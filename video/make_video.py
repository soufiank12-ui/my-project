#!/usr/bin/env python3
"""
Generates a 24s, 1920x1080 @ 30fps cinematic motion-graphics video with an
original, procedurally synthesized soundtrack (120 BPM), all beat-synced.

Usage:  python3 make_video.py [out_dir]
Needs:  numpy, Pillow (with raqm), ffmpeg, fonts-noto-core (Noto Kufi Arabic)
"""
import math
import os
import shutil
import subprocess
import sys
import wave
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "out")
FRAMES = os.path.join(OUT, "frames")
W, H, FPS, DUR = 1920, 1080, 30, 24.0
NF = int(FPS * DUR)
BPM = 120
BEAT = 60 / BPM
SR = 44100
CX, CY = W // 2, H // 2

AR_BOLD = "/usr/share/fonts/truetype/noto/NotoKufiArabic-Bold.ttf"
AR_REG = "/usr/share/fonts/truetype/noto/NotoKufiArabic-Regular.ttf"
LAT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
LAT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

CYAN = np.array([0.15, 0.85, 1.0], np.float32)
VIOLET = np.array([0.62, 0.30, 1.0], np.float32)
GOLD = np.array([1.0, 0.78, 0.35], np.float32)

# --------------------------------------------------------------------------
# Timeline (shared by audio + video so everything locks to the beat)
# --------------------------------------------------------------------------
IMPACTS = [4.0, 12.0, 16.0]


def kick_times():
    ks = []
    t = 4.0
    while t < 22.0 - 1e-6:
        if 12.0 <= t < 16.0:  # half-time breakdown
            if (t - 12.0) % (2 * BEAT) < 1e-6 and t < 15.0:
                ks.append(t)
        else:
            ks.append(t)
        t += BEAT
    return ks


KICKS = kick_times()


def ease_out(x):
    x = np.clip(x, 0, 1)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def env_hits(t, times, rate):
    v = 0.0
    for tk in times:
        if tk <= t:
            v += math.exp(-(t - tk) * rate)
    return v


def window(t, a, b, fin=0.4, fout=0.4):
    return float(ease_in_out((t - a) / fin) * ease_in_out((b - t) / fout))


# ==========================================================================
# AUDIO
# ==========================================================================
def band(x, lo, hi, soft=0.15):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if lo > 0:
        m *= 1 / (1 + np.exp(-(f - lo) / (lo * soft + 1)))
    if hi < SR / 2:
        m *= 1 / (1 + np.exp((f - hi) / (hi * soft + 1)))
    return np.fft.irfft(X * m, len(x))


def tone(freqs_t, harm, decay_h=1.5):
    """Additive oscillator with time-varying frequency array."""
    ph = 2 * np.pi * np.cumsum(freqs_t) / SR
    out = np.zeros_like(ph)
    for n in range(1, harm + 1):
        out += np.sin(n * ph) / n ** decay_h
    return out


def note_hz(name):
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3,
             "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o - 4)) / 12)


CHORDS = [  # (bass root, pad voicing, arp notes)
    ("A1", ["A3", "C4", "E4", "B4"], ["A4", "C5", "E5", "A5", "E5", "C5"]),
    ("F1", ["F3", "A3", "C4", "E4"], ["F4", "A4", "C5", "F5", "C5", "A4"]),
    ("C2", ["G3", "C4", "E4", "G4"], ["C5", "E5", "G5", "C6", "G5", "E5"]),
    ("G1", ["G3", "B3", "D4", "F#4"], ["G4", "B4", "D5", "G5", "D5", "B4"]),
]


