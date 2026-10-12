// COLLIDE stage. Layers:
//   dynamics + squish  = the response module (interactive-response.js): approximate planar motion with a render-only squish
//   render             = this file: the +ideal-v1 cushion mesh (22948 vertices/body) drawn from the module's
//                        world-space render vertices, a charcoal weave in rest-space triplanar, studio lights, camera
//   no physical solver runs in this page
// Fixed 1/60 s steps; up to 4 per display frame, any backlog beyond that is dropped and the measured sim/wall is shown.
import * as THREE from 'three';
import { createResponse as createPlaceholder } from './placeholder-response.js';

const $ = (id) => document.getElementById(id);
const IN = {
  matH: ['./assets/fabric/weave_height.png', '35ad65ee6f71d9f0a0d3099e5fd5b1da051241788bc89d8575ae5a7b63e07929'],
  matR: ['./assets/fabric/weave_roughness_512.png', '708eccd61f7a452f6185b3aa7590e0e0151cfb8aa432da86b811cc671bf156ca'],
  matC: ['./assets/fabric/weave_basecolor_512.png', 'ba11dc566368adc0f68ce821e151b146e295bcefceb7546ee191f3effee14957'],
  matN: ['./assets/fabric/weave_normal_512.png', 'd5a7e54fd80827ee03b664dfd2bcb8ec8d92334f1fce9a7e3da0174ca227d39c'],
  // +ideal-v1 rest mesh, normalised to a 0.36 m plan (see PROVENANCE.md)
  embedding: ['./assets/model/rest_ideal_v1.json', 'de7107b31f4728662aa2b90a63e03eff3c615fe0137f2e0c8871b6f5eca77ad1'] };
const hex = async (b) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
const fetchChecked = async ([url, sha]) => { const b = await (await fetch(url, { cache: 'no-store' })).arrayBuffer(); const got = await hex(b); if (got !== sha) throw new Error(`sha mismatch ${url}: ${got.slice(0, 8)}`); return b; };
const DT = 1 / 60, MAX_STEPS = 4, Z_FLOOR = -0.073, Z_TOP = 0.073, N1_TILE_M = 0.024, N1_BUMP = 0.9;
const qs = new URLSearchParams(location.search);
const ART = qs.get('art') === 'b' ? 'b' : 'a'; document.documentElement.dataset.art = ART;

// ---------- three ----------
const gl = $('gl'), stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = ART === 'b' ? 1.25 : 1.35;
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, 0.05, 20); cam.up.set(0, 0, 1);
// ground colour = warm floor bounce: lifts the undersides (was 0x9a9ea6, which left a hard black rim under every edge)
scene.add(new THREE.HemisphereLight(0xfffaf3, 0xd6d2ca, 1.35));
const rake = new THREE.DirectionalLight(0xfff6ea, 1.45); rake.position.set(-1.0, 0.6, 0.7); scene.add(rake);
const fill = new THREE.DirectionalLight(0xeef1f5, 0.8); fill.position.set(0.9, -0.7, 1.4); scene.add(fill);
const sun = new THREE.DirectionalLight(0xfffaf3, 1.65); sun.position.set(-0.25, 0.3, 3.0); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2, near: 0.5, far: 8 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: ART === 'b' ? 0.5 : 0.16 })); floor.position.z = Z_FLOOR; floor.receiveShadow = true; scene.add(floor);

