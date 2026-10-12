// PLACEHOLDER response (stage wiring only): rigid drag with no collision and no squish. It follows the same module boundary
// as interactive-response.js (createResponse -> pick/grab/drag/release/cancel/step/pose/writeVerts/contact/squish/finite/reset)
// and is used only with ?response=placeholder. The page labels it as a placeholder whenever it is the active response.
export function createResponse({ rest, init, bounds }) {
  const R = 0.18, B = init.map(p => ({ x: p.x, y: p.y, theta: p.theta || 0, vx: 0, vy: 0, omega: 0 }));
  let g = null;
  const clampTo = (p) => { p.x = Math.min(bounds.xhi - R, Math.max(bounds.xlo + R, p.x)); p.y = Math.min(bounds.yhi - R, Math.max(bounds.ylo + R, p.y)); };
  return {
    placeholder: true,
    pick(x, y) { for (let b = 0; b < 2; b++) if (Math.hypot(x - B[b].x, y - B[b].y) < R) return b; return -1; },
    grab(b, x, y) { if (b < 0 || b > 1) return false; g = { b, ox: x - B[b].x, oy: y - B[b].y, x, y }; return true; },
    drag(x, y) { if (g) { g.x = x; g.y = y; } },
    release() { g = null; },
    cancel() { g = null; },
    step(dt) {
      for (let b = 0; b < 2; b++) { const p = B[b];
        if (g && g.b === b) { p.vx = (g.x - g.ox - p.x) * 0.35 / dt; p.vy = (g.y - g.oy - p.y) * 0.35 / dt; } else { p.vx *= 0.85; p.vy *= 0.85; }
        p.x += p.vx * dt; p.y += p.vy * dt; clampTo(p); }
    },
    pose(b) { return { ...B[b] }; },
    writeVerts(b, out) { const p = B[b], c = Math.cos(p.theta), s = Math.sin(p.theta);
      for (let i = 0; i < out.length; i += 3) { const x = rest[i], y = rest[i + 1]; out[i] = p.x + c * x - s * y; out[i + 1] = p.y + s * x + c * y; out[i + 2] = rest[i + 2]; } },
    contact() { return { active: false, nx: 0, ny: 0, depth_m: 0, impulse: 0, px: 0, py: 0 }; },
    squish() { return { inward_m: 0, bulge_m: 0 }; },
    finite() { return B.every(p => Number.isFinite(p.x + p.y + p.theta + p.vx + p.vy)); },
    reset() { g = null; init.forEach((p, b) => Object.assign(B[b], { x: p.x, y: p.y, theta: p.theta || 0, vx: 0, vy: 0, omega: 0 })); },
  };
}
