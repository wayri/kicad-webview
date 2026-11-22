# KiCad WebView 1.2.0

Large boards use less memory while loading and inspecting saved copper. Named PCB loads store ordinary filled-zone coordinates in 64-bit buffers. The parser fills those buffers directly for ordinary saved contours. The 2D canvas reads the same buffers for drawing and picking. The comparison parser still returns its usual tree, and irregular contours keep the general parsing path.

Dense 2D drawings use a limited preview while dragging or zooming and restore full detail when movement stops. Drawing batches consecutive opaque copper strokes and reuses spatial query buffers. Picking gives the viewed side priority when traces overlap. Collapsed panes skip drawing until they have a usable viewport. Net expansion in 3D updates selected geometry without repeatedly scanning board-wide net membership. Switching to 3D releases the materialized 2D zone point cache.

Open a `.kicad_wks` template on its own or apply one to a schematic or PCB. Fit page shows the paper and title block. The 2D PCB Outline preset shows the saved Edge.Cuts layer, including routed cutouts. See [the public API guide](PUBLIC-API.md) for loading options and format limits.

## Verification

On the same saved Marble board, three isolated processes per version measured the parser, drawing model and connectivity. Compared with the preceding compact-tree candidate, median peak process working set dropped from 575,116 to 525,472 KiB. Retained JS heap plus buffers remained about 300 MB. Median import time was 1.36 versus 1.45 seconds with overlapping ranges. Both versions produced 205,702 drawing primitives and 1,374 nets.

A separate 20,000-segment scene used 79 Canvas stroke calls while submitting all segments. This is a draw-call count. Real browser frame times and memory vary by board and device. The headless browser suite verified KERO and mobile-width IRCA and Marble embeds. Marble preserved all 139 rendered contours, and IRCA passed a 3D to 2D to 3D round trip. The complete source suite passed 734 tests.