def make_audio(path):
    rng = np.random.default_rng(7)
    n = int(SR * (DUR + 0.5))
    t = np.arange(n) / SR
    L = np.zeros(n)
    R = np.zeros(n)
    send = np.zeros((2, n))  # reverb bus

    def add(sig, start, gain=1.0, pan=0.0, rev=0.0):
        i = int(start * SR)
        if i >= n:
            return
        sig = sig[: n - i]
        gl = gain * math.cos((pan + 1) * math.pi / 4)
        gr = gain * math.sin((pan + 1) * math.pi / 4)
        L[i:i + len(sig)] += sig * gl
        R[i:i + len(sig)] += sig * gr
        if rev:
            send[0, i:i + len(sig)] += sig * gl * rev
            send[1, i:i + len(sig)] += sig * gr * rev

    # sidechain envelope (ducking after each kick)
    duck = np.ones(n)
    for k in KICKS:
        i = int(k * SR)
        seg = np.arange(n - i) / SR
        duck[i:] *= 1 - 0.65 * np.exp(-seg * 9)

    # ---- Pads -------------------------------------------------------------
    bar = 4 * BEAT
    for b in range(int(DUR / bar)):
        root, voicing, _ = CHORDS[b % 4]
        seg_len = bar + 0.6
        ts = np.arange(int(seg_len * SR)) / SR
        env = np.minimum(1, ts / 0.25) * np.clip((seg_len - ts) / 0.6, 0, 1)
        pad = np.zeros_like(ts)
        for nm in voicing:
            f = note_hz(nm)
            for det in (-0.12, 0.0, 0.11):
                vib = 1 + 0.002 * np.sin(2 * np.pi * (4.7 + det) * ts)
                pad += tone(np.full_like(ts, f * 2 ** (det / 12)) * vib, 7, 1.6)
        pad = band(pad, 120, 3200) * env
        g = 0.035
        start = b * bar
        add(pad, start, g, pan=-0.35, rev=0.7)
        add(np.roll(pad, 300), start, g, pan=0.35, rev=0.7)

    # master pad automation applied later via 'padenv' would need separate bus;
    # simpler: shape whole mix intro with fade (below).

    # ---- Sub bass ----------------------------------------------------------
    bass = np.zeros(n)
    for b in range(int(DUR / bar)):
        st = b * bar
        if st < 4.0 or st >= 22.0:
            continue
        f = note_hz(CHORDS[b % 4][0])
        i0, i1 = int(st * SR), int(min(st + bar, 22.0) * SR)
        ts = np.arange(i1 - i0) / SR
        sig = np.sin(2 * np.pi * f * ts) + 0.3 * np.sin(2 * np.pi * 2 * f * ts)
        sig *= np.minimum(1, ts / 0.01) * np.minimum(1, (i1 - i0 - np.arange(i1 - i0)) / 800)
        bass[i0:i1] += sig
    bass = np.tanh(bass * 1.4) * duck
    add(bass, 0, 0.22)

    # ---- Kick ---------------------------------------------------------------
    kl = int(0.6 * SR)
    kt = np.arange(kl) / SR
    kf = 44 + 120 * np.exp(-kt * 28)
    kick = np.sin(2 * np.pi * np.cumsum(kf) / SR) * np.exp(-kt * 6.5)
    kick += 0.3 * band(rng.standard_normal(kl), 1500, 8000) * np.exp(-kt * 120)
    kick = np.tanh(kick * 1.8)
    for k in KICKS:
        add(kick, k, 0.55)

    # ---- Clap / snare on 2 & 4 ---------------------------------------------
    sl = int(0.5 * SR)
    st_ = np.arange(sl) / SR
    clap = band(rng.standard_normal(sl), 900, 6000)
    clap_env = np.exp(-st_ * 18)
    for off in (0.0, 0.011, 0.022):  # flam = clap texture
        clap_env += 0.5 * np.exp(-np.maximum(st_ - off, 0) * 90) * (st_ >= off)
    clap = clap * clap_env + 0.6 * np.sin(2 * np.pi * 185 * st_) * np.exp(-st_ * 30)
    clap /= np.abs(clap).max()
    t_ = 8.0 + BEAT
    while t_ < 22.0:
        if not (12.0 <= t_ < 16.0):
            add(clap, t_, 0.22, rev=0.35)
        t_ += 2 * BEAT

    # ---- Hats ---------------------------------------------------------------
    hl = int(0.12 * SR)
    ht = np.arange(hl) / SR
    hat = band(rng.standard_normal(hl), 7000, 16000) * np.exp(-ht * 45)
    hat /= np.abs(hat).max()
    t_ = 8.0
    i = 0
    while t_ < 22.0:
        if not (12.0 <= t_ < 15.0):
            g = 0.09 if i % 2 else 0.035
            add(hat, t_, g, pan=0.3 if i % 2 else -0.2)
        t_ += BEAT / 2
        i += 1

    # ---- Arp (16ths) with ping-pong delay ----------------------------------
    al = int(0.45 * SR)
    at = np.arange(al) / SR
    arp_l = np.zeros(n)
    arp_r = np.zeros(n)
    step = BEAT / 4
    t_ = 8.0
    i = 0
    while t_ < 21.5:
        b = int(t_ / bar)
        notes = CHORDS[b % 4][2]
        f = note_hz(notes[i % len(notes)])
        pl = (np.sin(2 * np.pi * f * at) + 0.4 * np.sin(4 * np.pi * f * at)
              + 0.15 * np.sin(6 * np.pi * f * at)) * np.exp(-at * 14) * np.minimum(1, at / 0.003)
        acc = 1.0 if i % 4 == 0 else 0.7
        if 12.0 <= t_ < 16.0:
            acc *= 0.6
        j = int(t_ * SR)
        m = min(al, n - j)
        arp_l[j:j + m] += pl[:m] * acc
        arp_r[j:j + m] += pl[:m] * acc
        t_ += step
        i += 1
    d = int(3 * step * SR)
    dl, dr = arp_l.copy(), arp_r.copy()
    fb = 0.42
    for k in range(1, 5):
        sh = d * k
        g = fb ** k
        if k % 2:
            dr[sh:] += arp_l[:-sh] * g
        else:
            dl[sh:] += arp_l[:-sh] * g
    L += dl * 0.06
    R += dr * 0.06
    send[0] += dl * 0.03
    send[1] += dr * 0.03

    # ---- Risers --------------------------------------------------------------
    def riser(length, f0, f1):
        m = int(length * SR)
        out = np.zeros(m)
        chunk = 2048
        noise = rng.standard_normal(m + chunk)
        win = np.hanning(chunk * 2)
        for s in range(0, m, chunk):
            p = s / m
            fc = f0 * (f1 / f0) ** p
            seg = band(noise[s:s + chunk * 2] if s + chunk * 2 <= len(noise) else
                       np.pad(noise[s:], (0, s + chunk * 2 - len(noise))), fc * 0.6, fc * 1.6)
            seg = seg * win
            e = min(m, s + chunk * 2)
            out[s:e] += seg[: e - s]
        rt = np.arange(m) / SR
        sweep = tone(110 * (8 ** (rt / length)), 4, 1.2) * 0.25
        out = (out / (np.abs(out).max() + 1e-9) + sweep) * (rt / length) ** 2.2
        return out

    r1 = riser(4.0, 250, 7000)
    add(r1, 0.0, 0.28, pan=-0.15, rev=0.5)
    add(np.roll(r1, 400), 0.0, 0.28, pan=0.15, rev=0.5)
    r2 = riser(2.0, 400, 8000)
    add(r2, 14.0, 0.3, rev=0.5)

    # reverse "suck" into each impact
    # ---- Impacts -------------------------------------------------------------
    il = int(3.0 * SR)
    it = np.arange(il) / SR
    boom = np.sin(2 * np.pi * np.cumsum(30 + 50 * np.exp(-it * 3)) / SR) * np.exp(-it * 1.6)
    crash = band(rng.standard_normal(il), 300, 12000) * np.exp(-it * 2.2)
    impact = np.tanh(1.5 * boom) * 0.9 + 0.35 * crash
    for k in IMPACTS:
        add(impact, k, 0.55, rev=0.6)

    # ---- Sub drop + final shimmer ------------------------------------------
    ft = np.arange(int(4 * SR)) / SR
    shimmer = sum(np.sin(2 * np.pi * note_hz(x) * ft) for x in ["A5", "E6", "A6", "C7"])
    shimmer *= np.minimum(1, ft / 0.8) * np.exp(-ft * 0.8)
    add(shimmer, 20.0, 0.03, rev=1.0)

    # ---- Reverb (convolution, stereo decorrelated) -------------------------
    irl = int(2.8 * SR)
    irt = np.arange(irl) / SR
    for ch in range(2):
        ir = band(rng.standard_normal(irl), 200, 9000) * np.exp(-irt * 2.3)
        ir /= np.sqrt((ir ** 2).sum())
        N = 1 << int(math.ceil(math.log2(n + irl)))
        wet = np.fft.irfft(np.fft.rfft(send[ch], N) * np.fft.rfft(ir, N), N)[:n]
        (L if ch == 0 else R)[:] += wet * 0.55

    # ---- Master --------------------------------------------------------------
    mix = np.stack([L, R])
    fade_in = np.clip(t / 1.5, 0, 1)
    fade_out = np.clip((DUR - t) / 2.0, 0, 1)
    mix *= fade_in * fade_out
    mix = mix[:, : int(DUR * SR)]
    mix /= np.abs(mix).max()
    mix = np.tanh(mix * 1.6) / np.tanh(1.6)
    mix *= 0.89
    pcm = (mix.T * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ==========================================================================
# VIDEO
# ==========================================================================
def text_layer(txt, font_path, size, rtl=False, spacing=0):
    f = ImageFont.truetype(font_path, size, layout_engine=ImageFont.Layout.RAQM)
    kw = {"direction": "rtl", "language": "ar"} if rtl else {}
    if spacing and not rtl:
        txt = (" " * 0).join(txt)  # handled below by manual spacing
        widths = [f.getlength(c) for c in txt]
        tw = int(sum(widths) + spacing * (len(txt) - 1))
        asc, desc = f.getmetrics()
        img = Image.new("L", (tw + 40, asc + desc + 40))
        d = ImageDraw.Draw(img)
        x = 20
        for c, cw in zip(txt, widths):
            d.text((x, 20), c, font=f, fill=255)
            x += cw + spacing
        return np.asarray(img, np.float32) / 255
    bbox = ImageDraw.Draw(Image.new("L", (1, 1))).textbbox((0, 0), txt, font=f, **kw)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    img = Image.new("L", (w + 80, h + 80))
    ImageDraw.Draw(img).text((40 - bbox[0], 40 - bbox[1]), txt, font=f, fill=255, **kw)
    return np.asarray(img, np.float32) / 255


def blur(a, r):
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255


# precomputed assets (built in parent, inherited by forked workers) -------
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
RR = np.sqrt(((xx - CX) / W) ** 2 + ((yy - CY) / H) ** 2)
VIGNETTE = np.clip(1.25 - RR * 1.6, 0, 1) ** 1.6
del yy, xx

TXT = {}


def build_text():
    TXT["title"] = text_layer("إبداع بلا حدود", AR_BOLD, 150, rtl=True)
    TXT["sub"] = text_layer("CREATIVITY  WITHOUT  LIMITS", LAT, 34, spacing=10)
    TXT["w1"] = text_layer("رؤية", AR_BOLD, 220, rtl=True)
    TXT["w2"] = text_layer("شغف", AR_BOLD, 220, rtl=True)
    TXT["w3"] = text_layer("إنجاز", AR_BOLD, 220, rtl=True)
    TXT["tag"] = text_layer("نصنع المستقبل معاً", AR_REG, 54, rtl=True)
    TXT["year"] = text_layer("2026", LAT_B, 30, spacing=14)
    for k in list(TXT):
        TXT[k + "_g"] = blur(TXT[k], 18)


rng = np.random.default_rng(3)
NP = 900
PX = rng.uniform(-1, 1, NP) * 4.0
PY = rng.uniform(-1, 1, NP) * 2.4
PZ0 = rng.uniform(0.3, 10, NP)
PCOL = rng.uniform(0, 1, NP)
PSIZE = rng.uniform(0.6, 1.8, NP)

# camera speed profile & integrated travel
_ts = np.arange(NF + 1) / FPS


def speed_at(t):
    s = 0.35
    s += 9.0 * ease_in_out((t - 1.8) / 2.2) * (t < 4.0)
    if t >= 4.0:
        s += 9.0 * math.exp(-(t - 4.0) * 2.2)
    s += 7.0 * ease_in_out((t - 14.0) / 2.0) * (14.0 <= t < 16.0)
    if t >= 16.0:
        s += 7.0 * math.exp(-(t - 16.0) * 2.2)
    if t >= 21.0:
        s *= max(0.0, 1 - (t - 21.0) / 3) * 0.7 + 0.3
    return s


SPEED = np.array([speed_at(t) for t in _ts])
TRAVEL = np.concatenate([[0], np.cumsum(SPEED[:-1] / FPS)])


def paste(canvas, layer, cx, cy, color, alpha, scale=1.0):
    if alpha <= 0.001:
        return
    if abs(scale - 1) > 1e-3:
        h, w = layer.shape
        img = Image.fromarray((layer * 255).astype(np.uint8)).resize(
            (max(1, int(w * scale)), max(1, int(h * scale))), Image.BICUBIC)
        layer = np.asarray(img, np.float32) / 255
    h, w = layer.shape
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
    if xa >= xb or ya >= yb:
        return
    sub = layer[ya - y0:yb - y0, xa - x0:xb - x0, None] * alpha
    canvas[ya:yb, xa:xb] += sub * color


def wipe_rtl(layer, p, soft=0.18):
    """Reveal from right to left (Arabic reading direction)."""
    w = layer.shape[1]
    x = np.linspace(1, 0, w, dtype=np.float32)  # 1 at left, 0 at right
    m = np.clip((p * (1 + soft) - x) / soft, 0, 1)
    return layer * m[None, :]


def wipe_ltr(layer, p, soft=0.18):
    w = layer.shape[1]
    x = np.linspace(0, 1, w, dtype=np.float32)
    m = np.clip((p * (1 + soft) - x) / soft, 0, 1)
    return layer * m[None, :]


def shimmer(layer, p, width=0.12):
    w = layer.shape[1]
    x = np.linspace(-0.3, 1.3, w, dtype=np.float32)
    band_ = np.exp(-((x - p) / width) ** 2)
    return layer * band_[None, :]


def render(i):
    t = i / FPS
    beat = env_hits(t, KICKS, 7.0)
    flash = env_hits(t, IMPACTS, 5.0)
    zoom = 1.0 + 0.012 * beat + 0.04 * env_hits(t, IMPACTS, 3.0)

    # ---- background: drifting nebula blobs (low res -> upscale) ------------
    sw, sh = 240, 135
    gy, gx = np.mgrid[0:sh, 0:sw].astype(np.float32)
    gx /= sw
    gy /= sh
    bg = np.zeros((sh, sw, 3), np.float32)
    blobs = [
        (0.30 + 0.10 * math.sin(t * 0.31), 0.40 + 0.08 * math.cos(t * 0.27), 0.30, VIOLET, 0.55),
        (0.72 + 0.08 * math.cos(t * 0.23), 0.62 + 0.10 * math.sin(t * 0.35), 0.28, CYAN, 0.38),
        (0.55 + 0.15 * math.sin(t * 0.17 + 2), 0.25 + 0.05 * math.sin(t * 0.4), 0.22, GOLD, 0.12),
    ]
    for bx, by, r, col, a in blobs:
        d2 = ((gx - bx) * 1.78) ** 2 + (gy - by) ** 2
        bg += np.exp(-d2 / (r * r))[..., None] * col * a
    intro = ease_in_out(t / 2.5)
    bg *= (0.25 + 0.75 * intro) * (0.85 + 0.25 * beat)
    bg += np.array([0.012, 0.014, 0.035], np.float32)
    big = Image.fromarray(np.clip(bg * 255, 0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    frame = np.asarray(big, np.float32) / 255

    # ---- particles / warp streaks -----------------------------------------
    sharp = Image.new("RGB", (W, H))
    ds = ImageDraw.Draw(sharp)
    z = (PZ0 - TRAVEL[i]) % 10 + 0.15
    sp = SPEED[i]
    streak = 0.012 * sp + 0.004
    f = 900 * zoom
    x1 = CX + PX / z * f
    y1 = CY + PY / z * f
    z2 = z + streak * z
    x2 = CX + PX / z2 * f
    y2 = CY + PY / z2 * f
    bright = np.clip(1.6 / z, 0, 1) * np.clip((10.15 - z) / 2, 0, 1)
    for k in np.argsort(-z):
        b = bright[k]
        if b < 0.03:
            continue
        c = CYAN * (1 - PCOL[k]) + VIOLET * PCOL[k]
        c = c * 0.6 + 0.4  # pastel/white core
        col = tuple(int(v * 255 * b) for v in c)
        wdt = max(1, int(PSIZE[k] * 2.2 / z[k] ** 0.6))
        if sp > 1.0:
            ds.line([(x2[k], y2[k]), (x1[k], y1[k])], fill=col, width=wdt)
        else:
            r_ = wdt * 0.8
            ds.ellipse([x1[k] - r_, y1[k] - r_, x1[k] + r_, y1[k] + r_], fill=col)

    # ---- HUD rings ----------------------------------------------------------
    ring_vis = ease_out((t - 4.0) / 1.0) * window(t, 4.0, 23.0, 0.01, 1.5)
    if 12.0 <= t < 16.0:
        ring_vis *= 0.35
    if ring_vis > 0.01:
        grow = 0.35 + 0.65 * ease_out((t - 4.0) / 1.2)
        for j, (r0, wdt, spd, segs, col) in enumerate([
            (430, 3, 18, 3, CYAN), (490, 2, -11, 5, VIOLET), (545, 1, 7, 1, CYAN), (370, 2, -25, 4, GOLD)
        ]):
            r = (r0 + 18 * beat * (1 + j * 0.3)) * grow * zoom
            a = ring_vis * (0.55 if j != 3 else 0.35)
            c = tuple(int(v * 255 * a) for v in col)
            box = [CX - r, CY - r, CX + r, CY + r]
            if segs == 1:
                ds.ellipse(box, outline=c, width=wdt)
            else:
                span = 360 / segs
                for s in range(segs):
                    st = s * span + t * spd
                    ds.arc(box, st, st + span * 0.62, fill=c, width=wdt + 1)
        # tick marks
        rt = 600 * grow * zoom
        for k in range(72):
            ang = math.radians(k * 5 + t * 4)
            ln = 14 if k % 6 == 0 else 6
            a = ring_vis * 0.35
            c = tuple(int(v * 255 * a) for v in CYAN)
            ds.line([(CX + math.cos(ang) * rt, CY + math.sin(ang) * rt),
                     (CX + math.cos(ang) * (rt + ln), CY + math.sin(ang) * (rt + ln))], fill=c, width=2)

    # shockwaves on impacts
    for k in IMPACTS:
        dt = t - k
        if 0 <= dt < 1.2:
            r = 80 + 1400 * ease_out(dt / 1.2)
            a = (1 - dt / 1.2) ** 2
            c = tuple(int(v * 255 * a) for v in (0.8, 0.9, 1.0))
            ds.ellipse([CX - r, CY - r * 0.98, CX + r, CY + r * 0.98], outline=c, width=int(2 + 10 * a))

    sharp_a = np.asarray(sharp, np.float32) / 255
    small = sharp.resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6))
    glow = np.asarray(small.resize((W, H), Image.BILINEAR), np.float32) / 255
    frame += sharp_a + glow * 2.2

    # ---- typography ---------------------------------------------------------
    txt = np.zeros((H, W, 3), np.float32)

    def put(key, cx, cy, col, alpha, scale=1.0, layer=None, glow_amt=0.9):
        lay = TXT[key] if layer is None else layer
        g = blur(lay, 18) if layer is not None else TXT[key + "_g"]
        paste(txt, g, cx, cy, col, alpha * glow_amt, scale)
        paste(txt, lay, cx, cy, np.array([1, 1, 1], np.float32), alpha, scale)

    # Scene 1: title reveal (4 -> 12)
    a1 = window(t, 4.0, 11.8, 0.05, 0.5)
    if a1 > 0:
        p = ease_out((t - 4.05) / 1.1)
        lay = wipe_rtl(TXT["title"], p)
        sc = (1.10 - 0.10 * ease_out((t - 4.0) / 2.0)) * (1 + 0.012 * beat)
        put("title", CX, CY - 30, CYAN * 0.8 + VIOLET * 0.4, a1, sc, layer=lay, glow_amt=0.9 + 0.6 * beat)
        if t > 5.4:
            sh = shimmer(TXT["title"], (t - 5.4) / 1.4)
            paste(txt, sh, CX, CY - 30, GOLD * 1.4, a1, sc)
        a_sub = a1 * ease_out((t - 5.0) / 0.8)
        sub = wipe_ltr(TXT["sub"], ease_out((t - 5.0) / 1.2))
        put("sub", CX, CY + 95 + 10 * (1 - ease_out((t - 5.0) / 0.8)), CYAN, a_sub * 0.85, layer=sub, glow_amt=0.6)

    # Scene 2: three words on the beat (12 -> 15.5)
    for j, key in enumerate(["w1", "w2", "w3"]):
        st = 12.0 + j * 1.0
        en = st + 0.95 if j < 2 else 15.6
        a = window(t, st, en, 0.04, 0.2)
        if a > 0:
            dt = t - st
            sc = 1.0 + 0.25 * math.exp(-dt * 7) + 0.03 * dt
            col = [CYAN, VIOLET, GOLD][j]
            put(key, CX, CY - 10, col * 1.2, a, sc, glow_amt=1.4)

    # Scene 3: final lockup (16 -> 24)
    a3 = window(t, 16.0, 23.6, 0.05, 1.6)
    if a3 > 0:
        p = ease_out((t - 16.05) / 0.9)
        sc = (1.0 + 0.04 * (t - 16) / 8) * (1 + 0.01 * beat)
        lay = wipe_rtl(TXT["title"], p)
        put("title", CX, CY - 60, VIOLET * 0.7 + CYAN * 0.5, a3, sc, layer=lay, glow_amt=1.0 + 0.5 * beat)
        if t > 17.0:
            paste(txt, shimmer(TXT["title"], (t - 17.0) / 1.6), CX, CY - 60, GOLD * 1.5, a3, sc)
        if t > 20.0:
            paste(txt, shimmer(TXT["title"], (t - 20.0) / 1.6), CX, CY - 60, CYAN * 1.5, a3, sc)
        at = a3 * ease_out((t - 17.0) / 1.0)
        put("tag", CX, CY + 60 + 20 * (1 - ease_out((t - 17.0) / 1.0)), GOLD, at * 0.95, glow_amt=0.5)
        ay = a3 * ease_out((t - 18.0) / 1.0)
        # thin divider lines + year
        if ay > 0:
            ln = int(220 * ease_out((t - 18.0) / 1.0))
            yv = CY + 150
            for side in (-1, 1):
                xa = CX + side * 70
                xb = xa + side * ln
                lo, hi = min(xa, xb), max(xa, xb)
                if hi > lo:
                    txt[yv:yv + 2, lo:hi] += GOLD * ay * 0.8
            put("year", CX, yv + 1, GOLD, ay * 0.9, glow_amt=0.5)

    frame += txt

    # ---- finishing: flash, vignette, grade, chromatic aberration, grain ----
    frame += flash * 0.55 * np.array([0.9, 0.95, 1.0], np.float32) * (1 - RR[..., None])
    frame *= VIGNETTE[..., None]
    frame = 1 - np.exp(-frame * 1.25)  # filmic tone map
    fade = ease_in_out(t / 0.8) * ease_in_out((DUR - t) / 1.2)
    frame *= fade
    ca = int(2 + 6 * flash)
    frame[..., 0] = np.roll(frame[..., 0], ca, axis=1)
    frame[..., 2] = np.roll(frame[..., 2], -ca, axis=1)
    grain = np.random.default_rng(i).standard_normal((H // 2, W // 2)).astype(np.float32)
    grain = np.repeat(np.repeat(grain, 2, 0), 2, 1)
    frame += grain[..., None] * 0.012
    out = np.clip(frame * 255, 0, 255).astype(np.uint8)
    # letterbox bars for cinematic 2.39:1 feel
    bar = 70
    out[:bar] = 0
    out[-bar:] = 0
    Image.fromarray(out).save(os.path.join(FRAMES, f"f{i:05d}.jpg"), quality=95, subsampling=0)
    return i


def main():
    if os.path.isdir(FRAMES):
        shutil.rmtree(FRAMES)
    os.makedirs(FRAMES)
    wav = os.path.join(OUT, "soundtrack.wav")
    print("synthesizing audio ...", flush=True)
    make_audio(wav)
    print("building text ...", flush=True)
    build_text()
    print(f"rendering {NF} frames ...", flush=True)
    with Pool(os.cpu_count()) as pool:
        for k, _ in enumerate(pool.imap_unordered(render, range(NF), chunksize=4)):
            if k % 60 == 0:
                print(f"  {k}/{NF}", flush=True)
    mp4 = os.path.join(OUT, "video.mp4")
    print("encoding ...", flush=True)
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(FRAMES, "f%05d.jpg"),
        "-i", wav, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", mp4,
    ], check=True)
    shutil.rmtree(FRAMES)
    print("done:", mp4)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[2] == "--preview":
        os.makedirs(FRAMES, exist_ok=True)
        build_text()
        for tt in map(float, sys.argv[3:]):
            render(int(tt * FPS))
            print(os.path.join(FRAMES, f"f{int(tt * FPS):05d}.jpg"))
    else:
        main()
