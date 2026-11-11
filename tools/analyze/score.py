"""Score an output image against a reference. PROPOSED composite, NOT calibrated.

  python tools/analyze/score.py reference.png output.png [--unpaired] [--json]

Paired: same subject in both images. Components C (colour), S (structure), E (edges), T (texture), G (glow).
Unpaired: different subjects. S and the GMSD part of E are dropped and weights renormalised; the result is
called a STYLE score, not similarity. Refuses to score a paired comparison it cannot align.
See docs/RESEARCH_EFFECT_RECREATION.md section 5.4 for the design and 5.6 for the calibration still owed.
"""
import argparse, json, sys
import numpy as np
from scipy.stats import wasserstein_distance
from skimage.metrics import structural_similarity
from skimage.color import deltaE_ciede2000
from skimage.registration import phase_cross_correlation
from scipy import ndimage as ndi
import fx

WEIGHTS = {'C': 0.25, 'S': 0.30, 'E': 0.15, 'T': 0.15, 'G': 0.15}  # proposal
DIV = {'dE': 30.0, 'gmsd': 0.25, 'lsd': 1.0, 'emd': 25.0}          # proposal
MAX_ASPECT_GAP = 0.12   # paired crops must have similar aspect, else alignment is meaningless
MAX_SHIFT = 12          # px at working size; a larger residual shift means the crops do not line up


def clamp01(x):
    return float(min(1.0, max(0.0, x)))


def prep(path):
    rgb = fx.load(path)
    y0, y1, x0, x1 = fx.subject_box(rgb)
    return fx.resize(rgb[y0:y1, x0:x1])


def align(ref, out):
    """Resize out to ref's size, estimate residual shift by phase correlation, return (out, shift_px)."""
    out = fx.resize(out, size=(ref.shape[1], ref.shape[0]))
    shift, *_ = phase_cross_correlation(fx.luma(ref), fx.luma(out), upsample_factor=4)
    out = ndi.shift(out, (shift[0], shift[1], 0), order=1, mode='nearest')
    return out, float(np.hypot(*shift))


def score(ref_path, out_path, paired=True):
    ref, out = prep(ref_path), prep(out_path)
    notes = []
    if paired:
        ra, oa = ref.shape[1] / ref.shape[0], out.shape[1] / out.shape[0]
        if abs(ra - oa) / ra > MAX_ASPECT_GAP:
            return {'refused': f'subject boxes differ in aspect ({ra:.2f} vs {oa:.2f}); cannot align'}
        out, sh = align(ref, out)
        if sh > MAX_SHIFT:
            return {'refused': f'residual shift {sh:.1f}px > {MAX_SHIFT}px; crops do not line up'}
    else:
        out = fx.resize(out, size=(ref.shape[1], ref.shape[0]))
    Lr, Lo = fx.luma(ref), fx.luma(out)
    c = {}
    # C colour and tone
    if paired:
        d = deltaE_ciede2000(fx.lab(fx.blur(ref, 2)), fx.lab(fx.blur(out, 2))).mean()
        c['C'] = clamp01(1 - d / DIV['dE'])
    else:
        labr, labo = fx.lab(ref).reshape(-1, 3), fx.lab(out).reshape(-1, 3)
        e = np.mean([wasserstein_distance(labr[:, i], labo[:, i]) for i in range(3)])
        c['C'] = clamp01(1 - e / DIV['emd'])
    # S structure: SSIM after blur, two scales (a two-scale MS-SSIM stand-in)
    if paired:
        s = [structural_similarity(fx.blur(Lr, k), fx.blur(Lo, k), data_range=1.0, gaussian_weights=True) for k in (2, 4)]
        c['S'] = clamp01(np.mean(s))
    # E edge and detail
    if paired:
        c['E'] = clamp01(1 - fx.gmsd(fx.blur(Lr, 1), fx.blur(Lo, 1)) / DIV['gmsd'])
    else:
        wr, wo = fx.edge_width(Lr), fx.edge_width(Lo)
        c['E'] = clamp01(min(wr, wo) / max(wr, wo)) if wr and wo else None
    # T texture: log-spectral distance of the high-pass power
    lsd = np.mean(np.abs(np.log10(fx.radial_power(Lr) + 1e-12) - np.log10(fx.radial_power(Lo) + 1e-12)))
    c['T'] = clamp01(1 - lsd / DIV['lsd'])
    # G glow profile
    gr, go = fx.glow_profile(Lr), fx.glow_profile(Lo)
    if gr is None or go is None:
        c['G'] = None
        notes.append('glow profile not measurable on one image; G dropped')
    else:
        err = [abs(a - b) / max(a, b, 1e-6) for a, b in zip(gr[:2], go[:2])] + [abs(gr[2] - go[2]) / max(gr[2], go[2], 1e-6)]
        c['G'] = clamp01(1 - np.mean(err))
    used = {k: v for k, v in c.items() if v is not None}
    wsum = sum(WEIGHTS[k] for k in used)
    total = 100 * sum(WEIGHTS[k] * v for k, v in used.items()) / wsum
    return {'kind': 'similarity' if paired else 'style score', 'score': round(total, 1),
            'components': {k: (None if v is None else round(v, 3)) for k, v in c.items()},
            'uncalibrated': True, 'notes': notes}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('reference'); ap.add_argument('output')
    ap.add_argument('--unpaired', action='store_true')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    r = score(a.reference, a.output, paired=not a.unpaired)
    if a.json:
        print(json.dumps(r))
    elif 'refused' in r:
        print('REFUSED:', r['refused']); sys.exit(2)
    else:
        print(f"{r['kind']}: {r['score']}  (uncalibrated)  {r['components']}")
        for n in r['notes']: print('note:', n)
