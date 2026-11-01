// src/lite/haloImage.ts
// HALO, read from the reference photos (a backlit silhouette in coloured light):
//  - The subject is dark. Light lands in patches, like light through coloured gels, not evenly.
//  - Where it lands is set by the structure of the picture: fine detail (hair, fur, folds) catches WARM light, in
//    deep amber, orange and, only at the strongest points, a yellow-white core.
//  - Smooth edges catch light by the side they face: the side towards the upper left is warm, the other is cool
//    (navy, blue, a white-blue core).
//  - Each hot spot blooms with a tight glow and a wide soft one, in the colour of its light, and a little grain.
// The picture decides WHERE light lands and how strongly; the colours come from the lights. The form of the picture
// stays readable (eyes, goggles, features are never blocked): it shows as a dim lit form under the bright light.
// Alpha (depth) is kept. Pixels with no light and no form stay black, so no background is added.

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function hash2(x: number, y: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return mix(mix(hash2(ix, iy), hash2(ix + 1, iy), ux), mix(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux), uy);
}

type Buf = Float32Array<ArrayBuffer>;

/** One box-blur pass along rows or columns, with running sums, so a wide radius costs the same as a narrow one. */
function boxPass(src: Buf, dst: Buf, w: number, h: number, r: number, ch: number, horizontal: boolean): void {
  const len = horizontal ? w : h;
  const outer = horizontal ? h : w;
  const P = new Float64Array(len + 1);
  for (let c = 0; c < ch; c++) {
    for (let o = 0; o < outer; o++) {
      const at = (k: number) => (horizontal ? (o * w + k) * ch + c : (k * w + o) * ch + c);
      for (let k = 0; k < len; k++) P[k + 1] = P[k] + src[at(k)];
      for (let k = 0; k < len; k++) {
        const a = Math.max(0, k - r), b = Math.min(len - 1, k + r);
        dst[at(k)] = (P[b + 1] - P[a]) / (b - a + 1);
      }
    }
  }
}

/** Three box passes each way, close to a Gaussian. Returns a new buffer. */
function blur(buf: Buf, w: number, h: number, r: number, ch: number): Buf {
  let a = new Float32Array(buf) as Buf;
  let b = new Float32Array(buf.length) as Buf;
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, w, h, r, ch, true);
    boxPass(b, a, w, h, r, ch, false);
  }
  return a;
}

/**
 * rgba: the picture grid, w x h, alpha = depth. glow: strength of the light and its bloom (0..1). reach: bloom radius as a
 * share of the height. amount: how much of the lit result replaces the original (0..1). Returns a new array.
 */
