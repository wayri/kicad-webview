# Embedded model fixture

`native-box.kicad_pcb` was loaded and saved with installed KiCad 10.0.6 using
`pcbnew.LoadBoard` / `pcbnew.SaveBoard`. It contains a simple VRML Box embedded
with KiCad's native base64 Zstandard representation and historical MurmurHash
checksum. Its source was authored here; no third-party board geometry is used.

Native `kicad-cli pcb export vrml` accepted its checksum and exported model
geometry. The board has no outline, so the CLI also reported a malformed outline.
This fixture verifies saved embedded payload decoding, not full-board rendering
fidelity or acceptance on a physical Android device.

`native-vectors.kicad_pcb` additionally retains native-accepted historical
MurmurHash checksums for 13–16 and 29–32 bytes of `x`. Residual lengths 13–15
exercise KiCad's legacy behavior that skips the tail when padding rounds it
to a complete block. Modern hashing includes those bytes.

`outlined-box.kicad_pcb` is the full-board loading companion: the unchanged native
box model bytes/checksum and U1 placement are retained, with an authored 25 x 25 mm
rectangular Edge.Cuts outline from (0,10) to (25,35). KiCad CLI 10.0.6 exported it
successfully with `pcb export vrml` on 2026-10-25, without the malformed-outline
diagnostic. It is an owned synthetic loading fixture; it does not establish
pixel-equivalent rendering or physical Android acceptance.
