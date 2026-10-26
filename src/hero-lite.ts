// src/hero-lite.ts
// Lightweight <particle-hero> for a portfolio header. No three.js, no depth model, no simulation:
// a stateless WebGL2 vertex-shader animation (see src/lite/). Build with `npm run build:hero-lite`.
import { LiteEngine, liteDefaults, type LiteLayout, type LiteParams } from './lite/LiteEngine';
import { sampleLite } from './lite/sample';

export interface HeroLiteOptions {
  image: string;
  /** Baked depth map (greyscale, white = near). Omit for a flat picture. */
  depth?: string;
  /** URL of a studio export (`{ params }`) or a partial LiteParams object. */
  config?: string | Partial<LiteParams>;
  poster?: string;
  alt?: string;
  pointer?: 'window' | 'element';
  pointCount?: 'auto' | number;
  pauseOffscreen?: boolean;
  fit?: LiteLayout['fit'];
  alignX?: number;
  alignY?: number;
  maxDpr?: number;
}

/** Accepts either LiteParams keys or a studio Params export. */
export function toLiteParams(src: any): Partial<LiteParams> {
  if (!src || typeof src !== 'object') return {};
  const p = src.params ?? src;
  const out: Partial<LiteParams> = {};
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  for (const k of ['drift', 'angle', 'length', 'depth', 'speed', 'sway', 'trailLength', 'trailStrength', 'brightness'] as const) {
    const v = num(p[k]);
    if (v !== undefined) out[k] = v;
  }
  if (typeof p.trails === 'boolean') out.trails = p.trails;
  if (p.line) {
    const a = num(p.line.angle);
    const l = num(p.line.length);
    if (a !== undefined) out.angle = a;
    if (l !== undefined) out.length = l;
  }
  if (p.trail) {
    const l = num(p.trail.length);
    const s = num(p.trail.strength);
    if (l !== undefined) out.trailLength = l;
    if (s !== undefined) out.trailStrength = s;
  }
  return out;
}

/** Starting particle count from what the device can plausibly afford. */
export function autoCount(): number {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as any).deviceMemory || 4;
  if (window.innerWidth < 768 || cores <= 4 || mem <= 4) return 200000;
  if (cores >= 8 && mem >= 8 && window.innerWidth >= 1280) return 450000;
  return 300000;
}

/** Greyscale image to one value per pixel (0..1), the red channel. */
function greyArray(img: HTMLImageElement): Float32Array {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const out = new Float32Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed: ' + src));
    img.src = src;
  });
}

export class HeroLite {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private posterEl?: HTMLImageElement;
  private engine?: LiteEngine;
  private options: HeroLiteOptions;
  private destroyed = false;
  private visible = true;
  private raf = 0;
  private last = 0;
  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private cleanups: Array<() => void> = [];

  constructor(container: HTMLElement, options: HeroLiteOptions) {
    this.container = container;
    this.options = options;

    if (options.poster) {
      const img = document.createElement('img');
      img.src = options.poster;
      img.alt = options.alt || 'Particle animation';
      img.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;pointer-events:none;transition:opacity 600ms ease';
      container.appendChild(img);
      this.posterEl = img;
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:2;opacity:0;transition:opacity 800ms ease';
    container.appendChild(this.canvas);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (this.posterEl) this.posterEl.style.opacity = '1';
      return; // static poster only
    }

    const start = () => void this.init();
    if ('requestIdleCallback' in window) (window as any).requestIdleCallback(start, { timeout: 1200 });
    else setTimeout(start, 80);
  }

