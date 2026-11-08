# Mobile embeds

The shared viewer adapts to its container width, including narrow iframes on a desktop. Below 540 px the file picker and controls wrap; menus and the inspector stay within the embed, with scrolling inside longer panels. Touch devices use 44 px primary controls and 16 px form text to avoid iOS focus zoom. Host pages should supply a viewport meta tag and a real height, for example width:100%; height:70dvh; min-height:360px. Do not disable user scaling in the host viewport.

PCB/schematic: drag with one finger to pan, pinch with two to zoom, tap to select. 3D: drag with one finger to orbit, pinch/two-finger drag to zoom/pan. Enable Pan for one-finger 3D panning; disable it to orbit again. Top, Bottom, Iso, rotation and zoom buttons provide alternatives to gestures. Drawing gestures are reserved only on the canvas; page scrolling remains available outside it. Search results cross-select and frame parts in linked 3D views.

This applies to new library builds. Uploaded self-contained HTML files are snapshots and need regeneration. Host apps can impose their own frame dimensions or touch restrictions; verify their mobile clients separately. Responsive browser checks do not establish physical iOS/Android gesture acceptance.

Responsive browser checks covered narrow and short viewports. Physical iOS/Android gestures and host mobile apps remain unverified.