// Candle Man — main loop: input, physics, hazards, lighting, end cinematic, HUD.
(function () {
  const CM = window.CM;
  const U = CM.util;
  const D = CM.draw;
  const A = CM.audio;
  const GY = CM.GY;
  const W = 1280;
  const H = 720;
  const TAU = Math.PI * 2;

  // tuning
  const MAX_SPEED = 250;
  const GRAVITY = 2100;
  const JUMP_V = 800;
  const WIND_SPEED = 190; // how hard a full gust pushes back
  const WIND_DRAIN = 8; // flame per second in a full gust
  const DRIP_DAMAGE = 30;
  const BOOST_COST = 12;
  const BOOST_TIME = 3;
  const BOOST_COOLDOWN = 5;
  const EMBER_GAIN = 20;
  const BASE_ZOOM = 1.3; // the camera sits close, like a miniature lit by a candle
  const CLIMB_STEP_TIME = 0.2; // the two climbing images swap every 0.2 s…
  const CLIMB_STEP = 23; // …and each swap lifts him this much (≈115 px/s)
  const DARKNESS = 0.955;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // The darkness + light layer lives on its own canvas, created once and reused every frame.
  // It is soft by nature, so it renders at half resolution (much cheaper on the iPad).
  const lc = document.createElement('canvas');
  const lctx = lc.getContext('2d');
  const LIGHT_RES = 0.5;
  const wrap = document.getElementById('wrap');
  const menuEl = document.getElementById('menu');
  const endEl = document.getElementById('endScreen');
  let S = 1; // backing-store scale: CSS scale x devicePixelRatio, capped at 2
  let LS = 0.5; // light-layer scale

  function resize() {
    const k = Math.min(window.innerWidth / W, window.innerHeight / H);
    wrap.style.transform = `translate(${-(W * k) / 2}px, ${-(H * k) / 2}px) scale(${k})`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    S = U.clamp(Math.round(k * dpr * 4) / 4, 1, 2);
    LS = S * LIGHT_RES;
    canvas.width = Math.round(W * S);
    canvas.height = Math.round(H * S);
    lc.width = Math.round(W * LS);
    lc.height = Math.round(H * LS);
    CM.fx.resize(S);
  }
  window.addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------ input
  const keys = {};
  const pressed = {};
  function clearPressed() {
    for (const k in pressed) pressed[k] = false;
  }
  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    if (G.state === 'playing') G.paused = true;
  });
  // ------------------------------------------------------------ touch controls
  // On-screen buttons feed the same key table as the keyboard.
  const touchEl = document.getElementById('touch');
  function virtualKey(code, down) {
    if (down && !keys[code]) pressed[code] = true;
    keys[code] = down;
  }
  function enableTouch() {
    if (document.body.classList.contains('touch')) return;
    document.body.classList.add('touch');
  }
  if (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) enableTouch();
  window.addEventListener('touchstart', enableTouch, { passive: true });
  touchEl.querySelectorAll('[data-key]').forEach((btn) => {
    const code = btn.dataset.key;
    const ids = new Set();
    const up = (e) => {
      ids.delete(e.pointerId);
      if (ids.size === 0) {
        btn.classList.remove('down');
        virtualKey(code, false);
      }
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      A.init();
      ids.add(e.pointerId);
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (err) {}
      btn.classList.add('down');
      virtualKey(code, true);
    });
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  // stop iOS from scrolling / zooming / selecting while playing
  for (const ev of ['touchmove', 'gesturestart', 'dblclick']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
  let touchUIState = '';
  function syncTouchUI() {
    const st = G.state === 'playing' || G.state === 'dying' ? (G.paused ? 'paused' : 'play') : 'off';
    if (st === touchUIState) return;
    touchUIState = st;
    touchEl.className = st;
    if (st !== 'play') for (const b of touchEl.querySelectorAll('[data-key]')) {
      b.classList.remove('down');
      keys[b.dataset.key] = false;
    }
  }

  const inp = {
    left: () => keys.ArrowLeft || keys.KeyA,
    right: () => keys.ArrowRight || keys.KeyD,
    jump: () => keys.Space || keys.ArrowUp || keys.KeyW,
    jumpP: () => pressed.Space || pressed.ArrowUp || pressed.KeyW,
    down: () => keys.ArrowDown || keys.KeyS,
    leftP: () => pressed.ArrowLeft || pressed.KeyA,
    rightP: () => pressed.ArrowRight || pressed.KeyD,
    boostP: () => pressed.KeyE || pressed.ShiftLeft || pressed.ShiftRight,
  };

  // ------------------------------------------------------------ state
  const G = {
    state: 'menu', // menu | playing | dying | ending | won
    paused: false,
    time: 0,
    playTime: 0,
    deaths: 0,
    cam: { x: 0, y: 0, z: 1, look: 0 },
    darkAlpha: 0.95,
    life: 0,
    wave: -1,
    endT: 0,
    flash: 0,
    hurtShake: 0,
    lightFade: 1,
    dieT: 0,
    toast: { on: false, text: '', t: 0, dur: 0 },
    stageT: 0,
    crackleT: 0,
  };
  let L;
  let hero;
  // Object pools: everything is allocated once here and recycled, never created while playing.
  const MAX_PARTICLES = 900;
  const particles = []; // live particles
  const freeParticles = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    freeParticles.push({ type: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 1, g: 0, rot: 0, col: '', minX: -1e9 });
  }
  const MAX_DROPS = 32;
  const drops = [];
  const freeDrops = [];
  for (let i = 0; i < MAX_DROPS; i++) freeDrops.push({ x: 0, y: 0, vy: 0 });
  const motes = [];
  for (let i = 0; i < 90; i++) motes.push({ x: 0, y: 0, vx: 0, vy: 0, s: 1, p: 0 });
  const birds = [];
  for (let i = 0; i < 6; i++) birds.push({ on: false, x: 0, y: 0, v: 0, p: 0, s: 1 });
  const PETALS = ['#ffb7cf', '#fff1a8', '#ffffff'];
  // spark / leaf colours by brightness level, prepared once (no per-frame strings)
  const SPARK_COL = [];
  const LEAF_COL = [];
  for (let i = 0; i <= 16; i++) {
    SPARK_COL.push(`rgb(255,${(150 + 80 * (i / 16)) | 0},60)`);
    LEAF_COL.push(`rgb(${(110 * (i / 16)) | 0},${(75 * (i / 16)) | 0},${(40 * (i / 16)) | 0})`);
  }

  function makeHero(x, y) {
    return {
      x,
      y,
      w: 24,
      h: 60,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
      coyote: 0,
      jumpBuf: 0,
      flame: 100,
      flameShown: 100,
      boostT: 0,
      boostCd: 0,
      boostA: 0,
      inv: 0,
      walkPh: 0,
      walkAmt: 0,
      squash: 0,
      windLean: 0,
      flameLean: 0,
      reach: 0,
      flameSize: 30,
      fx: x,
      fy: y,
      lightR: 200,
      climb: null,
      climbFrame: 0,
      jaPhase: '', // jump animation: '' | 'up' | 'land'
      jaT: 0,
      pose: null,
      poseT: 0,
      out: false,
    };
  }

  function newGame() {
    L = CM.buildLevel1();
    hero = makeHero(L.spawn.x, L.spawn.y);
    hero.onGround = true;
    G.checkpoint = { x: L.spawn.x + 12 };
    G.time = 0;
    G.playTime = 0;
    G.deaths = 0;
    G.darkAlpha = DARKNESS;
    G.life = 0;
    G.wave = -1;
    G.endT = 0;
    G.flash = 0;
    G.lightFade = 1;
    G.toast.on = false;
    G.stageT = 0;
    G.bloomPlayed = false;
    G.endShown = false;
    G.cam.z = BASE_ZOOM;
    G.cam.look = 0;
    while (particles.length) freeParticles.push(particles.pop());
    while (drops.length) freeDrops.push(drops.pop());
    for (const b of birds) b.on = false;
    for (const m of motes) {
      m.x = Math.random() * W;
      m.y = 200 + Math.random() * 420;
      m.vx = (Math.random() - 0.5) * 8;
      m.vy = (Math.random() - 0.5) * 6;
      m.s = 0.6 + Math.random() * 1.6;
      m.p = Math.random() * TAU;
    }
    snapCamera();
  }

  function startGame() {
    A.init();
    A.setAmbient(1);
    newGame();
    G.state = 'playing';
    G.paused = false;
    menuEl.classList.remove('visible');
    endEl.classList.remove('visible');
    showToast('المرحلة الأولى: الغابة الميتة', 4);
  }

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('againBtn').addEventListener('click', startGame);
  document.getElementById('menuBtn').addEventListener('click', () => {
    newGame();
    G.state = 'menu';
    endEl.classList.remove('visible');
    menuEl.classList.add('visible');
  });

  function showToast(text, dur) {
    G.toast.text = text;
    G.toast.t = 0;
    G.toast.dur = dur || 2.5;
    G.toast.on = true;
  }

  // ------------------------------------------------------------ helpers
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function localLife(x) {
    if (G.wave < 0) return 0;
    return U.clamp((G.wave - Math.abs(x - L.brazier.x)) / 600, 0, 1);
  }

  const WIND = { I: 0, warn: 0 };
  function windAt(x) {
    let best = 0;
    let warn = 0;
    for (const z of L.wind) {
      if (x < z.x1 - 80 || x > z.x2 + 80) continue;
      const edge = U.clamp(Math.min(x - (z.x1 - 80), z.x2 + 80 - x) / 80, 0, 1);
      best = Math.max(best, z.I * edge);
      warn = Math.max(warn, z.warn * edge);
    }
    WIND.I = best;
    WIND.warn = warn;
    return WIND;
  }

  function sheltered(h) {
    const right = h.x + h.w;
    for (const r of L.rocks) {
      if (r.x >= right - 8 && r.x - right < 130 && r.y <= h.y + 24 && h.y + h.h > r.y + 4) return true;
    }
    return false;
  }

  // Takes a particle from the pool (returns null if the pool is empty).
  function spawn(type, x, y, vx, vy, life, max, s, g) {
    const p = freeParticles.pop();
    if (!p) return null;
    p.type = type;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = max;
    p.s = s;
    p.g = g || 0;
    p.rot = 0;
    p.col = '';
    p.minX = -1e9;
    particles.push(p);
    return p;
  }
  function killParticle(i) {
    const p = particles[i];
    particles[i] = particles[particles.length - 1];
    particles.pop();
    freeParticles.push(p);
  }

  // A burst of n particles. ang = NaN means all directions.
  function burst(x, y, n, type, ang, spread, speed, life, size, g) {
    for (let i = 0; i < n; i++) {
      const a = ang === ang ? ang + (Math.random() - 0.5) * spread : Math.random() * TAU;
      const sp = speed * (0.3 + Math.random() * 0.9);
      const l = life * (0.6 + Math.random() * 0.8);
      spawn(type, x, y, Math.cos(a) * sp, Math.sin(a) * sp, l, l, size * (0.6 + Math.random() * 0.8), g);
    }
  }

  // ------------------------------------------------------------ hero physics
  function moveAndCollide(h, dt) {
    const prevBottom = h.y + h.h;
    h.x += h.vx * dt;
    for (const s of L.solids) {
      if (s.kind === 'ledge' || !overlap(h, s)) continue;
      if (h.vx > 0) h.x = s.x - h.w;
      else if (h.vx < 0) h.x = s.x + s.w;
      else h.x = h.x + h.w / 2 < s.x + s.w / 2 ? s.x - h.w : s.x + s.w;
      h.vx = 0;
    }
    h.y += h.vy * dt;
    h.onGround = false;
    for (const s of L.solids) {
      if (!overlap(h, s)) continue;
      if (s.kind === 'ledge' && (h.vy < 0 || prevBottom > s.y + 1)) continue; // one-way branch
      if (h.vy >= 0) {
        h.y = s.y - h.h;
        h.onGround = true;
      } else {
        h.y = s.y + s.h;
      }
      h.vy = 0;
    }
  }

  // ------------------------------------------------------------ climbing
  // Near a rock's side (facing it) or a tree trunk + jump = grab and climb to the top.
  const CLIMB = { kind: '', obj: null, side: 1, top: 0, x: 0, t: 0, startY: 0, rise: 0, stepT: 0 };
  function setClimb(kind, obj, side, top, x) {
    CLIMB.kind = kind;
    CLIMB.obj = obj;
    CLIMB.side = side;
    CLIMB.top = top;
    CLIMB.x = x;
    CLIMB.t = 0;
    CLIMB.stepT = 0;
    return CLIMB;
  }
  function findClimb(h, dir) {
    const cx = h.x + h.w / 2;
    for (const r of L.rocks) {
      if (h.y + h.h <= r.y + 6 || h.y >= r.y + r.h) continue;
      if ((h.facing === 1 || dir === 1) && Math.abs(h.x + h.w - r.x) <= 6) return setClimb('rock', r, 1, r.y, r.x - h.w);
      if ((h.facing === -1 || dir === -1) && Math.abs(h.x - (r.x + r.w)) <= 6) return setClimb('rock', r, -1, r.y, r.x + r.w);
    }
    for (const tr of L.trees) {
      if (Math.abs(cx - tr.x) > 18 || h.y + h.h <= tr.ledge.y + 2) continue;
      return setClimb('tree', tr, h.facing, tr.ledge.y, tr.x - h.w / 2);
    }
    return null;
  }

  // One climbing step: swap to the other image and reach a little higher.
  function climbStep(h) {
    const c = h.climb;
    c.stepT = 0;
    c.rise += CLIMB_STEP;
    h.climbFrame = 1 - h.climbFrame;
    A.crackle(0.05);
    burst(h.x + h.w / 2 + c.side * 10, h.y + 24, 2, 'dust', NaN, 1, 30, 0.5, 1.6, 300);
  }

  // Hold jump to keep climbing; release to hang still on the wall (last image stays);
  // press a direction away from the wall (or down) to let go.
  function updateClimb(h, dt, dir, controllable) {
    const c = h.climb;
    c.t += dt;
    h.vx = 0;
    h.vy = 0;
    h.onGround = false;
    if (controllable && c.t > 0.12) {
      const awayP = c.kind === 'rock' ? (c.side === 1 ? inp.leftP() : inp.rightP()) : inp.leftP() || inp.rightP();
      if (awayP || inp.down()) {
        h.climb = null;
        h.vy = -200;
        h.vx = (dir || -c.side) * 170;
        if (dir) h.facing = dir;
        return;
      }
    }
    if (controllable && h.jumpBuf > 0) {
      h.jumpBuf = 0;
      climbStep(h); // every new press is a step
    } else if (controllable && inp.jump()) {
      c.stepT += dt;
      if (c.stepT >= CLIMB_STEP_TIME) climbStep(h); // holding keeps climbing
    } else {
      c.stepT = CLIMB_STEP_TIME * 0.6; // released: hang; the next press steps at once
    }
    h.x = U.approach(h.x, c.x, dt * 220);
    h.y = U.approach(h.y, c.startY - c.rise, dt * 260);
    if (h.y + h.h <= c.top + 1) {
      // reached the top: pull up and stand on it
      h.y = c.top - h.h;
      if (c.kind === 'rock') h.x = c.side === 1 ? c.obj.x + 3 : c.obj.x + c.obj.w - h.w - 3;
      h.onGround = true;
      h.climb = null;
      h.squash = 0.45;
      A.land(0.3);
    }
  }

  function updateHero(dt, controllable) {
    const h = hero;
    const cxh = h.x + h.w / 2;
    const w = windAt(cxh);
    const safe = sheltered(h);
    const push = safe ? 0 : w.I;
    h.windPush = push;

    let dir = 0;
    if (controllable) dir = (inp.right() ? 1 : 0) - (inp.left() ? 1 : 0);
    if (G.state === 'ending') dir = cxh < L.brazier.x - 66 ? 1 : 0;
    if (controllable && inp.jumpP()) h.jumpBuf = 0.13;
    else h.jumpBuf -= dt;

    // boost pose: arms wide for a moment
    h.poseT -= dt;
    h.pose = (h.poseT > 0 || h.reach > 0.3) && h.onGround && !h.climb ? 'boost' : null;
    if (h.pose && G.state === 'playing') dir = 0;

    if (!h.climb && controllable && h.jumpBuf > 0) {
      const c = findClimb(h, dir);
      if (c) {
        h.climb = c;
        h.jumpBuf = 0;
        h.jaPhase = '';
        c.startY = h.y;
        c.rise = 0;
        h.climbFrame = 1;
        climbStep(h);
        if (c.kind === 'rock') h.facing = c.side;
        h.squash = -0.3;
        A.jump();
      }
    }
    if (h.climb) {
      updateClimb(h, dt, dir, controllable);
      h.walkAmt = 0;
      h.squash = U.approach(h.squash, 0, dt * 5);
      return finishHeroUpdate(h, dt, controllable, push, safe, w);
    }
    if (dir) h.facing = dir;

    const windV = -WIND_SPEED * push;
    const target = dir * MAX_SPEED + windV * (dir ? 1 : 0.6);
    // walking eases in and out instead of starting / stopping instantly
    let acc;
    if (!h.onGround) acc = 1300;
    else if (dir && h.vx * dir < 0) acc = 2600; // turning around brakes quickly
    else acc = dir ? 1250 : 1500;
    h.vx = U.approach(h.vx, target, acc * dt);

    // jumping with coyote time + input buffer
    h.coyote = h.onGround ? 0.1 : h.coyote - dt;
    if (h.jumpBuf > 0 && h.coyote > 0) {
      h.vy = -JUMP_V;
      h.coyote = 0;
      h.jumpBuf = 0;
      h.jaPhase = 'up';
      h.jaT = 0;
      h.squash = -0.7;
      A.jump();
      burst(cxh, h.y + h.h, 5, 'dust', -Math.PI / 2, 2.4, 60, 0.5, 2.5, 0);
    }
    let g = GRAVITY;
    if (h.vy < 0 && !(controllable && inp.jump())) g *= 2.4;
    else if (h.vy > 0) g *= 1.15;
    h.vy = Math.min(h.vy + g * dt, 1150);

    const wasGround = h.onGround;
    const preVy = h.vy;
    moveAndCollide(h, dt);
    if (h.jaPhase) {
      h.jaT += dt; // animation speed is measured in seconds, not frames
      if (h.jaPhase === 'land' && h.jaT > 0.3) h.jaPhase = '';
    }
    if (h.onGround && !wasGround && (preVy > 150 || h.jaPhase === 'up')) {
      h.jaPhase = 'land';
      h.jaT = 0;
    }
    if (h.onGround && !wasGround && preVy > 300) {
      h.squash = Math.min(1, preVy / 1000);
      A.land(preVy / 1100);
      burst(h.x + h.w / 2, h.y + h.h, 8, 'dust', -Math.PI / 2, 3, 90, 0.6, 2.5, 0);
    }
    h.squash = U.approach(h.squash, 0, dt * 5);

    const moving = h.onGround && Math.abs(h.vx) > 25 ? 1 : 0;
    h.walkAmt = U.approach(h.walkAmt, moving, dt * 6);
    h.walkPh += dt * Math.abs(h.vx) * 0.06;
    finishHeroUpdate(h, dt, controllable, push, safe, w);
  }

  function finishHeroUpdate(h, dt, controllable, push, safe, w) {
    // wind drains the flame and bends it
    if (push > 0 && G.state === 'playing') h.flame -= WIND_DRAIN * push * dt;
    const visWind = Math.max(push, safe ? w.I * 0.25 : 0);
    h.windLean = U.approach(h.windLean, visWind, dt * 3);
    h.flameLean = U.lerp(h.flameLean, -h.windLean * 1.3 - h.vx / 520 + h.vy / 3000, Math.min(1, dt * 8));

    // light boost
    h.boostCd -= dt;
    h.boostT -= dt;
    if (controllable && inp.boostP()) {
      if (h.boostCd <= 0 && h.flame > BOOST_COST + 4) {
        h.boostT = BOOST_TIME;
        h.boostCd = BOOST_COOLDOWN;
        h.flame -= BOOST_COST;
        if (h.onGround && !h.climb) h.poseT = 0.6;
        A.boost();
        burst(h.fx, h.fy - 10, 26, 'spark', NaN, 1, 260, 0.9, 1.8, 0);
      } else if (h.boostCd > 0) {
        G.boostDeny = 0.4;
      }
    }
    h.boostA = U.approach(h.boostA, h.boostT > 0 ? 1 : 0, dt * (h.boostT > 0 ? 5 : 1.6));
    h.inv -= dt;

    h.flame = U.clamp(h.flame, 0, 100);
    h.flameShown = U.lerp(h.flameShown, h.flame, Math.min(1, dt * 6));
  }

  function hurt(amount, x, y) {
    const h = hero;
    if (h.inv > 0 || G.state !== 'playing') return;
    h.flame -= amount;
    h.inv = 0.6;
    G.flash = 0.35;
    G.hurtShake = 0.4;
    A.hiss();
    burst(x, y, 14, 'steam', -Math.PI / 2, 1.6, 70, 1.1, 6, 0);
    burst(x, y, 10, 'splash', -Math.PI / 2, 2.6, 160, 0.5, 1.6, 900);
  }

  function die(reason) {
    if (G.state !== 'playing') return;
    G.state = 'dying';
    G.dieT = 0;
    G.deaths++;
    hero.flame = 0;
    hero.out = true;
    hero.climb = null;
    hero.boostT = 0;
    A.death();
    burst(hero.fx, hero.fy, 24, 'smoke', -Math.PI / 2, 1.2, 40, 2, 8, 0);
    showToast(reason === 'fall' ? 'سقطت في الظلام…' : 'انطفأت الشعلة…', 1.8);
  }

  function respawn() {
    const h = hero;
    const cp = G.checkpoint;
    h.x = cp.x + 22;
    h.y = GY - h.h;
    h.vx = h.vy = 0;
    h.flame = 100;
    h.out = false;
    h.climb = null;
    h.flameShown = 100;
    h.boostT = 0;
    h.boostCd = 0;
    h.inv = 1;
    h.facing = 1;
    h.windLean = 0;
    G.state = 'playing';
    G.lightFade = 0;
    while (drops.length) freeDrops.push(drops.pop());
    A.respawn();
    burst(h.x + h.w / 2, h.y - 6, 20, 'spark', -Math.PI / 2, 2, 140, 0.9, 1.6, 0);
  }

  // ------------------------------------------------------------ world update
  function updateWind(dt) {
    let audioWind = 0;
    const view0 = G.cam.x - 100;
    const view1 = G.cam.x + W / G.cam.z + 300;
    for (const z of L.wind) {
      const c = (G.time + z.off) % z.period;
      z.I = U.smooth(0, 0.45, c) * (1 - U.smooth(z.gust - 0.45, z.gust, c)) * z.str;
      z.warn = U.smooth(z.period - 1.0, z.period, c) * z.str;
      const hx = hero.x + hero.w / 2;
      const near = U.clamp(1 - Math.max(0, z.x1 - hx, hx - z.x2) / 500, 0, 1);
      audioWind = Math.max(audioWind, (z.I + z.warn * 0.3) * near * (hero.windPush > 0 || z.I < 0.01 ? 1 : 0.55));

      // streaks + dead leaves
      if (z.x2 < view0 || z.x1 > view1 || G.state === 'ending' || G.state === 'won') continue;
      const rate = 70 * z.I + 18 * z.warn;
      let n = rate * dt;
      while (n > 0) {
        if (Math.random() < n) {
          const x0 = Math.max(z.x1, view0);
          const x1 = Math.min(z.x2 + 200, view1);
          const leaf = Math.random() < 0.12;
          const p = spawn(
            leaf ? 'leaf' : 'streak',
            x1 - Math.random() * (x1 - x0) * 0.3,
            330 + Math.random() * 265,
            -(leaf ? 300 : 750 + Math.random() * 500) * (0.35 + z.I),
            leaf ? -20 + Math.random() * 40 : 0,
            leaf ? 2.5 : 0.8 + Math.random() * 0.5,
            leaf ? 2.5 : 1.2,
            leaf ? 3 + Math.random() * 2 : 30 + Math.random() * 60,
            0
          );
          if (p) {
            p.rot = Math.random() * TAU;
            p.minX = z.x1 - 120;
          }
        }
        n -= 1;
      }
    }
    G.windAudio = audioWind;
    A.setWind(G.state === 'ending' || G.state === 'won' ? 0 : audioWind);
  }

  function removeDrop(i) {
    const d = drops[i];
    drops[i] = drops[drops.length - 1];
    drops.pop();
    freeDrops.push(d);
  }

  function updateDrips(dt) {
    const FORM = 1.0;
    for (const em of L.drips) {
      const tt = G.time + em.off;
      const c = tt % em.period;
      const cyc = Math.floor(tt / em.period);
      em.form = c < FORM ? c / FORM : 0;
      if (c >= FORM && em.lastCyc !== cyc) {
        em.lastCyc = cyc;
        const d = freeDrops.pop();
        if (d) {
          d.x = em.x;
          d.y = em.y + 3;
          d.vy = 40;
          drops.push(d);
        }
      }
    }
    const h = hero;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vy += 1500 * dt;
      d.y += d.vy * dt;
      const hit = d.x > h.x - 4 && d.x < h.x + h.w + 4 && d.y > h.y - 34 && d.y < h.y + h.h;
      if (hit && G.state === 'playing') {
        hurt(DRIP_DAMAGE, d.x, d.y);
        removeDrop(i);
        continue;
      }
      if (d.y >= GY - 1) {
        burst(d.x, GY - 2, 7, 'splash', -Math.PI / 2, 2.2, 110, 0.45, 1.4, 900);
        const dist = Math.abs(d.x - (h.x + h.w / 2));
        if (dist < 700) A.drip(U.clamp(1 - dist / 700, 0.1, 1));
        removeDrop(i);
      }
    }
  }

  function updatePickups(dt) {
    const h = hero;
    const hcx = h.x + h.w / 2;
    const hcy = h.y + h.h / 2;
    for (const e of L.embers) {
      if (e.taken) {
        e.t -= dt;
        if (e.t <= 0) e.taken = false;
        continue;
      }
      if (G.state !== 'playing') continue;
      if (Math.hypot(hcx - e.x, hcy - e.y) < 36 || Math.hypot(h.fx - e.x, h.fy - 10 - e.y) < 30) {
        e.taken = true;
        e.t = 25;
        h.flame = Math.min(100, h.flame + EMBER_GAIN);
        A.pickup();
        burst(e.x, e.y, 16, 'spark', NaN, 1, 160, 0.7, 1.6, 0);
      }
    }
    for (const cp of L.checkpoints) {
      if (cp.lit) cp.litT += dt;
      if (G.state !== 'playing') continue;
      if (Math.abs(hcx - cp.x) < 34 && h.y + h.h > GY - 50) {
        if (!cp.lit) {
          cp.lit = true;
          cp.litT = 0;
          G.checkpoint = cp;
          A.ignite(false);
          burst(cp.x, GY - 42, 22, 'spark', -Math.PI / 2, 2, 170, 0.9, 1.7, 0);
          showToast('أشعلت شمعة — نقطة حفظ', 2.4);
        }
        G.checkpoint = cp;
        if (h.flame < 100) h.flame = Math.min(100, h.flame + 60 * dt);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0 || p.x < p.minX) {
        killParticle(i);
        continue;
      }
      if (p.type === 'leaf') {
        p.vy += Math.sin(G.time * 5 + p.rot) * 60 * dt + 30 * dt;
        p.rot += dt * 8;
        if (p.y > GY - 3) {
          p.y = GY - 3;
          p.vy = -Math.abs(p.vy) * 0.3;
        }
      } else if (p.type === 'smoke' || p.type === 'steam') {
        p.vx *= 1 - dt * 1.2;
        p.vy -= 20 * dt;
        p.s += dt * 9;
      } else if (p.type === 'spark') {
        p.vy -= 40 * dt;
        p.vx *= 1 - dt * 1.5;
      } else if (p.type === 'firefly') {
        p.vx += (Math.random() - 0.5) * 120 * dt;
        p.vy += (Math.random() - 0.5) * 120 * dt;
        p.vx *= 1 - dt * 0.8;
        p.vy *= 1 - dt * 0.8;
      } else if (p.type === 'petal') {
        p.vx += Math.sin(G.time * 2 + p.s * 10) * 20 * dt;
        p.rot += dt * 3;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    // flame sparks
    if (hero.flameSize > 6 && Math.random() < dt * (3 + hero.boostA * 14)) {
      spawn('spark', hero.fx + (Math.random() - 0.5) * 6, hero.fy - 14, (Math.random() - 0.5) * 30 - hero.windLean * 80, -40 - Math.random() * 60, 1, 1, 0.9 + Math.random(), 0);
    }
    // floating dust motes (screen-space, wrapped around the camera)
    const vw = W / G.cam.z;
    const vh = H / G.cam.z;
    for (const m of motes) {
      m.x += (m.vx - (G.windAudio || 0) * 60) * dt;
      m.y += (m.vy + Math.sin(G.time * 0.7 + m.p) * 4) * dt;
      const wx = ((((m.x - G.cam.x) % vw) + vw) % vw) + G.cam.x;
      m.x = wx;
      if (m.y < G.cam.y) m.y += vh;
      if (m.y > G.cam.y + vh) m.y -= vh;
    }
  }

  function updateCamera(dt, snap) {
    const c = G.cam;
    const h = hero;
    let tz = BASE_ZOOM;
    let tx;
    if (G.state === 'ending' || G.state === 'won') {
      const e = G.endT;
      tz = U.lerp(BASE_ZOOM, 0.85, U.smooth(1.6, 5.5, e));
      const vw = W / tz;
      tx = U.lerp(h.x + h.w / 2, L.brazier.x - 60, U.smooth(0, 2, e)) - vw / 2;
    } else {
      c.look = U.approach(c.look, h.facing * 90, dt * 150);
      tx = h.x + h.w / 2 - W / c.z / 2 + c.look;
    }
    c.z = snap ? tz : U.lerp(c.z, tz, 1 - Math.exp(-dt * 3));
    const vw = W / c.z;
    const vh = H / c.z;
    // on the menu the candle man stands a little left of centre, below the title
    if (G.state === 'menu') tx = h.x + h.w / 2 - vw * 0.3;
    else tx = U.clamp(tx, -40, L.width + 60 - vw);
    const ty = GY - vh * 0.83;
    if (snap) {
      c.x = tx;
      c.y = ty;
    } else {
      // smooth follow (exponential lerp: same feel at any frame rate)
      const k = 1 - Math.exp(-dt * 5);
      c.x = U.lerp(c.x, tx, k);
      c.y = U.lerp(c.y, ty, k);
    }
  }

  function snapCamera() {
    updateCamera(0, true);
  }

  function startEnding() {
    G.state = 'ending';
    G.endT = 0;
    hero.boostT = 0;
    A.setWind(0);
  }

  function updateEnding(dt) {
    const e = (G.endT += dt);
    const b = L.brazier;
    const h = hero;
    h.reach = U.smooth(0.25, 0.75, e) * (1 - U.smooth(1.7, 2.4, e));
    h.facing = 1;
    h.flame = U.approach(h.flame, 100, dt * 40);
    if (e > 0.85 && !b.lit) {
      b.lit = true;
      A.ignite(true);
      burst(b.x, GY - 90, 60, 'spark', -Math.PI / 2, 2.2, 320, 1.4, 2.2, 0);
    }
    b.flameA = U.smooth(0.85, 2.2, e);
    if (b.lit && Math.random() < dt * 30) spawn('spark', b.x + (Math.random() - 0.5) * 50, D.brazierFireY, (Math.random() - 0.5) * 40, -60 - Math.random() * 80, 1.2, 1.2, 1 + Math.random() * 1.2, 0);
    G.wave = e < 1.6 ? -1 : U.easeOut((e - 1.6) / 7) * 5200;
    G.darkAlpha = DARKNESS * (1 - U.smooth(1.8, 6.8, e));
    G.life = U.smooth(2.2, 8.5, e);
    if (e > 2 && !G.bloomPlayed) {
      G.bloomPlayed = true;
      A.bloom();
      A.setAmbient(0.25);
    }
    if (G.life > 0.3) {
      const vw = W / G.cam.z;
      if (Math.random() < dt * 6 * G.life) {
        spawn('firefly', G.cam.x + Math.random() * vw, 380 + Math.random() * 210, 0, 0, 6, 6, 1.5 + Math.random(), 0);
      }
      if (Math.random() < dt * 4 * G.life) {
        const pt = spawn('petal', G.cam.x + Math.random() * vw, G.cam.y - 10, -20 + Math.random() * 30, 30 + Math.random() * 30, 12, 12, Math.random(), 0);
        if (pt) pt.col = PETALS[(Math.random() * 3) | 0];
      }
      if (Math.random() < dt * 0.5) {
        for (const bd of birds) {
          if (bd.on) continue;
          bd.on = true;
          bd.x = G.cam.x - 40;
          bd.y = 40 + Math.random() * 160;
          bd.v = 60 + Math.random() * 50;
          bd.p = Math.random() * TAU;
          bd.s = 0.7 + Math.random() * 0.6;
          if (Math.random() < 0.6) A.bird();
          break;
        }
      }
    }
    for (const bd of birds) {
      if (!bd.on) continue;
      bd.x += bd.v * dt;
      bd.p += dt * 9;
      if (bd.x > G.cam.x + W / G.cam.z + 60) bd.on = false;
    }
    if (e > 10.5 && !G.endShown) {
      G.endShown = true;
      G.state = 'won';
      const t = Math.round(G.playTime);
      document.getElementById('endStats').textContent = `الوقت: ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}  ·  مرات الانطفاء: ${G.deaths}`;
      endEl.classList.add('visible');
    }
  }

  // One-shot menu keys: handled once per frame, outside the fixed physics steps.
  function handleMetaKeys() {
    if (pressed.KeyM) A.setMuted(!A.muted);
    if ((pressed.Escape || pressed.KeyP) && G.state === 'playing') G.paused = !G.paused;
    if (pressed.Enter && G.state === 'menu') startGame();
    if (pressed.KeyF) fps.on = !fps.on;
    pressed.KeyM = pressed.Escape = pressed.KeyP = pressed.Enter = pressed.KeyF = false;
  }

  function update(dt) {
    if (G.paused) {
      A.setWind(0);
      return;
    }
    G.time += dt;
    CM.now = G.time;
    G.stageT += dt;
    G.flash = Math.max(0, G.flash - dt);
    G.hurtShake = Math.max(0, G.hurtShake - dt);
    G.boostDeny = Math.max(0, (G.boostDeny || 0) - dt);
    if (G.toast.on) {
      G.toast.t += dt;
      if (G.toast.t > G.toast.dur) G.toast.on = false;
    }

    const h = hero;
    if (G.state === 'playing') G.playTime += dt;
    if (G.state === 'playing' || G.state === 'menu') G.lightFade = U.approach(G.lightFade, 1, dt * 1.4);

    updateWind(dt);
    updateDrips(dt);

    const controllable = G.state === 'playing';
    if (G.state === 'dying') {
      G.dieT += dt;
      h.vx = U.approach(h.vx, 0, dt * 800);
      h.vy = Math.min(h.vy + GRAVITY * dt, 1150);
      if (h.y < 900) moveAndCollide(h, dt);
      G.lightFade = 1 - U.smooth(0, 0.7, G.dieT);
      if (G.dieT > 1.7) respawn();
    } else if (G.state !== 'won') {
      updateHero(dt, controllable);
    } else {
      h.vx = 0;
      h.walkAmt = U.approach(h.walkAmt, 0, dt * 4);
    }

    if (G.state === 'playing') {
      if (h.flame <= 0) die('out');
      else if (h.y > 820) die('fall');
      else if (h.x + h.w / 2 > L.brazier.x - 72) startEnding();
    }
    if (G.state === 'ending' || G.state === 'won') updateEnding(dt);

    updatePickups(dt);
    updateParticles(dt);
    updateCamera(dt, false);

    // flame visuals + light radius
    const deathK = G.state === 'dying' ? 1 - U.smooth(0, 0.5, G.dieT) : 1;
    h.flameSize = (19 + h.flame * 0.17) * (1 + 0.45 * h.boostA) * deathK * (1 - h.windLean * 0.18);
    const flick = 1 + 0.035 * Math.sin(G.time * 13) + 0.025 * Math.sin(G.time * 31.7);
    h.lightR = (110 + h.flame * 1.3) * (1 + 0.85 * h.boostA) * flick * (1 - (h.windPush || 0) * 0.12);

    G.crackleT -= dt;
    if (G.crackleT <= 0 && h.flameSize > 5 && G.state !== 'menu') {
      G.crackleT = 0.08 + Math.random() * 0.45;
      A.crackle(0.03 + h.boostA * 0.04);
    }
    clearPressed(); // one-shot presses are consumed by the first fixed step that runs
  }

  // ------------------------------------------------------------ rendering
  let shakeX = 0;
  let shakeY = 0;
  function setWorld(c, scale) {
    const sc = scale || S;
    const z = G.cam.z * sc;
    c.setTransform(z, 0, 0, z, (-G.cam.x * G.cam.z + shakeX) * sc, (-G.cam.y * G.cam.z + shakeY) * sc);
  }
  function setScreen(c) {
    c.setTransform(S, 0, 0, S, 0, 0);
  }
  function inView(x0, x1, pad) {
    pad = pad || 0;
    return x1 > G.cam.x - pad && x0 < G.cam.x + W / G.cam.z + pad;
  }

  function drawSky() {
    const life = G.life;
    setScreen(ctx);
    ctx.fillStyle = '#0D0805';
    ctx.fillRect(0, 0, W, H);
    // the golden-hour sky (pre-rendered once) fades in over the black
    if (life > 0.001) {
      ctx.globalAlpha = life;
      ctx.drawImage(CM.fx.skyAlive, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // Painted parallax layer: tiles an image (mirrored copies) across the view.
  function drawLayer(im, par, height, bottom, alpha) {
    if (!im || !im.width || alpha <= 0.01) return;
    const z = G.cam.z;
    ctx.setTransform(z * S, 0, 0, z * S, -G.cam.x * par * z * S, -G.cam.y * z * S);
    const w = im.width * (height / im.height);
    const from = G.cam.x * par - 10;
    const to = from + W / z + 20;
    ctx.globalAlpha = alpha;
    CM.tileMirrored(ctx, im, 0, bottom - height, w, height, from, to);
    ctx.globalAlpha = 1;
  }

  function drawBackground() {
    drawSky();
    const I = CM.img;
    const dead = 1 - G.life;
    // the living forest (end scene) rises behind everything
    if (G.life > 0.01 && CM.forestFaded) {
      const par = 0.35;
      const z = G.cam.z;
      ctx.setTransform(z * S, 0, 0, z * S, -G.cam.x * par * z * S, -G.cam.y * z * S);
      const im = CM.forestFaded;
      const hh = 470;
      const w = im.width * (hh / im.height);
      ctx.globalAlpha = G.life;
      ctx.drawImage(im, L.brazier.x * par - w * 0.42, GY + 30 - hh, w, hh);
      ctx.globalAlpha = 1;
    }
    drawLayer(I.bg_far, 0.18, 330, GY - 10, dead);
    drawLayer(I.bg_mid, 0.45, 290, GY + 12, dead);
    if (G.life > 0.01) {
      setScreen(ctx);
      // birds
      ctx.strokeStyle = '#282832';
      ctx.globalAlpha = 0.7 * G.life;
      ctx.lineWidth = 1.6;
      for (const b of birds) {
        if (!b.on) continue;
        const sx = (b.x - G.cam.x) * G.cam.z;
        const fl = Math.sin(b.p) * 5 * b.s;
        ctx.beginPath();
        ctx.moveTo(sx - 8 * b.s, b.y - fl);
        ctx.quadraticCurveTo(sx - 3 * b.s, b.y - 3, sx, b.y);
        ctx.quadraticCurveTo(sx + 3 * b.s, b.y - 3, sx + 8 * b.s, b.y - fl);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawWorld() {
    const t = G.time;
    const h = hero;
    setWorld(ctx);
    for (const tr of L.trees) if (inView(tr.x - 260, tr.x + 260)) D.tree(ctx, tr, 1 - localLife(tr.x));
    // the pits stay dark, whatever is painted behind them
    ctx.fillStyle = '#070403';
    ctx.fillRect(G.cam.x - 50, GY + 2, W / G.cam.z + 100, 600);
    for (const lg of L.logs) if (inView(lg.x1 - 60, lg.x2 + 60)) D.log(ctx, lg);
    for (const g of L.grounds) if (inView(g.x, g.x + g.w)) D.ground(ctx, g);
    for (const r of L.rocks) if (inView(r.x - 30, r.x + r.w + 30)) D.rock(ctx, r);

    // fresh grass and flowers sprout when the light returns
    ctx.lineCap = 'round';
    const gx0 = G.cam.x - 20;
    const gx1 = G.cam.x + W / G.cam.z + 20;
    ctx.lineWidth = 1.6;
    for (const b of L.grass) {
      if (b.x < gx0 || b.x > gx1) continue;
      const ll = localLife(b.x);
      if (ll <= 0) continue;
      const hh = b.h * ll;
      ctx.strokeStyle = b.col;
      ctx.beginPath();
      ctx.moveTo(b.x, GY + 1);
      ctx.quadraticCurveTo(b.x, GY - hh * 0.5, b.x + b.lean * hh, GY - hh);
      ctx.stroke();
    }
    for (const f of L.flowers) {
      if (f.x < gx0 || f.x > gx1) continue;
      const ll = localLife(f.x);
      const gr = U.smooth(0.35 + f.k * 0.2, 1, ll);
      if (gr <= 0) continue;
      const top = GY - f.h * gr;
      ctx.strokeStyle = '#4c8a3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(f.x, GY);
      ctx.quadraticCurveTo(f.x + 3, GY - f.h * gr * 0.5, f.x, top);
      ctx.stroke();
      const r = f.r * U.smooth(0.5, 1, gr);
      if (r > 0.2) {
        ctx.fillStyle = f.col;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + t * 0.2;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * r, top + Math.sin(a) * r, r * 0.75, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#ffd34d';
        ctx.beginPath();
        ctx.arc(f.x, top, r * 0.55, 0, TAU);
        ctx.fill();
      }
    }

    for (const cp of L.checkpoints) if (inView(cp.x - 20, cp.x + 20)) D.candle(ctx, cp);
    if (inView(L.brazier.x - 80, L.brazier.x + 80)) D.brazier(ctx, L.brazier);

    // drip spots and drops
    for (const em of L.drips) {
      if (!inView(em.x - 10, em.x + 10)) continue;
      ctx.fillStyle = 'rgba(20,30,40,0.6)';
      ctx.beginPath();
      ctx.ellipse(em.x, em.y - 1, 9, 3, 0, 0, TAU);
      ctx.fill();
      if (em.form > 0) D.drop(ctx, em.x, em.y + 1 + em.form * 4, 1 + em.form * 2.6, 1);
    }
    for (const d of drops) D.drop(ctx, d.x, d.y, 3.6, 1);

    D.heroShadow(ctx, h);
    if (!(h.inv > 0 && G.state === 'playing' && Math.floor(G.time * 16) % 2 === 0 && h.inv < 0.6)) D.hero(ctx, h, t);
  }

  // Punch light holes in the darkness layer.
  // (uses the pre-rendered light stamp: no gradient is built per frame)
  function punch(c, x, y, r, k) {
    if (r <= 1 || k <= 0) return;
    CM.fx.draw(c, CM.fx.light, x, y, r, k);
  }

  // Shadow volume of a convex polygon lit by a point light.
  function castShadow(c, pts, lx, ly) {
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p[0];
      cy += p[1];
    }
    cx /= pts.length;
    cy /= pts.length;
    const FAR = 1600;
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      let nx = -(b[1] - a[1]);
      let ny = b[0] - a[0];
      if (nx * (mx - cx) + ny * (my - cy) < 0) {
        nx = -nx;
        ny = -ny;
      }
      if (nx * (lx - mx) + ny * (ly - my) >= 0) continue; // faces the light
      const ax = a[0] - lx;
      const ay = a[1] - ly;
      const bx = b[0] - lx;
      const by = b[1] - ly;
      const la = Math.hypot(ax, ay) || 1;
      const lb = Math.hypot(bx, by) || 1;
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
      c.lineTo(b[0] + (bx / lb) * FAR, b[1] + (by / lb) * FAR);
      c.lineTo(a[0] + (ax / la) * FAR, a[1] + (ay / la) * FAR);
      c.closePath();
    }
    c.fill();
  }

  function renderLighting() {
    const l = lctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, lc.width, lc.height);
    const da = G.darkAlpha;
    if (da <= 0.003) return false;
    l.fillStyle = '#080503';
    l.globalAlpha = da;
    l.fillRect(0, 0, lc.width, lc.height);
    l.globalAlpha = 1;
    setWorld(l, LS);
    const h = hero;
    const R = h.lightR * G.lightFade;
    const fx = h.fx;
    const fy = h.fy;
    if (R > 2) {
      l.globalCompositeOperation = 'destination-out';
      punch(l, fx, fy, R, 1);
      // occluders cast shadows away from the flame
      l.globalCompositeOperation = 'source-over';
      l.save();
      l.beginPath();
      l.arc(fx, fy, R, 0, TAU);
      l.clip();
      l.beginPath();
      l.rect(fx - R, fy - R, R * 2, GY + 3 - (fy - R));
      l.clip();
      l.fillStyle = '#080503';
      l.globalAlpha = da * 0.8;
      for (const r of L.rocks) if (Math.abs(r.x + r.w / 2 - fx) < R + 60) castShadow(l, r.pts, fx, fy);
      l.globalAlpha = 1;
      l.restore();
    }
    l.globalCompositeOperation = 'destination-out';
    for (const cp of L.checkpoints) {
      if (!cp.lit) continue;
      const k = U.smooth(0, 0.6, cp.litT);
      punch(l, cp.x, D.candleFlameY, (150 + Math.sin(G.time * 9 + cp.x) * 5) * k, 0.95);
    }
    for (const e of L.embers) if (!e.taken) punch(l, e.x, e.y, 55, 0.6);
    const b = L.brazier;
    if (b.lit) punch(l, b.x, D.brazierFireY, 320 * b.flameA + Math.max(0, G.wave) * 1.3, 1);
    // unlit brazier: a faint, inviting glint
    else punch(l, b.x, GY - 70, 60, 0.22 + 0.06 * Math.sin(G.time * 2));
    l.globalCompositeOperation = 'source-over';
    return true;
  }

  function drawLightLayer() {
    if (!renderLighting()) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lc, 0, 0, canvas.width, canvas.height); // half-res layer, scaled up (it is soft anyway)
    // warm golden-brown tint inside the light
    setWorld(ctx);
    const h = hero;
    const R = h.lightR * G.lightFade;
    if (R > 2) {
      ctx.globalCompositeOperation = 'overlay';
      CM.fx.draw(ctx, CM.fx.tint, h.fx, h.fy, R * 1.1, 1);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawEmissive() {
    const t = G.time;
    const h = hero;
    setWorld(ctx);

    // glints on forming drops so they read in the dark
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const em of L.drips) {
      if (em.form > 0.05 && inView(em.x - 10, em.x + 10)) CM.fx.draw(ctx, CM.fx.drip, em.x, em.y + 4, 10, 0.55 * em.form);
    }
    ctx.fillStyle = 'rgba(150,200,255,0.35)';
    for (const d of drops) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    for (const e of L.embers) if (!e.taken && inView(e.x - 20, e.x + 20)) D.ember(ctx, e, t);

    // flickering glow over the painted flames
    for (const cp of L.checkpoints) {
      if (!cp.lit || !inView(cp.x - 40, cp.x + 40)) continue;
      glow(cp.x, D.candleFlameY - 4, 26 * (1 + 0.08 * Math.sin(t * 15 + cp.x)), 0.5 * U.smooth(0, 0.5, cp.litT));
    }
    const b = L.brazier;
    if (b.lit && inView(b.x - 120, b.x + 120)) {
      glow(b.x, D.brazierFireY + 5, 95 * (1 + 0.06 * Math.sin(t * 11) + 0.04 * Math.sin(t * 27)), 0.55 * b.flameA);

    }

    const heroK = h.out ? 0 : G.lightFade * (0.55 + h.flame / 220) * (1 + h.boostA * 0.6);
    D.heroGlow(ctx, h, heroK, t);

    // particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const a = U.clamp(p.life / p.max, 0, 1);
      switch (p.type) {
        case 'spark': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = SPARK_COL[(a * 16) | 0];
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s * (0.5 + a * 0.5), 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'smoke':
        case 'steam': {
          const lit = lightAt(p.x, p.y);
          ctx.fillStyle = p.type === 'steam' ? '#c8d2dc' : '#6e645c';
          ctx.globalAlpha = a * (0.12 + 0.3 * lit);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'splash': {
          ctx.fillStyle = '#b4d7f5';
          ctx.globalAlpha = a * (0.3 + 0.6 * lightAt(p.x, p.y));
          ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
          ctx.globalAlpha = 1;
          break;
        }
        case 'dust': {
          ctx.fillStyle = '#785a3c';
          ctx.globalAlpha = a * 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'streak': {
          const lit = 0.08 + 0.4 * lightAt(p.x, p.y);
          const fade = Math.sin(a * Math.PI);
          ctx.strokeStyle = '#ffe1be';
          ctx.globalAlpha = lit * fade;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.s, p.y + Math.sin(p.x * 0.01) * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'leaf': {
          const lit = 0.15 + 0.85 * lightAt(p.x, p.y);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = LEAF_COL[(lit * 16) | 0];
          ctx.globalAlpha = Math.min(1, a * 3);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'firefly': {
          ctx.globalCompositeOperation = 'lighter';
          const tw = 0.5 + 0.5 * Math.sin(t * 4 + p.x);
          CM.fx.draw(ctx, CM.fx.firefly, p.x, p.y, 9, 0.9 * tw * Math.min(1, a * 3));
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'petal': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.col;
          ctx.globalAlpha = Math.min(1, a * 4);
          ctx.beginPath();
          ctx.ellipse(0, 0, 3.2, 1.6, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        }
      }
    }

    // dust motes floating in the light
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffc882';
    for (const m of motes) {
      const lit = lightAt(m.x, m.y);
      if (lit < 0.03) continue;
      ctx.globalAlpha = lit * 0.7 * (0.6 + 0.4 * Math.sin(t * 3 + m.p));
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.s * 0.8, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    drawTexts();
  }

  function glow(x, y, r, a) {
    if (a <= 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    CM.fx.draw(ctx, CM.fx.warm, x, y, r, a);
    ctx.globalCompositeOperation = 'source-over';
  }

  function lightAt(x, y) {
    if (G.darkAlpha < 0.3) return 1;
    const h = hero;
    const R = h.lightR * G.lightFade;
    let v = R > 0 ? U.clamp(1 - Math.hypot(x - h.fx, y - h.fy) / R, 0, 1) : 0;
    for (const cp of L.checkpoints) if (cp.lit) v = Math.max(v, U.clamp(1 - Math.hypot(x - cp.x, y - GY + 50) / 150, 0, 1));
    return v;
  }

  function drawTexts() {
    if (G.state === 'menu') return;
    const hx = hero.x + hero.w / 2;
    const isTouch = document.body.classList.contains('touch');
    ctx.font = '600 22px Cairo, Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    // only the closest hint is shown, so they never overlap
    let near = null;
    for (const tx of L.texts) if (!near || Math.abs(tx.x - hx) < Math.abs(near.x - hx)) near = tx;
    if (near) {
      const d = near.x - hx;
      const a = U.clamp(1 - Math.max(0, Math.abs(d + 120) - 180) / 220, 0, 1) * (1 - G.life);
      if (a > 0.01) {
        ctx.fillStyle = '#f2cd96';
        ctx.globalAlpha = a * 0.85;
        ctx.shadowColor = 'rgba(255,140,40,0.6)';
        ctx.shadowBlur = 12;
        ctx.fillText(isTouch && near.tt ? near.tt : near.t, near.x + 40, 300);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  let hudFlameVal = -1;
  let hudFlameText = '';

  // ------------------------------------------------------------ FPS counter (F key, ?fps, or two-finger tap)
  const fps = { on: /[?&]fps/.test(location.search), frames: 0, t: 0, value: 0, ms: 0, text: '' };
  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2 && !e.target.closest('.tbtn')) fps.on = !fps.on;
    },
    { passive: true }
  );
  function countFps(dtReal) {
    fps.frames++;
    fps.t += dtReal;
    if (fps.t >= 0.5) {
      fps.value = Math.round(fps.frames / fps.t);
      fps.ms = (fps.t * 1000) / fps.frames;
      fps.text = fps.value + ' FPS  ' + fps.ms.toFixed(1) + ' ms';
      fps.frames = 0;
      fps.t = 0;
    }
  }
  function drawFps() {
    if (!fps.on) return;
    setScreen(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(10, H - 36, 150, 26);
    ctx.font = '700 14px Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.fillStyle = fps.value >= 55 ? '#7dff8a' : fps.value >= 40 ? '#ffd35a' : '#ff6a5a';
    ctx.fillText(fps.text, 18, H - 18);
  }

  function drawHUD() {
    setScreen(ctx);
    // vignette
    ctx.globalAlpha = 0.65 - 0.4 * G.life;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(CM.fx.vignette, 0, 0); // 1:1, no scaling
    setScreen(ctx);
    ctx.globalAlpha = 1;

    if (G.flash > 0) {
      ctx.fillStyle = '#78aae6';
      ctx.globalAlpha = G.flash * 0.35;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (G.state === 'menu') return;

    const hudA = G.state === 'ending' || G.state === 'won' ? 1 - U.smooth(0, 1.5, G.endT) : 1;
    if (hudA > 0.01) {
      ctx.save();
      ctx.globalAlpha = hudA;
      const h = hero;
      const bw = 260;
      const bx = W - 40 - bw;
      const by = 52;
      let shake = 0;
      if (h.flame < 25 && G.state === 'playing') shake = Math.sin(G.time * 30) * 1.2;
      ctx.font = '700 18px Cairo, Tahoma, sans-serif';
      ctx.textAlign = 'right';
      ctx.direction = 'rtl';
      ctx.fillStyle = '#f2cf96';
      const fv = Math.round(h.flame);
      if (fv !== hudFlameVal) {
        hudFlameVal = fv;
        hudFlameText = 'قوة الشعلة  ' + fv; // rebuilt only when the number changes
      }
      ctx.fillText(hudFlameText, W - 72, 40);
      D.flame(ctx, W - 52, 42, 22, Math.sin(G.time) * 0.1, G.time, 9);
      // bar
      ctx.translate(shake, 0);
      roundRect(ctx, bx, by, bw, 14, 7);
      ctx.fillStyle = 'rgba(20,12,6,0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(242,199,122,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      const fw = (bw - 4) * U.clamp(h.flameShown / 100, 0, 1);
      if (fw > 1) {
        const low = h.flame < 25;
        ctx.save();
        roundRect(ctx, bx + bw - 2 - fw, by + 2, fw, 10, 5);
        ctx.clip();
        ctx.drawImage(low ? CM.fx.barLow : CM.fx.bar, bx + bw - 2 - fw, by + 2, fw, 10);
        if (low) {
          ctx.fillStyle = '#ff3c14';
          ctx.globalAlpha = hudA * (0.25 + 0.25 * Math.sin(G.time * 10));
          ctx.fillRect(bx + bw - 2 - fw, by + 2, fw, 10);
        }
        ctx.restore();
      }
      // boost indicator
      const ready = h.boostCd <= 0;
      const cx = W - 52;
      const cy = 98;
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, TAU);
      ctx.fillStyle = 'rgba(20,12,6,0.75)';
      ctx.fill();
      ctx.strokeStyle = ready ? '#ffc56b' : 'rgba(242,199,122,0.3)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + TAU * (ready ? 1 : 1 - h.boostCd / BOOST_COOLDOWN));
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.direction = 'ltr';
      ctx.font = '700 13px Cairo, Tahoma, sans-serif';
      ctx.fillStyle = ready ? '#ffd38a' : 'rgba(242,199,122,0.45)';
      ctx.fillText(document.body.classList.contains('touch') ? '☀' : 'E', cx, cy + 5);
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.font = '600 15px Cairo, Tahoma, sans-serif';
      ctx.fillStyle = G.boostDeny > 0 ? '#ff8a5a' : 'rgba(242,207,150,0.75)';
      ctx.fillText(ready ? 'تقوية الضوء جاهزة' : h.boostT > 0 ? 'الضوء قوي!' : 'تقوية الضوء…', cx - 22, cy + 5);
      ctx.restore();
    }

    // toast
    if (G.toast.on) {
      const tt = G.toast;
      const a = U.smooth(0, 0.4, tt.t) * (1 - U.smooth(tt.dur - 0.6, tt.dur, tt.t));
      ctx.font = '700 28px "Reem Kufi", Cairo, Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      ctx.fillStyle = '#ffd696';
      ctx.globalAlpha = U.clamp(a, 0, 1);
      ctx.shadowColor = 'rgba(255,120,30,0.8)';
      ctx.shadowBlur = 18;
      ctx.fillText(tt.text, W / 2, 130);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    if (G.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      ctx.fillStyle = '#ffd38a';
      ctx.font = '700 54px "Reem Kufi", Cairo, Tahoma, sans-serif';
      ctx.fillText('إيقاف مؤقت', W / 2, H / 2);
      ctx.font = '500 20px Cairo, Tahoma, sans-serif';
      ctx.fillStyle = 'rgba(242,214,168,0.8)';
      ctx.fillText(document.body.classList.contains('touch') ? 'المس زر ▶ للمتابعة' : 'اضغط Esc للمتابعة', W / 2, H / 2 + 44);
    }
  }

  function render() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    drawBackground();
    drawWorld();
    drawLightLayer();
    drawEmissive();
    drawHUD();
    drawFps();
  }

  // ------------------------------------------------------------ loop
  const startBtn = document.getElementById('startBtn');
  if (!CM.assetsReady) {
    startBtn.disabled = true;
    startBtn.dataset.label = startBtn.textContent;
    startBtn.textContent = '…';
  }
  CM.onAssets(() => {
    startBtn.disabled = false;
    D.prepare();
    if (startBtn.dataset.label) startBtn.textContent = startBtn.dataset.label;
    // the living forest panorama fades softly into the sky at its top edge
    const im = CM.img.forest_alive;
    if (im.width) {
      const c = document.createElement('canvas');
      c.width = im.width;
      c.height = im.height;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      x.globalCompositeOperation = 'destination-in';
      const g = x.createLinearGradient(0, 0, 0, im.height);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.3, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      x.fillStyle = g;
      x.fillRect(0, 0, im.width, im.height);
      CM.forestFaded = c;
    }
  });

  function drawLoading() {
    setScreen(ctx);
    ctx.fillStyle = '#0D0805';
    ctx.fillRect(0, 0, W, H);
    const p = CM.assetProgress();
    ctx.fillStyle = 'rgba(255,170,70,0.25)';
    ctx.fillRect(W / 2 - 150, H - 80, 300, 4);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(W / 2 - 150, H - 80, 300 * p, 4);
  }

  // Fixed timestep: the game simulates exactly 60 steps per second whatever the screen's
  // refresh rate (60 / 120 Hz, slow device…). Drawing interpolates between the last two
  // steps so motion stays smooth even when a frame does not line up with a step.
  const STEP = 1 / 60;
  const MAX_STEPS = 5; // after a long hitch (tab switch…) skip ahead instead of spiralling
  let acc = 0;
  let last = performance.now();
  const prev = { hx: 0, hy: 0, cx: 0, cy: 0, cz: 1 };

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    countFps(dt);
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    handleMetaKeys();
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      prev.hx = hero.x;
      prev.hy = hero.y;
      prev.cx = G.cam.x;
      prev.cy = G.cam.y;
      prev.cz = G.cam.z;
      update(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;
    syncTouchUI();
    if (CM.assetsReady) {
      // interpolate positions between the previous and the current step
      const a = G.paused ? 1 : acc / STEP;
      const hx = hero.x;
      const hy = hero.y;
      const cx = G.cam.x;
      const cy = G.cam.y;
      const cz = G.cam.z;
      if (Math.abs(hx - prev.hx) < 60 && Math.abs(hy - prev.hy) < 60) {
        hero.x = U.lerp(prev.hx, hx, a);
        hero.y = U.lerp(prev.hy, hy, a);
      }
      if (Math.abs(cx - prev.cx) < 200) {
        G.cam.x = U.lerp(prev.cx, cx, a);
        G.cam.y = U.lerp(prev.cy, cy, a);
        G.cam.z = U.lerp(prev.cz, cz, a);
      }
      shakeX = G.hurtShake > 0 ? (Math.random() - 0.5) * 6 * G.hurtShake : 0;
      shakeY = G.hurtShake > 0 ? (Math.random() - 0.5) * 6 * G.hurtShake : 0;
      render();
      hero.x = hx;
      hero.y = hy;
      G.cam.x = cx;
      G.cam.y = cy;
      G.cam.z = cz;
    } else drawLoading();
    requestAnimationFrame(frame);
  }

  newGame();
  requestAnimationFrame(frame);

  // debugging / automated testing hooks
  CM.game = {
    G,
    get hero() {
      return hero;
    },
    get level() {
      return L;
    },
    start: startGame,
    fps,
    teleport(x) {
      hero.climb = null;
      hero.x = x;
      hero.y = GY - hero.h - 2;
      hero.vx = hero.vy = 0;
      snapCamera();
    },
  };
})();
