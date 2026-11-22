# KiCad WebView 1.1.1

Fixed 3D placement of pads and graphics on back-side footprints. KiCad stores
these footprint-local coordinates with the flip already applied. The 3D viewer
now uses the saved positions consistently with Layout, so selecting an
asymmetric or rotated back-side pad identifies its own saved net.

The 1.1 public API, embed URLs and package entry points remain compatible.

Verification: 714 automated tests passed. In isolated Chrome, the saved
ESP32-PoE board selected EXT2.6, EXT2.5 and EXT2.6 as /GPIO32, /GPIO33 and
/GPIO32. The selected 3D pads agreed with their saved board coordinates.
