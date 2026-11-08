# Presentation rendering beta

Open examples/presentation.html through the preview server (dist/presentation.html after building). This uses the pinned public inverter fixture, not a fabricated board.

After loading a board in 3D, call viewer.setRenderQuality('presentation'). Choose 'balanced' to restore normal rendering; 'low' and 'high' are also accepted. The method returns the active setting, including graphics fallback. Use the same method on a Viewer created through the direct browser global KiCadWebView.Viewer; hosting requires no Node runtime. The in-view Display → Quality menu exposes Presentation in any 3D embed.

Presentation adds a matte receiving stage outside the source board group, environment reflection intensity, 24-sample ambient occlusion and denoising, and 2048-pixel directional shadow maps on unconstrained devices. The framebuffer remains capped at 3 million pixels (4 million on premium devices; 1 million on constrained devices). This is optional rasterized studio rendering, not physically unbiased path tracing. Missing component models remain proxies and diagnostics remain visible. Saved geometry and selection identity are unchanged.

The stage is excluded from picking and board fit, is front-sided so it does not obscure bottom inspection, and is hidden when switching quality. GPU buffers are disposed on quality changes and viewer disposal. No HDR downloads, extra runtime dependencies or permanent animation loop are added. Presentation is an explicit opt-in; persistence stores High instead to avoid silently making future embeds expensive. Unsupported enhanced rendering falls back to Balanced with a visible diagnostic.

The demonstration turntable stops on pointer, wheel, keyboard, view changes, page hiding and disposal. Normal orbit/selection and scripted DemoController controls continue to use the same viewer.

Browser checks covered quality switching, turntable control and narrow viewports; hardware support can vary.