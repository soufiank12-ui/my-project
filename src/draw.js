// Drawing: painted sprites from /assets, plus the few things still drawn in code
// (HUD flame, embers, the fallen dripping trunk, light and particles).
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

  // ---------------------------------------------------------------- hero (painted sprites)
  const HM = CM.HERO;

  function heroFrame(h) {
    if (h.out) return 'out';
    if (h.climb) return HM.climb[h.climbFrame % HM.climb.length];
    if (h.pose === 'boost') return 'boost';
    const ja = h.jumpAnim;
    if (!h.onGround) {
      // rising: take-off frames 1→6, then hold frame 6 at the top of the jump
      if (ja && ja.phase === 'up' && h.vy < 100) return 'jump_up_' + Math.min(6, 1 + Math.floor(ja.t / 0.05));
      if (h.vy < 0) return 'jump_up_6';
      return 'jump_land_1'; // falling
    }
    // touched the ground: the rest of the landing frames
    if (ja && ja.phase === 'land' && ja.t < 0.3) return 'jump_land_' + Math.min(6, 2 + Math.floor(ja.t / 0.06));
    if (h.walkAmt > 0.35) return HM.walk[Math.floor(h.walkPh / 1.25) % HM.walk.length];
    return 'idle';
  }

  // Draws the candle man. Writes the flame anchor (light source) back into h.fx / h.fy.
  D.hero = function (ctx, h, t) {
    const name = heroFrame(h);
    const im = CM.img['hero_' + name];
    const k = 1 / HM.px;
    // on a rock face he presses against the stone, not beside it
    const cx = h.x + h.w / 2 + (h.climb && h.climb.kind === 'rock' ? h.climb.side * 9 : 0);
    const feetY = h.y - 2 + (HM.feet - HM.cy) * k;
    const sq = h.squash;
    const syk = 1 - sq * 0.12;
    let bob = 0;
    if (name.startsWith('walk')) bob = -Math.abs(Math.sin(h.walkPh * 1.25)) * 1.6;
    else if (name === 'idle') bob = Math.sin(t * 2.2) * 0.5;
    const lean = U.clamp(h.vx / 2600, -0.08, 0.08) * h.facing - (h.windLean || 0) * 0.06;
    ctx.save();
    ctx.translate(cx, feetY);
    ctx.scale(h.facing * (1 + sq * 0.1), syk);
    ctx.rotate(lean);
    ctx.translate(0, bob);
    if (im && im.width) ctx.drawImage(im, -HM.cx * k, -HM.feet * k, HM.cw * k, HM.ch * k);
    ctx.restore();
    h.frame = name;
    h.fx = cx - h.facing * (name.startsWith('walk') ? 7 : 0) + h.facing * (HM.flameX[name] || 0) * k;
    h.fy = feetY - (HM.feet - HM.flameY[name]) * k * syk + bob;
  };

  D.heroShadow = function (ctx, h) {
    if (h.climb) return;
    const cx = h.x + h.w / 2 - h.facing * 14;
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

  // Soft light passing through the wax + around the flame (drawn additively after the darkness).
  D.heroGlow = function (ctx, h, k, t) {
    if (k <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cx = h.x + h.w / 2;
    const y = h.y + 12;
    let g = ctx.createRadialGradient(cx, y, 0, cx, y, 32);
    g.addColorStop(0, `rgba(255,160,60,${0.22 * k})`);
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 32, y - 32, 64, 64);
    const fl = 1 + 0.08 * Math.sin(t * 17) + 0.05 * Math.sin(t * 29);
    const r = 34 * fl * Math.min(1.6, k);
    g = ctx.createRadialGradient(h.fx, h.fy, 0, h.fx, h.fy, r);
    g.addColorStop(0, `rgba(255,200,110,${0.35 * k})`);
    g.addColorStop(0.4, `rgba(255,120,30,${0.14 * k})`);
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(h.fx - r, h.fy - r, r * 2, r * 2);
    ctx.restore();
  };

  // ---------------------------------------------------------------- props (painted sprites)
  function drawBottom(ctx, im, cx, bottom, w, alpha) {
    if (!im || !im.width || alpha <= 0) return 0;
    const s = w / im.width;
    const hh = im.height * s;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(im, cx - w / 2, bottom - hh, w, hh);
    ctx.globalAlpha = 1;
    return hh;
  }

  const CANDLE_W = 30;
  D.candle = function (ctx, cp) {
    const k = cp.lit ? U.smooth(0, 0.5, cp.litT) : 0;
    drawBottom(ctx, CM.img.candle_off, cp.x, CM.GY + 3, CANDLE_W, 1 - k);
    // the lit candle image is a little wider (its flame); scale by the wax width
    drawBottom(ctx, CM.img.candle_on, cp.x, CM.GY + 3, CANDLE_W * (97 / 95), k);
  };
  D.candleFlameY = CM.GY + 3 - 157 * (CANDLE_W / 95) + 12;

  const BRAZIER_W = 124;
  D.brazier = function (ctx, b) {
    const s = BRAZIER_W / 161;
    drawBottom(ctx, CM.img.brazier_off, b.x, CM.GY + 5, BRAZIER_W, 1 - b.flameA);
    if (b.flameA > 0) {
      // the fire breathes a little
      const f = 1 + 0.025 * Math.sin(CM.now * 11) + 0.02 * Math.sin(CM.now * 23);
      const im = CM.img.brazier_on;
      const w = im.width * s;
      const hh = im.height * s;
      ctx.save();
      ctx.globalAlpha = b.flameA;
      ctx.translate(b.x, CM.GY + 5);
      ctx.scale(1, f);
      ctx.drawImage(im, -w / 2, -hh, w, hh);
      ctx.restore();
    }
  };
  D.brazierFireY = CM.GY + 5 - 194 * (BRAZIER_W / 161) + 40;

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

  // ---------------------------------------------------------------- world (painted sprites)
  // Dead trees: tr = {img, x (trunk centre), s (scale), ax, base} — fades out when life returns.
  D.tree = function (ctx, tr, alpha) {
    const im = CM.img[tr.img];
    if (!im || !im.width || alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, tr.x - tr.ax * tr.s, CM.GY + 8 - tr.base * tr.s, im.width * tr.s, im.height * tr.s);
    ctx.globalAlpha = 1;
  };

  const GROUND_H = 86; // drawn height of the ground tile
  const GROUND_TOP = 30; // where the dirt starts inside the tile image (above it: grass tufts)
  D.ground = function (ctx, g) {
    const im = CM.img.ground;
    const s = GROUND_H / im.height;
    const tw = im.width * s;
    const y0 = g.y - GROUND_TOP * s;
    // deep earth under the strip
    const gr = ctx.createLinearGradient(0, y0 + GROUND_H - 10, 0, g.y + 260);
    gr.addColorStop(0, '#1d130b');
    gr.addColorStop(1, '#070403');
    ctx.fillStyle = gr;
    ctx.fillRect(g.x, y0 + GROUND_H - 10, g.w, 420);
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x, y0 - 2, g.w, GROUND_H + 4);
    ctx.clip();
    CM.tileMirrored(ctx, im, 0, y0, tw + 0.6, GROUND_H, g.x, g.x + g.w, tw);
    ctx.restore();
    // rounded, darker cliff edges
    for (const side of [0, 1]) {
      const x = side ? g.x + g.w : g.x;
      const eg = ctx.createLinearGradient(x, 0, x + (side ? -18 : 18), 0);
      eg.addColorStop(0, 'rgba(5,3,2,0.9)');
      eg.addColorStop(1, 'rgba(5,3,2,0)');
      ctx.fillStyle = eg;
      ctx.fillRect(side ? x - 18 : x, g.y - 2, 18, 420);
    }
  };

  // The rock image: the stone fills ~76% of its width and ~90% of its height (the rest is grass).
  D.rock = function (ctx, r) {
    const im = CM.img.rock;
    if (!im.width) return;
    const w = r.w / 0.76;
    const hh = r.h / 0.9;
    ctx.drawImage(im, r.x + r.w / 2 - w / 2, r.y + r.h + 7 - hh, w, hh);
  };

  D.drop = function (ctx, x, y, r, a) {
    const im = CM.img.drop;
    if (!im.width) return;
    const w = r * 2.5;
    const hh = w * (im.height / im.width);
    ctx.globalAlpha = a;
    ctx.drawImage(im, x - w / 2, y + r - hh, w, hh);
    ctx.globalAlpha = 1;
  };

  // A huge fallen dead trunk resting on two snapped trees — water drips from it.
  // Its bark is cut from the painted tree (tree_a) so it matches the rest of the art.
  let barkV = null;
  let barkH = null;
  function makeBark() {
    const im = CM.img.tree_a;
    if (barkH || !im || !im.width) return;
    const sx = 100, sy = 90, sw = 55, sh = 70;
    barkV = document.createElement('canvas');
    barkV.width = sw;
    barkV.height = sh;
    barkV.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
    barkH = document.createElement('canvas');
    barkH.width = sh;
    barkH.height = sw;
    const c = barkH.getContext('2d');
    c.translate(sh, 0);
    c.rotate(Math.PI / 2);
    c.drawImage(barkV, 0, 0);
  }

  D.log = function (ctx, lg) {
    makeBark();
    if (!barkH) return;
    const { x1, x2, y, h } = lg;
    // supports: two snapped trunks
    for (const sx of [x1 + 30, x2 - 30]) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx - 24, CM.GY + 6);
      ctx.quadraticCurveTo(sx - 13, CM.GY - 60, sx - 15, y + h);
      ctx.lineTo(sx - 20, y - 8);
      ctx.lineTo(sx - 6, y + 6);
      ctx.lineTo(sx + 5, y - 14);
      ctx.lineTo(sx + 15, y + h);
      ctx.quadraticCurveTo(sx + 13, CM.GY - 60, sx + 24, CM.GY + 6);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(barkV, sx - 26, y - 16, 52, CM.GY + 24 - y);
      const sg = ctx.createLinearGradient(sx - 24, 0, sx + 24, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0.6)');
      sg.addColorStop(0.5, 'rgba(0,0,0,0)');
      sg.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 26, y - 16, 52, CM.GY + 24 - y);
      ctx.restore();
    }
    // the trunk itself
    ctx.save();
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
    ctx.clip();
    const tw = barkH.width * ((h + 8) / barkH.height);
    CM.tileMirrored(ctx, barkH, x1 - 4, y - 4, tw + 0.5, h + 8, x1 - 4, x2 + 6, tw);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,190,120,0.08)');
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(x1 - 4, y - 4, x2 - x1 + 10, h + 8);
    ctx.restore();
  };

})();
