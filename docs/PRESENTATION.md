# Presentation rendering

Open examples/presentation.html through the preview server (dist/presentation.html after building). This loads the credited public OLIMEX ESP32-P4-DevKit package with its retained source/model provenance.

The next source build adds [Photoreal Fast](PHOTOREAL-FAST.md): `viewer.setRenderQuality('photoreal-fast')` uses studio reflections and an invisible shadow catcher with cached 1024-pixel shadows without screen-space effects. It has a lower framebuffer budget than enhanced Presentation and remains an explicit opt-in. Published 0.7.0 does not include this preset.

After loading a board in 3D, call viewer.setRenderQuality('presentation'). Choose 'balanced' to restore normal rendering; 'low' and 'high' are also accepted. The method returns the active setting, including graphics fallback. Use the same method on a Viewer created through the direct browser global KiCadWebView.Viewer; hosting requires no Node runtime. The in-view Display → Quality menu exposes Presentation in any 3D embed.

Presentation adds a invisible shadow catcher outside the source board group, environment reflection intensity, 24-sample ambient occlusion and denoising, and 2048-pixel directional shadow maps on unconstrained devices. The framebuffer remains capped at 3 million pixels (4 million on premium devices; 1 million on constrained devices). This is optional rasterized studio rendering, not physically unbiased path tracing. Missing component models remain proxies and diagnostics remain visible. Saved geometry and selection identity are unchanged.

The stage is excluded from picking and board fit, is front-sided so it does not obscure bottom inspection, and is hidden outside the two studio presets or during translucent inspection. GPU buffers are disposed on quality changes and viewer disposal. No HDR downloads, extra runtime dependencies or permanent animation loop are added. Presentation is an explicit opt-in; persistence stores High instead to avoid silently making future embeds expensive. Photoreal Fast stores Balanced instead. Unsupported enhanced rendering falls back to Balanced with a visible diagnostic.

The demonstration turntable stops on pointer, wheel, keyboard, view changes, page hiding and disposal. Normal orbit/selection and scripted DemoController controls continue to use the same viewer.

Browser checks covered quality switching, turntable control and narrow viewports; hardware support can vary.
## Board appearance

Display → Appearance → Translucent makes the board and models translucent, shows copper in actual layer colors, and keeps fills faint. Saved XY positions are exact. Where stackup information is absent, internal copper elevations are illustrative and a diagnostic identifies this; transparent raster sorting can produce visual ordering artifacts. Layers remain independently hideable, and selecting then clearing a selection restores translucency. Model refreshes are batched progressively, and internal copper is constructed lazily.

Translucent picking, surface measurement and demo-face selection skip the substrate so visible saved geometry behind it stays reachable. Switch to an opaque appearance when measuring the board surface itself. Hidden layers remain excluded.
