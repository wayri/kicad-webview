/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { createServer } from 'node:http';
import { createSlackService } from './service.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createSlackHandler, prepareCatalog, slackTransport } from './adapter.mjs';

const { SLACK_SIGNING_SECRET, SLACK_TEAM_ID, SLACK_APP_ID, SLACK_BOT_TOKEN, VIEWER_CATALOG, VIEWER_CATALOG_JSON, SLACK_BIND_HOST = '127.0.0.1', PORT = '8787' } = process.env;
if(Boolean(VIEWER_CATALOG)===Boolean(VIEWER_CATALOG_JSON))throw new Error('Set exactly one of VIEWER_CATALOG or VIEWER_CATALOG_JSON to an explicitly approved catalog.');
if(!['127.0.0.1','0.0.0.0'].includes(SLACK_BIND_HOST))throw new Error('SLACK_BIND_HOST must be loopback or an explicitly configured container interface.');
const port = Number(PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
const raw=VIEWER_CATALOG_JSON||await readFile(VIEWER_CATALOG,'utf8');if(Buffer.byteLength(raw)>256*1024)throw new Error('Catalog exceeds 256 KiB.');
const config=JSON.parse(raw),catalog=prepareCatalog(config);
const handler = createSlackHandler({ signingSecret: SLACK_SIGNING_SECRET, teamID: SLACK_TEAM_ID, appID: SLACK_APP_ID,
  catalog, callSlack: slackTransport(SLACK_BOT_TOKEN),
  onError: () => console.error('Slack operation failed; inspect service health without logging credentials or request bodies.') });
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../dist');
const server = createServer(createSlackService({dist,catalog,eventHandler:handler}));
server.requestTimeout = 10_000; server.headersTimeout = 10_000; server.maxHeadersCount = 50;
server.listen(port,SLACK_BIND_HOST,()=>console.log('Slack beta service listening; HTTPS proxy and approved catalog required.'));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close(()=>{process.exitCode=0;});setTimeout(()=>process.exit(1),10_000).unref();});
