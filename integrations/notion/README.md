# Notion beta

This adapter is a hosted URL integration, not an installed Notion app. It uses the same deployed embed.html and compiled viewer as a normal website. It does not upload attachments or read a Notion workspace.

1. Build and deploy the standalone dist directory to an HTTPS host that allows framing. Use a release with the desired file-format support.
2. Host an explicitly public drawing/project/ZIP on a CORS-enabled source host.
3. Generate the URL from the repository root:

    node integrations/shared/make-embed.mjs https://viewer.example.com/embed.html https://files.example.com/project.zip dark

4. In Notion, choose /embed, paste the generated URL and resize the block. Paste the URL, not iframe HTML or JavaScript.
5. Check actual desktop, web and mobile clients: file load, layer controls, light/dark menu contrast, pan/zoom/picking and 3D if applicable. Keep a normal Open viewer link alongside it as a fallback.

Custom-domain embed resolution and client behavior remain live-test requirements. Notion may resolve embeds through Iframely. Do not assume a successful standalone browser test proves Notion support. Embeds requiring external login do not work in Notion desktop/mobile according to [Notion help](https://www.notion.com/help/embed-and-connect-other-apps). This beta therefore supports explicitly public sources only; it does not expose private sources to make an embed work.

The viewer is licensed under [MPL-2.0](../../LICENSE); third-party terms also apply. See [HTML snapshots](../../docs/SLACK-HTML-ATTACHMENT.md) for the tested self-contained route.
