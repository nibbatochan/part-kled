"""Measure what a single treated image is made of. Writes a JSON report; every number is a measurement.

  python tools/analyze/analyze.py reference.png [--json out.json]

Single-image measures only (research doc section 4, rows 1,2,5,7,9,10,11,12,16,17,18,19).
Rows that need a source/target pair (3D LUT, tone curve match, optical flow, blend recovery) are not here.
null means "not measurable on this image", never zero.
"""
import argparse, json
import numpy as np
from scipy import ndimage as ndi
from scipy.cluster.vq import kmeans2
from skimage.registration import phase_cross_correlation
import fx


def palette(rgb, subject, k=5):
    px = fx.lab(rgb)[subject]
    if len(px) < 50:
        return None
    px = px[np.random.default_rng(0).permutation(len(px))[:20000]]
    cen, lbl = kmeans2(px, k, minit='++', seed=0)
    share = np.bincount(lbl, minlength=k) / len(lbl)
    from skimage.color import lab2rgb
    out = []
    for i in np.argsort(-share):
        if share[i] > 0:
            hexv = '#%02x%02x%02x' % tuple((np.clip(lab2rgb(cen[i][None, None]), 0, 1)[0, 0] * 255).astype(int))
            out.append({'hex': hexv, 'share': round(float(share[i]), 3), 'L': round(float(cen[i][0]), 1)})
    return out


def halftone(L):
    """Strongest isolated spectral peak away from the centre: pitch (px) and angle (deg), or None."""
    w = np.outer(np.hanning(L.shape[0]), np.hanning(L.shape[1]))
    P = np.abs(np.fft.fftshift(np.fft.fft2((L - L.mean()) * w)))
    cy, cx = np.array(P.shape) // 2
    yy, xx = np.indices(P.shape)
    r = np.hypot(yy - cy, xx - cx)
    ring = (r > 6) & (r < min(cy, cx) * 0.95)
    med = np.median(P[ring])
    pk = np.where(ring, P, 0)
    y, x = np.unravel_index(pk.argmax(), pk.shape)
    ratio = float(pk[y, x] / (med + 1e-9))
    if ratio < 40:  # no isolated peak: smooth, noisy or stochastic
        return None
    return {'pitch_px': round(float(L.shape[0] / max(r[y, x], 1e-6)), 2),
            'angle_deg': round(float(np.degrees(np.arctan2(cy - y, x - cx)) % 180), 1), 'peak_ratio': round(ratio, 1)}


def aberration(rgb, L):
    """Mean R-vs-B shift (px) on strong edges, per quadrant, and its direction relative to the centre.
    Radial if shifts point away from / toward the centre; lateral if the same everywhere."""
    h, w = L.shape
    g = np.hypot(ndi.sobel(L, 0), ndi.sobel(L, 1))
    res = []
    for qy in (0, 1):
        for qx in (0, 1):
            ys, xs = slice(qy * h // 2, (qy + 1) * h // 2), slice(qx * w // 2, (qx + 1) * w // 2)
            if (g[ys, xs] > 0.5).sum() < 200:
                continue
            sh, *_ = phase_cross_correlation(rgb[ys, xs, 0] * (g[ys, xs] > 0.2), rgb[ys, xs, 2] * (g[ys, xs] > 0.2), upsample_factor=10)
            res.append((qy, qx, sh))
    if len(res) < 4:
        return None
    mags = [float(np.hypot(*s)) for _, _, s in res]
    # radial test: sign of shift along the outward direction should flip between opposite quadrants
    out = [np.dot(s, [1 if qy else -1, 1 if qx else -1]) for qy, qx, s in res]
    kind = 'radial' if (max(out) > 0.3 and min(out) < -0.3 or all(o > 0.3 for o in out) or all(o < -0.3 for o in out)) else 'lateral' if max(mags) > 0.3 else 'none'
    return {'mean_shift_px': round(float(np.mean(mags)), 2), 'kind': kind}


def vignette(L):
    h, w = L.shape
    yy, xx = np.indices(L.shape)
    r = np.hypot(yy - h / 2, xx - w / 2) / np.hypot(h / 2, w / 2)
    c, e = L[r < 0.25].mean(), L[r > 0.85].mean()
    return {'centre': round(float(c), 3), 'corner': round(float(e), 3), 'falloff': round(float(1 - e / max(c, 1e-6)), 3)}


def analyze(path):
    rgb = fx.load(path)
    y0, y1, x0, x1 = fx.subject_box(rgb)
    full = fx.resize(rgb)
    L = fx.luma(full)
    box = fx.resize(rgb[y0:y1, x0:x1])
    Lb = fx.luma(box)
    border = np.concatenate([L[0], L[-1], L[:, 0], L[:, -1]]).mean()
    subj = fx.luma(rgb[y0:y1, x0:x1]).mean()
    p1, p50, p99 = np.percentile(L, [1, 50, 99])
    modes = int(((np.diff(np.sign(np.diff(ndi.gaussian_filter1d(np.histogram(Lb, 64, (0, 1))[0].astype(float), 1.5)))) < 0)).sum())
    hi = Lb >= np.percentile(Lb, 99)
    lab_, n = ndi.label(hi)
    sizes = ndi.sum(hi, lab_, range(1, n + 1)) if n else []
    grain = fx.grain_sigma(Lb)
    return {
        'file': path, 'size': list(rgb.shape[1::-1]), 'subject_box': [int(x0), int(y0), int(x1), int(y1)],
        'field_polarity': {'border_luma': round(float(border), 3), 'subject_luma': round(float(subj), 3),
                           'light_field': bool(border > 0.5), 'note': 'light field breaks the studio rule (bright = dots)' if border > 0.5 else 'dark field, ok'},
        'palette': palette(box, np.ones(Lb.shape, bool)),
        'tone': {'black_pt': round(float(p1), 3), 'median': round(float(p50), 3), 'white_pt': round(float(p99), 3),
                 'contrast_p99_p1': round(float(p99 - p1), 3), 'histogram_modes': modes,
                 'banding': 'hard steps' if modes >= 4 else 'smooth'},
        'edge_width_px_at_256': fx.edge_width(Lb),
        'bloom_halo': fx.glow_profile(Lb),
        'specular': {'highlight_regions': int(n), 'median_size_px': float(np.median(sizes)) if n else None,
                     'style': ('many small glints' if n > 25 else 'few broad highlights') if n else 'none'},
        'grain_sigma': round(grain, 4),
        'grain_chroma': round(float(np.corrcoef((box[..., 0] - ndi.median_filter(box[..., 0], 3)).ravel(),
                                                (box[..., 2] - ndi.median_filter(box[..., 2], 3)).ravel())[0, 1]), 3),
        'halftone': halftone(Lb),
        'chromatic_aberration': aberration(box, Lb),
        'vignette': vignette(L),
    }


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('image'); ap.add_argument('--json')
    a = ap.parse_args()
    r = analyze(a.image)
    s = json.dumps(r, indent=1)
    if a.json:
        open(a.json, 'w').write(s)
    print(s)
