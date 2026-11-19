# Next stability update: validation scope

Unreleased source, checked 19 November 2026. Publication and live-site/CDN deployment remain paused. Published 1.0.0 assets were not overwritten.

## Automated checks

The initial stability pass below recorded 662 tests; the subsequent [memory optimization pass](MEMORY-OPTIMIZATION.md) passed 673. The canonical 3D and main builds passed using pinned existing dependencies. The complete serial suite passed **662 tests, zero failures or skips**. Strict TypeScript consumer checks passed for full/lite layer types, occurrence navigation, the extended restore callback and immediate expansion. Diff whitespace checks passed.

Regression coverage includes selected-net camera preservation, source/layer colors, selected versus unrelated via materials, logarithmic copper depth, reversible expansion, hidden/reduced-motion behavior, repeated-sheet context and cancellation. Independent review found asynchronous expansion replay returning too early; the fix uses immediate restoration and tests the real motion controller's pending-frame cancellation.

## Browser checks

Desktop Chromium loaded the pinned KERO Encoder and approved IRCA review projection. Checks covered linked full-net selection and clear, actual orbit and Pan-mode mouse drags, explicit part focus, assembled/expanded states, and restoring saved camera/selection/layers/expansion. KERO close-up resistor pads were inspected without reproducing the reported speckling; this is sampled visual evidence, not proof against every angle or GPU. IRCA reported 50 loaded model components out of 59; KERO's unbundled external models remain disclosed stand-ins.

Same-origin iframe boxes at 340 px and 390 px were checked; scrollbar-reduced content widths were 320 px and 370 px. There was no horizontal document overflow in these samples. Layer/inspection menus stayed inside the viewer. Light/dark warm palettes, Overview selection and compact 3D rotation buttons were exercised. This is responsive desktop-browser evidence, not physical-phone touch or GPU qualification.

Two unlocalized `MutationObserver.observe` diagnostics appeared during iframe navigation in the automation host. Neither the shipped SDK bundle nor these examples references MutationObserver. Their origin was not established, so this run is not advertised as a clean-console pass. No corresponding viewer-control failure was observed; the diagnostics remain recorded for follow-up before release acceptance.

## Performance samples

Single local browser samples, with cache/model-completion differences; no comparative speedup is claimed:

| Sample | Viewer ready | Median select + clear (20 cycles) | Loaded model components |
| --- | ---: | ---: | ---: |
| KERO desktop | 600 ms | 26.2 ms | 0 (stand-ins) |
| IRCA desktop | 915 ms | 28.7 ms | 50 |
| KERO narrow iframe | 706 ms | 35.5 ms | 0 (stand-ins) |
| IRCA narrow iframe | 851 ms | 20.9 ms | 50 |

These measure synchronous selection/clear work, excluding subsequent frame presentation. Viewer-ready timing does not wait for every asynchronous component asset. Renderer-reported retained geometry was about 3.9 MiB for KERO and 9.4 MiB for IRCA; retained texture estimates were about 25.5 MiB and 29.6 MiB. These are owned-resource estimates, not browser-process or peak GPU memory. No sampled context loss occurred. Network speed, device energy and physical-phone FPS were not measured.

## Acceptance remaining

Keep publication paused. Physical-device touch/GPU validation and attribution of the iframe-host diagnostics remain open. Chrome/Firefox extensions, VS Code/Android clients, Slack, Notion and Confluence were not installed, updated or requalified by this WebView check. Preserve the established host-specific experimental disclosures.
