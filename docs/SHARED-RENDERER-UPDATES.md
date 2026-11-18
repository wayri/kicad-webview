# Shared renderer updates

The current source incorporates KiCad Online fixes while retaining WebView's
independent embed, camera, presentation and source-snapshot APIs.

- Embedded `lib_name` overrides and exact saved pin identities remain distinct.
  Coincident pin labels combine compatible text styles without removing pins.
- Sheet-local fields, ancestor fields and project variables resolve in their
  saved scopes. Ambiguous repeated-sheet values remain visibly unresolved.
  Metadata-only parsing avoids retaining artwork in scope lookup caches.
- Inline PNG images accept validated trailing-data saves and strip compressed
  ancillary metadata before browser decoding. Bounded uncompressed 24/32-bit BMP
  images are supported. Referenced external pictures are not fetched implicitly.
- Connector interiors and actual text bounds have more consistent picking.
  Selected nets use crisp strokes without blurred highlights. Saved copper-fill
  bridges are filled without an added outline stroke.
- Layer inspection reveals selected inner copper while retaining checkbox choices
  for restoration. Bounded zone allocation reserves room across requested layers
  and reports omitted contours by layer.
- 3D copper uses saved depths, source-refined track arcs and via spans. Existing
  Expand mode, source-linked selection, registered result guards and camera
  controls are preserved. Partial-depth dielectric cavities remain unmeshed.
- Model discovery reuses parsed source and handles unambiguous repository casing
  and alternate model formats. It does not fetch arbitrary library URLs.

Focused source checks passed 248 tests without skips, including native KiCad
orientation fixtures, repeated-sheet scope resolution, saved image validation,
prepared-parser ownership, 32-layer budget allocation and numerical copper
geometry checks. Browser/WebGL acceptance and generated SDK builds are separate
checks; these source tests do not establish whole-tab memory or frame-rate limits.

This source update does not submit browser stores or publish an npm SDK version.
Browser-session GitHub collaboration belongs to the KiCad Online host and is not
added to WebView's read-only project embed.
