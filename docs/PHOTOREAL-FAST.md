# Fast photoreal presentation

The 0.8.0-preview.1 website SDK adds `photoreal-fast` to the 3D quality menu and `setRenderQuality`. It is opt-in; ordinary embeds retain their existing default. Published 0.7.0 does not contain this preset.

```js
await viewer.load('/designs/project.json', {view: '3d'});
viewer.setAppearance('realistic');
viewer.setRenderQuality('photoreal-fast');
```

Choose **Display → Quality → Photoreal Fast** in an embedded viewer. The same orbit, pan, picking, linked selections and view controls remain available. Switching quality does not replace source geometry, selection or the camera.

This preset combines the existing physically based materials, studio environment reflections, filmic tone mapping, an invisible shadow catcher and cached 1024 × 1024 shadow maps. It skips ambient-occlusion, SMAA and supersampling passes. The framebuffer is capped at two million pixels, or one million on constrained devices. These are allocation limits, not measured frame-rate guarantees. Rendering remains demand-driven and pauses when hidden.

`presentation` remains available for enhanced shadows and ambient occlusion at a higher memory cost. Switch back with `viewer.setRenderQuality('balanced')`. The fast preset does not become a persisted default for other embeds.

Translucent inspection temporarily hides the shadow catcher and disables shadows; returning to opaque appearance restores the selected studio mode. Layer colors, results overlays and cross-highlighting retain their data colors.

This is real-time rasterized PBR presentation, not path tracing or a photographic reconstruction. Its fidelity depends on supplied component geometry and materials. Missing models remain reported stand-ins. No model, HDR image, rendering service or additional network environment asset is downloaded by the preset. If environment reflections are unavailable, the viewer reports it and retains direct lighting.

The presentation example uses the credited OLIMEX public hardware package. Its upstream hardware license and conversion/model provenance remain separate from the library’s MPL-2.0 license. Physical-device speed and compatibility must be checked on the intended host and device.
