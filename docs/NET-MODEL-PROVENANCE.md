# Saved connectivity engine

engine/net-model.js is an owner-authorized source copy of extension/net-model.js from the local KiCad browser-review project, retained independently (no sibling imports at runtime). SHA-256 at extraction: 73407afa294065444853fb798dd40c01908907f5dcca93c7dba04d9895eaef55. The repository license and inherited third-party notices apply. It extracts saved PCB assignments and bounded per-file schematic source connectivity; it does not run KiCad's netlist/ERC/DRC engine. Bus membership, implicit hidden power pins and repeated-sheet instance connectivity remain limited.

Standalone modifications quarantine duplicate saved source UUIDs before geometry membership expansion and enforce a 400,000-reference aggregate membership-work cap. Ambiguous geometry is excluded with visible warnings. The original extraction hash above describes the copied input, not the modified current file.
