"""Builds the grade atlas and the blue-noise texture the studio loads (phase R3).

  python tools/luts/build_atlas.py

Reads the licensed .cube files in docs/effect-library/luts-source/, adds three generated grades (NEUTRAL, B&W, CROSS),
and writes public/luts/grades.png (1089 x 264) and public/noise/blue64.png.
Atlas layout: row k (y 33k .. 33k+32) is grade k; pixel (b*33 + r, 33k + g) is the grade's output for input (r, g, b).
Grade order is the lutId of Params.finish: 0 NEUTRAL, 1 AMBER, 2 FADE, 3 NEON, 4 FILM, 5 DUSK, 6 B&W, 7 CROSS.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'docs', 'effect-library', 'luts-source')
N = 33


def read_cube(path):
    size, rows, lo, hi = None, [], 0.0, 1.0
    for line in open(path, encoding='utf-8'):
        t = line.split()
        if not t or t[0].startswith('#') or t[0] == 'TITLE': continue
        if t[0] == 'LUT_3D_SIZE': size = int(t[1])
        elif t[0] == 'DOMAIN_MIN': assert float(t[1]) == 0.0, path
        elif t[0] == 'DOMAIN_MAX': assert float(t[1]) == 1.0, path
        else: rows.append([float(v) for v in t[:3]])
    assert size == N and len(rows) == N ** 3, (path, size, len(rows))
    return np.array(rows, np.float32).reshape(N, N, N, 3)   # [b][g][r] -> rgb (red varies fastest)


def grid():
    a = np.linspace(0, 1, N, dtype=np.float32)
    b, g, r = np.meshgrid(a, a, a, indexing='ij')           # b slowest, r fastest, like a .cube
    return r, g, b


def sig(x, k):
    """S-curve through (0,0), (.5,.5), (1,1); k is the steepness."""
    f = lambda v: 1 / (1 + np.exp(-k * (v - 0.5)))
    return (f(x) - f(0)) / (f(1) - f(0))


def neutral():
    r, g, b = grid()
    return np.stack([r, g, b], -1)


def bw():
    r, g, b = grid()
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    y = sig(y, 6.0)
    return np.stack([y, y, y], -1)


def cross():
    r, g, b = grid()
    return np.stack([sig(r, 7.0), 0.08 + 0.92 * sig(g, 3.0) ** 0.9, 0.18 + 0.62 * b], -1)


grades = [
    neutral(),
    read_cube(os.path.join(SRC, 'slay', 'slay-01-amber.cube')),
    read_cube(os.path.join(SRC, 'slay', 'slay-02-fade.cube')),
    read_cube(os.path.join(SRC, 'slay', 'slay-03-neon.cube')),
    read_cube(os.path.join(SRC, 'slay', 'slay-04-film.cube')),
    read_cube(os.path.join(SRC, 'lumix', 'DuskTide.cube')),
    bw(),
    cross(),
]
atlas = np.zeros((N * len(grades), N * N, 3), np.float32)
for k, lut in enumerate(grades):
    for b in range(N):                       # slice b goes to x = b*N .. b*N+N-1; inside it, rows are g, columns are r
        atlas[k * N:(k + 1) * N, b * N:(b + 1) * N] = lut[b]
out = os.path.join(ROOT, 'public', 'luts', 'grades.png')
Image.fromarray(np.clip(atlas * 255 + 0.5, 0, 255).astype(np.uint8), 'RGB').save(out, optimize=True)
print('grades.png', atlas.shape[1], 'x', atlas.shape[0], os.path.getsize(out), 'bytes')

noise = Image.open(os.path.join(SRC, 'blue-noise', 'LDR_LLL1_0_64.png')).convert('L')
assert noise.size == (64, 64)
nout = os.path.join(ROOT, 'public', 'noise', 'blue64.png')
noise.save(nout, optimize=True)
print('blue64.png', os.path.getsize(nout), 'bytes')
