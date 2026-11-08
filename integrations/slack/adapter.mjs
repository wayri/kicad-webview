/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { buildEmbedURL, publicHTTPS, publicSource, validateEmbedOptions } from '../shared/embed-url.mjs';

export const SLACK_FRAME_ANCESTORS = 'https://*.slack.com https://*.slack-gov.com https://*.slack-mcps.com';
const MAX_BODY = 256 * 1024;
const MAX_READERS = 16;
const ID = /^[A-Z][A-Z0-9]{2,63}$/;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

export function verifySlackRequest(rawBody, headers, signingSecret, now = Date.now()) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length > MAX_BODY || typeof signingSecret !== 'string' || signingSecret.length < 16) return false;
  const timestamp = headers['x-slack-request-timestamp'], signature = headers['x-slack-signature'];
  if (typeof timestamp !== 'string' || !/^\d{10,12}$/.test(timestamp) || typeof signature !== 'string' || !/^v0=[a-f0-9]{64}$/.test(signature) ||
      Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const digest = 'v0=' + createHmac('sha256', signingSecret).update('v0:' + timestamp + ':').update(rawBody).digest('hex');
  return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export function prepareCatalog({ viewerPage, sourceHosts, entries }) {
  if (!Array.isArray(sourceHosts) || !sourceHosts.length || !Array.isArray(entries) || !entries.length || entries.length > 256)
    throw new TypeError('Provide approved source hosts and 1–256 public catalog entries.');
  const byURL = new Map(), byID = new Map();
  for (const item of entries) {
    if (!plain(item) || item.public !== true || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(item.id) ||
        typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160 || /[\u0000-\u001f\u007f]/.test(item.title))
      throw new TypeError('Catalog entries require an ID, title and explicit public:true approval.');
    const url = publicHTTPS(item.url);
    if (url.search || url.hash || byURL.has(url.href) || byID.has(item.id)) throw new TypeError('Catalog links/IDs must be unique stable public URLs.');
    const source = publicSource(item.source, sourceHosts);
    const options = validateEmbedOptions(item.options);
    const entry = Object.freeze({ id: item.id, title: item.title, url: url.href, source, options,
      previewURL: buildEmbedURL(viewerPage, source, options, { sourceHosts }) });
    byURL.set(entry.url, entry); byID.set(entry.id, entry);
  }
  return { byURL, byID };
}

function metadata(entry, details = false) {
  return {
    url: entry.url, external_ref: { id: entry.id, type: 'ecad-design' }, entity_type: 'slack#/entities/file',
    entity_payload: { attributes: { title: { text: entry.title }, display_type: 'Interactive ECAD viewer',
      product_name: 'KiCad WebView', full_size_preview: { is_supported: true, mime_type: 'application/vnd.slack-embed',
        ...(details ? { preview_url: entry.previewURL } : {}) } }, fields: {} },
  };
}

/** Produces bounded API operations only; does not fetch designs or post messages. */
export function planSlackEvent(envelope, catalog) {
  const event = envelope.event;
  if (!plain(event)) return [];
  if (event.type === 'link_shared') {
    if (typeof event.channel !== 'string' || !ID.test(event.channel) || typeof event.message_ts !== 'string' || !/^\d{1,16}\.\d{1,16}$/.test(event.message_ts) ||
        !Array.isArray(event.links) || event.links.length > 20) throw new TypeError('Invalid link event.');
    const seen = new Set(), entities = [];
    for (const link of event.links) {
      const entry = catalog.byURL.get(link?.url);
      if (entry && !seen.has(entry.id)) { seen.add(entry.id); entities.push({ ...metadata(entry), app_unfurl_url: entry.url }); }
    }
    return entities.length ? [{ method: 'chat.unfurl', body: { channel: event.channel, ts: event.message_ts, unfurls: {}, metadata: { entities } } }] : [];
  }
  if (event.type === 'entity_details_requested') {
    const entry = catalog.byID.get(event.external_ref?.id);
    if (!entry || event.external_ref?.type !== 'ecad-design' || event.entity_url !== entry.url ||
        event.app_unfurl_url && event.app_unfurl_url !== entry.url) return [];
    if (typeof event.trigger_id !== 'string' || !/^[A-Za-z0-9._-]{1,512}$/.test(event.trigger_id)) throw new TypeError('Invalid entity trigger.');
    return [{ method: 'entity.presentDetails', body: { trigger_id: event.trigger_id, metadata: metadata(entry, true) } }];
  }
  return [];
}

/** Single-workspace receiver with bounded in-memory queue/replay protection. */
export function createSlackHandler({ signingSecret, teamID, appID, catalog, callSlack, now = Date.now, onError = () => {}, bodyTimeoutMs = 10_000 }) {
  if (typeof signingSecret !== 'string' || signingSecret.length < 16 || !ID.test(teamID) || !ID.test(appID) || typeof callSlack !== 'function' || !Number.isInteger(bodyTimeoutMs) || bodyTimeoutMs < 1 || bodyTimeoutMs > 30_000)
    throw new TypeError('Configure signing secret, workspace/app IDs and Slack API transport.');
  const seen = new Map();
  let pending = 0, readers = 0;
  return async function handler(request, response) {
    const send = (status, body = '') => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(body); };
    if (request.method !== 'POST' || request.url !== '/slack/events') return send(404);
    if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type'] || ''))) return send(415);
    if (Number(request.headers['content-length']) > MAX_BODY) return send(413);
    // Reserve before reading any unauthenticated bytes. Pending Slack API work
    // is a separate budget and cannot protect body-buffer allocations.
    if (readers >= MAX_READERS) return send(503);
    readers++;
    let raw, timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; request.destroy(new Error('Request body deadline exceeded.')); }, bodyTimeoutMs);
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length; if (size > MAX_BODY) return send(413);
        chunks.push(bytes);
      }
      raw = Buffer.concat(chunks);
    } catch { return send(timedOut ? 408 : 400); }
    finally { clearTimeout(deadline); readers--; }
    if (!verifySlackRequest(raw, request.headers, signingSecret, now())) return send(401);
    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return send(400); }
    if (!plain(body) || body.api_app_id !== undefined && body.api_app_id !== appID) return send(403);
    if (body.type === 'url_verification') {
      if (typeof body.challenge !== 'string' || body.challenge.length > 200 || /[\u0000-\u001f]/.test(body.challenge)) return send(400);
      return send(200, body.challenge);
    }
    if (body.team_id !== teamID || body.api_app_id !== appID) return send(403);
    if (body.type !== 'event_callback') return send(200);
    if (typeof body.event_id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(body.event_id)) return send(400);
    const time = now();
    for (const [key, expiry] of seen) if (expiry < time) seen.delete(key);
    // Keep a content fingerprint to reject reuse of an event ID with different data.
    const fingerprint = createHash('sha256').update(raw).digest('hex'), key = body.event_id + ':' + fingerprint;
    if (seen.has(key)) return send(200);
    if ([...seen.keys()].some(value => value.startsWith(body.event_id + ':'))) return send(409);
    let calls;
    try { calls = planSlackEvent(body, catalog); } catch { return send(400); }
    if (pending >= 32 || seen.size >= 4096) return send(503);
    seen.set(key, time + 10 * 60 * 1000);
    pending++;
    send(200); // Acknowledge before network calls; long-lived process required.
    queueMicrotask(async () => {
      try { for (const call of calls) await callSlack(call.method, call.body); }
      catch (error) { seen.delete(key); try { onError(error); } catch { /* Logging must not create an unhandled rejection. */ } }
      finally { pending--; }
    });
  };
}

export function slackTransport(token, fetchImpl = fetch) {
  if (typeof token !== 'string' || !/^xoxb-[A-Za-z0-9-]+$/.test(token)) throw new TypeError('Configure a Slack bot token.');
  return async (method, body) => {
    if (!['chat.unfurl', 'entity.presentDetails'].includes(method)) throw new TypeError('Unsupported Slack operation.');
    const response = await fetchImpl('https://slack.com/api/' + method, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Slack HTTP request failed: ' + response.status);
    const result = await response.json();
    if (!result.ok) throw new Error('Slack rejected ' + method + ': ' + String(result.error || 'unknown'));
    return result;
  };
}
