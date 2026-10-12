# Provenance

## Assets

| file | sha256 (first 8) | origin |
|---|---|---|
| `assets/model/rest_ideal_v1.json` | de7107b3 | Cushion mesh as rest vertices and triangles: 22,948 vertices and 45,892 triangles per cushion, 0.36 m plan, z up. |
| `assets/fabric/weave_height.png` | 35ad65ee | Procedurally generated tileable plain-weave height map (deterministic seed 20261011), 24 mm tile, about 2 mm thread pitch. |
| `assets/fabric/weave_roughness_512.png` | 708eccd6 | Same procedure: roughness, 512 px web variant. |
| `assets/fabric/weave_basecolor_512.png` | ba11dc56 | Same procedure: neutral charcoal colour (mean about #303030), 512 px. |
| `assets/fabric/weave_normal_512.png` | d5a7e54f | Same procedure: tangent normal map, 512 px, renormalised. |
| `fonts/*.otf` | - | TeX Gyre Heros / Heros Cn, unmodified (see `THIRD-PARTY-NOTICES.md`). |
| `vendor/three/*` | - | three.js, unmodified (see `THIRD-PARTY-NOTICES.md`). |

- The weave maps were made procedurally for COLLIDE from a deterministic recipe:
  - a tileable plain weave, 24 mm tile, about 2 mm thread pitch, seed 20261011;
  - 1024 px masters reduced to 512 px web variants by a 2 x 2 box filter, with the normal map renormalised.

  The script is not included, so the maps cannot be regenerated from this repository. No third-party material is used in them.
- `play.js` checks every asset above, and the response module, by SHA-256 before using it.

## Code lineage

- **`interactive-response.js`:** the approximate response module (planar rigid motion, footprint signed-distance contact, render-only squish). It is pinned by hash in `play.js` (c4a1496d) and is shipped byte-identical to the reviewed version, so its comments are the original working notes. This version only speeds up `writeVerts`; in parity tests its float32 output is identical to the earlier reviewed module (6eb2c07a).
- **`play.js` and `index.html`:** taken from the reviewed build. The only changes are packaging:
  - the import map now points into `vendor/`;
  - outdated comments were corrected (a removed footer link, a superseded mesh name);
  - internal names were removed from comments;
  - the title was changed;
  - two hidden placeholder dashes were replaced.

  No change to logic, camera, material, layout or interaction.
- **`placeholder-response.js`:** a rigid stub used only with `?response=placeholder`.

## Evidence boundary

- **What exists:** the checks summarised in `README.md` were made during development with browser automation and headless runs.
- **What is shipped:** the raw logs, screenshots and recordings stay in the private workspace. Only `npm test` ships here, and it re-checks what can be re-checked without a browser.
- **Earlier research:** a separate XPBD solver (Rust/WASM) on related plus-shaped cushions (not this mesh) informed this work. It is not included and is not running here.
