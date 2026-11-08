# Original sensor review example

These small synthetic designs demonstrate full KiCad pages, title blocks, schematic hierarchy, symbol properties, PCB layers and revision comparisons. They are original test examples, not an electrically validated circuit or fabrication-ready board.

Open `sensor.kicad_sch` as the root schematic to navigate to `power.kicad_sch`. Open `sensor.kicad_pcb` for layout review. The embedded schematic symbol and PCB pads do not require external symbol or footprint libraries; no component 3D assets are supplied.

The Python acceptance fixtures in `tests/fixtures.py` also provide a changed revision (resistor value, worksheet revision, footprint position and tracks) for testing Git comparisons. The Actions workflow exercises those changes in a temporary Git repository using the real installed KiCad renderer.
