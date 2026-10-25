// src/hero.ts
import { Engine } from './core/Engine';
import { sampleImageParticles } from './core/Sampler';
import { defaults, parseParams, type Params } from './core/params';

export interface HeroOptions {
  image: string;
  depth: string;
  config?: string | Partial<Params>;
  poster?: string;
  alt?: string;
  pointer?: 'window' | 'element';
  pointCount?: 'auto' | number;
  transparent?: boolean;
  pauseOffscreen?: boolean;
  scrollLink?: boolean;
}

export class HeroInstance {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private posterEl?: HTMLImageElement;
  private engine?: Engine;
  private options: HeroOptions;
  private params: Params = { ...defaults };
  private isDestroyed = false;
  private isPaused = false;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private animFrameId?: number;
  private lastTime = performance.now();

  constructor(container: HTMLElement, options: HeroOptions) {
    this.container = container;
    this.options = options;

    // Fast first paint: show poster immediately
    if (options.poster) {
      this.posterEl = document.createElement('img');
      this.posterEl.src = options.poster;
      this.posterEl.alt = options.alt || 'Particle Animation';
      this.posterEl.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: opacity 600ms ease;
        z-index: 1;
        pointer-events: none;
      `;
      this.container.appendChild(this.posterEl);
    }

    // Canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      pointer-events: none;
      z-index: 2;
      opacity: 0;
      transition: opacity 800ms ease;
    `;
    this.container.appendChild(this.canvas);

    // Reduced motion check
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      if (this.posterEl) this.posterEl.style.opacity = '1';
      return;
    }

    // Lazy initialization on idle
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => this.initEngine(), { timeout: 1500 });
    } else {
      setTimeout(() => this.initEngine(), 100);
    }
  }

  private async initEngine(): Promise<void> {
    if (this.isDestroyed) return;

    try {
      // Determine point count
      let count = 262144;
      if (typeof this.options.pointCount === 'number') {
        count = this.options.pointCount;
      } else if (window.innerWidth < 768) {
        count = 131072;
      } else if (window.innerWidth >= 1440) {
        count = 524288;
      }

      this.engine = new Engine(this.canvas, count);

      // Load config if provided
      if (typeof this.options.config === 'string') {
        try {
          const res = await fetch(this.options.config);
          const data = await res.json();
          this.params = parseParams(JSON.stringify(data.params || data));
        } catch {
          this.params = { ...defaults };
        }
      } else if (this.options.config) {
        this.params = { ...defaults, ...this.options.config };
      }
      this.engine.setParams(this.params);

      // Load image and depth map
      const [imgEl, depthEl] = await Promise.all([
        this.loadImage(this.options.image),
        this.loadImage(this.options.depth),
      ]);

      const w = imgEl.width;
      const h = imgEl.height;

      const imgCanvas = document.createElement('canvas');
      imgCanvas.width = w;
      imgCanvas.height = h;
      const imgCtx = imgCanvas.getContext('2d')!;
      imgCtx.drawImage(imgEl, 0, 0);

      const depthCanvas = document.createElement('canvas');
      depthCanvas.width = w;
      depthCanvas.height = h;
      const depthCtx = depthCanvas.getContext('2d')!;
      depthCtx.drawImage(depthEl, 0, 0);
      const depthData = depthCtx.getImageData(0, 0, w, h).data;
      const depthArr = new Float32Array(w * h);
      for (let i = 0; i < depthArr.length; i++) {
        depthArr[i] = depthData[i * 4] / 255.0;
      }

      const sampleData = sampleImageParticles(imgCanvas, depthArr, count);
      this.engine.loadSampleData(sampleData);

      // Cross-fade: reveal canvas, fade out poster
      this.canvas.style.opacity = '1';
      if (this.posterEl) {
        setTimeout(() => {
          if (this.posterEl) this.posterEl.style.opacity = '0';
        }, 300);
      }

      this.bindEvents();
      this.startLoop();
    } catch (e) {
      console.warn('Hero engine init failed, maintaining poster image:', e);
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private bindEvents(): void {
    // Pointer tracking
    const pointerTarget = this.options.pointer === 'element' ? this.container : window;
    pointerTarget.addEventListener('pointermove', (e: Event) => {
      const pe = e as PointerEvent;
      this.engine?.setPointer(pe.clientX, pe.clientY);
    });

    // Resize observer
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.engine?.resize(width, height);
        }
      }
    });
    this.resizeObserver.observe(this.container);

    // Offscreen pause
    if (this.options.pauseOffscreen !== false) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          this.isPaused = !entry.isIntersecting;
        }
      });
      this.intersectionObserver.observe(this.container);
    }

    // Tab visibility pause
    document.addEventListener('visibilitychange', () => {
      this.isPaused = document.hidden;
    });
  }

  private startLoop(): void {
    const loop = (t: number) => {
      if (this.isDestroyed) return;
      if (!this.isPaused && this.engine) {
        const dt = Math.min(0.05, (t - this.lastTime) / 1000);
        this.engine.update(dt, t / 1000);
      }
      this.lastTime = t;
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public setParams(params: Partial<Params>): void {
    this.params = { ...this.params, ...params };
    this.engine?.setParams(this.params);
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.engine?.dispose();
    this.canvas.remove();
    this.posterEl?.remove();
  }
}

export function createHero(container: HTMLElement, options: HeroOptions): HeroInstance {
  return new HeroInstance(container, options);
}

// Custom Web Component <particle-hero>
class ParticleHeroElement extends HTMLElement {
  private hero?: HeroInstance;

  connectedCallback() {
    const image = this.getAttribute('src') || this.getAttribute('image') || '';
    const depth = this.getAttribute('depth') || '';
    const config = this.getAttribute('config') || undefined;
    const poster = this.getAttribute('poster') || undefined;
    const alt = this.getAttribute('alt') || 'Particle Hero';

    if (image && depth) {
      this.style.position = 'relative';
      this.style.display = 'block';
      this.style.width = '100%';
      this.style.height = '100%';
      this.hero = createHero(this, {
        image,
        depth,
        config,
        poster,
        alt,
      });
    }
  }

  disconnectedCallback() {
    this.hero?.destroy();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('particle-hero')) {
  customElements.define('particle-hero', ParticleHeroElement);
}
