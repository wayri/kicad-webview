# Native Bezier references

These synthetic fixtures and SVG references were exported with installed
KiCad CLI **10.0.6** on 2026-11-03. The native exports were retained without
editing their drawing geometry. No user board or schematic was changed.

PCB command:

```text
kicad-cli pcb export svg --layers F.SilkS,B.SilkS --exclude-drawing-sheet --page-size-mode 1 --mode-single --output pcb-native.svg curves.kicad_pcb
```

Schematic command:

```text
kicad-cli sch export svg --exclude-drawing-sheet --output exported curves.kicad_sch
```

The schematic export is retained as `schematic-native.svg`. Reference coordinates
cover a world-coordinate PCB cubic, a rotated back-footprint cubic, and a
90-degree mirrored schematic symbol with a conductive pin joined to a wire.

Source SHA-256:

- `curves.kicad_pcb`: `d07b1901e8d7f0935955218a3ecd03a0211c0cec7527cada5bfc1f52c9f031dc`
- `curves.kicad_sch`: `e4308fe197ae060e5f62d3edb48d4d96fa64876ee770be2c9b756e0ed77a324d`

The PCB SVG retains exact cubic controls, which the regression samples
independently and compares with browser polylines to **0.00501 mm**. The schematic
SVG contains KiCad's own flattened paths; their points agree with the browser
curve within **0.006 mm**, including SVG output rounding. The pin/wire landmarks
match exactly at the exported **(130, 110) mm** connection. This proves the tested
geometry and transforms, not overall font or pixel equivalence.

Browser subdivision uses a 0.005 mm control-hull tolerance, at most 2,049 points
per cubic, and shared curve-point budgets per drawing. Malformed or over-budget
curves are omitted with a diagnostic rather than replaced by a straight segment.