// weave bump fade: thrPx = threads per pixel (24 mm tile = 12 threads); the derivative bump fades out before it aliases into a stripe grid
function fabricMaterial(maps) {
  // ONE shared charcoal textile (generated weave maps, mean #303030) in rest-space triplanar: the weave rides the surface (no swim)
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, sheen: 0.55, sheenColor: ART === 'b' ? 0xfff8ee : 0x777777, sheenRoughness: 0.8 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { weaveH: { value: maps.h }, weaveR: { value: maps.r }, weaveC: { value: maps.c }, weaveRep: { value: 1 / N1_TILE_M }, weaveBump: { value: N1_BUMP }, weaveN: { value: maps.n }, meso: { value: 1.0 }, slopeK: { value: 0.45 }, cavMean: { value: 0.9224 }, tint: { value: ART === 'b' ? new THREE.Vector3(23.5, 22.4, 20.6) : new THREE.Vector3(1, 1, 1) } });
    sh.vertexShader = 'attribute vec3 restPos;\nattribute vec3 restNrm;\nvarying vec3 vRest;\nvarying vec3 vRestN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRest = restPos; vRestN = restNrm;');
    sh.fragmentShader = `uniform sampler2D weaveH; uniform sampler2D weaveR; uniform sampler2D weaveC; uniform float weaveRep; uniform float weaveBump; uniform vec3 tint; varying vec3 vRest; varying vec3 vRestN;
vec3 triW() { vec3 n = abs(normalize(vRestN)); n = pow(n, vec3(4.0)); return n / (n.x + n.y + n.z); }
vec4 tri(sampler2D t) { vec3 w = triW(); return texture2D(t, vRest.yz * weaveRep) * w.x + texture2D(t, vRest.xz * weaveRep) * w.y + texture2D(t, vRest.xy * weaveRep) * w.z; }
vec3 weavePerturb(vec3 p, vec3 nrm, vec2 dH, float fd) { vec3 sx = normalize(dFdx(p)), sy = normalize(dFdy(p)), r1 = cross(sy, nrm), r2 = cross(nrm, sx);
  float det = dot(sx, r1) * fd; return normalize(abs(det) * nrm - sign(det) * (dH.x * r1 + dH.y * r2)); }
uniform sampler2D weaveN; uniform float meso; uniform float slopeK; uniform float cavMean;
vec3 triN() { vec3 w = triW(); vec3 g = vec3(0.0); float r = weaveRep * meso; vec3 t;
  t = texture2D(weaveN, vRest.yz * r).xyz * 2.0 - 1.0; g += w.x * (-t.x / t.z * vec3(0.0, 1.0, 0.0) - t.y / t.z * vec3(0.0, 0.0, 1.0));
  t = texture2D(weaveN, vRest.xz * r).xyz * 2.0 - 1.0; g += w.y * (-t.x / t.z * vec3(1.0, 0.0, 0.0) - t.y / t.z * vec3(0.0, 0.0, 1.0));
  t = texture2D(weaveN, vRest.xy * r).xyz * 2.0 - 1.0; g += w.z * (-t.x / t.z * vec3(1.0, 0.0, 0.0) - t.y / t.z * vec3(0.0, 1.0, 0.0));
  return g; }
float triH2() { vec3 w = triW(); float r = weaveRep * meso; return texture2D(weaveH, vRest.yz * r).r * w.x + texture2D(weaveH, vRest.xz * r).r * w.y + texture2D(weaveH, vRest.xy * r).r * w.z; }
` + sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= min(tri(weaveC).rgb * tint, vec3(0.92)) * mix(0.8, 1.0, triH2()) / cavMean;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(0.24 + 0.76 * tri(weaveR).r, 0.72, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n float threadFootprint = max(length(dFdx(vRest)), length(dFdy(vRest))) * weaveRep * meso * 12.0;\n vec3 gS = triN() * slopeK * (1.0 - smoothstep(0.35, 0.9, threadFootprint));\n normal = weavePerturb(-vViewPosition, normal, vec2(dot(gS, normalize(dFdx(vRest))), dot(gS, normalize(dFdy(vRest)))), faceDirection);');
  };
  return m;
}

