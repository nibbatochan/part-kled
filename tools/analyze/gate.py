"""Effect gate: Score B (canvas shot vs reference) against its ceiling B_max (the reference drawn as plain dots).

  python tools/analyze/gate.py reference.png canvas.png ceiling.png [--unpaired] [--json]

ratio = score_B / B_max. The dots layer caps what any look can reach, so the ratio is the fair number.
Paired verdict: pass when ratio >= PASS_RATIO. Unpaired: the style score itself must reach PASS_STYLE.
Both thresholds are PROPOSALS (docs/RESEARCH_EFFECT_RECREATION.md 5.5) and need calibration (5.6).
"""
import argparse, json, sys
import score

PASS_RATIO = 0.70
PASS_STYLE = 70.0


def gate(reference, canvas, ceiling, paired=True):
    b = score.score(reference, canvas, paired)
    if 'refused' in b:
        return {'verdict': 'refused', 'reason': b['refused'], 'uncalibrated': True}
    m = score.score(reference, ceiling, paired)
    out = {'kind': b['kind'], 'score_B': b['score'], 'components': b['components'], 'uncalibrated': True}
    if 'refused' in m or m['score'] <= 0:
        out.update(verdict='no-ceiling', B_max=None, ratio=None, reason=m.get('refused', 'ceiling score is zero'))
        return out
    out.update(B_max=m['score'], ratio=round(b['score'] / m['score'], 3))
    ok = out['ratio'] >= PASS_RATIO if paired else b['score'] >= PASS_STYLE
    out['verdict'] = 'pass' if ok else 'below'
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('reference'); ap.add_argument('canvas'); ap.add_argument('ceiling')
    ap.add_argument('--unpaired', action='store_true'); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    r = gate(a.reference, a.canvas, a.ceiling, paired=not a.unpaired)
    if a.json:
        print(json.dumps(r))
    elif r['verdict'] == 'refused':
        print('REFUSED:', r['reason']); sys.exit(2)
    else:
        print(f"{r['kind']}: Score B {r['score_B']}  B_max {r['B_max']}  ratio {r['ratio']}  -> {r['verdict'].upper()}  (uncalibrated)")
        print('components:', r['components'])
