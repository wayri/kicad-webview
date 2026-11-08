# Forge build and validation

Build the root viewer and run `npm run build` in this directory. The adapter copies the root viewer bundle and records its version and hashes in `static/VIEWER-BUILD.json`; rebuild after changing the root viewer. The build rejects external JavaScript imports and retains dependency notices under `static/licenses`. Atlassian SDK and third-party terms remain separate from the viewer license; see `licenses/iframe-resizer-4.4.5/PROVENANCE.json` for its notice provenance.

Run `npm run validate:manifest` for local schema and semantic validation. A placeholder app ID is suitable only for offline validation; deployment requires a registered app ID. Authenticated Forge CLI lint and a live tenant check require an authorized account and tenant. Local controller tests and manifest validation do not establish live Confluence support. The Forge adapter has not been deployed.
