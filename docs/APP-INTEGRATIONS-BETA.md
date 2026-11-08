# Slack, Confluence and Notion integration beta

These beta adapters use the same KiCad WebView library. Slack and Notion web-client interactions have been tested; the Confluence Forge adapter has not been deployed.

## Common deployment

Build the root library and deploy dist/ to a reviewed HTTPS host. The host page and design source need the permissions/CORS required by the actual embedding client. Public hosted KiCad, Gerber, Excellon, manufacturing manifests and ZIP sources use the same Viewer.load(url) path; availability of a format is defined by the library release, not by the adapter. Leave the initial view automatic for fabrication inputs.

Use the shared builder:

    node integrations/shared/make-embed.mjs https://viewer.example.com/embed.html https://files.example.com/project.zip dark

It outputs a safely encoded viewer URL. HTTPS, bounded options and public hostnames are required. This beta rejects source query strings/fragments so credentials or signed links are not placed in page config or unfurl metadata. The host must still confirm that a catalog source and its referenced files are intentionally public. Syntax/host checks are not an access-control or DNS-ownership proof.

The core renderer needs no runtime Node server. Slack automatic link previews need an HTTPS event receiver; a self-contained HTML attachment works without that receiver in the tested Slack web client. Confluence can host the viewer through Forge Custom UI. Notion supports a native HTML block as well as URL embeds.

For private designs, stop at the ordinary authorized application viewer. This beta does not obtain platform attachment tokens, proxy arbitrary URLs or publish private files. Do not solve an iframe authentication problem by making a private design public.

## Slack: first-party workspace beta

### Artifacts and setup

1. Copy integrations/slack/catalog.example.json to a task-owned deployment configuration outside Git. Replace viewerPage and every share URL. Add only reviewed public source hosts and entries with public:true. The catalog is the only set of links the adapter will recognize; event URLs never cause a server-side source fetch.
2. Deploy the root dist viewer to the viewerPage location. Generate optional public share landing pages with VIEWER_CATALOG set, then run node integrations/slack/build-catalog.mjs. It writes under .cache/integrations/slack-pages and records exact share URL mappings in deploy-map.json. Deploy each page at its catalog URL or provide equivalent existing landing pages. The generator does not upload anything.
3. Create an undistributed Slack app in the chosen test workspace using integrations/slack/manifest.example.json. Replace the example domains/event endpoint. The prepared scopes are links:read and links:write; there is no chat:write or file-download scope.
4. In Slack app settings, enable Work Objects/rich previews and allowlist the viewer hostname. Subscribe to link_shared and entity_details_requested. Configure the unfurl domain to match catalog share links.
5. Supply SLACK_SIGNING_SECRET, SLACK_TEAM_ID, SLACK_APP_ID, SLACK_BOT_TOKEN and VIEWER_CATALOG through the service environment. Never put credentials in a catalog, repository file, viewer URL or browser code. Optionally set PORT; default 8787.
6. Run node integrations/slack/server.mjs. It binds loopback only. Put a production HTTPS reverse proxy in front of /slack/events; set request/body/time limits there as well. The receiver validates signed URL-verification challenges and subsequent workspace/app-bound events.
7. Set the viewer host's HTTP Content-Security-Policy frame-ancestors to permit https://*.slack.com https://*.slack-gov.com https://*.slack-mcps.com as well as any other intentionally supported ancestors. This must be an HTTP response header. A meta tag cannot enable frame-ancestors. Do not use X-Frame-Options: DENY/SAMEORIGIN for the embeddable page. Avoid changing policies of unrelated pages.
8. In the selected workspace, a human shares one approved catalog link. Verify its Work Object card and click it to open the interactive side pane. The adapter only responds to link/details events; it has no proactive-post operation.

### Limits and acceptance

Slack currently allows these embeds for first-party, undistributed apps in their own workspace. Distributed Marketplace embed access is invitation-only; this code does not bypass that requirement. The default opaque iframe origin can require CORS for every loaded resource. Test desktop/web/mobile, including actual 2D canvas and WebGL availability, HTTPS and origin policies. The normal standalone viewer link remains the fallback.

The receiver caps bodies at 256 KiB, concurrent unauthenticated body readers at 16, remembered events at 4096 and pending API work at 32. A 10-second body deadline and finally-based release cover completed, rejected, aborted and timed-out reads. It verifies exact raw-body HMAC and timestamp, binds events to one app/workspace, suppresses duplicate events and only sends chat.unfurl/entity.presentDetails to the fixed Slack API origin. It never downloads a design on its server. It acknowledges before network operations and uses an in-memory queue/deduplication cache. This requires a continuously running process; it is not a durable serverless queue. Process restarts can lose accepted work. Scale-out/durable retry storage and private-source authorization are later work. Inspect transport failures without logging tokens, raw events or design bytes.

