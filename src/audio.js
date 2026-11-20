// Procedural sound with the Web Audio API — no audio files needed.
(function () {
  const CM = (window.CM = window.CM || {});
  const A = (CM.audio = { ctx: null, muted: false });

  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (A.ctx = new AC());
    A.master = c.createGain();
    A.master.gain.value = 0.75;
    A.master.connect(c.destination);

    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.noise = buf;

    // Ambient: a low, lonely drone plus distant air.
    A.amb = c.createGain();
    A.amb.gain.value = 0;
    A.amb.connect(A.master);
    [55, 82.4, 110.2].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = [0.08, 0.04, 0.02][i];
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.06 + i * 0.035;
      const lg = c.createGain();
      lg.gain.value = [0.03, 0.02, 0.012][i];
      lfo.connect(lg);
      lg.connect(g.gain);
      o.connect(g);
      g.connect(A.amb);
      o.start();
      lfo.start();
    });
    const air = A.loopNoise();
    const af = c.createBiquadFilter();
    af.type = 'lowpass';
    af.frequency.value = 350;
    const ag = c.createGain();
    ag.gain.value = 0.05;
    air.connect(af);
    af.connect(ag);
    ag.connect(A.amb);
    A.amb.gain.linearRampToValueAtTime(1, c.currentTime + 3);

    // Wind bed (gain driven by gameplay).
    const w = A.loopNoise();
    A.windF = c.createBiquadFilter();
    A.windF.type = 'bandpass';
    A.windF.frequency.value = 400;
    A.windF.Q.value = 0.9;
    A.windG = c.createGain();
    A.windG.gain.value = 0;
    w.connect(A.windF);
    A.windF.connect(A.windG);
    A.windG.connect(A.master);
  };

  A.loopNoise = function () {
    const s = A.ctx.createBufferSource();
    s.buffer = A.noise;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(0, Math.random());
    return s;
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (A.ctx) A.master.gain.setTargetAtTime(m ? 0 : 0.75, A.ctx.currentTime, 0.05);
  };

  A.setWind = function (v) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    A.windG.gain.setTargetAtTime(v * 0.32, t, 0.15);
    A.windF.frequency.setTargetAtTime(280 + v * 750, t, 0.25);
  };

  A.setAmbient = function (v) {
    if (!A.ctx) return;
    A.amb.gain.setTargetAtTime(v, A.ctx.currentTime, 0.8);
  };

  function tone(freq, dur, type, vol, freqEnd, delay, attack) {
    if (!A.ctx) return;
    const c = A.ctx;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = c.createGain();
    const at = attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(A.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, ftype, f0, f1, delay, q) {
    if (!A.ctx) return;
    const c = A.ctx;
    const t0 = c.currentTime + (delay || 0);
    const s = c.createBufferSource();
    s.buffer = A.noise;
    const f = c.createBiquadFilter();
    f.type = ftype;
    f.frequency.setValueAtTime(f0, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    if (q) f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(A.master);
    s.start(t0, Math.random());
    s.stop(t0 + dur + 0.05);
  }

  A.jump = () => noise(0.14, 0.06, 'lowpass', 900, 300);
  A.land = (v) => noise(0.12, 0.05 + 0.1 * (v || 0), 'lowpass', 500, 150);
  A.crackle = (v) => noise(0.025 + Math.random() * 0.03, (v || 0.04) * (0.4 + Math.random()), 'bandpass', 1500 + Math.random() * 3000, null, 0, 3);
  A.drip = (v) => {
    tone(1500 + Math.random() * 400, 0.14, 'sine', 0.12 * (v || 1), 500);
    noise(0.05, 0.03 * (v || 1), 'highpass', 4000);
  };
  A.hiss = () => {
    noise(0.6, 0.22, 'highpass', 2500, 7000);
    tone(400, 0.25, 'sine', 0.05, 200);
  };
  A.boost = () => {
    noise(0.7, 0.18, 'lowpass', 300, 2500);
    tone(330, 0.8, 'triangle', 0.05, 495, 0, 0.2);
  };
  A.pickup = () => {
    tone(880, 0.5, 'sine', 0.09);
    tone(1320, 0.6, 'sine', 0.06, null, 0.07);
    tone(1760, 0.7, 'sine', 0.04, null, 0.14);
  };
  A.ignite = (big) => {
    noise(big ? 1.6 : 0.7, big ? 0.35 : 0.2, 'lowpass', 200, big ? 3500 : 2500);
    tone(big ? 196 : 392, big ? 2 : 1, 'triangle', big ? 0.12 : 0.07, big ? 294 : 523, 0, 0.1);
    if (!big) tone(784, 1.2, 'sine', 0.05, null, 0.12);
  };
  A.death = () => {
    tone(330, 1.4, 'sine', 0.1, 70);
    noise(1.2, 0.18, 'highpass', 1800, 6000);
  };
  A.respawn = () => {
    tone(262, 1.2, 'sine', 0.06, null, 0, 0.3);
    tone(392, 1.4, 'sine', 0.05, null, 0.2, 0.3);
  };

  A.bird = (delay) => {
    if (!A.ctx) return;
    const c = A.ctx;
    const t0 = c.currentTime + (delay || 0);
    const base = 2200 + Math.random() * 1800;
    const n = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const ts = t0 + i * (0.09 + Math.random() * 0.05);
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, ts);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), ts + 0.04);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, ts + 0.08);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.exponentialRampToValueAtTime(0.035, ts + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.09);
      o.connect(g);
      g.connect(A.master);
      o.start(ts);
      o.stop(ts + 0.12);
    }
  };

  // The "life returns" swell: a warm major chord, chimes, and birds.
  A.bloom = () => {
    if (!A.ctx) return;
    [130.8, 196, 261.6, 329.6, 392, 523.3].forEach((f, i) => tone(f, 9, i < 2 ? 'sine' : 'triangle', 0.045, null, i * 0.12, 2.2));
    const melody = [523.3, 659.3, 784, 1046.5, 784, 880, 1046.5, 1318.5];
    melody.forEach((f, i) => tone(f, 1.6, 'sine', 0.05, null, 1.2 + i * 0.38));
    for (let i = 0; i < 14; i++) A.bird(2.5 + i * 0.6 + Math.random() * 0.6);
  };
})();
