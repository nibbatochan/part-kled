"""Calibration of the similarity score against the owner's ratings (research doc 5.6).

  python tools/analyze/calib.py sheet            build the blind rating sheets and pairs.json (scores kept hidden)
  python tools/analyze/calib.py fit ratings.json fit weights and a threshold from {"1": 80, "2": 35, ...}

References are the six treated sample pictures; outputs are canvas renders of the stock source with several looks
(damaged copies of each reference, plus the studio look meant to match). PROPOSAL until the owner's ratings exist.
"""
import json, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.stats import spearmanr
from scipy.optimize import nnls
import fx, score

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
D = os.path.join(ROOT, 'docs', 'effect-library')
OUT = os.path.join(D, 'calibration')
MATCH = {'chrome': 25, 'holo': 26, 'glass': 48, 'crystal': 49}   # nearest look to each reference; neon and stipple are left out: their treated pictures paint their own field, so the subjects cannot be aligned
POOL = [25, 26, 28, 46, 47, 48, 49]
H = 300


DEGRADE = [('blur', 1.5), ('blur', 5), ('hue', 15), ('hue', 50), ('noise', 0.05), ('noise', 0.20), ('gamma', 1.6), ('gamma', 0.6)]


def degrade(path, kind, level, out):
    """A slightly damaged copy of a reference: the 'close' end of the scale the owner rates."""
    from scipy import ndimage as ndi
    from skimage import color
    x = fx.load(path)
    if kind == 'blur': x = ndi.gaussian_filter(x, (level, level, 0))
    elif kind == 'hue':
        h = color.rgb2hsv(np.clip(x, 0, 1)); h[..., 0] = (h[..., 0] + level / 360) % 1; x = color.hsv2rgb(h)
    elif kind == 'noise': x = x + np.random.default_rng(3).normal(0, level, x.shape)
    elif kind == 'gamma': x = np.clip(x, 0, 1) ** level
    Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).save(out)


def pairs():
    """16 pairs: for each of four references, three damaged copies and the studio look meant to match it."""
    out = []
    for i, (name, m) in enumerate(MATCH.items()):
        ref = os.path.join(D, 'samples', f'sample-10__{name}.png')
        for j in range(3):
            kind, level = DEGRADE[(i * 2 + j * 3) % len(DEGRADE)]
            cp = os.path.join(OUT, f'deg-{name}-{kind}-{level}.png')
            degrade(ref, kind, level, cp)
            out.append({'ref': name, 'output': f'{kind} {level}', 'refPath': ref, 'canvasPath': cp})
        out.append({'ref': name, 'output': f'studio look {m}', 'refPath': ref, 'canvasPath': os.path.join(OUT, f'canvas-{m}.png')})
    random.Random(11).shuffle(out)
    for n, p in enumerate(out, 1):
        p['id'] = n
    return out


def crop(path):
    rgb = fx.load(path)
    y0, y1, x0, x1 = fx.subject_box(rgb)
    return Image.fromarray((np.clip(rgb[y0:y1, x0:x1], 0, 1) * 255).astype(np.uint8))


def fit_h(im):
    return im.resize((max(1, round(im.width * H / im.height)), H), Image.LANCZOS)


def _draw(chunk, name):
    font = ImageFont.load_default(size=26)
    cells = []
    for p in chunk:
        a, b = fit_h(crop(p['refPath'])), fit_h(crop(p['canvasPath']))
        cell = Image.new('RGB', (a.width + b.width + 30, H + 40), (14, 14, 16))
        cell.paste(a, (10, 36)); cell.paste(b, (a.width + 20, 36))
        d = ImageDraw.Draw(cell)
        d.text((10, 4), f"#{p['id']}", fill=(255, 255, 255), font=font)
        d.text((a.width + 20, 8), 'output', fill=(150, 150, 150), font=ImageFont.load_default(size=14))
        d.text((a.width - 60, 8), 'reference', fill=(150, 150, 150), font=ImageFont.load_default(size=14))
        cells.append(cell)
    cols, cw, ch = 3, max(c.width for c in cells), max(c.height for c in cells)
    rows = -(-len(cells) // cols)
    im = Image.new('RGB', (cols * cw, rows * ch), (14, 14, 16))
    for i, c in enumerate(cells):
        im.paste(c, ((i % cols) * cw, (i // cols) * ch))
    im.save(os.path.join(OUT, name))


def sheet():
    ps = pairs()
    for k in range(0, len(ps), 8):
        _draw(ps[k:k + 8], f'rate-sheet-{k // 8 + 1}.png')
    for p in ps:
        r = score.score(p['refPath'], p['canvasPath'])
        p['score'] = r
    json.dump(ps, open(os.path.join(OUT, 'pairs.json'), 'w'), indent=1)   # hidden from the owner until after rating
    print(f'{len(ps)} pairs, sheets: {-(-len(ps) // 8)}; refused: {sum("refused" in p["score"] for p in ps)}')


def dots_sheet():
    """Four more pairs, ids 17-20: each reference against the plain dots render. Anchors what the ceiling B_max means."""
    ps = []
    for n, name in enumerate(random.Random(5).sample(list(MATCH), len(MATCH)), 17):
        ps.append({'id': n, 'ref': name, 'output': 'plain dots', 'refPath': os.path.join(D, 'samples', f'sample-10__{name}.png'),
                   'canvasPath': os.path.join(OUT, 'canvas-0.png')})
    _draw(ps, 'rate-sheet-3.png')
    for p in ps:
        p['score'] = score.score(p['refPath'], p['canvasPath'])
    json.dump(ps, open(os.path.join(OUT, 'pairs-dots.json'), 'w'), indent=1)
    print('4 dots pairs, sheet rate-sheet-3.png')


def fit(ratings_path):
    ps = json.load(open(os.path.join(OUT, 'pairs.json')))
    extra = os.path.join(OUT, 'pairs-dots.json')
    if os.path.exists(extra): ps += json.load(open(extra))
    rt = json.load(open(ratings_path))
    rows = [(p, float(rt[str(p['id'])])) for p in ps if str(p['id']) in rt and 'refused' not in p['score']]
    y = np.array([r for _, r in rows])
    parts = 'CSETG'
    X = np.array([[p['score']['components'].get(k) or 0.0 for k in parts] for p, _ in rows])
    tot = np.array([p['score']['score'] for p, _ in rows])
    print(f'{len(rows)} rated pairs')
    print('Spearman of current total score vs ratings:', round(spearmanr(tot, y)[0], 3))
    for i, k in enumerate(parts):
        print(f'  component {k}: Spearman {spearmanr(X[:, i], y)[0]:.3f}')
    w, res = nnls(X, y)
    w = w / w.sum() if w.sum() else w
    print('non-negative weights fitted to the ratings:', dict(zip(parts, np.round(w, 3))), '(current: C .25 S .30 E .15 T .15 G .15)')
    new = 100 * X @ w
    print('Spearman with fitted weights (same data, optimistic):', round(spearmanr(new, y)[0], 3))
    # threshold: lowest fitted score whose rating reaches 70 ("acceptable")
    ok = new[y >= 70]
    print('score at which ratings reach 70:', round(float(ok.min()), 1) if len(ok) else 'no pair rated 70 or more')
    if len(rows) < 20:
        print('WARNING: fewer than 20 pairs; treat weights as a rough guide, not a result')


if __name__ == '__main__':
    if sys.argv[1] == 'sheet': sheet()
    elif sys.argv[1] == 'dots': dots_sheet()
    elif sys.argv[1] == 'fit': fit(sys.argv[2])
