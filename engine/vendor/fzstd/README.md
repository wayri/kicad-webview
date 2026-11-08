# fzstd

Vendored fzstd 0.1.1 UMD build, MIT licensed. Sources:

- https://unpkg.com/fzstd@0.1.1/umd/index.js
- https://github.com/101arrowz/fzstd

Used for local KiCad embedded 3D model Zstandard decoding. The viewer validates
frame content size, window size and block boundaries before decoding, with an
8 MiB per-model limit and a 24 MiB total decoded model budget. External resources
in VRML and GLB are rejected. SHA-256 and KiCad's seeded MurmurHash3 checksums
are verified, including KiCad's historical tail-padding compatibility variant.
