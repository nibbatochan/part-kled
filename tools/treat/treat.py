"""Image treatments: source picture -> treated picture (a plain PNG).

Stage 1 of the two-stage pipeline (see .agents/skills/image-to-effect/SKILL.md).
Stage 2 is the existing particle studio: upload the output PNG as an ordinary picture.
No particle logic lives here. Every function takes and returns a picture only.

Contract for every treatment:
  - same width/height as the (resized) source, silhouette kept (alpha copied or implied)
  - subject geometry comes from the source (relief is derived from its own luminance + silhouette)
  - deterministic (fixed seed)

Usage:
  python tools/treat/treat.py chrome in.png out.png [--liquid 0.5]
  python tools/treat/treat.py --all in.png outdir/
Needs: pillow, numpy, scipy.
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

MAX_SIDE = 1024


# ---------------------------------------------------------------- helpers
def load(path, max_side=MAX_SIDE):
    im = Image.open(path).convert("RGBA")
    s = max_side / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3]
    if alpha.min() > 0.99:  # no cut-out: subject = everything not flat background
        alpha = np.ones_like(alpha)
    return rgb, alpha


def save(path, rgb, alpha=None):
    rgb = np.clip(rgb, 0, 1)
    if alpha is None:
        out = Image.fromarray((rgb * 255 + 0.5).astype(np.uint8), "RGB")
    else:
        arr = np.dstack([rgb, np.clip(alpha, 0, 1)])
        out = Image.fromarray((arr * 255 + 0.5).astype(np.uint8), "RGBA")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    out.save(path)


def luma(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def g(x, s):
    return ndi.gaussian_filter(x, s)


def local_norm(L, mask, s=24):
    """Flatten overall exposure so relief comes from form, not from white-vs-black material."""
    m = g(mask.astype(np.float32), s) + 1e-4
    mu = g(L * mask, s) / m
    var = g(((L - mu) ** 2) * mask, s) / m
    return (L - mu) / np.sqrt(var + 1e-3)


def relief(rgb, alpha, detail=1.0, inflate=0.55):
    """Height field from the picture itself: normalised luminance form + inflated silhouette."""
    mask = alpha > 0.5
    L = luma(rgb)
    Ln = local_norm(L, mask)
    form = g(Ln, 2.0) * 0.55 + g(Ln, 6.0) * 0.45
    d = ndi.distance_transform_edt(mask).astype(np.float32)
    d = d / (d.max() + 1e-6)
    infl = np.sqrt(np.clip(d, 0, 1))
    H = detail * form * 0.30 + inflate * infl * 2.2
    return H * mask, mask, d


def normals(H, k=6.0):
    gy, gx = np.gradient(H)
    n = np.dstack([-gx * k, gy * k, np.ones_like(H)])
    return n / np.linalg.norm(n, axis=2, keepdims=True)


def ramp(t, stops):
    """Piecewise-linear colour ramp. stops: [(pos, (r,g,b)), ...] sorted by pos."""
    t = np.clip(t, 0, 1)
    pos = np.array([p for p, _ in stops], np.float32)
    cols = np.array([c for _, c in stops], np.float32)
    return np.stack([np.interp(t, pos, cols[:, i]) for i in range(3)], -1)


def noise(shape, s, seed=3):
    r = np.random.RandomState(seed).randn(*shape).astype(np.float32)
    r = g(r, s)
    return r / (r.std() + 1e-6)


# ---------------------------------------------------------------- 1. CHROME (liquid mirror)
def chrome(rgb, alpha, liquid=0.35, bands=1.0):
    """Polished mirror metal. Relief from the picture; a horizon-and-softbox studio env gives
    the sharp black/white bands that read as chrome. `liquid` ripples the surface."""
    H, mask, d = relief(rgb, alpha, detail=1.0, inflate=0.55)
    if liquid > 0:
        H = H + liquid * 0.35 * g(noise(H.shape, 14, 1), 1.0) * smoothstep(0.0, 0.1, d)
    n = normals(H, k=7.0)
    nz = n[..., 2]
    ry = 2 * nz * n[..., 1]   # reflected vector, view = +z
    rx = 2 * nz * n[..., 0]
    rz = 2 * nz * nz - 1
    # studio environment, sky above a dark floor, hard horizon, bar softboxes
    up = ry * 0.9 + rx * 0.25 * bands
    sky = ramp(smoothstep(-0.1, 1.0, up), [(0, (0.80, 0.86, 0.95)), (0.5, (0.42, 0.52, 0.68)), (1, (0.10, 0.16, 0.30))])
    floor = ramp(smoothstep(-1.0, 0.0, up), [(0, (0.02, 0.02, 0.03)), (0.7, (0.10, 0.10, 0.12)), (1, (0.30, 0.28, 0.27))])
    horizon = smoothstep(-0.02, 0.02, up)[..., None]
    env = floor * (1 - horizon) + sky * horizon
    line = np.exp(-((up - 0.02) / 0.035) ** 2)[..., None]            # bright horizon hairline
    env = env + line * np.array([1.0, 0.97, 0.9], np.float32) * 0.9
    box = smoothstep(0.30, 0.34, rx) * (1 - smoothstep(0.55, 0.60, rx)) * smoothstep(0.25, 0.3, ry) * (1 - smoothstep(0.7, 0.75, ry))
    env = env + box[..., None] * np.array([1.0, 0.98, 0.94], np.float32) * 0.8
    env = env + (1 - smoothstep(0.0, 0.5, rz))[..., None] * 0.0
    # band the tone so metal reads as folded reflections, not a soft gradient
    k = 4.0 * bands
    Lq = luma(env)
    env = env * (0.65 + 0.35 * np.cos(Lq * k * np.pi)[..., None] ** 2)
    # keep the subject legible: a little of the original luma contrast rides on the mirror
    Ln = np.clip(0.5 + 0.25 * local_norm(luma(rgb), mask), 0, 1)
    out = env * (0.78 + 0.45 * Ln[..., None])
    # silhouette edge: dark rim then bright reflect, like a bevelled edge
    edge = np.exp(-((d * 40 - 0.0) / 1.4) ** 2)
    out = out * (1 - 0.45 * edge[..., None])
    out = (out ** 0.92) * 1.05
    return out * mask[..., None], alpha


# ---------------------------------------------------------------- 2. HOLO FOIL
def holo(rgb, alpha, film=1.0, sheen=1.0):
    """Holographic foil. Thin-film hue driven by surface thickness (relief) and view angle,
    on a bright silvery base. Pastel rainbow, never a flat gradient overlay."""
    H, mask, d = relief(rgb, alpha, detail=1.4, inflate=0.35)
    n = normals(H, k=5.0)
    L = luma(rgb)
    Ln = np.clip(0.5 + 0.22 * local_norm(L, mask), 0, 1)
    thick = 0.9 + 1.1 * (H - H[mask].min()) / (np.ptp(H[mask]) + 1e-6) + 0.9 * (1 - n[..., 2])
    t = thick * film * 1.6 + 0.25 * n[..., 0] + 0.15 * Ln
    ph = np.array([0.0, 0.33, 0.67], np.float32)
    iri = 0.5 + 0.5 * np.cos(2 * np.pi * (t[..., None] + ph))
    iri = 0.35 + 0.65 * iri   # keep pastel, not neon
    base = (0.62 + 0.38 * Ln)[..., None]
    out = base * (0.55 + 0.6 * iri)
    # moving light band: diagonal sheen across the foil
    u = (np.arange(H.shape[1])[None, :] * 0.8 + np.arange(H.shape[0])[:, None] * 1.0) / H.shape[1]
    band = np.exp(-(((u * 2.2) % 1.0 - 0.5) / 0.09) ** 2) * sheen
    out = out + band[..., None] * 0.35 * (0.3 + 0.7 * mask[..., None])
    # crumple glints
    ng = np.maximum(0, n[..., 0] * 0.6 + n[..., 1] * 0.5 + n[..., 2] * 0.6)
    out = out + (ng ** 24)[..., None] * 0.9
    return out * mask[..., None], alpha


# ---------------------------------------------------------------- 3. NEON TUBE
def neon(rgb, alpha, hue_a=(1.0, 0.1, 0.75), hue_b=(0.1, 0.9, 1.0), glow=1.0):
    """Subject redrawn as glowing tube lines on black. Lines = silhouette + form edges.
    Each tube has a white-hot core, a saturated inner halo and a wide soft bloom."""
    mask = alpha > 0.5
    L = luma(rgb)
    Ln = local_norm(L, mask)
    # edge strength from the picture's own form (smoothed so lines follow shapes, not noise)
    S = g(Ln, 1.8)
    gx, gy = ndi.sobel(S, axis=1), ndi.sobel(S, axis=0)
    e = np.hypot(gx, gy)
    e = e * ndi.binary_erosion(mask, iterations=3)
    e = e / (np.percentile(e[mask], 99) + 1e-6)
    form = smoothstep(0.28, 0.75, e)
    # thin it to a line: non-max-ish via difference with a blurred copy
    thin = np.clip(g(form, 0.8) - 0.55 * g(form, 3.0), 0, 1)
    thin = smoothstep(0.06, 0.28, thin)
    # silhouette tube
    d = ndi.distance_transform_edt(mask)
    sil = np.exp(-((d - 1.5) / 1.6) ** 2) * mask
    line = np.clip(thin * 0.85 + sil, 0, 1)
    # colour field: two hues swept vertically with a diagonal tilt
    Hh, Ww = line.shape
    y = np.linspace(0, 1, Hh)[:, None]; x = np.linspace(0, 1, Ww)[None, :]
    mix = np.clip(0.8 * y + 0.2 * x, 0, 1)[..., None]
    col = np.array(hue_a, np.float32) * (1 - mix) + np.array(hue_b, np.float32) * mix
    core = g(line, 0.9)
    halo = g(line, 3.5) * 2.2
    bloom = g(line, 14) * 6.0 * glow
    haze = g(line, 40) * 5.0 * glow
    out = col * (halo + bloom * 0.9 + haze * 0.5)[..., None] + core[..., None] * 1.15
    out = out + (core ** 2)[..., None] * 0.5
    # soft filmic roll-off so cores go white, not clipped flat colour
    out = 1 - np.exp(-out * 1.5)
    return out, None


# ---------------------------------------------------------------- 4. STIPPLE INK
def stipple(rgb, alpha, n_dots=42000, on_black=1.0, paper=(0.95, 0.93, 0.88), ink=(0.06, 0.05, 0.08), ss=2):
    """Pointillist ink drawing. Dot density follows tone (dark = dense), dots keep a minimum
    spacing so it reads as engraved stipple, not noise. Dots are the same size everywhere."""
    mask = alpha > 0.5
    L = luma(rgb)
    Ln = local_norm(L, mask, s=30)
    tone = np.clip(0.5 + 0.28 * Ln + 0.35 * (L - L[mask].mean()), 0, 1)   # 0 dark .. 1 light
    dark = ((tone if on_black else (1 - tone)) ** 1.25) * mask   # on_black: bright = dense, so the studio places dots on the light parts
    dark = g(dark, 0.8)
    Hh, Ww = dark.shape
    rs = np.random.RandomState(7)
    # variable-radius dart throwing on a spatial hash (radius shrinks where it is darker)
    cand = n_dots * 14
    ys = rs.randint(0, Hh, cand); xs = rs.randint(0, Ww, cand)
    keep = rs.rand(cand) < dark[ys, xs] ** 1.1
    ys, xs = ys[keep], xs[keep]
    rmin, rmax = 2.4, 7.0
    cell = rmax
    grid = {}
    pts = []
    for y, x in zip(ys, xs):
        r = rmax - (rmax - rmin) * dark[y, x]
        cx, cy = int(x // cell), int(y // cell)
        ok = True
        for ax in (-1, 0, 1):
            for ay in (-1, 0, 1):
                for (px, py, pr) in grid.get((cx + ax, cy + ay), ()):
                    rr = 0.5 * (r + pr)
                    if (px - x) ** 2 + (py - y) ** 2 < rr * rr:
                        ok = False; break
                if not ok: break
            if not ok: break
        if ok:
            grid.setdefault((cx, cy), []).append((x, y, r))
            pts.append((x, y))
            if len(pts) >= n_dots: break
    canvas = np.zeros((Hh * ss, Ww * ss), np.float32)
    for (x, y) in pts:
        canvas[min(int(y * ss), Hh * ss - 1), min(int(x * ss), Ww * ss - 1)] = 1.0
    dot_r = 0.95 * ss
    canvas = ndi.maximum_filter(canvas, size=2 * int(dot_r) + 1)    # round-ish dot
    canvas = g(canvas, 0.55 * ss)
    canvas = np.clip(canvas * 2.2, 0, 1)
    canvas = np.asarray(Image.fromarray(canvas).resize((Ww, Hh), Image.LANCZOS))
    ink_a = np.clip(canvas, 0, 1)[..., None]
    if on_black:   # studio rule: bright pixels get particles, black gets none
        out = np.array((0, 0, 0), np.float32) * (1 - ink_a) + np.array(paper, np.float32) * ink_a
    else:
        out = np.array(paper, np.float32) * (1 - ink_a) + np.array(ink, np.float32) * ink_a
    return out, None


# ---------------------------------------------------------------- 5. REFRACT GLASS
def glass(rgb, alpha, strength=0.45, frost=0.0, bg_keep=0.0, tint=(0.88, 1.0, 0.97)):
    """Solid clear glass sculpture. The body shows a gently refracted, chromatically split view of a
    bright studio backdrop; form is kept legible by the picture's own relief shading; bright
    Fresnel rim; thin dark core edge. Never a dark silhouette."""
    H, mask, d = relief(rgb, alpha, detail=1.0, inflate=0.7)
    n = normals(H, k=6.0)
    Hh, Ww = H.shape
    yy, xx = np.mgrid[0:Hh, 0:Ww].astype(np.float32)
    u, v = xx / Ww, yy / Hh
    bg = 0.42 + 0.28 * (1 - v) + 0.12 * u
    for cx, wd, amp in ((0.12, 0.05, 0.55), (0.88, 0.05, 0.55)):
        bg = bg + amp * np.exp(-((u - cx) / wd) ** 2)
    bg = bg - 0.30 * np.exp(-((v - 0.55) / 0.22) ** 2) * (np.sin(u * 14) * 0.5 + 0.5) * 0.5
    bg = bg + 0.30 * np.exp(-((v - 0.88) / 0.035) ** 2)
    bgrgb = np.dstack([bg * 0.93, bg * 1.0, bg * 1.10])
    n_big = normals(g(H, 5.0) * 0.6 + 1.6 * np.sqrt(np.clip(d, 0, 1)), k=14.0)   # lens-scale form
    out = np.zeros_like(bgrgb)
    for ci, disp in enumerate((1.00, 1.10, 1.22)):
        off = strength * 150 * disp
        sx = np.clip(xx - n_big[..., 0] * off, 0, Ww - 1)
        sy = np.clip(yy - n_big[..., 1] * off, 0, Hh - 1)
        out[..., ci] = ndi.map_coordinates(bgrgb[..., ci], [sy, sx], order=1, mode="nearest")
    if frost > 0:
        out = np.dstack([g(out[..., i], 6 * frost) for i in range(3)])
    Ln = np.clip(0.5 + 0.30 * local_norm(luma(rgb), mask), 0, 1)
    shade = 0.88 + 0.30 * Ln          # the subject's form shows as faint internal shading, not as a painted surface
    body = out * np.array(tint, np.float32) * shade[..., None]
    body = body * (0.85 + 0.35 * (1 - n[..., 2:3]))
    fres = (1 - n[..., 2]) ** 2.0
    body = body + fres[..., None] * np.array([0.70, 0.88, 0.95], np.float32) * 1.0
    inner = np.exp(-((d * 40 - 4.5) / 1.3) ** 2) * mask          # inner bevel line: glass thickness
    body = body + inner[..., None] * 0.25 * np.array([0.8, 1.0, 1.0], np.float32)
    Hv = np.array([0.35, 0.55, 0.75], np.float32); Hv /= np.linalg.norm(Hv)
    spec = np.maximum(0, n @ Hv) ** 70
    body = body + spec[..., None] * 1.2
    edge = np.exp(-((d * 40 - 0.6) / 1.1) ** 2) * 0.55
    body = body * (1 - edge[..., None] * 0.6)
    final = bgrgb * 0.70 * bg_keep * (1 - mask[..., None]) + body * mask[..., None]   # bg_keep 0: black field, studio places no dots there
    return final, None


# ---------------------------------------------------------------- 6. CRYSTAL FACET
def crystal(rgb, alpha, cells=1100, bevel=1.0):
    """Cut crystal. The picture is rebuilt from flat polygon facets: larger in flat areas,
    smaller along features. Each facet keeps the picture's mean tone (so the subject still
    reads), takes a small light shift from the surface normal under it (so facets agree with
    the form), and gets a thin bright bevel. Silhouette stays intact."""
    mask = alpha > 0.5
    Hh, Ww = mask.shape
    L = luma(rgb)
    e = np.hypot(ndi.sobel(g(L, 2.0), axis=0), ndi.sobel(g(L, 2.0), axis=1))
    e = e / (np.percentile(e[mask], 99) + 1e-6)
    w = (0.35 + np.clip(e, 0, 1.0) * 1.2) * mask
    rs = np.random.RandomState(11)
    cand = cells * 80
    ys = rs.randint(0, Hh, cand); xs = rs.randint(0, Ww, cand)
    keep = rs.rand(cand) < (w[ys, xs] / w.max())
    ys, xs = ys[keep][:cells], xs[keep][:cells]
    pts = np.stack([ys, xs], 1).astype(np.float32)
    # min spacing via one relaxation pass toward the cell centroid (kills slivers)
    for _ in range(2):
        tr = cKDTree(pts)
        yy0, xx0 = np.mgrid[0:Hh:3, 0:Ww:3]
        q = np.stack([yy0.ravel(), xx0.ravel()], 1).astype(np.float32)
        _, lb = tr.query(q)
        wq = w[yy0.ravel(), xx0.ravel()] + 1e-3
        cnt = np.bincount(lb, wq, minlength=len(pts)) + 1e-6
        py = np.bincount(lb, wq * q[:, 0], minlength=len(pts)) / cnt
        px = np.bincount(lb, wq * q[:, 1], minlength=len(pts)) / cnt
        pts = 0.5 * pts + 0.5 * np.stack([py, px], 1).astype(np.float32)
    tree = cKDTree(pts)
    yy, xx = np.mgrid[0:Hh, 0:Ww]
    dist, lab = tree.query(np.stack([yy.ravel(), xx.ravel()], 1), k=2)
    lab1 = lab[:, 0].reshape(Hh, Ww)
    edge = (dist[:, 1] - dist[:, 0]).reshape(Hh, Ww)
    n_c = len(pts)
    Lsm = g(local_norm(luma(rgb), mask, 24), 3.0)
    flat = np.dstack([Lsm, Lsm, Lsm]).reshape(-1, 3); lflat = lab1.ravel()
    m = mask.ravel().astype(np.float32)
    cnt = np.bincount(lflat, m, minlength=n_c) + 1e-6
    mean = np.stack([np.bincount(lflat, flat[:, i] * m, minlength=n_c) for i in range(3)], 1) / cnt[:, None]
    # facet normal = relief normal at facet centre + small jitter
    H, _, d = relief(rgb, alpha, detail=1.0, inflate=0.6)
    N = normals(H, k=6.0)
    cy = np.clip(pts[:, 0].astype(int), 0, Hh - 1); cx = np.clip(pts[:, 1].astype(int), 0, Ww - 1)
    fn = N[cy, cx] + rs.randn(n_c, 3) * np.array([0.22, 0.22, 0.05], np.float32)
    fn /= np.linalg.norm(fn, axis=1, keepdims=True)
    Lv = np.array([-0.5, -0.55, 0.67], np.float32); Lv /= np.linalg.norm(Lv)
    shade = fn @ Lv
    lit = 1.0 + 0.50 * (shade - 0.6)
    cimg = mean[lab1] * lit[lab1][..., None]
    # re-stretch tone on the faceted picture so eyes, hair and folds survive, then grade as ice
    Lf = cimg[..., 0]
    Lt = np.clip(0.5 + 0.34 * Lf, 0, 1)
    cimg = ramp(Lt, [(0.0, (0.02, 0.05, 0.14)), (0.35, (0.16, 0.34, 0.62)), (0.7, (0.62, 0.82, 0.97)), (1.0, (1.0, 1.0, 1.0))])
    line = np.exp(-(edge / (0.9 * bevel)) ** 2)
    tipLight = np.clip(shade[lab1] * 1.2, 0, 1)
    cimg = cimg + line[..., None] * (0.05 + 0.40 * tipLight[..., None])
    sp = (shade[lab1] > 0.97).astype(np.float32) * 0.18
    cimg = cimg + sp[..., None]
    return cimg * mask[..., None], alpha


EFFECTS = {"chrome": chrome, "holo": holo, "neon": neon, "stipple": stipple, "glass": glass, "crystal": crystal}


def run(name, src, dst, **kw):
    rgb, alpha = load(src)
    out, a = EFFECTS[name](rgb, alpha, **kw)
    save(dst, out, a)


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(1)
    if args[0] == "--all":
        src, outdir = args[1], args[2]
        stem = os.path.splitext(os.path.basename(src))[0]
        for k in EFFECTS:
            run(k, src, os.path.join(outdir, f"{stem}__{k}.png"))
            print("ok", k)
    else:
        name, src, dst = args[:3]
        kw = {}
        rest = args[3:]
        for i in range(0, len(rest), 2):
            kw[rest[i].lstrip("-")] = float(rest[i + 1])
        run(name, src, dst, **kw)
