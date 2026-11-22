// Stage 1 — "The Dead Forest" (الغابة الميتة): tutorial stage.
(function () {
  const CM = window.CM;
  const U = CM.util;
  const GY = CM.GY;

  // Rock collider -> dome-shaped polygon (used for the light's shadow casting).
  function rockShape(x, w, h) {
    const r = { x, y: GY - h, w, h, kind: 'rock' };
    r.pts = [
      [x - 2, GY + 3],
      [x + w * 0.02, GY - h * 0.5],
      [x + w * 0.15, GY - h * 0.85],
      [x + w * 0.4, GY - h],
      [x + w * 0.68, GY - h * 0.97],
      [x + w * 0.9, GY - h * 0.7],
      [x + w + 2, GY - h * 0.3],
      [x + w + 3, GY + 3],
    ];
    return r;
  }

  // Painted dead trees. ax/base = trunk centre and ground line inside the image,
  // ledge = the fork you can stand on after climbing the trunk (image coordinates).
  const TREE_ART = {
    tree_a: { ax: 125, base: 178, ledgeY: 58, l0: 92, l1: 170 },
    tree_b: { ax: 132, base: 175, ledgeY: 62, l0: 105, l1: 170 },
  };

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
      L.solids.push(g);
      return g;
    });
    L.solids.push({ x: -300, y: -2000, w: 300, h: 3000, kind: 'wall' });
    L.solids.push({ x: 7700, y: -2000, w: 400, h: 3000, kind: 'wall' });

    // Rocks: obstacles, and shelter from the wind (wind blows from the right).
    L.rocks = [
      [1460, 200, 165], // the big boulder: too high to jump, you must climb it
      [2280, 90, 74],
      [2600, 94, 78],
      [2900, 90, 72],
      [4846, 74, 66],
      [5186, 74, 66],
      [6250, 92, 74],
    ].map(([x, w, h]) => {
      const r = rockShape(x, w, h);
      L.solids.push(r);
      return r;
    });

    // Climbable dead trees, each with a fork to stand on.
    L.trees = [
      ['tree_b', 690, 1.6],
      ['tree_a', 3300, 1.6],
      ['tree_b', 6690, 1.6],
    ].map(([img, x, sc]) => {
      const a = TREE_ART[img];
      const tr = { img, x, s: sc, ax: a.ax, base: a.base };
      tr.ledge = { x: x + (a.l0 - a.ax) * sc, y: GY + 8 - (a.base - a.ledgeY) * sc, w: (a.l1 - a.l0) * sc, h: 10, kind: 'ledge' };
      L.solids.push(tr.ledge);
      return tr;
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
      [1570, 400],
      [700, 380],
      [2440, 552],
      [3310, 372],
      [4085, 552],
      [4790, 476],
      [5130, 476],
      [6330, 552],
      [6700, 385],
    ].map(([x, y]) => ({ x, y, taken: false, t: 0 }));

    L.texts = [
      { x: 230, t: 'تحرّك بالأسهم أو بالمفتاحين A و D', tt: 'تحرّك بزرَّي ◀ ▶' },
      { x: 820, t: 'اقفز بالمسافة', tt: 'اقفز بالزر ⤒' },
      { x: 560, t: 'الشرارات الطائرة تقوّي شعلتك' },
      { x: 1380, t: 'صخرة عالية! اقترب منها واضغط المسافة مطوّلاً لتتسلّقها', tt: 'صخرة عالية! اقترب منها والمس ⤒ مطوّلاً لتتسلّقها' },
      { x: 1960, t: 'الريح تُضعف شعلتك… اختبئ خلف الصخور حتى تهدأ' },
      { x: 3080, t: 'الشمعة الصغيرة: نقطة حفظ وتعيد شحن شعلتك' },
      { x: 3430, t: 'احذر قطرات الماء — راقبها وهي تتكوّن قبل أن تسقط' },
      { x: 4470, t: 'اضغط E أو Shift لتقوية الضوء ورؤية الطريق', tt: 'المس زر ☀ لتقوية الضوء ورؤية الطريق' },
      { x: 6700, t: 'احمل شعلتك إلى المشعل الكبير…' },
    ];

    // Grass and flowers sleep in the dry earth until the light returns.
    L.grass = [];
    L.flowers = [];
    const greens = ['#4f8a3a', '#5e9c41', '#3f7a35', '#73ad4c'];
    const petals = ['#e86a6a', '#f2c94c', '#8fb4ff', '#c58cf0', '#ff9fc4', '#ffffff'];
    for (const g of L.grounds) {
      for (let x = g.x + 4; x < g.x + g.w - 4; x += 4 + rand() * 6) {
        L.grass.push({ x, h: 8 + rand() * 16, lean: (rand() - 0.5) * 0.6, col: greens[(rand() * greens.length) | 0] });
      }
      for (let x = g.x + 20; x < g.x + g.w - 20; x += 35 + rand() * 90) {
        L.flowers.push({ x, h: 12 + rand() * 18, r: 3 + rand() * 2.5, col: petals[(rand() * petals.length) | 0], k: rand() });
      }
    }
    return L;
  };
})();
