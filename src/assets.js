// Image loading + metadata for the painted art in /assets.
(function () {
  const CM = (window.CM = window.CM || {});

  // Every hero frame is a 380x410 PNG drawn at 3 px per world px.
  // The wick base sits at (cx, cy) in every frame, so poses never jump or change size.
  // flameY = where the flame's light comes from (sprite px, from the top).
  CM.HERO = {
    cw: 380,
    ch: 410,
    cx: 195,
    cy: 150,
    feet: 342,
    px: 3,
    flameY: {
      idle: 113, walk0: 108, walk1: 103, walk2: 108, walk3: 105, walk4: 108, walk5: 107,
      jump_up: 109, jump_down: 108, boost: 118, out: 91, climb0: 117, climb1: 119,
      // new jump animation (assets/candleman): feet on the same line in every frame
      jump_up_1: 111, jump_up_2: 142, jump_up_3: 101, jump_up_4: 99, jump_up_5: 144, jump_up_6: 131,
      jump_land_1: 114, jump_land_2: 122, jump_land_3: 162, jump_land_4: 185, jump_land_5: 146, jump_land_6: 118,
    },
    // horizontal offset of the flame from the frame's centre line (sprite px); 0 when missing
    flameX: {
      jump_up_1: 5, jump_up_2: 35, jump_up_3: 43, jump_up_4: 40, jump_up_5: 37, jump_up_6: 6,
      jump_land_1: 9, jump_land_2: 5, jump_land_3: 16, jump_land_4: 14, jump_land_5: 13, jump_land_6: -2,
    },
    walk: ['walk0', 'walk1', 'walk2', 'walk3', 'walk4', 'walk5'],
    climb: ['climb0', 'climb1'], // seen from behind, alternated while climbing
  };

  const heroFrames = Object.keys(CM.HERO.flameY);
  const world = ['bg_far', 'bg_mid', 'tree_a', 'tree_b', 'ground', 'candle_off', 'candle_on', 'brazier_off', 'brazier_on', 'rock', 'drop', 'forest_alive'];

  CM.img = {};
  let loaded = 0;
  const total = heroFrames.length + world.length;
  CM.assetsReady = false;
  CM.assetProgress = () => loaded / total;

  const done = [];
  CM.onAssets = (fn) => (CM.assetsReady ? fn() : done.push(fn));

  function load(key, src) {
    const im = new Image();
    im.onload = im.onerror = () => {
      loaded++;
      if (loaded === total) {
        CM.assetsReady = true;
        done.forEach((f) => f());
      }
    };
    im.src = src;
    CM.img[key] = im;
  }
  // Everything is preloaded here, once, before the game can start: nothing loads during play.
  CM.heroImg = {}; // frame name -> image (no string building in the game loop)
  heroFrames.forEach((k) => {
    load('hero_' + k, (/^jump_(up|land)_\d$/.test(k) ? 'assets/candleman/' : 'assets/hero/') + k + '.png');
    CM.heroImg[k] = CM.img['hero_' + k];
  });
  world.forEach((k) => load(k, 'assets/world/' + k + '.png'));

  // Draw an image tiled horizontally, alternating mirrored copies so the seams always match.
  // step = distance between tiles (defaults to w; pass a slightly smaller step to overlap seams).
  CM.tileMirrored = function (ctx, im, x0, y, w, h, from, to, step) {
    if (!im.width) return;
    step = step || w;
    let i = Math.floor((from - x0) / step);
    for (let x = x0 + i * step; x < to; x += step, i++) {
      if (i % 2 === 0) ctx.drawImage(im, x, y, w, h);
      else {
        ctx.save();
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(im, 0, 0, w, h);
        ctx.restore();
      }
    }
  };
})();
