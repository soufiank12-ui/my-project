// Procedural drawing of every sprite: the candle man, flames, trees, rocks…
(function () {
  const CM = window.CM;
  const U = CM.util;
  const D = (CM.draw = {});
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- flame
  function flamePath(ctx, x, y, w, h, tip) {
    ctx.beginPath();
    ctx.moveTo(x, y + w * 0.55);
    ctx.bezierCurveTo(x - w * 1.2, y + w * 0.3, x - w * 0.95 + tip * 0.25, y - h * 0.42, x + tip, y - h);
    ctx.bezierCurveTo(x + w * 0.95 + tip * 0.25, y - h * 0.42, x + w * 1.2, y + w * 0.3, x, y + w * 0.55);
    ctx.closePath();
  }

  // A teardrop flame: whitish core, orange middle, red-orange edges. y = wick tip.
  D.flame = function (ctx, x, y, size, lean, t, seed) {
    if (size < 0.8) return;
    seed = seed || 0;
    const f = 1 + 0.07 * Math.sin(t * 15 + seed) + 0.05 * Math.sin(t * 23.7 + seed * 2) + 0.03 * Math.sin(t * 41 + seed * 3);
    const h = size * f;
    const w = size * 0.3 * (1 + 0.04 * Math.sin(t * 19 + seed));
    const sway = Math.sin(t * 6.3 + seed) * size * 0.07 + Math.sin(t * 11.3 + seed) * size * 0.035;
    const tip = lean * size * 0.65 + sway;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gx = x + tip * 0.3;
    const gy = y - h * 0.4;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, h * 1.4);
    g.addColorStop(0, 'rgba(255,170,60,0.42)');
    g.addColorStop(0.35, 'rgba(255,115,30,0.16)');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(gx - h * 1.4, gy - h * 1.4, h * 2.8, h * 2.8);
    ctx.globalCompositeOperation = 'source-over';

    ctx.shadowColor = 'rgba(255,90,20,0.9)';
    ctx.shadowBlur = size * 0.45;
    ctx.fillStyle = 'rgba(255,82,26,0.88)';
    flamePath(ctx, x, y, w, h, tip);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#FF9A1F';
    flamePath(ctx, x, y + h * 0.02, w * 0.8, h * 0.83, tip * 0.85);
    ctx.fill();
    ctx.fillStyle = '#FFCF5E';
    flamePath(ctx, x, y + h * 0.03, w * 0.6, h * 0.62, tip * 0.62);
    ctx.fill();
    ctx.fillStyle = '#FFF6DA';
    flamePath(ctx, x, y + h * 0.04, w * 0.38, h * 0.4, tip * 0.38);
    ctx.fill();
    ctx.fillStyle = 'rgba(90,130,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + w * 0.3, w * 0.42, w * 0.28, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  // ---------------------------------------------------------------- hero
  const DRIPS = [
    [-11.5, 13],
    [-6.5, 24],
    [-1, 9],
    [4.5, 19],
    [10, 27],
  ];
  const LOBES = [
    [-15, -10, 6],
    [-10, -5, 10],
    [-5, 0, 5],
    [0, 5, 11],
    [5, 10, 6],
    [10, 15, 9],
  ];

  function shoe(ctx, x, y) {
    const g = ctx.createLinearGradient(x, y - 5, x, y + 5);
    g.addColorStop(0, '#ffdc98');
    g.addColorStop(1, '#b97f38');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 7.8, 4.9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,245,215,0.55)';
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y - 2.3, 3.4, 1.4, -0.15, 0, TAU);
    ctx.fill();
  }

  function leg(ctx, hx, hy, ang, len, lift) {
    const fx = hx + Math.sin(ang) * len;
    const fy = hy + Math.cos(ang) * len - lift * 4;
    ctx.strokeStyle = '#e1a956';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(hx + Math.sin(ang) * len * 0.5 + 1, hy + len * 0.5, fx, fy);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,235,190,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx - 1.5, hy + 2);
    ctx.lineTo(fx - 1.5, fy - 2);
    ctx.stroke();
    shoe(ctx, fx + 2.5, fy + 1.2);
  }

  function arm(ctx, side, sx, sy, a1, a2) {
    const ex = sx + Math.sin(a1) * 13;
    const ey = sy + Math.cos(a1) * 13;
    const hx = ex + Math.sin(a2) * 12;
    const hy = ey + Math.cos(a2) * 12;
    ctx.strokeStyle = '#e4ad5e';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    // little blob at the elbow
    ctx.fillStyle = '#e8b465';
    ctx.beginPath();
    ctx.arc(ex, ey, 2.3, 0, TAU);
    ctx.fill();
    // palm + four long thin fingers
    ctx.beginPath();
    ctx.arc(hx, hy, 2.8, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const fa = a2 + (i - 1.5) * 0.32;
      const fl = i === 0 || i === 3 ? 5.5 : 7;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(
        hx + Math.sin(fa) * fl * 0.6,
        hy + Math.cos(fa) * fl * 0.6,
        hx + Math.sin(fa + 0.15 * side) * fl,
        hy + Math.cos(fa + 0.15 * side) * fl
      );
      ctx.stroke();
    }
  }

  // Draws the candle man. Writes the flame anchor back into h.fx / h.fy.
  D.hero = function (ctx, h, t) {
    const cx = h.x + h.w / 2;
    const by = h.y + h.h;
    const mv = h.walkAmt;
    const ph = h.walkPh;
    const air = !h.onGround;
    const sq = h.squash;
    const sxk = 1 + sq * 0.12;
    const syk = 1 - sq * 0.16;
    const bob = Math.abs(Math.sin(ph)) * 2.2 * mv + Math.sin(t * 2.2) * 0.6 * (1 - mv);
    const top = -60 - bob;
    const bot = -21 - bob;

    h.fx = cx + h.facing * 0.6 * sxk;
    h.fy = by + (top - 7.5) * syk;

    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(h.facing * sxk, syk);
    // gentle lean into the movement / against the wind
    ctx.rotate(U.clamp(h.vx / 2200, -0.1, 0.1) * h.facing + (h.windLean || 0) * 0.05 * h.facing);

    // legs
    const swing = Math.sin(ph) * 0.6 * mv;
    leg(ctx, -5, bot + 2, air ? -0.35 : swing, air ? 10 : 14, air ? 0 : Math.max(0, Math.cos(ph)) * mv);
    leg(ctx, 5, bot + 2, air ? 0.5 : -swing, air ? 12 : 14, air ? 0 : Math.max(0, -Math.cos(ph)) * mv);

    // body (Path2D so we can re-use it for shading layers)
    const body = new Path2D();
    body.moveTo(-14, top + 1);
    body.bezierCurveTo(-15.6, top + 14, -13, top + 26, -15, bot);
    for (const [a, b, d] of LOBES) body.bezierCurveTo(a + 0.6, bot + d, b - 0.6, bot + d, b, bot);
    body.bezierCurveTo(13.5, top + 26, 15.6, top + 14, 14, top + 1);
    body.ellipse(0, top + 1, 14, 4, 0, 0, Math.PI, false);
    body.closePath();

    const gh = ctx.createLinearGradient(-15, 0, 15, 0);
    gh.addColorStop(0, '#a26b2c');
    gh.addColorStop(0.22, '#e3b062');
    gh.addColorStop(0.48, '#ffe2a4');
    gh.addColorStop(0.72, '#F2C77A');
    gh.addColorStop(1, '#93602a');
    ctx.fillStyle = gh;
    ctx.fill(body);
    const gv = ctx.createLinearGradient(0, top, 0, bot + 10);
    gv.addColorStop(0, 'rgba(255,230,170,0.45)');
    gv.addColorStop(0.35, 'rgba(255,210,140,0)');
    gv.addColorStop(1, 'rgba(90,45,10,0.4)');
    ctx.fillStyle = gv;
    ctx.fill(body);
    // wax texture
    ctx.strokeStyle = 'rgba(150,95,40,0.22)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-7, top + 14);
    ctx.lineTo(-8, top + 22);
    ctx.moveTo(6, top + 26);
    ctx.lineTo(7.5, top + 33);
    ctx.moveTo(-2, top + 30);
    ctx.lineTo(-3, top + 35);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,70,25,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke(body);

    // melted pool on top
    ctx.fillStyle = '#ffd994';
    ctx.beginPath();
    ctx.ellipse(0, top + 1, 14.4, 4.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#efb55c';
    ctx.beginPath();
    ctx.ellipse(0, top + 1.6, 10, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,225,0.6)';
    ctx.beginPath();
    ctx.ellipse(-4, top + 0.6, 4, 1, 0, 0, TAU);
    ctx.fill();

    // hanging drips from the rim
    for (const [dx, len0] of DRIPS) {
      const len = len0 + Math.sin(t * 0.7 + dx) * 1.6;
      ctx.beginPath();
      ctx.moveTo(dx - 3.3, top + 2);
      ctx.bezierCurveTo(dx - 2.6, top + len * 0.5, dx - 1.9, top + len - 3, dx - 2.3, top + len);
      ctx.arc(dx, top + len, 2.4, Math.PI, 0, true);
      ctx.bezierCurveTo(dx + 1.9, top + len - 3, dx + 2.6, top + len * 0.5, dx + 3.3, top + 2);
      ctx.closePath();
      ctx.fillStyle = '#ffd690';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,248,220,0.7)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(dx - 1.6, top + 4);
      ctx.lineTo(dx - 1.2, top + len - 1);
      ctx.stroke();
    }

    // arms
    const as = -Math.sin(ph) * 0.35 * mv;
    const lift = air ? 0.55 : 0;
    const reach = h.reach || 0;
    let a1 = 0.42 + as + lift;
    let a2 = 0.15 + as * 0.5 + lift * 0.5;
    arm(ctx, 1, 12.5, top + 13, U.lerp(a1, 2.25, reach), U.lerp(a2, 2.0, reach));
    a1 = -0.42 - as - lift;
    a2 = -0.15 - as * 0.5 - lift * 0.5;
    arm(ctx, -1, -12.5, top + 13, a1, a2);

    // wick
    ctx.strokeStyle = '#1a120b';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, top + 1.5);
    ctx.quadraticCurveTo(-1.6, top - 3.5, 0.6, top - 7.5);
    ctx.stroke();
    if (h.flameSize > 1) {
      ctx.fillStyle = '#ff6a1a';
      ctx.beginPath();
      ctx.arc(0.6, top - 7.5, 1.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  D.heroShadow = function (ctx, h) {
    const cx = h.x + h.w / 2 - h.facing * 16;
    const by = h.y + h.h + 1;
    const g = ctx.createRadialGradient(cx, by, 0, cx, by, 40);
    g.addColorStop(0, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(1, 0.14);
    ctx.translate(-cx, -by);
    ctx.fillRect(cx - 40, by - 40, 80, 80);
    ctx.restore();
  };

  // Soft light passing through the wax (drawn additively after the darkness).
  D.heroGlow = function (ctx, h, k) {
    if (k <= 0) return;
    const cx = h.x + h.w / 2;
    const y = h.y + 10;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, y, 0, cx, y, 30);
    g.addColorStop(0, `rgba(255,170,70,${0.32 * k})`);
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 30, y - 30, 60, 60);
    ctx.restore();
  };

  // ---------------------------------------------------------------- props
  D.candle = function (ctx, cp, t) {
    const x = cp.x;
    const y = CM.GY;
    // stone dish
    ctx.fillStyle = '#3b3129';
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 15, 4.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#54473b';
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 13, 3.5, 0, 0, TAU);
    ctx.fill();
    // wax
    const lit = cp.lit;
    const g = ctx.createLinearGradient(x - 7, 0, x + 7, 0);
    if (lit) {
      g.addColorStop(0, '#a26b2c');
      g.addColorStop(0.45, '#ffe2a4');
      g.addColorStop(1, '#93602a');
    } else {
      g.addColorStop(0, '#4f463b');
      g.addColorStop(0.45, '#8f8473');
      g.addColorStop(1, '#433a30');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 34);
    ctx.lineTo(x - 7.5, y - 5);
    ctx.quadraticCurveTo(x, y - 1, x + 7.5, y - 5);
    ctx.lineTo(x + 7, y - 34);
    ctx.ellipse(x, y - 34, 7, 2.4, 0, 0, Math.PI, true);
    ctx.fill();
    ctx.fillStyle = lit ? '#ffd994' : '#9d917f';
    ctx.beginPath();
    ctx.ellipse(x, y - 34, 7, 2.4, 0, 0, TAU);
    ctx.fill();
    // drip
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 33);
    ctx.lineTo(x + 2.4, y - 22);
    ctx.arc(x + 3.6, y - 22, 1.6, Math.PI, 0, true);
    ctx.lineTo(x + 5.5, y - 33);
    ctx.fill();
    // wick
    ctx.strokeStyle = '#1a120b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y - 34);
    ctx.quadraticCurveTo(x - 1, y - 37, x + 0.5, y - 40);
    ctx.stroke();
  };

  D.brazier = function (ctx, b, life) {
    const x = b.x;
    const y = CM.GY;
    // pedestal
    const g = ctx.createLinearGradient(x - 36, 0, x + 36, 0);
    g.addColorStop(0, U.mix('#1d1813', '#4c4339', life));
    g.addColorStop(0.45, U.mix('#4a4038', '#8d8172', life));
    g.addColorStop(1, U.mix('#1a1511', '#3e362e', life));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 40, y + 2);
    ctx.lineTo(x - 30, y - 12);
    ctx.lineTo(x - 22, y - 16);
    ctx.lineTo(x - 18, y - 66);
    ctx.lineTo(x + 18, y - 66);
    ctx.lineTo(x + 22, y - 16);
    ctx.lineTo(x + 30, y - 12);
    ctx.lineTo(x + 40, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 22, y - 16);
    ctx.lineTo(x + 22, y - 16);
    ctx.moveTo(x - 19, y - 52);
    ctx.lineTo(x + 19, y - 52);
    ctx.stroke();
    // carved sun
    ctx.strokeStyle = b.lit ? 'rgba(255,170,70,0.55)' : 'rgba(120,100,80,0.35)';
    ctx.beginPath();
    ctx.arc(x, y - 34, 6, 0, TAU);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.moveTo(x + Math.cos(a) * 8.5, y - 34 + Math.sin(a) * 8.5);
      ctx.lineTo(x + Math.cos(a) * 12, y - 34 + Math.sin(a) * 12);
    }
    ctx.stroke();
    // bowl
    ctx.fillStyle = '#231c17';
    ctx.beginPath();
    ctx.moveTo(x - 46, y - 82);
    ctx.quadraticCurveTo(x - 40, y - 60, x, y - 62);
    ctx.quadraticCurveTo(x + 40, y - 60, x + 46, y - 82);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4c3f33';
    ctx.beginPath();
    ctx.ellipse(x, y - 82, 46, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = b.lit ? `rgb(${(120 + 135 * b.flameA) | 0},${(50 + 60 * b.flameA) | 0},20)` : '#15100c';
    ctx.beginPath();
    ctx.ellipse(x, y - 82, 39, 5, 0, 0, TAU);
    ctx.fill();
  };

  D.ember = function (ctx, e, t) {
    const y = e.y + Math.sin(t * 2 + e.x) * 4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(e.x, y, 0, e.x, y, 18);
    g.addColorStop(0, 'rgba(255,240,190,0.95)');
    g.addColorStop(0.25, 'rgba(255,160,50,0.6)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(e.x - 18, y - 18, 36, 36);
    ctx.restore();
  };

  // ---------------------------------------------------------------- world
  D.tree = function (ctx, tree, life, dim) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = dim ? U.mix('#120c08', '#2f4a36', life) : U.mix('#2b2119', '#5b3d25', life);
    for (const s of tree.segs) {
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.quadraticCurveTo(s.cx, s.cy, s.x2, s.y2);
      ctx.stroke();
    }
    if (!dim) {
      // a pale lit edge on the trunk
      ctx.strokeStyle = U.mix('#3d3026', '#7b5634', life, 0.6);
      for (let i = 0; i < tree.segs.length && i < 2; i++) {
        const s = tree.segs[i];
        ctx.lineWidth = s.w * 0.25;
        ctx.beginPath();
        ctx.moveTo(s.x1 - s.w * 0.3, s.y1);
        ctx.quadraticCurveTo(s.cx - s.w * 0.3, s.cy, s.x2 - s.w * 0.3, s.y2);
        ctx.stroke();
      }
    }
    if (life > 0.01) {
      for (const tip of tree.tips) {
        const g = U.clamp(life * 1.7 - tip.k * 0.7, 0, 1);
        if (g <= 0) continue;
        ctx.fillStyle = dim ? U.mix('#1e3a2a', tip.col, 0.35) : tip.col;
        for (const [ox, oy, rr] of tip.blobs) {
          ctx.beginPath();
          ctx.arc(tip.x + ox * g, tip.y + oy * g, rr * g, 0, TAU);
          ctx.fill();
        }
        if (tip.flower && g > 0.6) {
          ctx.fillStyle = tip.flower;
          ctx.beginPath();
          ctx.arc(tip.x + 3, tip.y - 3, 3.2 * (g - 0.6) * 2.5, 0, TAU);
          ctx.fill();
        }
      }
    }
  };

  D.ground = function (ctx, g, life) {
    const gr = ctx.createLinearGradient(0, g.y - 4, 0, g.y + 150);
    gr.addColorStop(0, U.mix('#3a2a1c', '#4b3521', life));
    gr.addColorStop(0.12, U.mix('#26190f', '#352214', life));
    gr.addColorStop(1, '#0c0704');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y + 420);
    ctx.lineTo(g.top[0][0], g.top[0][1] + 6);
    for (const p of g.top) ctx.lineTo(p[0], p[1]);
    const last = g.top[g.top.length - 1];
    ctx.lineTo(last[0], last[1] + 6);
    ctx.lineTo(g.x + g.w, g.y + 420);
    ctx.closePath();
    ctx.fill();
    for (const p of g.pebbles) {
      ctx.fillStyle = U.mix('#4d3d2f', '#21180f', p.s);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, TAU);
      ctx.fill();
      if (p.y < g.y + 3) {
        ctx.fillStyle = 'rgba(160,120,80,0.25)';
        ctx.beginPath();
        ctx.ellipse(p.x - p.rx * 0.2, p.y - p.ry * 0.4, p.rx * 0.5, p.ry * 0.35, 0, 0, TAU);
        ctx.fill();
      }
    }
  };

  D.rock = function (ctx, r, lx, life) {
    const dir = lx < r.x + r.w / 2 ? -1 : 1;
    const g = ctx.createLinearGradient(r.x + r.w / 2 + (dir * r.w) / 2, r.y, r.x + r.w / 2 - (dir * r.w) / 2, r.y + r.h);
    g.addColorStop(0, U.mix('#5e4c3d', '#7c7568', life));
    g.addColorStop(0.5, U.mix('#3a2d23', '#55504a', life));
    g.addColorStop(1, '#15100c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(r.pts[0][0], r.pts[0][1]);
    for (let i = 1; i < r.pts.length; i++) ctx.lineTo(r.pts[i][0], r.pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const c of r.cracks) {
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(c[2], c[3]);
    }
    ctx.stroke();
    if (life > 0.05) {
      ctx.fillStyle = U.mix('#3d6b34', '#5d9a45', life, U.clamp(life * 1.4, 0, 1));
      ctx.beginPath();
      ctx.ellipse(r.x + r.w * 0.45, r.y + 6, r.w * 0.36 * life, 6 * life, 0, 0, TAU);
      ctx.fill();
    }
  };

  D.stump = function (ctx, s, life) {
    const g = ctx.createLinearGradient(s.x, 0, s.x + s.w, 0);
    g.addColorStop(0, '#1a120c');
    g.addColorStop(0.4, U.mix('#3b2c20', '#5d4128', life));
    g.addColorStop(1, '#140d08');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(s.x - 8, s.y + s.h);
    ctx.quadraticCurveTo(s.x + 2, s.y + s.h - 12, s.x, s.y + 6);
    ctx.lineTo(s.x + s.w, s.y + 6);
    ctx.quadraticCurveTo(s.x + s.w - 2, s.y + s.h - 12, s.x + s.w + 8, s.y + s.h);
    ctx.closePath();
    ctx.fill();
    // bark lines
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 1; i < 5; i++) {
      const x = s.x + (s.w * i) / 5;
      ctx.moveTo(x, s.y + 10);
      ctx.quadraticCurveTo(x + 3, s.y + s.h * 0.5, x - 1, s.y + s.h - 4);
    }
    ctx.stroke();
    // rings on top
    ctx.fillStyle = U.mix('#5c4632', '#8a6a48', life);
    ctx.beginPath();
    ctx.ellipse(s.x + s.w / 2, s.y + 6, s.w / 2, 7, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,25,15,0.5)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(s.x + s.w / 2 + 2, s.y + 6, (s.w / 2) * (i / 4), 7 * (i / 4), 0, 0, TAU);
      ctx.stroke();
    }
  };

  // A huge fallen dead trunk, resting on two snapped trees — water drips from it.
  D.log = function (ctx, lg, life) {
    const { x1, x2, y, h } = lg;
    // supports
    for (const sx of [x1 + 30, x2 - 30]) {
      const g = ctx.createLinearGradient(sx - 16, 0, sx + 16, 0);
      g.addColorStop(0, '#120c08');
      g.addColorStop(0.5, U.mix('#2c2118', '#523822', life));
      g.addColorStop(1, '#0f0a06');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - 22, CM.GY + 4);
      ctx.quadraticCurveTo(sx - 12, CM.GY - 40, sx - 13, y + h);
      ctx.lineTo(sx - 20, y - 8);
      ctx.lineTo(sx - 6, y + 6);
      ctx.lineTo(sx + 4, y - 14);
      ctx.lineTo(sx + 13, y + h);
      ctx.quadraticCurveTo(sx + 12, CM.GY - 40, sx + 22, CM.GY + 4);
      ctx.closePath();
      ctx.fill();
    }
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, U.mix('#3e3024', '#5f4329', life));
    g.addColorStop(0.5, U.mix('#271c14', '#3f2b1a', life));
    g.addColorStop(1, '#0f0a06');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x1, y + 6);
    ctx.lineTo(x1 + 10, y - 2);
    ctx.lineTo(x1 + 4, y + 10);
    ctx.lineTo(x1 + 14, y + 16);
    ctx.lineTo(x1 + 2, y + h - 4);
    ctx.lineTo(x1 + 12, y + h);
    ctx.lineTo(x2 - 12, y + h);
    ctx.lineTo(x2, y + h - 10);
    ctx.lineTo(x2 - 8, y + h * 0.5);
    ctx.lineTo(x2 + 4, y + 8);
    ctx.lineTo(x2 - 10, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < lg.bark.length; i++) {
      const b = lg.bark[i];
      ctx.moveTo(b[0], b[1]);
      ctx.quadraticCurveTo(b[0] + b[2] / 2, b[1] + b[3], b[0] + b[2], b[1]);
    }
    ctx.stroke();
    if (life > 0.05) {
      ctx.fillStyle = U.mix('#2f5e2c', '#4d8c3c', life, life);
      for (const m of lg.moss) {
        ctx.beginPath();
        ctx.ellipse(m[0], y + 2, m[1] * life, 5 * life, 0, 0, TAU);
        ctx.fill();
      }
    }
  };

  D.drop = function (ctx, x, y, r, a) {
    ctx.fillStyle = `rgba(170,205,235,${0.85 * a})`;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2.4);
    ctx.quadraticCurveTo(x + r, y - r * 0.6, x + r, y);
    ctx.arc(x, y, r, 0, Math.PI, false);
    ctx.quadraticCurveTo(x - r, y - r * 0.6, x, y - r * 2.4);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.8 * a})`;
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.2, r * 0.3, 0, TAU);
    ctx.fill();
  };
})();
