import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { buildEmbedURL, publicHTTPS, publicSource } from '../integrations/shared/embed-url.mjs';
import { createSlackHandler, prepareCatalog, planSlackEvent, verifySlackRequest, slackTransport } from '../integrations/slack/adapter.mjs';
import { validateMacroConfig, mountConfluenceViewer, saveMacroConfig } from '../integrations/confluence/src/controller.mjs';

const secret = 'signing-secret-for-local-tests-only';
const now = 1793750400000;
const catalogConfig = { viewerPage: 'https://viewer.example.com/embed.html', sourceHosts: ['files.example.com'],
  entries: [{ id: 'inverter-v1', title: 'Inverter', public: true, url: 'https://viewer.example.com/design/inverter-v1',
    source: 'https://files.example.com/inverter%2Bdriver.zip', options: { theme: 'dark' } }] };
const catalog = prepareCatalog(catalogConfig), entry = catalog.byID.get('inverter-v1');
const wrapper = event => ({ type: 'event_callback', team_id: 'T12345', api_app_id: 'A12345', event_id: 'Ev123', event });
const linkEvent = { type: 'link_shared', channel: 'C12345', message_ts: '1793750400.000001',
  links: [{ url: entry.url }, { url: 'https://unknown.example.com/design/secret' }, { url: entry.url }] };
const detailEvent = { type: 'entity_details_requested', external_ref: { id: entry.id, type: 'ecad-design' },
  entity_url: entry.url, app_unfurl_url: entry.url, trigger_id: '123.456.abcdef' };
function sign(raw, timestamp = String(now / 1000)) {
  return { 'content-type': 'application/json', 'x-slack-request-timestamp': timestamp,
    'x-slack-signature': 'v0=' + createHmac('sha256', secret).update('v0:' + timestamp + ':').update(raw).digest('hex') };
}
async function deliver(handler, body, { raw = Buffer.from(JSON.stringify(body)), headers = {}, method = 'POST', url = '/slack/events' } = {}) {
  const request = Readable.from([raw]); Object.assign(request, { method, url, headers: { ...sign(raw), ...headers } });
  const response = { status: null, ended: false, writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(text) { this.text = text; this.ended = true; } };
  await handler(request, response);
  await new Promise(resolve => setImmediate(resolve));
  return response;
}
function receiver(calls, extra = {}) {
  return createSlackHandler({ signingSecret: secret, teamID: 'T12345', appID: 'A12345', catalog,
    now: () => now, callSlack: async (method, body) => { calls.push({ method, body }); }, ...extra });
}

