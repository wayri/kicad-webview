# Application adapters · beta

The adapters use the standalone viewer distribution. They do not fork a parser or renderer. The viewer is licensed under [MPL-2.0](../LICENSE); third-party platform/SDK terms remain applicable.

- [Setup and acceptance guide](../docs/APP-INTEGRATIONS-BETA.md)
- shared/: HTTPS/public-source validation and hosted embed URL builder
- slack/: first-party workspace event receiver, public catalog, manifest and landing-page generator; Node built-ins only
- confluence/: Forge Custom UI macro/config sources and a build that copies the exact root viewer bundle
- notion/: hosted URL embed instructions; no Notion API token required

The beta is deliberately public-source only. Private links, Confluence attachment access, cross-workspace installations and Marketplace distribution are not implemented. A self-contained HTML snapshot has been tested in Slack and Notion web clients. Local contract tests do not establish live host support. No workspace installation, message posting, app deployment or third-party file upload is performed by building or testing these sources.
