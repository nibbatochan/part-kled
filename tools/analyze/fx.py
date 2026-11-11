"""Shared image measures for score.py and analyze.py. Needs numpy, scipy, scikit-image, Pillow only.

All measures work on a float RGB array in 0..1. Sizes are pixels at the working size (long side 256)
unless noted. Weights, divisors and thresholds live in score.py and are PROPOSALS until calibrated
(docs/RESEARCH_EFFECT_RECREATION.md section 5.6).
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color

WORK = 256


def load(path, bg=0.0):
    """RGB float array. Alpha is composited on a flat grey level (bg 0 = black, the studio's 'nothing')."""
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im, np.float32) / 255
    return a[..., :3] * a[..., 3:] + bg * (1 - a[..., 3:])


def luma(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def subject_box(rgb, thr=0.08):
    """Bounding box (y0,y1,x0,x1) of the largest blob that differs from the background colour.
    Opening drops thin grid lines and UI marks in canvas screenshots; the largest blob drops what is left."""
    bin_ = np.minimum((luma(rgb) * 32).astype(int), 31)  # background = the most common tone (ruler ticks pollute a border median)
    border = rgb[bin_ == np.bincount(bin_.ravel()).argmax()].mean(axis=0)
    m = ndi.binary_opening(np.abs(rgb - border).max(-1) > thr, np.ones((5, 5)))
    lab_, n = ndi.label(ndi.binary_dilation(m, np.ones((15, 15))))  # merge nearby fragments (dot clouds)
    if n == 0:
        return 0, rgb.shape[0], 0, rgb.shape[1]
    big = lab_ == (np.argmax(ndi.sum(m, lab_, range(1, n + 1))) + 1)
    ys, xs = np.where(big & m)
    return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1


def resize(rgb, size=None, long=WORK):
    h, w = rgb.shape[:2]
    if size is None:
        s = long / max(h, w)
        size = (max(8, round(w * s)), max(8, round(h * s)))
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.resize(size, Image.LANCZOS), np.float32) / 255


def blur(a, s):
    return ndi.gaussian_filter(a, (s, s, 0)[: a.ndim]) if s > 0 else a


def lab(rgb):
    return color.rgb2lab(np.clip(rgb, 0, 1))


def edge_width(L):
    """Median 10-90 style edge width (px): local range over gradient, on the strongest edges."""
    g = np.hypot(ndi.sobel(L, 0), ndi.sobel(L, 1)) / 8
    rng = ndi.maximum_filter(L, 5) - ndi.minimum_filter(L, 5)
    sel = g >= np.percentile(g, 99.5)
    sel &= rng > 0.15
    return float(np.median(0.8 * rng[sel] / np.maximum(g[sel], 1e-6))) if sel.any() else None


def glow_profile(L, pct=99.0, maxd=40):
    """Falloff of mean luminance with distance from the brightest regions. Returns (r50, r10, tail) or None."""
    mask = L >= np.percentile(L, pct)
    if mask.sum() < 4 or mask.all():
        return None
    d = ndi.distance_transform_edt(~mask)
    mean = np.array([L[(d > k - 0.5) & (d <= k + 0.5)].mean() if ((d > k - 0.5) & (d <= k + 0.5)).any() else np.nan
                     for k in range(1, maxd + 1)])
    if np.isnan(mean[0]):
        return None
    tail = np.nanmean(mean[-5:])
    peak = mean[0]
    if peak - tail < 0.03:
        return 0.0, 0.0, float(tail)  # no visible halo
    p = (mean - tail) / (peak - tail)
    r = lambda lv: float(next((i + 1 for i, v in enumerate(p) if v < lv), maxd))
    return r(0.5), r(0.1), float(tail)


def grain_sigma(L):
    """Noise sigma from flat patches: std of (image - 3x3 median), on the flattest 10% of 16x16 tiles."""
    hp = L - ndi.median_filter(L, 3)
    t = 16
    h, w = (L.shape[0] // t) * t, (L.shape[1] // t) * t
    tiles = L[:h, :w].reshape(h // t, t, w // t, t).std(axis=(1, 3))  # tile contrast
    hpt = hp[:h, :w].reshape(h // t, t, w // t, t)
    k = max(1, int(tiles.size * 0.1))
    idx = np.argsort(tiles.ravel())[:k]
    ys, xs = np.divmod(idx, tiles.shape[1])
    return float(np.mean([hpt[y, :, x, :].std() for y, x in zip(ys, xs)]))


def radial_power(L, bands=8):
    """Power of the high-pass (L - blur 2) in log-spaced radial frequency bands. Returns (bands,) array."""
    hp = L - ndi.gaussian_filter(L, 2)
    hp = hp * np.outer(np.hanning(hp.shape[0]), np.hanning(hp.shape[1]))
    P = np.abs(np.fft.fftshift(np.fft.fft2(hp))) ** 2
    cy, cx = np.array(P.shape) // 2
    yy, xx = np.indices(P.shape)
    r = np.hypot(yy - cy, xx - cx)
    edges = np.logspace(np.log10(2), np.log10(min(cy, cx)), bands + 1)
    return np.array([P[(r >= a) & (r < b)].mean() for a, b in zip(edges[:-1], edges[1:])])


def gmsd(a, b):
    """Gradient magnitude similarity deviation (Xue et al. 2013). Lower is closer."""
    def gm(x):
        return np.hypot(ndi.prewitt(x, 0), ndi.prewitt(x, 1)) / 3
    ga, gb = gm(a), gm(b)
    c = 0.0026
    s = (2 * ga * gb + c) / (ga ** 2 + gb ** 2 + c)
    return float(s.std())
