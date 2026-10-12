# COLLIDE

Two upholstered, plus-shaped cushions on a pale gallery floor. Grab one, push it into the other, let go.

**Live artwork:** https://collide.ferdon.dev/  |  **Public source:** https://github.com/notferdon/collide

**Status:** released as an interactive artwork with the documented approximation and limitations below.

## Run it

```sh
node scripts/serve.mjs        # then open http://127.0.0.1:8080/
```

Any static file server works (for example `python3 -m http.server 8080` from this folder). Opening `index.html` directly from disk does not, because the page uses ES modules and `fetch`.

**Browser:** WebGL2, ES modules and import maps (current Chrome, Edge, Firefox and Safari). There is no build step and nothing to install.

## Using it

- **Grab:** press on a cushion, anywhere you can see it, including its sides. Mouse and touch both work.
- **Push:** drag it into the other cushion, then let go.
- **Settle:** returns both cushions to rest.
- **Cancel:** Escape, a cancelled touch, or leaving the window lets go of a grab.
- **Keyboard:** there is no keyboard way to grab or push a cushion. From the keyboard you can only reach the Settle button and cancel a grab with Escape, which is not an equivalent of the pointer interaction.
- `?response=placeholder` swaps in a rigid stub with no contact (a wiring check, not the artwork).

## How it works

| file | role |
|---|---|
| `index.html` | Layout, fonts and the import map. |
| `play.js` | three.js scene and interaction. A fixed camera is fitted to the resting pair, and the invisible walls are the largest box that stays in frame. A pointer press raycasts the rendered cushions and grabs the front-most one at the point under the pointer. Every asset and the response module are SHA-256 checked before use. |
| `interactive-response.js` | Approximate motion. Two rigid bodies move in the floor plane (position and rotation) with a grab spring, penalty contact on a signed-distance grid of each cushion's footprint, and walls, in fixed 1/240 s substeps. The squish is render-only: near contact, a copy of the rest vertices is displaced along their rest normals and recovers after release. It never feeds back into the motion. |
| `assets/model/rest_ideal_v1.json` | The cushion mesh at rest (22,948 vertices per cushion). |
| `assets/fabric/` | Weave height, roughness, colour and normal maps, sampled triplanar in rest space so the weave stays on the surface as it squishes. |
| `vendor/three/` | three.js (MIT), unmodified. |

## What it is and is not

- It is an **interactive material study with an approximated soft-body response**.
- The squish is **drawn, not simulated**. There is no fabric, foam or finite-element physics, and the page says so.
- The motion is planar and approximate: cushions slide and turn on the floor; nothing lifts.
- An earlier, separate research build ran a real XPBD solver (Rust/WASM) on related plus-shaped cushions (not this mesh). It is one-shot and slower than real time, it is not part of this repository, and nothing from it runs here.

## What has been checked, and what has not

Unless stated otherwise, these were reviewed on 2026-10-12 in headless Chrome with emulated touch.

**Checked:**
- Grabbing was tested on sampled pixels: 36 of 36 side-wall and 10 of 10 top pixels grabbed the right cushion at each viewport (1440 x 900, 390 x 844 and 390 x 667), and 0 of 14 sampled points outside the cushions grabbed anything.
- Settle works.
- The layout fits 1440 x 900, 390 x 844 and 390 x 667 with no clipping or scrolling.
- Resting cushions do not touch.
- In headless stress runs of the response module there was no lock-up and every value stayed finite.
- **One physical phone:** two screen recordings (about 18 s and 36 s) from an iPhone in Safari, portrait, showed the page rendering and, in one clip, reloading, and basic grab, push, held contact and release working, with no visible crash or stuck grab. The device model and iOS version were not recorded, and the recordings do not identify the exact build.

**Not established:**
- **Frame rate:** below target, and no run has passed, on desktop or phone. Measured runs on one integrated-GPU laptop (Intel Iris Xe, Chrome, 1440 x 900) delivered about 19-22 fps, with JavaScript work per frame at a 95th percentile of about 16.7 ms. Later controlled comparisons on that machine were stopped before running, because a blank WebGL control page was not steady. The current response module's CPU optimisation has not been measured in a browser. The phone recordings do not measure frame rate, and no phone frame rate is claimed.
- **Phones beyond basic interaction:** on the physical iPhone, Settle, turning the device, deep held pushes and frame rate were not witnessed. No other phone has been tried.
- **Deepest contacts:** the review gate is 6 mm of mesh overlap. The surrogate check (an upper bound from every second vertex) showed up to 7.0 mm on a hard angled push; an exact point-to-triangle measurement of one saved state showed 5.13 mm, as a diagnostic only. The gate is still open.
- **Softness and contact feel:** testing by hand on desktop, the squish read as mild and subtle; in the phone recordings, reviewed at 512 px, no squish was clearly discernible. In hands-on desktop use and in headless tests, under deep held contact the cushions slip and rotate, the drawn indent can jump between frames, and the release can look abrupt; deep held contact was not observed in the phone recordings. These are open; no fix has been validated.
- **Visible slit at the notch:** when an arm is pressed into the other cushion's notch, a white slit can stay visible between the cushions while they are in contact. Headless measurements found two separate causes:
  - above and below the belt: contact is computed on the flat top-view outline, which matches the cushion's widest belt, while the rounded sides recede above and below it and leave a wedge;
  - at the belt itself: in light and medium pushes a second squish region forms inside the same contact patch, and the doubled indent leaves extra clearance at the belt (sampled exact clearance of about +5.8 mm and +11.2 mm), whereas in hard pushes with a single region the belt overlaps instead.

  The clearances are exact point-to-triangle distances on every second vertex in four held states; that the taper explains the visible wedge is inferred from this sampled geometry, not from an exact reconstruction of the camera view. No fix has been validated.
- **Stress-test depth:** in randomised headless stress gestures, the deepest contact reached 70.18 mm, over a 70 mm screening limit. This is a formal miss and has not been waived.
- **Mesh distortion under hard pushes:** in a simulated slow hard push using estimated values for the page's walls (not read directly from the page), the smallest triangle shrank to about 0.434-0.457 of its rest area, below a 0.5 screening limit, with no folded (flipped) triangles. Whether a person can produce that push on screen, and whether it is visible, has not been shown. Separate earlier randomized stress runs with wider walls gave about 0.39-0.48.

## Tests

```sh
npm test        # Node 20+, no dependencies
```

The tests cover:
- every pinned asset hash;
- that the import map and three.js resolve inside the repository;
- the absence of private paths, internal names and secrets in shipped text, assets' JSON included (the hash-pinned `interactive-response.js` and the vendored three.js are excluded; the module keeps its original working notes);
- a headless run of the response module (rest, push, release);
- the local server.

## Licences

- **Code:** the original software (`index.html`, `play.js`, `interactive-response.js`, `placeholder-response.js`, `scripts/`, `test/`) is MIT licensed, see `LICENSE`.
- **Artwork:** the cushion model and the weave maps in `assets/` are not covered by the MIT licence; they are included so this demo runs.
- **Third-party parts:** three.js (MIT) and TeX Gyre Heros (GUST Font License) keep their own terms, see `THIRD-PARTY-NOTICES.md`.
- **Origins of the assets:** `PROVENANCE.md`.
