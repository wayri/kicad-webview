# Slack integration deployment

The beta receiver supports approved public catalog links in a first-party workspace. Interactive Work Objects have been exercised in a Slack web client. Marketplace distribution and other clients are not established; check [Slack's Work Objects documentation](https://docs.slack.dev/messaging/work-objects-embeds/) for eligibility.

1. Copy `catalog.example.json` to a private deployment configuration and configure the viewer page, unique share URLs, approved public sources and `public: true` entries. The receiver does not fetch designs server-side.
2. Create a Slack app from `manifest.example.json`, replacing example hosts and endpoint. Configure `links:read` and `links:write`, the `link_shared` and `entity_details_requested` events, the unfurl domain and Work Objects embed allowlist.
3. Supply `SLACK_TEAM_ID`, `SLACK_APP_ID`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, and either `VIEWER_CATALOG` or `VIEWER_CATALOG_JSON` in the service environment. Do not put credentials in URLs or source files.
4. Run the service behind an HTTPS reverse proxy with appropriate request and body limits. Configure the viewer's HTTP `Content-Security-Policy` `frame-ancestors` for the intended Slack domains and CORS for source resources. Verify the signed URL challenge, then install the app in the chosen workspace. Slack may require reinstalling after an unfurl-domain change.
5. Verify the approved link, Work Object, interactive panel, source errors, 2D/3D controls and sizing in each intended client. Provide a normal viewer link as a fallback.

The receiver binds events to one app and workspace and verifies signatures and timestamps. Deduplication and the bounded work queue are in memory; a restart can lose accepted work. It is not a durable serverless queue. Private links, arbitrary attachment ingestion and cross-workspace distribution are outside this beta. See [integration setup](../../docs/APP-INTEGRATIONS-BETA.md) and [HTML snapshots](../../docs/SLACK-HTML-ATTACHMENT.md).
