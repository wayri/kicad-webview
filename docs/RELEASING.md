# Release preparation

For a release, run `npm run build:3d`, `npm run build`, `npm test` and `npm pack --dry-run`; inspect the package, license and third-party notices. Exercise relevant [browser checks](BROWSER-CHECKS.md) and verify the target registry version and publishing account before publishing. Publish stable releases to the latest tag with public access after inspecting the exact tarball. Preserve immutable version tags; verify the registry integrity and CDN bytes after publication. A CDN example is valid only after publication and verification.

Deploy the contents of `dist` to a static host when appropriate. See [hosting](HOSTING.md) for asset and CORS requirements. The existing public website is [here](https://wayri.github.io/kicad-webview/).