test('embed builder preserves exact source and bounded options as URL data', () => {
  const url = new URL(buildEmbedURL(catalogConfig.viewerPage, entry.source, { theme: 'dark', file: 'layers/F.Cu.gbr', ref: 'feature/beta' }));
  assert.equal(url.searchParams.get('src'), entry.source);
  assert.equal(url.searchParams.get('file'), 'layers/F.Cu.gbr');
  assert.equal(url.searchParams.get('ref'), 'feature/beta');
  assert.equal(url.searchParams.get('theme'), 'dark');
  assert.equal(url.searchParams.get('provider'), null);
});
test('beta rejects credential-bearing, local, signed and nonapproved sources', () => {
  for (const value of ['http://files.example.com/a.zip','https://user:pass@files.example.com/a.zip',
    'https://localhost/a.zip','https://127.0.0.1/a.zip','https://2130706433/a.zip','https://[::1]/a.zip',
    'https://host.local/a.zip','https://host.internal/a.zip','https://files.example.com:444/a.zip',
    'https://files.example.com/a.zip?token=secret','https://files.example.com/a.zip#secret'])
    assert.throws(() => publicSource(value, ['files.example.com']));
  assert.throws(() => publicHTTPS('https://other.example.com/a.zip', ['files.example.com']));
  assert.throws(() => buildEmbedURL('https://viewer.example.com/embed.html?src=x',entry.source));
  assert.throws(() => buildEmbedURL(catalogConfig.viewerPage,entry.source,{file:'../private.drl'}));
});
test('public catalog requires explicit approval, immutable copied entries and stable unique links', () => {
  assert.throws(() => prepareCatalog({ ...catalogConfig, entries: [{ ...catalogConfig.entries[0], public: false }] }));
  assert.throws(() => prepareCatalog({ ...catalogConfig, entries: [catalogConfig.entries[0], catalogConfig.entries[0]] }));
  assert.throws(() => prepareCatalog({ ...catalogConfig, entries: [{ ...catalogConfig.entries[0], source: entry.source + '?signature=x' }] }));
  const source = structuredClone(catalogConfig), copy = prepareCatalog(source);
  source.entries[0].source = 'https://files.example.com/replacement.zip';
  source.entries[0].options.theme = 'light';
  assert.equal(copy.byID.get(entry.id).source, entry.source);
  assert.equal(copy.byID.get(entry.id).options.theme, 'dark');
});
test('Slack plans a single approved Work Object and full-size details, never a new message', () => {
  const calls = planSlackEvent(wrapper(linkEvent), catalog);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'chat.unfurl');
  const entity = calls[0].body.metadata.entities[0];
  assert.equal(calls[0].body.metadata.entities.length, 1);
  assert.equal(entity.app_unfurl_url, entry.url);
  assert.equal(entity.entity_payload.attributes.full_size_preview.preview_url, undefined);
  const details = planSlackEvent(wrapper(detailEvent), catalog);
  assert.equal(details[0].method, 'entity.presentDetails');
  assert.equal(details[0].body.trigger_id, detailEvent.trigger_id);
  assert.equal(new URL(details[0].body.metadata.entity_payload.attributes.full_size_preview.preview_url).searchParams.get('src'), entry.source);
  assert.deepEqual(planSlackEvent(wrapper({ ...detailEvent, entity_url: 'https://other.example.com/private' }), catalog), []);
  assert.deepEqual(planSlackEvent(wrapper({ ...detailEvent, external_ref: { id: entry.id, type: 'other' } }), catalog), []);
});
test('Slack signature uses exact raw body, enforces timestamp window and detects tampering', () => {
  const raw = Buffer.from('{ "event": "test" }'), headers = sign(raw);
  assert.equal(verifySlackRequest(raw, headers, secret, now), true);
  assert.equal(verifySlackRequest(Buffer.from('{"event":"test"}'), headers, secret, now), false);
  assert.equal(verifySlackRequest(raw, sign(raw, String(now / 1000 - 301)), secret, now), false);
  assert.equal(verifySlackRequest(raw, { ...headers, 'x-slack-signature': 'v0=abc' }, secret, now), false);
});
test('receiver verifies URL challenge, app/workspace, body size and JSON before API activity', async () => {
  const calls = [], handler = receiver(calls);
  assert.equal((await deliver(handler, { type: 'url_verification', challenge: 'challenge-value' })).text, 'challenge-value');
  assert.equal((await deliver(handler, wrapper(linkEvent), { headers: { 'x-slack-signature': 'v0=' + '0'.repeat(64) } })).status, 401);
  assert.equal((await deliver(handler, { ...wrapper(linkEvent), team_id: 'T99999' })).status, 403);
  assert.equal((await deliver(handler, { ...wrapper(linkEvent), api_app_id: 'A99999' })).status, 403);
  assert.equal((await deliver(handler, null, { raw: Buffer.from('{bad') })).status, 400);
  assert.equal((await deliver(handler, null, { raw: Buffer.alloc(256 * 1024 + 1, 32) })).status, 413);
  assert.equal((await deliver(handler, wrapper(linkEvent), { method: 'GET' })).status, 404);
  assert.equal((await deliver(handler, wrapper(linkEvent), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal(calls.length, 0);
});
test('receiver suppresses retry delivery and rejects event ID reuse with altered payload', async () => {
  const calls = [], handler = receiver(calls), event = wrapper(linkEvent);
  assert.equal((await deliver(handler, event)).status, 200);
  assert.equal((await deliver(handler, event)).status, 200);
  assert.equal(calls.length, 1);
  assert.equal((await deliver(handler, { ...event, event: { ...linkEvent, channel: 'C99999' } })).status, 409);
});
test('receiver acknowledges before network calls and bounds concurrent accepted work', async () => {
  let completed = false, release;
  const waiting = new Promise(resolve => { release = resolve; });
  const handler = receiver([], { callSlack: async () => { await waiting; completed = true; } });
  const result = await deliver(handler, wrapper(linkEvent));
  assert.equal(result.status, 200); assert.equal(result.ended, true); assert.equal(completed, false);
  for (let i = 1; i < 32; i++) assert.equal((await deliver(handler, { ...wrapper(linkEvent), event_id: 'Ev' + i })).status, 200);
  assert.equal((await deliver(handler, { ...wrapper(linkEvent), event_id: 'EvOver' })).status, 503);
  release(); await new Promise(resolve => setImmediate(resolve)); assert.equal(completed, true);
});
test('Slack transport targets only approved API methods and surfaces HTTP/API failures', async () => {
  const requests = [];
  const call = slackTransport('xoxb-local-test-token', async (url, options) => {
    requests.push({url,options}); return { ok: true, json: async () => ({ ok: true }) };
  });
  await call('chat.unfurl', { metadata: {} });
  assert.equal(requests[0].url,'https://slack.com/api/chat.unfurl');
  assert.equal(requests[0].options.redirect, 'error');
  await assert.rejects(call('chat.postMessage', {}));
  await assert.rejects(slackTransport('xoxb-test', async () => ({ok:false,status:429}))('chat.unfurl',{}), /429/);
  await assert.rejects(slackTransport('xoxb-test', async () => ({ok:true,json:async()=>({ok:false,error:'missing_scope'})}))('chat.unfurl',{}), /missing_scope/);
});
test('Confluence validates source policy and submits only supported configuration fields', async () => {
  const submissions = [], bridge = { submit: async value => { submissions.push(value); } };
  const input = { source: entry.source, theme: 'dark', ignored: 'untrusted', view: '', file: '' };
  const result = await saveMacroConfig(bridge, input, catalogConfig.sourceHosts);
  assert.deepEqual(result,{source:entry.source,theme:'dark'});
  assert.deepEqual(submissions,[{config:result}]);
  assert.throws(() => validateMacroConfig({source:'https://other.example.com/private.zip'},catalogConfig.sourceHosts));
  assert.throws(() => validateMacroConfig({source:entry.source,theme:'system'},catalogConfig.sourceHosts));
});
test('Confluence mounts the shared viewer and releases it on load failure', async () => {
  const instances = [];
  class Viewer { constructor(target,options) { this.target=target;this.options=options;instances.push(this); } async load(source,options) {this.source=source;this.loadOptions=options;} dispose(){this.disposed=true;} }
  const context = { extension: { config: { source: entry.source, theme: 'dark', file:'layers/F.Cu.gbr' } } }, target = {};
  const instance = await mountConfluenceViewer({bridge:{getContext:async()=>context},Viewer,target,sourceHosts:catalogConfig.sourceHosts});
  assert.equal(instance.target,target); assert.equal(instance.source,entry.source);
  assert.deepEqual(instance.options,{theme:'dark'}); assert.deepEqual(instance.loadOptions,{file:'layers/F.Cu.gbr'});
  class Broken extends Viewer { async load(){throw new Error('CORS rejected');} }
  await assert.rejects(mountConfluenceViewer({bridge:{getContext:async()=>context},Viewer:Broken,target,sourceHosts:catalogConfig.sourceHosts}),/CORS/);
  assert.equal(instances.at(-1).disposed,true);
});

test('Confluence exposes the instance for teardown before an asynchronous load completes', async () => {
  let created, release;
  const pending = new Promise(resolve => { release = resolve; });
  class Viewer { async load() { await pending; } dispose() { this.disposed = true; } }
  const mounting = mountConfluenceViewer({ bridge: {}, context: { extension: { config: { source: entry.source } } }, Viewer, target: {}, sourceHosts: catalogConfig.sourceHosts, onCreate: value => { created = value; } });
  assert.ok(created); created.dispose(); release();
  assert.equal((await mounting).disposed, true);
});

test('receiver reserves bounded ingress slots before slow unauthenticated bodies and releases on abort', async () => {
  const calls = [], handler = receiver(calls), streams = [], work = [], replies = [];
  try {
    for (let i = 0; i < 16; i++) {
      const request = new Readable({ read() {} });
      Object.assign(request, { method: 'POST', url: '/slack/events', headers: sign(Buffer.from('unfinished')) });
      const response = { writeHead(status) { this.status = status; }, end() {} };
      streams.push(request); replies.push(response); work.push(handler(request, response));
      request.push(Buffer.alloc(64 * 1024, 32)); // Keep each body open after retaining bytes.
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await deliver(handler, wrapper(linkEvent))).status, 503);
    assert.equal(calls.length, 0);
    streams[0].destroy(new Error('Client aborted.'));
    await work[0];
    assert.equal(replies[0].status, 400);
    assert.equal((await deliver(handler, wrapper(linkEvent))).status, 200);
    assert.equal(calls.length, 1);
  } finally {
    for (const stream of streams) if (!stream.destroyed) stream.destroy(new Error('Test teardown.'));
    await Promise.all(work);
  }
});
test('body reader deadline releases the ingress slot without a completed request body', async () => {
  const calls = [], handler = receiver(calls, { bodyTimeoutMs: 10 });
  const request = new Readable({ read() {} });
  Object.assign(request, { method: 'POST', url: '/slack/events', headers: sign(Buffer.from('unfinished')) });
  const response = { writeHead(status) { this.status = status; }, end() {} };
  await handler(request, response);
  assert.equal(request.destroyed, true); assert.equal(response.status, 408);
  assert.equal((await deliver(handler, wrapper(linkEvent))).status, 200);
  assert.equal(calls.length, 1);
});

test('hosted iframe links preserve an explicit false click-inspection preference and reject non-booleans',()=>{const url=buildEmbedURL('https://viewer.example.com/embed.html','https://files.example.com/board.kicad_pcb',{inspectOnSelect:false});assert.equal(new URL(url).searchParams.get('inspectOnSelect'),'false');assert.throws(()=>buildEmbedURL('https://viewer.example.com/embed.html','https://files.example.com/board.kicad_pcb',{inspectOnSelect:'false'}),/boolean/);});

test('embed links transport validated highlight and appearance settings without permitting arbitrary values',()=>{const url=new URL(buildEmbedURL('https://viewer.example.com/embed.html','https://files.example.com/board.kicad_pcb',{highlightStyle:'bright',highlightColor:'source',appearance:'translucent'}));assert.equal(url.searchParams.get('highlightStyle'),'bright');assert.equal(url.searchParams.get('highlightColor'),'source');assert.equal(url.searchParams.get('appearance'),'translucent');for(const options of [{highlightStyle:'bad'},{highlightColor:'bad'},{appearance:'bad'}])assert.throws(()=>buildEmbedURL('https://viewer.example.com/embed.html','https://files.example.com/board.kicad_pcb',options),TypeError);});
