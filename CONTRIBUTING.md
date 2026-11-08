# Contributing

Bug reports, compatibility fixtures, documentation and focused improvements are welcome. Search existing issues first and include the library version, browser, reproduction steps and expected behavior. Share only designs you have permission to publish; reduce private designs to a non-sensitive reproduction.

## Development

Use Node.js 22 or later and the pinned dependency versions. Run npm ci, npm run build:3d, npm run build and npm test. A compatible existing installation can be reused through KICAD_WEB_BUILD_DEPS. Source lives in src/ and engine/; generated dist/ files are build outputs. Change source, rebuild affected outputs, and include relevant tests. Viewer rendering changes also need desktop and narrow-viewport browser checks. Never edit vendored dependencies without preserving their provenance and notices.

Keep changes focused and describe what changed, why, and how it was verified. Do not submit credentials, private workspace identifiers or personal/local paths. See SECURITY.md for sensitive reports.

## License

By submitting a contribution, you agree to license it under MPL-2.0 and confirm you have authority to do so. You retain copyright. There is no copyright assignment or separate proprietary relicensing grant. Keep applicable copyright, SPDX and dependency notices. If distributing modified bundles, make your matching covered source available and update the source notice.
