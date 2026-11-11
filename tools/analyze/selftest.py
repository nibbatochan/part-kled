"""Sanity checks for score.py and analyze.py. Run: python tools/analyze/selftest.py
Uses the treated samples in docs/effect-library/samples. Asserts shape of behaviour, not calibrated values."""
import os, numpy as np
from PIL import Image
import score, analyze

S = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'effect-library', 'samples')
g, h = os.path.join(S, 'sample-10__glass.png'), os.path.join(S, 'sample-10__holo.png')

r = score.score(g, g)
assert r['score'] > 99, r                                    # identical images score ~100
blurred = os.path.join(os.environ.get('TMP', '/tmp'), 'fx_selftest_blur.png')
im = Image.open(g).convert('RGBA'); im.filter(__import__('PIL.ImageFilter', fromlist=['x']).GaussianBlur(6)).save(blurred)
assert score.score(g, blurred)['score'] < r['score'] - 5      # a blurred copy must score lower
flat = os.path.join(os.environ.get('TMP', '/tmp'), 'fx_selftest_wide.png')
Image.fromarray(np.full((100, 300, 3), 255, np.uint8)).save(flat)
assert 'refused' in score.score(g, flat)                      # aspect mismatch must refuse, not guess
a = analyze.analyze(g)
assert a['field_polarity']['light_field'] is False and a['palette'] and a['grain_sigma'] >= 0
print('selftest ok')

# gate: Score B against its ceiling B_max (the reference rendered as plain dots)
import gate
r = gate.gate(g, g, g)
assert r['ratio'] > 0.99 and r['verdict'] == 'pass', r         # identical output passes the absolute bar
r = gate.gate(g, blurred, g)
assert r['ratio'] < 0.99 and r['score_B'] < r['B_max'], r     # a worse output has a lower ratio
r = gate.gate(g, flat, g)
assert r['verdict'] == 'refused', r                            # cannot align: refused, never a number
print('gate selftest ok')
