// COLLIDE interactive response module v3m-ideal (v3 3c38fb44 + contact shape built from the rest mesh footprint + squish sigma 60 mm; for +ideal-v1) — INTERACTIVE MATERIAL STUDY / APPROXIMATED SOFT-BODY RESPONSE (N1, 2026-10-11).
// NOT FEM, NOT the V4 solver. Two layers, kept separate:
//  (1) DYNAMICS: two rigid 2D bodies (x, y, theta, vx, vy, omega) on a damped "table", fixed dt 1/240 s substeps, pointer-grab spring
//      (force-capped), stiffening penalty contact (k d (1 + (d/40 mm)^2): soft first, firm deep) between the two VISIBLE plus silhouettes (signed distance grid of the rest mesh's own top-view
//      footprint, 1 mm raster), stiff arena walls (no squish). Clamped velocities; finite guard restores the last valid state.
//  (2) RENDER-ONLY SQUISH on a DUPLICATE of the 7998 rest skin vertices: one contact channel per body. While compressing, the indent
//      equals half the visible overlap (surfaces meet, no visible interpenetration up to the 30 mm cap); on release a damped 6 Hz
//      spring (zeta 0.2) recovers with a small wobble. The displacement is a SMOOTH VECTOR FIELD in body space (spatial gradient < 1 =>
//      no triangle inversion): push-in along the contact normal, lateral spread and vertical puff around it. Vertices carry their rest
//      position (texture stays attached; fabric compresses, does not swim). |displacement| <= 30 mm. Never feeds back into dynamics.
// Pure ES module, no DOM/THREE, deterministic for a given call sequence (no randomness, no wall clock).
const DT = 1 / 240, MASS = 0.8008, VMAX = 3.0, WMAX = 12.0, LIN_DAMP = 2.5, ANG_DAMP = 4.0;
const K_LINE = 700, D0 = 0.04, C_LINE = 18, RELAX_MIN = 0.55, RELAX_IN = 0.6, RELAX_OUT = 0.15, CLUSTER = 0.09, DEEP = 0.03, GRAB_SOFT = 0.035, GRAB_LIM = 0.05, K_WALL = 4000, C_WALL = 40, MU = 0.3;           // contact line stiffness N/m^2, damping N s/m^2
const GRAB_K = 50, GRAB_C = 2 * Math.sqrt(50 * 0.8008), GRAB_FMAX = 8;            // critically damped grab spring, force cap 8 N
const SQ_W = 2 * Math.PI * 6, SQ_Z = 0.2, SQ_SIGMA = 0.060, SQ_DEPTH = 0.06, BULGE = 0.35, PUFF = 0.15, DMAX = 0.030;
// CONTACT SHAPE = the rest mesh's own top-view footprint (generic; replaces the +simpler-specific analytic rounded plus):
// every rest triangle projected to xy is rasterised at 1 mm, then an exact signed Euclidean distance grid (Felzenszwalb) is sampled
// bilinearly. Concave arm ends, flared lips and fillets of +ideal-v1 are therefore represented (error ~<1 mm), not boxed over.
const RES = 0.001;
function edt1(f, n, d, v, z) { let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) { let sq = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (sq <= z[k]) { k--; sq = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = sq; z[k + 1] = Infinity; }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; } }
function edt2(target, N) {                                                        // squared distance (cells) to the nearest target cell
  const INF = 1e20, g = new Float64Array(N * N), f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1);
  for (let i = 0; i < N * N; i++) g[i] = target[i] ? 0 : INF;
  for (let x = 0; x < N; x++) { for (let y = 0; y < N; y++) f[y] = g[y * N + x]; edt1(f, N, d, v, z); for (let y = 0; y < N; y++) g[y * N + x] = d[y]; }
  for (let y = 0; y < N; y++) { for (let x = 0; x < N; x++) f[x] = g[y * N + x]; edt1(f, N, d, v, z); for (let x = 0; x < N; x++) g[y * N + x] = d[x]; }
  return g;
}
function buildSdf(rest, tris) {
  let L = 0; for (let i = 0; i < rest.length; i += 3) L = Math.max(L, Math.abs(rest[i]), Math.abs(rest[i + 1])); L += 0.03;
  const N = Math.ceil(2 * L / RES), inside = new Uint8Array(N * N), cx = (i) => -L + (i + 0.5) * RES;
  for (let t = 0; t < tris.length; t += 3) { const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
    const ax = rest[a], ay = rest[a + 1], bx = rest[b], by = rest[b + 1], qx = rest[c], qy = rest[c + 1];
    const den = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy); if (Math.abs(den) < 1e-14) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, qx) + L) / RES)), i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx, qx) + L) / RES));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, qy) + L) / RES)), j1 = Math.min(N - 1, Math.ceil((Math.max(ay, by, qy) + L) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const px = cx(i), py = cx(j);
      const w0 = ((by - qy) * (px - qx) + (qx - bx) * (py - qy)) / den, w1 = ((qy - ay) * (px - qx) + (ax - qx) * (py - qy)) / den;
      if (w0 >= -1e-9 && w1 >= -1e-9 && 1 - w0 - w1 >= -1e-9) inside[j * N + i] = 1; } }
  const out = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) out[i] = inside[i] ? 0 : 1;
  const dIn = edt2(inside, N), dOut = edt2(out, N), G = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) G[i] = inside[i] ? -(Math.sqrt(dOut[i]) - 0.5) * RES : (Math.sqrt(dIn[i]) - 0.5) * RES;
  const at = (i, j) => G[j * N + i];
  function sdf(x, y) {
    let u = (x + L) / RES - 0.5, w = (y + L) / RES - 0.5, ex = 0, ey = 0;
    if (u < 0) { ex = -u; u = 0; } else if (u > N - 1) { ex = u - (N - 1); u = N - 1; }
    if (w < 0) { ey = -w; w = 0; } else if (w > N - 1) { ey = w - (N - 1); w = N - 1; }
    const i = Math.min(N - 2, Math.floor(u)), j = Math.min(N - 2, Math.floor(w)), fu = u - i, fw = w - j;
    const s = (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fw) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fw;
    return s + Math.hypot(ex, ey) * RES;
  }
  return sdf;
}
function silhouette(sdf, n) {                                                     // n points on the zero contour (radial bisection)
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a); let lo = 0, hi = 0.3;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (sdf(m * c, m * s) < 0) lo = m; else hi = m; } pts.push([lo * c, lo * s]); }
  const ds = []; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], r = pts[(i + n - 1) % n]; ds.push(0.5 * (Math.hypot(q[0] - p[0], q[1] - p[1]) + Math.hypot(p[0] - r[0], p[1] - r[1]))); }
  return { pts, ds };
}
export function createResponse({ rest, tris, init = [{ x: -0.35, y: 0, theta: 0 }, { x: 0.35, y: 0, theta: 0 }], bounds = { xlo: -1, xhi: 1, ylo: -0.6, yhi: 0.6 } }) {
  const sdf = buildSdf(rest, tris), NV = rest.length / 3, SIL = silhouette(sdf, 160);
  const grad = (x, y) => { const e = RES, gx = sdf(x + e, y) - sdf(x - e, y), gy = sdf(x, y + e) - sdf(x, y - e), n = Math.hypot(gx, gy) || 1; return [gx / n, gy / n]; };
  let inertia = 0; { let n = 0; for (let x = -0.22; x <= 0.22; x += 0.004) for (let y = -0.22; y <= 0.22; y += 0.004) if (sdf(x, y) < 0) { inertia += x * x + y * y; n++; } inertia = MASS * inertia / n; }
  const nrm = new Float64Array(NV * 3);                                           // area-weighted rest vertex normals
  for (let t = 0; t < tris.length; t += 3) { const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    const ux = rest[3 * b] - rest[3 * a], uy = rest[3 * b + 1] - rest[3 * a + 1], uz = rest[3 * b + 2] - rest[3 * a + 2], vx = rest[3 * c] - rest[3 * a], vy = rest[3 * c + 1] - rest[3 * a + 1], vz = rest[3 * c + 2] - rest[3 * a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nrm[3 * v + k] += n[k]; }
  for (let v = 0; v < NV; v++) { const l = Math.hypot(nrm[3 * v], nrm[3 * v + 1], nrm[3 * v + 2]) || 1; for (let k = 0; k < 3; k++) nrm[3 * v + k] /= l; }
  const zmax = rest.reduce((m, v, i) => (i % 3 === 2 ? Math.max(m, Math.abs(v)) : m), 0);
  let B, grab, acc, last, cont, badFrames, relax;
  const newCh = () => ({ a: 0, va: 0, target: 0, cx: 0, cy: 0, mx: 1, my: 0, live: false });
  function reset() {
    B = init.map(p => ({ x: p.x, y: p.y, th: p.theta, vx: 0, vy: 0, w: 0, fx: 0, fy: 0, tq: 0, chs: [newCh(), newCh()] }));
    relax = 1;
    grab = null; acc = 0; badFrames = 0; cont = { active: false, nx: 0, ny: 0, depth_m: 0, impulse: 0, px: 0, py: 0 }; last = JSON.stringify(B);
  }
  const toWorld = (b, lx, ly) => { const c = Math.cos(b.th), s = Math.sin(b.th); return [b.x + c * lx - s * ly, b.y + s * lx + c * ly]; };
  const toLocal = (b, wx, wy) => { const c = Math.cos(b.th), s = Math.sin(b.th), dx = wx - b.x, dy = wy - b.y; return [c * dx + s * dy, -s * dx + c * dy]; };
  const force = (b, px, py, fx, fy) => { b.fx += fx; b.fy += fy; b.tq += (px - b.x) * fy - (py - b.y) * fx; };
  const velAt = (b, px, py) => [b.vx - b.w * (py - b.y), b.vy + b.w * (px - b.x)];
  function substep() {
    for (const b of B) { b.fx = b.fy = b.tq = 0; }
    // body-body contact: silhouette samples of i against the SDF of j (both ways), line-integrated penalty + damping + capped friction
    let depthMax = 0, wsum = 0, cx = 0, cy = 0, nx = 0, ny = 0, imp = 0; const S = [];
    for (const [i, j] of [[0, 1], [1, 0]]) { const bi = B[i], bj = B[j];
      for (let k = 0; k < SIL.pts.length; k++) { const [wx, wy] = toWorld(bi, SIL.pts[k][0], SIL.pts[k][1]); const [lx, ly] = toLocal(bj, wx, wy); const d = sdf(lx, ly); if (d >= 0) continue;
        const [gx, gy] = grad(lx, ly), c = Math.cos(bj.th), s = Math.sin(bj.th);
        // outward normal of j at the point; deep inside an interlocked plus the SDF gradient turns sideways and opposing samples cancel
        // (v1/v2 lock at ~62 mm), so blend toward the centre-to-centre axis with depth: deep contacts always push the bodies apart
        const ux = bi.x - bj.x, uy = bi.y - bj.y, ul = Math.hypot(ux, uy) || 1, al = Math.min(1, -d / DEEP);
        let n = [(1 - al) * (c * gx - s * gy) + al * ux / ul, (1 - al) * (s * gx + c * gy) + al * uy / ul]; { const l = Math.hypot(n[0], n[1]) || 1; n = [n[0] / l, n[1] / l]; }
        const va = velAt(bi, wx, wy), vb = velAt(bj, wx, wy), vr = [va[0] - vb[0], va[1] - vb[1]], vn = vr[0] * n[0] + vr[1] * n[1];
        const fn = Math.max(0, (relax * K_LINE * -d * (1 + (d / D0) * (d / D0)) - C_LINE * vn) * SIL.ds[k]), vt = [vr[0] - vn * n[0], vr[1] - vn * n[1]], vtl = Math.hypot(vt[0], vt[1]);
        const ft = vtl > 1e-9 ? Math.min(MU * fn, C_LINE * vtl * SIL.ds[k]) / vtl : 0;
        const f = [fn * n[0] - ft * vt[0], fn * n[1] - ft * vt[1]]; force(bi, wx, wy, f[0], f[1]); force(bj, wx, wy, -f[0], -f[1]);
        const wgt = -d; depthMax = Math.max(depthMax, -d); wsum += wgt; cx += wgt * wx; cy += wgt * wy; const sgn = i === 0 ? -1 : 1; nx += wgt * sgn * n[0]; ny += wgt * sgn * n[1]; imp += fn * DT; S.push([wx, wy, -d, sgn * n[0], sgn * n[1]]); } }
    cont = { active: wsum > 0, depth_m: depthMax, impulse: imp, px: wsum ? cx / wsum : 0, py: wsum ? cy / wsum : 0, nx: 0, ny: 0 };
    if (wsum) { const l = Math.hypot(nx, ny) || 1; cont.nx = nx / l; cont.ny = ny / l; }                 // normal A -> B
    // slow compression vs elastic release: held contact relaxes the contact stiffness (memory-foam-like creep), release restores it fast
    relax += cont.active ? DT * (RELAX_MIN - relax) / RELAX_IN : DT * (1 - relax) / RELAX_OUT;
    // up to 2 contact regions: seed = deepest sample, second seed = deepest sample farther than CLUSTER from the first
    const regions = [];
    for (let r = 0; r < 2 && S.length; r++) { let best = null;
      for (const q of S) if (!regions.some(g => Math.hypot(q[0] - g.sx, q[1] - g.sy) < CLUSTER) && (!best || q[2] > best[2])) best = q;
      if (!best) break; const g = { sx: best[0], sy: best[1], w: 0, px: 0, py: 0, nx: 0, ny: 0, depth: 0 };
      for (const q of S) if (Math.hypot(q[0] - g.sx, q[1] - g.sy) < CLUSTER) { g.w += q[2]; g.px += q[2] * q[0]; g.py += q[2] * q[1]; g.nx += q[2] * q[3]; g.ny += q[2] * q[4]; g.depth = Math.max(g.depth, q[2]); }
      g.px /= g.w; g.py /= g.w; const l = Math.hypot(g.nx, g.ny) || 1; g.nx /= l; g.ny /= l; regions.push(g); }
    // arena walls (stiff, no squish): silhouette samples vs the 4 planes
    for (const b of B) for (let k = 0; k < SIL.pts.length; k += 2) { const [wx, wy] = toWorld(b, SIL.pts[k][0], SIL.pts[k][1]); const v = velAt(b, wx, wy);
      for (const [pen, n] of [[bounds.xlo - wx, [1, 0]], [wx - bounds.xhi, [-1, 0]], [bounds.ylo - wy, [0, 1]], [wy - bounds.yhi, [0, -1]]]) if (pen > 0) {
        const vn = v[0] * n[0] + v[1] * n[1], fn = Math.max(0, (K_WALL * pen - C_WALL * vn) * SIL.ds[k] * 2); force(b, wx, wy, fn * n[0], fn * n[1]); } }
    // pointer grab: critically damped spring from the local anchor to the pointer, force-capped
    if (grab) { const b = B[grab.b], [ax, ay] = toWorld(b, grab.lx, grab.ly), v = velAt(b, ax, ay); let fx = GRAB_K * (grab.tx - ax) - GRAB_C * v[0], fy = GRAB_K * (grab.ty - ay) - GRAB_C * v[1];
      const fl = Math.hypot(fx, fy); if (fl > GRAB_FMAX) { fx *= GRAB_FMAX / fl; fy *= GRAB_FMAX / fl; }
      // overlap clamp: between GRAB_SOFT and GRAB_LIM overlap, remove the part of the grab force that drives this body toward the other
      if (cont.active && depthMax > GRAB_SOFT) { const o = B[1 - grab.b], ux = b.x - o.x, uy = b.y - o.y, ul = Math.hypot(ux, uy) || 1, fd = (fx * ux + fy * uy) / ul;
        if (fd < 0) { const keep = Math.max(0, (GRAB_LIM - depthMax) / (GRAB_LIM - GRAB_SOFT)); fx -= (1 - keep) * fd * ux / ul; fy -= (1 - keep) * fd * uy / ul; } }
      force(b, ax, ay, fx, fy); }
    for (const b of B) {                                                          // semi-implicit Euler + table damping + clamps
      b.vx = (b.vx + DT * b.fx / MASS) * Math.exp(-LIN_DAMP * DT); b.vy = (b.vy + DT * b.fy / MASS) * Math.exp(-LIN_DAMP * DT); b.w = (b.w + DT * b.tq / inertia) * Math.exp(-ANG_DAMP * DT);
      const sp = Math.hypot(b.vx, b.vy); if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; } b.w = Math.max(-WMAX, Math.min(WMAX, b.w));
      b.x += DT * b.vx; b.y += DT * b.vy; b.th += DT * b.w; }
    // squish channels (render-only), up to 2 per body: target = half the visible overlap of that region; regions keep their channel by proximity
    for (let i = 0; i < 2; i++) { const b = B[i], c = Math.cos(b.th), s = Math.sin(b.th), sg = i === 0 ? -1 : 1, used = [false, false];
      for (const ch of b.chs) ch.target = 0;
      for (const g of regions) { const [lx, ly] = toLocal(b, g.px, g.py); let k = -1, kd = Infinity;
        for (let q = 0; q < 2; q++) { if (used[q]) continue; const ch = b.chs[q], dd = ch.live ? Math.hypot(ch.cx - lx, ch.cy - ly) : 1e3 + q; if (dd < kd) { kd = dd; k = q; } }
        if (k < 0) continue; used[k] = true; const ch = b.chs[k];
        // inward (into this body): A gets -n, B gets +n (n points A -> B)
        const mxw = sg * g.nx, myw = sg * g.ny;
        ch.cx = lx; ch.cy = ly; ch.mx = c * mxw + s * myw; ch.my = -s * mxw + c * myw; ch.target = Math.min(DMAX, g.depth / 2); ch.live = true; }
      for (const ch of b.chs) {
        if (ch.target >= ch.a) { ch.va = (ch.target - ch.a) / DT; ch.a = ch.target; }
        else { ch.va += DT * (-SQ_W * SQ_W * (ch.a - ch.target) - 2 * SQ_Z * SQ_W * ch.va); ch.a += DT * ch.va; }
        ch.va = Math.max(-1, Math.min(1, ch.va)); ch.a = Math.max(-0.5 * DMAX, Math.min(DMAX, ch.a)); if (Math.abs(ch.a) < 1e-7 && ch.target === 0) ch.live = false; } }
  }
  function finite() { return Number.isFinite(relax) && B.every(b => [b.x, b.y, b.th, b.vx, b.vy, b.w, ...b.chs.flatMap(ch => [ch.a, ch.va])].every(Number.isFinite)); }
  const api = {
    info: { kind: 'interactive material study / approximated soft-body response', solver: 'none (not FEM, not V4)', dt: DT, layers: ['rigid 2D dynamics', 'render-only squish on duplicate rest vertices'] },
    reset,
    step(dt) { acc = Math.min(acc + dt, 0.1); while (acc >= DT - 1e-12) { substep(); acc -= DT;
      if (!finite()) { B = JSON.parse(last); for (const b of B) { b.vx = b.vy = b.w = 0; for (const ch of b.chs) { ch.a = ch.va = 0; } } relax = 1; badFrames++; grab = null; acc = 0; break; } } last = JSON.stringify(B); },
    pick(wx, wy) { let best = -1, bd = 0; for (let i = 0; i < 2; i++) { const [lx, ly] = toLocal(B[i], wx, wy), d = sdf(lx, ly); if (d < bd) { bd = d; best = i; } } return best; },
    grab(b, wx, wy) { if (b !== 0 && b !== 1) return false; const [lx, ly] = toLocal(B[b], wx, wy); if (sdf(lx, ly) > 0.02) return false; grab = { b, lx, ly, tx: wx, ty: wy }; return true; },
    drag(wx, wy) { if (grab) { grab.tx = wx; grab.ty = wy; } },
    release() { grab = null; }, cancel() { grab = null; },
    pose(b) { const o = B[b]; return { x: o.x, y: o.y, theta: o.th, vx: o.vx, vy: o.vy, omega: o.w }; },
    contact() { return { ...cont }; },
    squish(b) { const a = Math.max(0, ...B[b].chs.map(ch => ch.a)); return { inward_m: a, bulge_m: a * BULGE }; },
    finite, recovered() { return badFrames; },
    writeVerts(b, out) {                                                          // world-space render verts: pose + squish along rest normals
      const o = B[b], c = Math.cos(o.th), s = Math.sin(o.th), act = o.chs.filter(ch => ch.a !== 0), E05 = Math.exp(0.5);
      for (let v = 0; v < NV; v++) { let px = rest[3 * v], py = rest[3 * v + 1], pz = rest[3 * v + 2], ddx = 0, ddy = 0, ddz = 0;
        for (const ch of act) { const a = ch.a, dx = px - ch.cx, dy = py - ch.cy, sd = dx * ch.mx + dy * ch.my, tx = dx - sd * ch.mx, ty = dy - sd * ch.my;
          // CPU: sqrt instead of hypot; exp(0.5 - u^2/2) = exp(0.5) * exp(-u^2/2) (one exp per channel-vertex fewer)
          const tl = Math.sqrt(tx * tx + ty * ty), u = tl / SQ_SIGMA, fall = Math.exp(-Math.max(sd, 0) / SQ_DEPTH), g0 = Math.exp(-0.5 * u * u), g = g0 * fall;
          const push = a * g, spread = a * BULGE * u * E05 * g0 * fall, puff = a * PUFF * g;
          // push-in along the contact normal m (into the body), lateral spread away from the contact axis, vertical puff (thicker)
          ddx += push * ch.mx + (tl > 1e-9 ? spread * tx / tl : 0); ddy += push * ch.my + (tl > 1e-9 ? spread * ty / tl : 0); ddz += puff * pz / zmax; }
        const dl = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz); if (dl > DMAX) { ddx *= DMAX / dl; ddy *= DMAX / dl; ddz *= DMAX / dl; }
        px += ddx; py += ddy; pz += ddz;
        out[3 * v] = o.x + c * px - s * py; out[3 * v + 1] = o.y + s * px + c * py; out[3 * v + 2] = pz; }
      return out;
    },
  };
  reset();
  return api;
}

/* test-only: lets fit_check.mjs evaluate the contact shape; not part of the frontend API */
export { buildSdf };
