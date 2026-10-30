// src/ui/MusicPanel.ts
// The MUSIC section: pick where the sound comes from, show the bars, and each frame hand the engine the
// small offsets the sound produces. It runs its own frame loop, so the app's loop stays as it was.
import { AudioFeed, type AudioSource } from '../audio/AudioFeed';
import { AudioMapper } from '../audio/AudioMap';
import { paletteFrom, type Rgb } from '../audio/palette';
import type { AudioFeatures } from '../audio/features';
import type { WebEngine } from '../web/WebEngine';

const SOURCE_LABEL: Record<AudioSource, string> = { file: 'FILE', tab: 'TAB SOUND' };

export class MusicPanel {
  feed = new AudioFeed();
  map = new AudioMapper();
  private pal: Rgb[] = [];
  private palSample: unknown = undefined;
  private palT = 0;
  private eqMean = new Float32Array(12).fill(-30); // each column's recent level in dB, 4 s memory: the bar moves against its own average
  private reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  private last = 0;
  private silentFor = 0;
  private beatVis = 0;
  private status = document.getElementById('mu-status') as HTMLElement | null;
  private bars = new Map<string, HTMLElement>();
  private summary = document.querySelector<HTMLElement>('section[data-collapse="music"] .sec-summary');
  private fileInput = document.getElementById('mu-file-input') as HTMLInputElement | null;

  constructor(private engine: WebEngine) {
    document.querySelectorAll<HTMLElement>('#mu-meter i[data-b]').forEach((i) => this.bars.set(i.dataset.b ?? '', i));

    const on = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('click', fn);
    on('mu-file', () => this.fileInput?.click());
    on('mu-tab', () => this.start('tab', () => this.feed.useTab()));
    on('mu-stop', () => this.stop());
    this.fileInput?.addEventListener('change', () => {
      const f = this.fileInput?.files?.[0];
      if (f) void this.start('file', () => this.feed.useFile(f));
      if (this.fileInput) this.fileInput.value = ''; // the same file can be picked again
    });
    this.feed.onEnded = () => {
      this.setState();
      this.say('SHARING STOPPED');
    };

    this.setState();
    (window as unknown as { __music: MusicPanel }).__music = this; // for checks from the console, like __engine
    requestAnimationFrame(this.tick);
  }

  private async start(kind: AudioSource, open: () => Promise<void>): Promise<void> {
    this.say('OPENING ' + SOURCE_LABEL[kind] + '...');
    try {
      await open();
      this.silentFor = 0;
      this.say('LISTENING');
    } catch (e) {
      const err = e as Error;
      // Permission refusals are normal: say it plainly instead of showing a stack
      const denied = err.name === 'NotAllowedError' || err.name === 'SecurityError';
      this.say(denied ? 'BLOCKED: ALLOW IT IN THE BROWSER' : (err.message || 'COULD NOT OPEN').toUpperCase().slice(0, 40));
    }
    this.setState();
  }

  private stop(): void {
    this.feed.stop();
    this.say('NO SOUND YET');
    this.setState();
  }

  private say(text: string): void {
    if (this.status) this.status.textContent = text;
  }

  /** Lights the chosen source button and writes the closed-section summary. */
  private setState(): void {
    for (const [kind, id] of [['file', 'mu-file'], ['tab', 'mu-tab']] as const) {
      document.getElementById(id)?.classList.toggle('active', this.feed.kind === kind);
    }
    if (this.summary) this.summary.textContent = this.feed.kind ? SOURCE_LABEL[this.feed.kind] : 'OFF';
  }

  private tick = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    const st = this.engine.getAudioSettings();
    // Reduced motion in the system settings: the sound is allowed only a quarter of its strength
    const reduce = this.reduce.matches ? 0.25 : 1;
    this.map.settings.amount = st.amount * reduce;

    const f = this.feed.step(dt);
    const { mod } = this.map.step(f, dt);
    // The music moves the picture's particles (the looks) and the equalizer together
    this.engine.setAudioMod(mod);
    this.engine.setMusic({ ...f, amount: st.amount * reduce });
    this.feedEq(f, dt, st.eq, st.eqSize);

    this.meter(f, dt);
    requestAnimationFrame(this.tick);
  };

  /** EQUALIZER particles: 12 column levels and 12 waveform columns from the sound, the picture's palette. */
  private feedEq(f: AudioFeatures, dt: number, style: number, size: number): void {
    this.palT += dt;
    if (this.palT > 0.5) {
      this.palT = 0;
      const pic = this.engine.getPicture();
      if (pic !== this.palSample) {
        this.palSample = pic;
        this.pal = paletteFrom(pic?.grid);
      }
    }
    const levels = new Float32Array(12);
    const wave = new Float32Array(12);
    for (let k = 0; k < 12; k++) {
      const b0 = Math.floor((k * 32) / 12);
      const b1 = Math.floor(((k + 1) * 32) / 12);
      let sum = 0;
      for (let i = b0; i < b1; i++) sum += f.bands[i];
      const raw = sum / (b1 - b0);
      // Loud songs fill every band, so the level is how far this band sits above its own recent average, in dB.
      // Sustained loud sound sits near the middle; a band's spikes rise, its dips fall. At most 60% of the height.
      const db = 20 * Math.log10(Math.max(raw, 1e-4));
      this.eqMean[k] += (db - this.eqMean[k]) * (1 - Math.exp(-dt / 4));
      levels[k] = f.active ? 0.6 * Math.min(1, Math.max(0, 0.5 + (db - this.eqMean[k]) / 12)) : 0;
      wave[k] = f.active ? f.wave[Math.floor((k * 32) / 12)] : 0;
    }
    this.engine.setEqualizer(style, levels, wave, this.pal, size);
  }

  private meter(f: AudioFeatures, dt: number): void {
    if (this.feed.kind) {
      this.silentFor = f.active ? 0 : this.silentFor + dt;
      if (this.silentFor > 5) this.say('NO SOUND ARRIVING');
      else if (this.status && this.status.textContent === 'NO SOUND ARRIVING') this.say('LISTENING');
    }
    this.beatVis = f.beat ? 1 : this.beatVis * Math.exp(-dt / 0.15);
    const set = (k: string, v: number) => {
      const el = this.bars.get(k);
      if (el) el.style.transform = `scaleY(${Math.max(0.04, Math.min(1, v)).toFixed(3)})`;
    };
    set('bass', f.bass);
    set('mid', f.mid);
    set('high', f.high);
    set('beat', this.beatVis);
  }
}