Slack Work Object and interactive HTML attachment behavior has been exercised in a web client. See [HTML snapshots](SLACK-HTML-ATTACHMENT.md).

References: [Work Objects embeds and distribution eligibility](https://docs.slack.dev/messaging/work-objects-embeds/), [Slack request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/), [entity details event](https://docs.slack.dev/reference/events/entity_details_requested/).

## Confluence Cloud: Forge Custom UI beta

The quickest hosted route is Confluence's existing iFrame macro with the shared generated viewer URL. The supplied Forge source adds a native macro configuration dialog and serves the same viewer JavaScript as a Forge static resource. It does not support native Confluence attachments in this beta.

1. In integrations/confluence/policy.json, set the public source host allowlist. Update client fetch egress address objects in manifest.example.yml to match the source URLs and any resources they legitimately reference. The example includes GitHub API/raw sources plus files.example.com; replace that example host.
2. Copy manifest.example.yml to ignored manifest.yml. Register your own Forge app with the Atlassian CLI and set its app ID. No app ID or tenant is provisioned by this repository.
3. Install the pinned adapter dependencies, build the root viewer and run `npm run build` inside `integrations/confluence`. Forge bridge must resolve from the adapter.
4. The adapter build bundles its controller/Forge bridge and copies root dist/kicad-webview.min.js byte-for-byte. VIEWER-BUILD.json records the root package version and SHA-256. Never replace it with a forked viewer or stale manual copy. The build rejects external runtime JavaScript imports, inventories packages contributing controller code and retains their exact license/notice files under static/licenses. Keep static/FORGE-DEPENDENCY-NOTICES.md and static/licenses/DEPENDENCIES.json with the deployment. Atlassian SDK terms remain separate from the viewer license. A reviewed iframe-resizer 4.4.5 packaging omission is documented in integrations/confluence/licenses/iframe-resizer-4.4.5/PROVENANCE.json; it retains the exact MIT metadata/copyright and explicitly labeled supplemental upstream v4.4.4 MIT text.
5. Run npm run validate:manifest for the official local schema/semantic checks. A placeholder app ID can be used only for offline validation, not deployment. Use the Forge CLI for authenticated lint and deployment with your own registered app and tenant. The manifest requests inline-style permission and client fetch egress, but no Confluence attachment/content read scopes. Review permissions before installation.
6. Insert /KiCad WebView beta, provide the approved public source URL and theme, and save. Optional file/ref fields use the same library options as the ordinary browser embed. Configuration URLs are stored in the page, so never enter secrets or signed/private links.
7. Test both initial insertion and later config edits; page view/reload; useful and narrow sizes; theme/menu contrast; source failures; layer/picking/measurement; 3D where supported; disposal and browser back/forward. Verify exports separately: this beta does not provide interactive PDF/Word exports.

Local tests cover config policy and controller lifecycle. Manifest validation and local builds do not establish live host support. The Forge adapter has not been deployed; see [build checks](../integrations/confluence/BUILD-CHECKS.md).

References: [iFrame macro](https://support.atlassian.com/confluence-cloud/docs/insert-the-iframe-macro/), [Forge macro](https://developer.atlassian.com/platform/forge/manifest-reference/modules/macro/), [custom configuration](https://developer.atlassian.com/platform/forge/add-custom-configuration-to-a-macro/), [Forge bridge view](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/view/).

## Notion: native HTML and URL embed beta

A self-contained HTML snapshot has been exercised in Notion's web client, including JavaScript, WebGL, PCB/3D switching and inspection. It contained a PCB and labelled component proxies, not schematic sheets or external models. A general-purpose export API is not yet provided.

To use a suitable snapshot, insert an `/html` block, upload the file and select Interact. URL embeds are an alternative with a reviewed HTTPS host. Verify client behavior, sizing and controls for your own deployment. Physical mobile gestures and native mobile clients remain unverified.

References: [Notion HTML block release](https://www.notion.com/releases/2026-07-01), [Notion block API](https://developers.notion.com/reference/block), [Notion embeds](https://www.notion.com/help/embed-and-connect-other-apps).

## Local verification and release gate

Run node --test tests/integrations.test.mjs from the repository root. Tests cover URL encoding/rejection, explicit public catalog approval, Slack request signatures and timestamp windows, app/team binding, retry deduplication, bounded ingress/body deadlines and pending work, approved Work Object payloads, no proactive message method, fixed Slack transport and Forge controller lifecycle. They do not contact any app or prove live rendering.

Before claiming any host supported: complete the actual host-specific checks above with the same reviewed library artifact, record the source/project revision and library hash, and retain failed/unsupported behavior in visible diagnostics. Keep published beta status separate from local adapter source readiness.