// ---------- layout: play bounds + camera per orientation (3/4 oblique, fitted so the whole play area stays in frame) ----------
let W = 1, H = 1, portrait = false, bounds = null, init = null;
function layoutFor(p) {
  // Portrait looks steeper to cut depth foreshortening.
  // rest gap ~40-60 mm: the cushion spans about 0.36 m
  return p ? { init: [{ x: 0, y: 0.21, theta: 0 }, { x: 0, y: -0.21, theta: 0 }], el: 66 }
           : { init: [{ x: -0.2, y: 0, theta: 0 }, { x: 0.2, y: 0, theta: 0 }], el: 50 };
}
// ---------- hero framing (static camera; a moving camera fought the drag, see HERO-CAMERA-RECEIPT.md) ----------
// The camera is fitted tight on the RESTING pair; the arena walls are then the largest rectangle whose whole volume stays
// inside the frame, so a cushion can never leave view and the pointer maps 1:1 to the world (no camera motion ever).
const CAM = { dir: new THREE.Vector3(), d: 1 };
const EDGE = { x: 0.94, top: 0.88, bot: -0.8 }, KREST = 0.86, REST_HX = 0.18, REST_HY = 0.18;   // NDC frame box; resting pair (+ideal-v1 rest extents) fills 86% of it
function footprint(poses) { const P = []; for (const p of poses) for (const dx of [-REST_HX, REST_HX]) for (const dy of [-REST_HY, REST_HY]) for (const z of [Z_FLOOR, Z_TOP + 0.01]) P.push(new THREE.Vector3(p.x + dx, p.y + dy, z)); return P; }
function place(d) { cam.position.copy(CAM.dir).multiplyScalar(d); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix(); }
function inside(P, k) { return P.every(v => { const p = v.clone().project(cam); return Math.abs(p.x) <= EDGE.x * k && p.y <= EDGE.top * k && p.y >= EDGE.bot * k; }); }
const box = (hx, hy) => { const P = []; for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [Z_FLOOR, Z_TOP + 0.01]) P.push(new THREE.Vector3(x, y, z)); return P; };
const search = (ok, lo, hi) => { for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; } return lo; };
function fitCamera(el) {
  const e = el * Math.PI / 180; CAM.dir.set(0, -Math.cos(e), Math.sin(e));
  CAM.d = 1 / search((invd) => { place(1 / invd); return inside(footprint(init), KREST); }, 0.05, 3); place(CAM.d);
  const hy = search((y) => inside(box(0.01, y), 1), 0.05, 2), hx = search((x) => inside(box(x, hy), 1), 0.05, 3);
  return { xlo: -hx, xhi: hx, ylo: -hy, yhi: hy };
}
function resize() {
  const r = stage.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
  renderer.setSize(W, H, false); cam.aspect = W / H;
  const p = H > W * 1.1, L = layoutFor(p); init = L.init; const nb = fitCamera(L.el);
  if (!bounds || p !== portrait) {
    // first layout, or the screen turned: the walls change shape, so the pair is re-seated, visibly and on record
    const turned = !!bounds && !!api; portrait = p; bounds = nb;
    if (api) { letGo(null, 'cancel'); makeResponse(); }
    if (turned) { push(log.input, { t: performance.now(), type: 'reseat', portrait: p }); status('Screen turned · cushions re-seated for the new layout'); }
    return;
  }
  // same orientation (e.g. a phone toolbar showing/hiding): keep the walls, the pair and any held grab; only pull the
  // static camera back far enough that the kept walls still fit the frame (never closer than the rest fit)
  const kept = box(bounds.xhi, bounds.yhi);
  if (!inside(kept, 1)) { CAM.d = 1 / search((invd) => { place(1 / invd); return inside(kept, 1); }, 0.05, 3); place(CAM.d); }
  if (api) push(log.input, { t: performance.now(), type: 'resize', w: Math.round(W), h: Math.round(H), camD: +CAM.d.toFixed(4) });
}

// ---------- response module ----------
// default = the response module for +ideal-v1 (sha-checked here, executed from the checked bytes); ?response=placeholder = rigid stub
const N1_MODULE = ['./interactive-response.js', 'c4a1496d1387991db20f0ff08bd77945263c9a3c5bed0ea8136176bb956f4b4f'];
const USE_PLACEHOLDER = qs.get('response') === 'placeholder';
let createResponse = createPlaceholder;
let paused = false;
let api = null, rest = null, tris = null, meshes = [], held = null, maps = null;
const log = { frames: [], input: [], nonfinite: 0 };
const push = (a, v, n = 1800) => { a.push(v); if (a.length > n) a.shift(); };
function makeResponse() {
  api = createResponse({ rest, tris, init, bounds }); held = null;
  for (let b = 0; b < 2; b++) api.writeVerts(b, meshes[b].geometry.attributes.position.array);
}

// ---------- input: direct grab on the cushion mid-plane (z = 0) ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function castFrom(e) { const r = gl.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); }
function worldAt(e, z = Z_TOP) { castFrom(e); const o = ray.ray.origin, d = ray.ray.direction, t = (z - o.z) / d.z; return [o.x + d.x * t, o.y + d.y * t]; }   // pointer on a horizontal plane at height z
// grab = the FRONT-MOST rendered v1 surface under the pointer (top, welt or tall side wall); the drag then runs on a plane at
// that hit's own height, so the grabbed point stays under the pointer (no jump)
function hitAt(e) { castFrom(e); for (const m of meshes) { m.updateMatrixWorld(); m.geometry.computeBoundingSphere(); }
  const h = ray.intersectObjects(meshes, false)[0]; return h ? { b: meshes.indexOf(h.object), p: h.point } : null; }
