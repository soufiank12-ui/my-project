// Stage 1 — "The Dead Forest" (الغابة الميتة): tutorial stage.
(function () {
  const CM = window.CM;
  const U = CM.util;
  const GY = (CM.GY = 600);

  function makeTree(rand, x, height, thick, dim) {
    const segs = [];
    const tips = [];
    const leafCols = ['#3f7d3a', '#4f9142', '#5ca64a', '#367036', '#6aa84f'];
    const flowerCols = ['#f2a7c3', '#ffe08a', '#ffffff'];
    function branch(x0, y0, ang, len, w, depth) {
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len;
      const bend = (rand() - 0.5) * len * 0.35;
      const cx = (x0 + x1) / 2 + Math.cos(ang + Math.PI / 2) * bend;
      const cy = (y0 + y1) / 2 + Math.sin(ang + Math.PI / 2) * bend;
      segs.push({ x1: x0, y1: y0, x2: x1, y2: y1, cx, cy, w });
      const maxDepth = dim ? 4 : 5;
      if (depth >= maxDepth || len < 9) {
        const blobs = [];
        const n = 2 + ((rand() * 3) | 0);
        for (let i = 0; i < n; i++) blobs.push([(rand() - 0.5) * 18, (rand() - 0.6) * 14, 7 + rand() * 9]);
        tips.push({
          x: x1,
          y: y1,
          k: rand(),
          col: leafCols[(rand() * leafCols.length) | 0],
          blobs,
          flower: rand() < 0.18 ? flowerCols[(rand() * flowerCols.length) | 0] : null,
        });
        return;
      }
      // some dead branches simply snap off
      if (depth > 1 && rand() < 0.12) return;
      const n = depth === 0 ? 3 : rand() < 0.55 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        let a = ang + (i - (n - 1) / 2) * 0.55 + (rand() - 0.5) * 0.7;
        a = U.clamp(a, -Math.PI + 0.25, -0.25);
        branch(x1, y1, a, len * (0.6 + rand() * 0.2), Math.max(1.2, w * 0.6), depth + 1);
      }
    }
    // trunk in two pieces for a gnarled look
    const lean = (rand() - 0.5) * 0.18;
    const t1 = height * 0.3;
    const xa = x + Math.cos(-Math.PI / 2 + lean) * t1;
    const ya = GY + 4 + Math.sin(-Math.PI / 2 + lean) * t1;
    segs.push({ x1: x, y1: GY + 6, x2: xa, y2: ya, cx: x + (rand() - 0.5) * 8, cy: GY - t1 / 2, w: thick * 1.15 });
    branch(xa, ya, -Math.PI / 2 - lean + (rand() - 0.5) * 0.2, height * 0.3, thick, 0);
    // roots
    for (const s of [-1, 1]) {
      segs.push({ x1: x, y1: GY - 10, x2: x + s * thick * 1.8, y2: GY + 4, cx: x + s * thick * 0.6, cy: GY - 2, w: thick * 0.45 });
    }
    return { x, segs, tips };
  }

  CM.buildLevel1 = function () {
    const rand = U.rng(20261120);
    const L = { name: 'الغابة الميتة', width: 7700 };
    L.spawn = { x: 110, y: GY - 60 };

    const groundSpans = [
      [0, 980],
      [1100, 1700],
      [1840, 4560],
      [4700, 4920],
      [5060, 5260],
      [5400, 6420],
      [6560, 7900],
    ];
    L.solids = [];
    L.grounds = groundSpans.map(([a, b]) => {
      const g = { x: a, y: GY, w: b - a, h: 500, kind: 'ground' };
      g.top = [];
      for (let x = a; x < b; x += 18) g.top.push([x, GY + (x === a ? 3 : (rand() - 0.5) * 4)]);
      g.top.push([b, GY + 3]);
      g.pebbles = [];
      const n = ((b - a) / 11) | 0;
      for (let i = 0; i < n; i++) {
        const top = rand() < 0.55;
        g.pebbles.push({
          x: a + 6 + rand() * (b - a - 12),
          y: top ? GY - 0.5 + rand() * 3 : GY + 8 + rand() * 90,
          rx: top ? 1.5 + rand() * 4.5 : 2 + rand() * 7,
          ry: top ? 1.2 + rand() * 2.4 : 1.5 + rand() * 4,
          s: rand(),
        });
      }
      L.solids.push(g);
      return g;
    });
    L.solids.push({ x: -300, y: -2000, w: 300, h: 3000, kind: 'wall' });
    L.solids.push({ x: 7700, y: -2000, w: 400, h: 3000, kind: 'wall' });

    // Tree stumps you climb in the first section
    L.stumps = [
      [1330, 70, 85],
      [1500, 84, 160],
    ].map(([x, w, h]) => ({ x, y: GY - h, w, h, kind: 'stump' }));
    L.stumps.forEach((s) => L.solids.push(s));

    // Rocks: obstacles, and shelter from the wind (wind blows from the right).
    L.rocks = [
      [2280, 70, 78],
      [2600, 74, 80],
      [2900, 70, 76],
      [4850, 70, 76],
      [5190, 70, 76],
      [6250, 72, 78],
    ].map(([x, w, h]) => {
      const r = { x, y: GY - h, w, h, kind: 'rock' };
      r.pts = [
        [x - 4, GY + 3],
        [x - 2, GY - h * 0.45],
        [x + w * 0.12, GY - h * 0.85],
        [x + w * 0.35, GY - h - 1],
        [x + w * 0.7, GY - h + 2],
        [x + w * 0.92, GY - h * 0.75],
        [x + w + 2, GY - h * 0.35],
        [x + w + 5, GY + 3],
      ];
      r.cracks = [
        [x + w * 0.3, GY - h * 0.8, x + w * 0.42, GY - h * 0.45],
        [x + w * 0.42, GY - h * 0.45, x + w * 0.36, GY - h * 0.2],
        [x + w * 0.7, GY - h * 0.6, x + w * 0.82, GY - h * 0.35],
      ];
      L.solids.push(r);
      return r;
    });

    // Wind zones (gusts against the direction of travel)
    L.wind = [
      { x1: 1980, x2: 3040, str: 0.75, period: 5.2, gust: 2.6, off: 0 },
      { x1: 4600, x2: 5420, str: 1.0, period: 4.8, gust: 2.3, off: 1.3 },
      { x1: 5700, x2: 6380, str: 0.85, period: 5.0, gust: 2.4, off: 2.1 },
    ];

    // Fallen trunks that leak water
    L.logs = [
      { x1: 3400, x2: 4460, y: 316, h: 46 },
      { x1: 5700, x2: 6220, y: 334, h: 38 },
    ];
    L.logs.forEach((lg) => {
      lg.bark = [];
      for (let x = lg.x1 + 20; x < lg.x2 - 40; x += 30 + rand() * 40) lg.bark.push([x, lg.y + 8 + rand() * (lg.h - 18), 20 + rand() * 40, (rand() - 0.5) * 6]);
      lg.moss = [];
      for (let x = lg.x1 + 30; x < lg.x2 - 30; x += 50 + rand() * 60) lg.moss.push([x, 14 + rand() * 20]);
    });

    const d1 = [3560, 3700, 3840, 4010, 4160, 4320];
    const o1 = [0, 0.6, 1.2, 0.3, 0.9, 1.5];
    const d2 = [5820, 5980, 6120];
    const o2 = [0, 0.7, 1.4];
    L.drips = [
      ...d1.map((x, i) => ({ x, y: 316 + 46, period: 1.9, off: o1[i], lastCyc: -1, form: 0 })),
      ...d2.map((x, i) => ({ x, y: 334 + 38, period: 2.1, off: o2[i], lastCyc: -1, form: 0 })),
    ];

    L.checkpoints = [{ x: 3150 }, { x: 5520 }].map((c) => ({ x: c.x, lit: false, litT: 0 }));
    L.brazier = { x: 7250, lit: false, flameA: 0 };

    L.embers = [
      [1542, 398],
      [2440, 552],
      [3330, 552],
      [4085, 552],
      [4790, 476],
      [5130, 476],
      [6330, 552],
      [6900, 552],
    ].map(([x, y]) => ({ x, y, taken: false, t: 0 }));

    L.texts = [
      { x: 230, t: 'تحرّك بالأسهم أو بالمفتاحين A و D', tt: 'تحرّك بزرَّي ◀ ▶' },
      { x: 820, t: 'اقفز بالمسافة', tt: 'اقفز بالزر ⤒' },
      { x: 1420, t: 'الشرارات الطائرة تقوّي شعلتك' },
      { x: 1960, t: 'الريح تُضعف شعلتك… اختبئ خلف الصخور حتى تهدأ' },
      { x: 3080, t: 'الشمعة الصغيرة: نقطة حفظ وتعيد شحن شعلتك' },
      { x: 3430, t: 'احذر قطرات الماء — راقبها وهي تتكوّن قبل أن تسقط' },
      { x: 4470, t: 'اضغط E أو Shift لتقوية الضوء ورؤية الطريق', tt: 'المس زر ☀ لتقوية الضوء ورؤية الطريق' },
      { x: 6700, t: 'احمل شعلتك إلى المشعل الكبير…' },
    ];

    // Decorative trees (world layer) and a dim parallax forest behind.
    const gaps = groundSpans.slice(1).map((s, i) => [groundSpans[i][1], s[0]]);
    const inGap = (x, pad) => gaps.some(([a, b]) => x > a - pad && x < b + pad);
    const blocked = (x) =>
      inGap(x, 50) ||
      L.rocks.some((r) => x > r.x - 30 && x < r.x + r.w + 30) ||
      L.checkpoints.some((c) => Math.abs(x - c.x) < 60) ||
      Math.abs(x - L.brazier.x) < 140;
    L.trees = [];
    for (let x = 60; x < 7650; x += 230 + rand() * 260) {
      if (blocked(x)) continue;
      L.trees.push(makeTree(rand, x, 230 + rand() * 170, 9 + rand() * 7, false));
    }
    // the two trunks holding the fallen logs are drawn by D.log, add none there
    L.bgTrees = [];
    for (let x = -200; x < 7700 * 0.6 + 1600; x += 110 + rand() * 170) {
      L.bgTrees.push(makeTree(rand, x, 180 + rand() * 170, 5 + rand() * 5, true));
    }

    // Grass and flowers sleep in the dry earth until the light returns.
    L.grass = [];
    L.flowers = [];
    const greens = ['#4f8a3a', '#5e9c41', '#3f7a35', '#73ad4c'];
    const petals = ['#e86a6a', '#f2c94c', '#8fb4ff', '#c58cf0', '#ff9fc4', '#ffffff'];
    for (const g of L.grounds) {
      for (let x = g.x + 4; x < g.x + g.w - 4; x += 4 + rand() * 6) {
        L.grass.push({ x, h: 8 + rand() * 16, lean: (rand() - 0.5) * 0.6, col: greens[(rand() * greens.length) | 0], dead: 2 + rand() * 4 });
      }
      for (let x = g.x + 20; x < g.x + g.w - 20; x += 35 + rand() * 90) {
        L.flowers.push({ x, h: 12 + rand() * 18, r: 3 + rand() * 2.5, col: petals[(rand() * petals.length) | 0], k: rand() });
      }
    }
    return L;
  };
})();