  private async init(): Promise<void> {
    if (this.destroyed) return;
    try {
      const o = this.options;
      const [img, depth, cfg] = await Promise.all([
        loadImage(o.image),
        o.depth ? loadImage(o.depth).catch(() => null) : Promise.resolve(null),
        typeof o.config === 'string'
          ? fetch(o.config).then((r) => r.json()).catch(() => ({}))
          : Promise.resolve(o.config ?? {}),
      ]);
      if (this.destroyed) return;

      const engine = new LiteEngine(this.canvas, { maxDpr: o.maxDpr });
      this.engine = engine;
      engine.setParams({ ...liteDefaults, ...toLiteParams(cfg) });
      engine.setLayout({ fit: o.fit ?? 'contain', alignX: o.alignX ?? 0, alignY: o.alignY ?? 0 });

      const count = typeof o.pointCount === 'number' ? o.pointCount : autoCount();
      engine.setSample(sampleLite(img, depth ? greyArray(depth) : null, count));

      const rect = this.container.getBoundingClientRect();
      engine.resize(rect.width, rect.height);

      this.bind();
      this.canvas.style.opacity = '1';
      if (this.posterEl) setTimeout(() => this.posterEl && (this.posterEl.style.opacity = '0'), 400);

      const loop = (t: number) => {
        if (this.destroyed) return;
        this.raf = requestAnimationFrame(loop);
        if (!this.visible || document.hidden) {
          this.last = t;
          return;
        }
        engine.frame(this.last ? (t - this.last) / 1000 : 1 / 60);
        this.last = t;
      };
      this.raf = requestAnimationFrame(loop);
    } catch (e) {
      console.warn('particle-hero (lite) failed, keeping poster:', e);
      if (this.posterEl) this.posterEl.style.opacity = '1';
      this.canvas.remove();
    }
  }

  private bind(): void {
    const engine = this.engine!;
    const target: EventTarget = this.options.pointer === 'element' ? this.container : window;
    const move = (e: Event) => {
      const pe = e as PointerEvent;
      const r = this.canvas.getBoundingClientRect();
      const inside = pe.clientX >= r.left && pe.clientX <= r.right && pe.clientY >= r.top && pe.clientY <= r.bottom;
      engine.setPointer(inside ? pe.clientX - r.left : null, inside ? pe.clientY - r.top : null);
    };
    target.addEventListener('pointermove', move, { passive: true });
    this.cleanups.push(() => target.removeEventListener('pointermove', move));

    this.ro = new ResizeObserver(() => {
      const r = this.container.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) engine.resize(r.width, r.height);
    });
    this.ro.observe(this.container);

    if (this.options.pauseOffscreen !== false) {
      this.io = new IntersectionObserver((es) => {
        for (const e of es) this.visible = e.isIntersecting;
      });
      this.io.observe(this.container);
    }

    const lost = (ev: Event) => {
      ev.preventDefault();
      cancelAnimationFrame(this.raf);
      if (this.posterEl) this.posterEl.style.opacity = '1';
    };
    this.canvas.addEventListener('webglcontextlost', lost);
    this.cleanups.push(() => this.canvas.removeEventListener('webglcontextlost', lost));
  }

  /** Live tuning from the portfolio page (or from the studio's exported values). */
  setParams(p: Partial<LiteParams>): void {
    this.engine?.setParams(p);
  }

  /** Test and debugging access. */
  get debugEngine(): LiteEngine | undefined {
    return this.engine;
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.cleanups.forEach((f) => f());
    this.engine?.dispose();
    this.canvas.remove();
    this.posterEl?.remove();
  }
}

export function createHero(container: HTMLElement, options: HeroLiteOptions): HeroLite {
  return new HeroLite(container, options);
}

class ParticleHeroElement extends HTMLElement {
  private hero?: HeroLite;

  connectedCallback() {
    const image = this.getAttribute('src') || this.getAttribute('image') || '';
    if (!image) return;
    this.style.position = 'relative';
    this.style.display = 'block';
    this.style.width = this.style.width || '100%';
    this.style.height = this.style.height || '100%';
    const num = (n: string) => (this.hasAttribute(n) ? Number(this.getAttribute(n)) : undefined);
    this.hero = createHero(this, {
      image,
      depth: this.getAttribute('depth') || undefined,
      config: this.getAttribute('config') || undefined,
      poster: this.getAttribute('poster') || undefined,
      alt: this.getAttribute('alt') || undefined,
      fit: (this.getAttribute('fit') as LiteLayout['fit']) || undefined,
      alignX: num('align-x'),
      alignY: num('align-y'),
      pointCount: num('points'),
      pointer: this.getAttribute('pointer') === 'element' ? 'element' : 'window',
    });
  }

  disconnectedCallback() {
    this.hero?.destroy();
    this.hero = undefined;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('particle-hero')) {
  customElements.define('particle-hero', ParticleHeroElement);
}