gl.addEventListener('pointerdown', (e) => { if (!api || held || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const h = hitAt(e); if (!h) return;
  // the module's grab accepts points on/inside its footprint; a side-wall/welt hit just outside it is moved toward the body
  // centre in 5 mm steps (max 40 mm) and the drag keeps that offset, so nothing jumps and nothing outside the mask grabs
  const b = h.b, o = api.pose(b), L = Math.hypot(o.x - h.p.x, o.y - h.p.y) || 1; let ax = h.p.x, ay = h.p.y, k = 0, ok = api.grab(b, ax, ay);
  while (!ok && k < 8) { k++; ax = h.p.x + (o.x - h.p.x) / L * 0.005 * k; ay = h.p.y + (o.y - h.p.y) / L * 0.005 * k; ok = api.grab(b, ax, ay); }
  if (!ok) return;
  const x = h.p.x, y = h.p.y;
  held = { b, id: e.pointerId, z: h.p.z, ox: ax - h.p.x, oy: ay - h.p.y, nudge_mm: 5 * k }; gl.setPointerCapture(e.pointerId); gl.classList.add('held'); gl.style.cursor = 'grabbing'; e.preventDefault();
  push(log.input, { t: performance.now(), type: 'grab', b, x, y, pointer: e.pointerType }); status(`Holding ${'AB'[b]} · push it into the other`); });
gl.addEventListener('pointermove', (e) => { if (!api) return; const [x, y] = worldAt(e);
  if (!held) { gl.style.cursor = api.pick(x, y) >= 0 ? 'grab' : 'default'; return; }
  if (e.pointerId === held.id) { const [u, v] = worldAt(e, held.z); api.drag(u + held.ox, v + held.oy); } });
function letGo(e, how) { if (!held || (e && e.pointerId !== undefined && e.pointerId !== held.id)) return;
  how === 'release' ? api.release() : api.cancel(); push(log.input, { t: performance.now(), type: how, b: held.b }); held = null; gl.classList.remove('held'); gl.style.cursor = ''; status(IDLE); }
gl.addEventListener('pointerup', (e) => letGo(e, 'release'));
gl.addEventListener('pointercancel', (e) => letGo(e, 'cancel'));
gl.addEventListener('lostpointercapture', (e) => letGo(e, 'cancel'));
addEventListener('blur', () => letGo(null, 'cancel'));
addEventListener('keydown', (e) => { if (e.key === 'Escape') letGo(null, 'cancel'); });
$('settle').onclick = () => { if (!api) return; letGo(null, 'cancel'); api.reset(); push(log.input, { t: performance.now(), type: 'settle' }); };

// ---------- loop ----------
let IDLE = 'Grab a cushion and push it into the other.', last = performance.now(), acc = 0, sim = 0, wall = 0;
function status(m) { $('status').textContent = m; }
function loop(now) {
  const dtw = (now - last) / 1000; last = now; requestAnimationFrame(loop); if (!api) return;
  const t0 = performance.now(); acc += Math.min(dtw, 0.25); wall += dtw; let steps = 0;
  if (paused) acc = 0;
  while (acc >= DT && steps < MAX_STEPS) { api.step(DT); acc -= DT; steps++; sim += DT; }
  if (acc >= DT) acc = 0;   // backlog dropped, never fast-forwarded (sim/wall shows it)
  const ok = api.finite();
  if (!ok) { log.nonfinite++; letGo(null, 'cancel'); api.reset(); status('Response went non-finite · cushions settled back (logged)'); }
  else syncMeshes();
  const ms = performance.now() - t0; renderer.render(scene, cam);
  const c = api.contact(), sq = [api.squish(0), api.squish(1)];
  // Instruction only: follows the approximate module, never invents pressure or deformation.
  const cue = held ? (c.active ? 'In contact · let go to release' : 'Move slowly · bring them together') : 'Grab a cushion · push it into the other · let go';
  if ($('hint').textContent !== cue) $('hint').textContent = cue;
  push(log.frames, { t: now, steps, ms: +ms.toFixed(2), renderMs: +(performance.now() - t0 - ms).toFixed(2), contact: c, squish: sq, poses: [api.pose(0), api.pose(1)], held: held ? held.b : -1, ok, camD: +CAM.d.toFixed(4), inFrame: (log.frames.length % 5 === 0 ? (lastIn = inFrame()) : lastIn) });
  if (log.frames.length % 15 === 0) $('clock').textContent = `sim/wall ${(sim / Math.max(wall, 1e-6)).toFixed(2)} · frame ${p50()} ms`;
}
function inFrame() { const q = new THREE.Vector3(); for (const m of meshes) { m.updateMatrixWorld(); const a = m.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 30) { q.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(m.matrixWorld).project(cam); if (Math.abs(q.x) > 1 || Math.abs(q.y) > 1) return false; } } return true; }   // every 10th rendered vertex inside the canvas
// v1 has 3x the vertices: a body with no squish is its rest mesh moved rigidly, so it keeps the rest positions/normals and only
// its transform updates (no per-vertex work); a squished body gets the module's world-space vertices + area-weighted normals
let REST_N = null, lastIn = true; const rigid = [false, false], SQ_EPS = 1e-5;
function normalsInto(p, idx, n) { n.fill(0);
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    n[a] += nx; n[a + 1] += ny; n[a + 2] += nz; n[b] += nx; n[b + 1] += ny; n[b + 2] += nz; n[c] += nx; n[c + 1] += ny; n[c + 2] += nz; }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; } }
function syncMeshes() { for (let b = 0; b < 2; b++) { const m = meshes[b], g = m.geometry, q = api.squish(b), P = g.attributes.position, N = g.attributes.normal;
  if (q.inward_m < SQ_EPS && q.bulge_m < SQ_EPS) {
    if (!rigid[b]) { P.array.set(rest); N.array.set(REST_N); P.needsUpdate = N.needsUpdate = true; rigid[b] = true; }
    const o = api.pose(b); m.position.set(o.x, o.y, 0); m.rotation.set(0, 0, o.theta);
  } else { m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); api.writeVerts(b, P.array); normalsInto(P.array, tris, N.array); P.needsUpdate = N.needsUpdate = true; rigid[b] = false; } } }
