# Large project bounds

The browser loader and saved-source parser accept a single modern KiCad drawing up to 256 MiB and 12 million S-expression nodes. Comparison and connectivity accept up to 512 MiB of source across 128 files. The connectivity cache retains only 96 MiB of source and metadata; larger valid inputs rebuild without caching. These are acceptance ceilings, not a promise that a device has enough memory for every drawing at the ceiling.

Direct schematic hierarchy accepts 256 MiB per modern sheet and 512 MiB total across up to 256 listed files. It keeps the existing bounded depth, 4,096 displayed hierarchy instances, cancellation, and at most three concurrent remote reads. Sheetfile names never authorize a new network request.

The ZIP reader accepts 256 MiB compressed input, 512 MiB expanded data, 256 MiB per entry, and 256 entries. Declared sizes, CRC, compression ratio, safe paths, and entry consistency remain enforced. Hosted project metadata remains capped at 8 MiB; linked 3D model assets remain capped at 8 MiB each. Manufacturing manifest loading retains its separate 32 MiB per file and 128 MiB aggregate bounds.

PCB and schematic geometry extraction and connectivity each admit up to 1.5 million drawing primitives per file. Saved-object inspection indexes up to 50,000 parts, 500,000 records, 1.5 million primitives, and 3 million geometry memberships; it reports truncation. Board/BOM analytics accepts the same 256 MiB source input but retains its separate 100,000 counted-object, 200,000 zone-point, and 64-field analysis bounds.

A focused synthetic check covers the last of 20,001 saved parts and geometry after 1.2 million frame entries on a 32-layer board. That proves late lookup in the bounded index, not full drawing speed for 1.2 million distinct primitives. Large files can use substantially more browser memory than their source size during parsing and rendering. Internal 3D copper has not been qualified at these bounds; validate representative boards before claiming complete 3D fidelity.


## Next release: lower retained memory (unreleased)

Normal viewing now prepares a shared parsed source tree without retaining canonical comparison strings or comparison-record metadata. Connectivity derives lightweight saved identities/fields from that tree when needed. Actual comparison callers retain the existing complete fingerprint behavior. UTF-8 size checks count bytes without allocating another input-sized byte buffer; acceptance limits have not been raised.

3D repeats reuse ordinary dim materials by source material. Instanced color/shadow variants remain independent. Identical validated pad and via-cap contours reuse local extrusion buffers across copper layers only when drill contour and copper thickness also match. Layer placement, saved identities, picking and expansion stay per instance. The geometry reuse table is mount-local and bounded to 512 entries; the scene resource owner disposes shared buffers once. Model base64 decoding uses the native bounded decoder where available, with a preallocated indexed-copy fallback instead of an iterable expansion.

In the 100,000-object prepared-source synthetic check, three isolated-process medians showed 29.6% less retained heap for this stage (about 65.4 MiB saved). This is not a whole-viewer or physical-phone RAM guarantee. Source trees, inspection indexes, actual distinct geometry, textures and GPU targets still consume memory proportional to their contents. The viewer remains resident-memory rendering; it does not page arbitrary-size assemblies from disk. See [memory measurements](MEMORY-OPTIMIZATION.md) for reproducible commands, counts and limits.
