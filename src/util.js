// Small math / color helpers shared by every module.
(function () {
  const CM = (window.CM = window.CM || {});
  const U = (CM.util = {});
  CM.GY = 600; // ground height (world px) — shared by drawing and level code

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (e0, e1, x) => {
    const t = U.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.approach = (v, target, d) => (v < target ? Math.min(v + d, target) : Math.max(v - d, target));
  U.easeOut = (t) => 1 - Math.pow(1 - U.clamp(t, 0, 1), 3);

  // Deterministic PRNG (mulberry32) so the level looks the same every run.
  U.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const hexCache = {};
  U.rgb = (h) =>
    hexCache[h] ||
    (hexCache[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

  // Mix two hex colors; returns a css rgb()/rgba() string.
  U.mix = (a, b, t, alpha) => {
    const A = U.rgb(a);
    const B = U.rgb(b);
    t = U.clamp(t, 0, 1);
    const r = (A[0] + (B[0] - A[0]) * t) | 0;
    const g = (A[1] + (B[1] - A[1]) * t) | 0;
    const bl = (A[2] + (B[2] - A[2]) * t) | 0;
    return alpha === undefined ? `rgb(${r},${g},${bl})` : `rgba(${r},${g},${bl},${alpha})`;
  };
})();