export function haloGrade(rgba: Uint8ClampedArray, w: number, h: number, glow: number, reach: number, amount: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  const n = w * h;
  const lum = new Float32Array(n) as Buf;
  for (let i = 0; i < n; i++) lum[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;

  // Structure of the picture: fine detail (hair, fur, folds) and smooth edges, found in every tone, dark ones too
  const rFine = Math.max(1, Math.round(h * 0.004));
  const rEdge = Math.max(2, Math.round(h * 0.02));
  const fine = blur(lum, w, h, rFine, 1);
  const soft = blur(lum, w, h, rEdge, 1);
  const S = 0.6 + glow * 1.2;               // strength of the lights
  const lit = new Float32Array(n * 3) as Buf;
  const unit = 1 / h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const L = lum[i];
      const Ls = soft[i];

      // Detail: how far a pixel stands out from its surroundings, relative to the local tone (so dark detail counts too)
      const T = Math.min(1, (Math.abs(L - fine[i]) / (fine[i] + 0.07)) * 1.5) * smooth(0.02, 0.14, fine[i]);

      // Edges of the smooth tone, and which way they face
      const gx = soft[y * w + Math.min(w - 1, x + 1)] - soft[y * w + Math.max(0, x - 1)];
      const gy = soft[Math.min(h - 1, y + 1) * w + x] - soft[Math.max(0, y - 1) * w + x];
      const gm = Math.hypot(gx, gy);
      const edge = smooth(0.01, 0.06, gm * rEdge * 0.6) * smooth(0.03, 0.2, Ls);
      // The edge faces the upper-left when the tone grows that way; those edges are warm, the others cool
      const facing = gm > 1e-5 ? (-gx * 0.75 - gy * 0.66) / gm : 0;
      const warmSide = smooth(-0.25, 0.55, facing);

      // Patches: the light arrives in shards, but it never hides the detail (the floor is high)
      const u = x * unit, v = y * unit;
      const pw = 0.6 * noise(u * 8, v * 8) + 0.3 * noise(u * 16 + 5, v * 16 + 5) + 0.1 * noise(u * 32 + 9, v * 32 + 9);
      const pc = 0.6 * noise(u * 6 + 31, v * 6 + 17) + 0.4 * noise(u * 12 + 3, v * 12 + 8);
      const patchW = 0.35 + 0.65 * smooth(0.35, 0.68, pw);
      const patchC = 0.4 + 0.6 * smooth(0.3, 0.65, pc);

      // Key features (a strongly coloured part such as goggles, lips, eyes) always catch warm light: never blocked by a patch
      const mx = Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) / 255;
      const mn = Math.min(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) / 255;
      const feat = smooth(0.3, 0.65, mx - mn) * smooth(0.25, 0.6, mx);

      // Light energy: warm on detail and on warm-facing edges, cool on the other edges
      // Already-bright parts are not lit further, so fur and skin highlights do not blow out to white
      const Tg = T * (1 - 0.55 * smooth(0.5, 0.9, L));
      const E = Math.min(0.97, (Tg * 0.85 + edge * warmSide * 0.8) * patchW * S + feat * 0.55 * S);
      const B = Math.min(0.85, edge * (1 - warmSide) * 1.0 * patchC * S * (1 - 0.6 * T) * (1 - 0.5 * smooth(0.6, 0.95, L)));

      // Warm ramp: deep amber, orange, then a yellow-white core only at the strongest points
      const e = Math.min(1, E);
      const wr = mix(0.4, 1.0, smooth(0, 0.45, e));
      const wg = mix(0.16, 0.52, smooth(0, 0.45, e)) + 0.34 * smooth(0.88, 1.0, e);
      const wb = mix(0.03, 0.12, smooth(0, 0.45, e)) + 0.4 * smooth(0.92, 1.0, e);
      const kw = smooth(0, 0.12, E) * Math.max(E, 0.3);
      // Cool ramp: navy, blue, then a white-blue core
      const b = Math.min(1, B);
      const cr = mix(0.04, 0.2, smooth(0, 0.5, b)) + 0.55 * smooth(0.8, 1.0, b);
      const cg = mix(0.08, 0.42, smooth(0, 0.5, b)) + 0.45 * smooth(0.8, 1.0, b);
      const cb = mix(0.4, 1.0, smooth(0, 0.5, b));
      const kc = smooth(0, 0.12, B) * Math.max(B, 0.3);

      // The form: the picture's own tones as a dim lit shape, warm from the upper left, cool toward the lower right,
      // so features and eyes stay readable. It is the light's colour, not the picture's.
      const wl = smooth(0, 1, 1 - (x / w) * 0.6 - (y / h) * 0.4);
      const form = Math.pow(Math.min(1, L * 1.1), 1.5) * 0.26;
      const fr = mix(0.3, 0.95, wl), fg = mix(0.45, 0.5, wl), fb = mix(1.0, 0.3, wl);

      lit[i * 3] = wr * kw + cr * kc + fr * form;
      lit[i * 3 + 1] = wg * kw + cg * kc + fg * form;
      lit[i * 3 + 2] = wb * kw + cb * kc + fb * form;
    }
  }

  // Bloom: a tight glow and a wide soft one, each tinted by the light that made it. Kept moderate.
  const gk = 0.35 + glow * 0.8;
  const r1 = Math.max(2, Math.round(reach * h * 0.35));
  const r2 = Math.max(4, Math.round(reach * h * 1.4));
  const bloom1 = blur(lit, w, h, r1, 3);
  const bloom2 = blur(lit, w, h, r2, 3);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const energy = lit[i * 3] + lit[i * 3 + 1] + lit[i * 3 + 2];
      const grain = (hash2(x * 7 + 1, y * 13 + 3) - 0.5) * 0.05 * Math.min(1, energy * 1.5);   // grain only where there is light
      for (let c = 0; c < 3; c++) {
        const vsum = lit[i * 3 + c] + bloom1[i * 3 + c] * 0.35 * gk + bloom2[i * 3 + c] * 0.12 * gk + grain;
        const res = Math.min(1, Math.max(0, 1 - Math.exp(-vsum * 1.35)) / (1 - Math.exp(-1.35)));   // soft shoulder: no blown-out white
        const orig = rgba[i * 4 + c] / 255;
        out[i * 4 + c] = Math.round(255 * (orig + (res - orig) * amount));
      }
    }
  }
  return out;
}
