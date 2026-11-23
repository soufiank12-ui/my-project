// Pre-rendered "stamps": every radial glow / light / shadow is drawn ONCE into a small
// canvas here, then reused each frame with drawImage + globalAlpha. This avoids building
// new gradient objects inside the game loop.
(function () {
  const CM = window.CM;
  const FX = (CM.fx = {});

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function radial(size, stops) {
    const c = canvas(size, size);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return c;
  }

  function linear(w, h, x0, y0, x1, y1, stops) {
    const c = canvas(w, h);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(x0, y0, x1, y1);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    return c;
  }

  // light hole (used with destination-out on the darkness layer)
  FX.light = radial(256, [
    [0, 'rgba(0,0,0,1)'],
    [0.3, 'rgba(0,0,0,0.93)'],
    [0.62, 'rgba(0,0,0,0.5)'],
    [0.85, 'rgba(0,0,0,0.14)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  // warm golden tint inside the hero's light (overlay)
  FX.tint = radial(128, [
    [0, 'rgba(255,150,50,0.55)'],
    [0.6, 'rgba(200,100,30,0.3)'],
    [1, 'rgba(160,80,20,0)'],
  ]);
  FX.shadow = radial(64, [
    [0, 'rgba(0,0,0,0.6)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  // alpha of the colour stops is relative: the final strength comes from globalAlpha
  FX.bodyGlow = radial(64, [
    [0, 'rgba(255,160,60,1)'],
    [1, 'rgba(255,140,40,0)'],
  ]);
  FX.flameGlow = radial(128, [
    [0, 'rgba(255,200,110,1)'],
    [0.4, 'rgba(255,120,30,0.4)'],
    [1, 'rgba(255,90,20,0)'],
  ]);
  FX.warm = radial(128, [
    [0, 'rgba(255,190,100,1)'],
    [0.35, 'rgba(255,120,30,0.4)'],
    [1, 'rgba(255,90,20,0)'],
  ]);
  FX.ember = radial(64, [
    [0, 'rgba(255,240,190,0.95)'],
    [0.25, 'rgba(255,160,50,0.6)'],
    [1, 'rgba(255,90,20,0)'],
  ]);
  FX.flameHalo = radial(128, [
    [0, 'rgba(255,170,60,0.42)'],
    [0.35, 'rgba(255,115,30,0.16)'],
    [1, 'rgba(255,80,20,0)'],
  ]);
  FX.drip = radial(32, [
    [0, 'rgba(170,210,255,1)'],
    [1, 'rgba(120,170,255,0)'],
  ]);
  FX.firefly = radial(32, [
    [0, 'rgba(240,255,150,1)'],
    [1, 'rgba(200,255,100,0)'],
  ]);
  // dark fade on the cliff edges of the ground (left edge; mirrored for the right one)
  FX.edge = linear(18, 4, 0, 0, 18, 0, [
    [0, 'rgba(5,3,2,0.9)'],
    [1, 'rgba(5,3,2,0)'],
  ]);
  // side shading of a vertical trunk, and top-to-bottom shading of the fallen log
  FX.trunkShade = linear(48, 4, 0, 0, 48, 0, [
    [0, 'rgba(0,0,0,0.6)'],
    [0.5, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.65)'],
  ]);
  FX.logShade = linear(4, 64, 0, 0, 0, 64, [
    [0, 'rgba(255,190,120,0.08)'],
    [0.45, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.6)'],
  ]);
  // Screen-space layers (logical 1280x720 drawn at a reduced size, smooth gradients scale well)
  const W = 1280;
  const H = 720;
  // Full-screen vignette, rebuilt only when the canvas is resized, at the exact backing-store
  // size so drawing it each frame is a plain 1:1 copy (no scaling).
  FX.vignette = canvas(1, 1);
  FX.resize = function (S) {
    const c = FX.vignette;
    c.width = Math.round(W * S);
    c.height = Math.round(H * S);
    const x = c.getContext('2d');
    x.setTransform(S, 0, 0, S, 0, 0);
    const g = x.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  };
  // the golden-hour sky of the end scene (fades in over the black)
  FX.skyAlive = (function () {
    const c = canvas(640, 360);
    const x = c.getContext('2d');
    x.scale(0.5, 0.5);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3c74ad');
    g.addColorStop(0.45, '#9cc3dc');
    g.addColorStop(0.75, '#ffd79a');
    g.addColorStop(1, '#f4a95e');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    const sx = W * 0.62;
    const sg = x.createRadialGradient(sx, H * 0.62, 0, sx, H * 0.62, 520);
    sg.addColorStop(0, 'rgba(255,236,170,0.9)');
    sg.addColorStop(0.25, 'rgba(255,200,110,0.45)');
    sg.addColorStop(1, 'rgba(255,170,80,0)');
    x.fillStyle = sg;
    x.fillRect(0, 0, W, H);
    return c;
  })();
  // flame-strength bar (normal / low), stretched to the current fill width
  FX.bar = linear(256, 10, 0, 0, 256, 0, [
    [0, '#ff5a1a'],
    [0.6, '#FF9A1F'],
    [1, '#ffe7a6'],
  ]);
  FX.barLow = linear(256, 10, 0, 0, 256, 0, [
    [0, '#ff3b1a'],
    [0.6, '#ff7a2a'],
    [1, '#ffe7a6'],
  ]);

  // Draw a stamp centred on (x, y) with radius r. sy squashes it vertically.
  FX.draw = function (ctx, st, x, y, r, a, sy) {
    if (a <= 0.004 || r <= 0.5) return;
    sy = sy || 1;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(st, x - r, y - r * sy, r * 2, r * 2 * sy);
    ctx.globalAlpha = 1;
  };
})();
