# 0.7.0 validation — 15 November 2026

The final source gate passed **555 tests**, with no failures or skips. Pinned
esbuild 0.25.12 / Three.js 0.171.0 built 3D, ESM, classic-script and lite bundles;
the module/classic distributions contain no external JavaScript imports.

## Desktop browser acceptance

The real-project check used the credited OLIMEX ESP32-P4-DevKit Rev.D1 at
[26705d3](https://github.com/OLIMEX/ESP32-P4-DevKit/tree/26705d36407a07324348927dfd30fbf4ffc1d94c),
with the existing model-path adaptation and retained public model provenance.
168 saved parts and 141 loaded models were observed; absent models retain notes.

- Exact saved identities cross-selected the schematic, PCB, 3D and contextual
  preview; clear propagated without feedback or reopening Properties.
- A top preset followed by selection of bottom-mounted U1 flipped and focused
  the assembly on its mounting side.
- Properties resizing and 320-pixel previews preserved the main camera and
  had equal client/scroll widths. Both light and dark themes were inspected.
- Orbit/pan and translucent display were exercised in the real 3D assembly.
- A separate format sample displayed explicit project variables, numeric
  expressions, overbars and horizontal table cells without altering its source.
- A retained numerical-test fixture exercised 2D/3D saved-result palettes,
  registered board overlays and independent 3D fields: 206 triangles rendered,
  24 missing/degenerate triangles omitted, no scalar-color fallback, original
  range retained. Palette updates preserved the settled fitted camera.
- Registered result/probe display suspended during exploded display and
  restored on assembly. At 320 by 240 pixels, Properties used a scrollable short
  panel; the main camera remained unchanged.

These are desktop Chromium observations and bounded regression checks. They do
not establish installed extension/client compatibility, physical iOS/Android
gestures, exact embedded-font layout, universal GPU parity or solver accuracy.
Unsupported constructs remain labelled; no arbitrary LaTeX or editing is added.