const p50 = () => { const a = log.frames.slice(-120).map(f => f.ms + f.renderMs).sort((u, v) => u - v); return a.length ? a[a.length >> 1].toFixed(1) : '-'; };

// ---------- boot ----------
(async () => {
  try {
    const [h, r, c, n, emb] = await Promise.all([IN.matH, IN.matR, IN.matC, IN.matN, IN.embedding].map(fetchChecked));
    const tex = async (buf, srgb) => { const t = new THREE.Texture(await createImageBitmap(new Blob([buf]), { imageOrientation: 'flipY' }));
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; return t; };
    maps = { h: await tex(h, false), r: await tex(r, false), c: await tex(c, true), n: await tex(n, false) };
    const E = JSON.parse(new TextDecoder().decode(emb));
    rest = Float32Array.from(E.vertices.flat()); tris = Uint32Array.from(E.triangles.flat());
    const g0 = new THREE.BufferGeometry(); g0.setAttribute('position', new THREE.BufferAttribute(rest, 3)); g0.setIndex(new THREE.BufferAttribute(tris, 1)); g0.computeVertexNormals();
    const restNrm = g0.attributes.normal.array, mat = fabricMaterial(maps); REST_N = restNrm;
    meshes = [0, 1].map(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rest.length), 3));
      g.setAttribute('restPos', new THREE.BufferAttribute(rest, 3)); g.setAttribute('restNrm', new THREE.BufferAttribute(restNrm, 3)); g.setIndex(new THREE.BufferAttribute(tris, 1));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(rest.length), 3));
      const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; });
    if (!USE_PLACEHOLDER) { const src = await fetchChecked(N1_MODULE); const u = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })); createResponse = (await import(u)).createResponse; URL.revokeObjectURL(u); }
    resize(); makeResponse();
    if (!USE_PLACEHOLDER) IDLE = 'Approximate model: the squish is drawn, not measured.';
    else if (api.placeholder) { IDLE = 'PLACEHOLDER response: rigid drag only, no collision or squish yet (response module not loaded).'; $('mode').textContent = 'Placeholder · no soft response'; }
    status(IDLE); last = performance.now();
  } catch (err) { status('Could not start: ' + err.message); throw err; }
})();
new ResizeObserver(resize).observe(stage);
requestAnimationFrame(loop);
window.__fi = { get api() { return api; }, worldAt: (cx, cy, z) => worldAt({ clientX: cx, clientY: cy }, z), get meshes() { return meshes; }, rigid, log, get held() { return held; }, cam, get bounds() { return bounds; }, get portrait() { return portrait; },
  toScreen(x, y, z = 0) { const p = new THREE.Vector3(x, y, z).project(cam), r = gl.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; },
  bodies() { return [0, 1].map(b => { const a = meshes[b].geometry.attributes.position.array; let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[i + k]); hi[k] = Math.max(hi[k], a[i + k]); } return { pose: api.pose(b), lo, hi }; }); },
  sim: () => ({ sim, wall }),
  CAM, setPaused(v) { paused = !!v; }, advance(n) { for (let i = 0; i < n; i++) api.step(DT); syncMeshes(); renderer.render(scene, cam); } };
