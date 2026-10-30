# Research: music-reactive PC wallpaper, then website embed

Research only. No code was changed. Date: 2026-10-31. Branch `master-web`.

Evidence rules:
- "Code fact" = read from `src/lite/shaders.ts`, `src/lite/LiteEngine.ts`, `src/shaders/lifecycle.ts`, `src/web/WebEngine.ts`, `src/hero.ts`. Line numbers are from the working tree on this date.
- Every outside claim carries a source number `[n]`, listed in section 8 with its URL.
- Anything I could not confirm in a primary source is marked **UNVERIFIED**.
- No long quotes. Sources are paraphrased.

---

## 1. Summary

- **Our renderer is audio-ready.** Every motion term is a pure function of uniforms. Audio can drive about 15 uniforms per frame with no framebuffers and no state. One catch: `uSpeed` and the scan rate sit inside time terms, so changing them live makes particles jump. Fix: one accumulated clock (section 2.4).
- **Easiest route to "any audio, no extra step" on Windows** is a host that already does system loopback and hands the page an array. Wallpaper Engine gives 128 values about 30 times a second [1]. Lively gives a 128-value array too, enabled with `--audio` [10]. Neither makes the user pick a source.
- **Browser-only route** (`getDisplayMedia` with audio) works for a quick demo but asks the user to pick a tab or screen every time and cannot be remembered [19].
- **Recommended path:** Phase 1, add an audio module to the web build and test it with `getDisplayMedia` and a file. Phase 2, package it as a Lively wallpaper (free, open source, Windows, WebView2) and also a Wallpaper Engine project. Phase 3, the website embed, built on `LiteEngine` not the old hero engine.
- **Do not build our own WorkerW host first.** The trick is undocumented and one community project reports that Windows 11 24H2/25H2 changed the desktop layout [16]. Lively and Wallpaper Engine already carry that burden.

---

## 2. How our particle motion works, and what audio can drive

### 2.1 The one idea

Nothing is simulated. In `place()` (`shaders.ts:101-185`) each particle gets five hashed random numbers from its index (`rnd(id, salt)`, lines 88-96) and its position is computed from `home`, `light`, `uTime` and uniforms. No state is kept between frames. Draw calls are `gl.POINTS` for the picture, `gl.LINES` instanced for trails, and one instance per cell for the cell looks (`LiteEngine.ts:667-698`).

### 2.2 Each motion mechanism in plain words

| Mechanism | What you see | How it works | Where |
|---|---|---|---|
| **Rest vs stream** | Most dots sit still and form the picture. A share peel off and fly away. | `share = (0.02 + 0.55*uDrift) * brightnessWeight * origin * emitK`. A particle streams if its own random `r0 < share`. | `shaders.ts:125-126` |
| **Bright sheds more** | Light areas throw more dots than dark areas. | `lw = 0.2 + 1.6*lc*lc`, with `lc` capped at 0.7. | `:115-116` |
| **DRIFT / FLOW** (`uDrift`) | How many streamers and how far they travel. | Raises `share` and `reach = (0.4 + 1.6*uDrift)*...`. | `:125`, `:145` |
| **Lifecycle** | A streamer waits at home 30% of its life, then travels, then fades and restarts. | `cycle = (5 + 5*r2)/uSpeed` s, `age = fract(uTime/cycle + r1)`, `rest = 0.30`, `ease = s^1.4`. | `:133-138` |
| **Direction, length** (`uDir`) | The angle and strength of the drift dial. | Unit vector times `0.45 + 0.55*length`, computed on the CPU. | `LiteEngine.ts:588-590`, `shaders.ts:143` |
| **Randomness** (`uRandom`) | Streamers fan out instead of marching in line. | Turns each path up to about 0.6 rad and varies distance per particle. | `:141,145` |
| **LEAN** (`uLean`) | Streamers come mostly from the left or right side. | Scales `share` by an exponential across the picture width. | `:111-112` |
| **Streamline bend** | Paths curve together, like wind. | Sideways sine offset that depends on the start position plus `uTime*0.25`. | `:151-152` |
| **Shimmer** | Held picture is slightly alive. | Tiny sine wobble per particle, `0.0015*(0.3+uDrift)`. | `:163` |
| **DEPTH / RELIEF** (`uDepth`) | Near parts move toward the viewer when the picture tilts. | `z * 0.45 * uDepth` in clip-space setup. | `:189` |
| **Tilt / PAN / sway / 3D** | The picture turns like a card. | `uLook` (cursor tilt or orbit, smoothed on CPU), `uSway` (always-on idle sway). Perspective divide by `1 - zc*0.5`. | `:190-198`, `LiteEngine.ts:571-580` |
| **Dolly** (`uDolly`) | Moves through the picture (closer or further). | Added to the rotated z before perspective. | `:195` |
| **FLOAT** | Whole picture bobs up and down. | CPU sine added to `uOffset.y`. | `LiteEngine.ts:582,614` |
| **TRACK (cursor)** | Pointer pushes particles aside. | OLD: Gaussian repel plus follow pointer velocity. SOFT: small push inside radius 0.14. | `shaders.ts:165-176` |
| **Trails** | Thin lines behind each streamer. | One line per particle, tail runs back along its own path by `uTrailLen`. Culled by `rnd(id,6u) > uTrailAmount*0.5`. | `:300-352` |
| **EMITTERS** | Which parts of the picture shed. | 3x3 weights `uEmitW[9]`, blended smoothly. SPOTS adds small hot patches, SCATTER blurs the launch point. | `:72-79,118-124,149` |
| **Cell looks** | Halftone, mosaic, dither, ASCII, stipple, lines. | One quad per grid cell treated as a particle by `place()`. Tone comes from the picture under the whole cell. | `:364-484` |
| **Scan SWEEP** | A band of light crosses the picture along the drift line. | Gaussian band at `dot(p, lineDir)` vs position `uScan`. | `lifecycle.ts:32-35` |
| **Scan RING** | A ring grows from the click point. | Gaussian on `length(p - c) - scan*1.1`. | `lifecycle.ts:36-39` |
| **Scan RADAR** | A beam turns around the click point. | Angular wedge following `scan*2*pi`. | `lifecycle.ts:40-45` |
| **Scan LINES** | Fine bands travel along the drift. | `fract(dot(p,lineDir)*7 - scan*3)`. | `lifecycle.ts:52-53` |
| **Scan DEPTH** | A band moves from far relief to near relief. | Compares normalised depth with `scan`. Falls back to brightness when relief is 0. | `lifecycle.ts:46-51` |
| **Scan PULSE** | Light glances off the surface. | `glint()` finds where the depth-map normal faces a light circling at `uTime*0.7`, plus a moving sheet. Reads the depth texture. | `shaders.ts:210-230,281-283` |
| **BURST** | Click shock ring pushes dots outward. | `uBurst = (x, y, age, amplitude)`. Amplitude falls to 0 over `BURST_LIFE = 1.1` s. | `shaders.ts:178-182`, `LiteEngine.ts:119,458-463,591` |
| **Scan level** | Strength of every scan band. | Multiplies the band by `uScanLevel/3`. | `lifecycle.ts:58` |
| **Brightness / opacity** | Overall level, picture only. | `uBright` in the dot-colour formula; `uOpacity` for picture, not trails. | `shaders.ts:293-296` |

### 2.3 Everything audio could drive

"Safe" means the output is a continuous function of the uniform, so changing it each frame moves things smoothly. "Pops" means the uniform decides which particles are streamers or visible, so a change flips some particles on or off. Small, slow changes hide this. "Jumps" means the uniform sits inside the time term, so a change moves every particle somewhere else.

| Uniform / param | Shader line | Set at (LiteEngine.ts) | Effect of a per-frame change | Verdict |
|---|---|---|---|---|
| `uBright` (`p.brightness`) | 41, used 293 | 636 | Brightens every dot. | Safe. Cap the swing (section 5). |
| `uTrailGain` (`trailStrength`) | 43, used 350 | 638 | Trail line brightness. | Safe. |
| `uTrailLen` (`trailLength`) | 42, used 330 | 637 | Trail length. Positive length is clamped to the particle's travelled distance. | Safe. |
| `uTrailAmount` | 44, used 310 | 639 | Share of trails kept. Threshold test on a hash. | Pops at the margin. Slow release only. |
| `uTrailSize` | 29, used 290 | 624 | Size of drifting dots. | Safe. |
| `uPSat` | 31 | 626 | Saturation of drifting dots. | Safe. |
| `uScanLevel` | 29 in lifecycle.ts | 651 | Strength of scan bands (1 to 5). | Safe. Best "kick" knob. |
| `uBurst.w` amplitude | 38, used 182 | 633 | Ring push. `burst()` also resets `clickT` and the scan origin. | Safe if driven separately (see 2.5). |
| `uDepth` | 23, used 189 | 617 | Relief height. Also `uZScale` (line 647). | Safe. Slow only, or the whole picture "breathes". |
| `uDolly` | 56, used 195 | 623 | Camera in and out. | Safe. Clamp to +/-0.8 as the wheel does (`LiteEngine.ts:482`). |
| `uSway` amplitude (`p.sway`) | 33, used 190-191 | 579-580, 628 | Idle camera drift. Multiplies the sine, so it is continuous. | Safe. |
| `uLook` (`pan`) | 32 | 571-574 | Tilt. Already smoothed with `k = 1 - exp(-dt*5)`. | Safe. Reuse that smoother. |
| FLOAT amplitude | n/a | 582 | Vertical bob. | Safe. |
| `uOpacity` | 53, used 295 | 648 | Picture alpha. | Safe, but keep off audio. A fast opacity swing is a flash. |
| `uLightCol` / `light` | 46 | 641 | Tint colour. | Safe. Slow hue drift only. |
| `uFx2.x` hue, `uFx1` levels | FX block 234-257 | 652-653 | Colour of the picture. | Safe. Slow only. |
| `uDrift` | 22, used 125,145,152,163 | 616 | Both the streamer share and the reach. | Reach is continuous (positions scale smoothly). Share pops: streamers appear and vanish. Keep modulation under about 0.1 and release over 400 ms or more. |
| `uRandom` | 28, used 141,145 | 622 | Path angle and distance per particle. | Continuous, but reads as jitter. Do not drive from audio. |
| `uLean` | 26, used 112 | 620 | Which side sheds. | Pops. Do not drive. |
| `uEmitW[]`, `uEmitX` | 60-61 | 609-610 | Which regions shed; spot and scatter amounts. | Weights pop; `scatter` (`uEmitX.y`) is continuous. Could use `scatter` as a "treble fizz". |
| `uSpeed` (`p.speed`) | 24, used 133 | 618 | Divides each streamer's cycle length. | **Jumps.** See 2.4. |
| `uTime` | 21 | 615 | Clock for everything. | Do not scale it live. See 2.4. |
| scan rate (`SCAN_RATE`) | CPU only | 118, 596-597 | `scanPhase = ((t - clickT)*rate) % 1`. | **Jumps** if `rate` changes live. See 2.4. |

### 2.4 The time-term jump and its fix

The problem. `age = fract(uTime / cycle + r1)` with `cycle = (5 + 5*r2)/uSpeed` (`shaders.ts:133-135`). The phase is `uTime * uSpeed / (5 + 5*r2)`. If `uSpeed` changes by 0.1 when `uTime` is 600 s, the phase shifts by `600*0.1/7.5 = 8` cycles. Each particle has its own `r2`, so the shift is different for each one and the fractional part is effectively random. Every streamer teleports to a new place in its life. The same happens to `scanPhase` if `SCAN_RATE` changes, and to the flow bend `uTime*0.25` if that frequency changed. (The existing SPEED slider has this flaw too; it just changes rarely.) This is arithmetic from the code, not a measured result.

The fix. Stop passing wall-clock time. Keep one integrated clock on the CPU and scale how fast it ticks:

```
// per frame, in LiteEngine.frame()
audioRate = 1 + 0.6 * smoothedLoudness        // smoothed, 1 = normal speed
this.phase += dt * audioRate                  // integrate: position never jumps
uTime      = this.phase                       // instead of t
scanPhase  = ((this.phase - this.clickPhase) * SCAN_RATE) % 1
```

Because the clock is the integral of the rate, a change in rate changes only how fast things move from now on. Positions stay continuous. The shimmer, flow bend, glint and streamer cycles all scale together. Keep real `t` for the CPU sway and float if you want them independent of music. In this design the shader needs no edit; only the value of `uTime` changes. Drive the slider `uSpeed` the same way (accumulate `phase += dt * p.speed` and leave `uSpeed` at 1) if you also want the SPEED slider to be jump-free. Loop export uses `exactT` and `loopFreq` (`LiteEngine.ts:123-127,548-550`) and must keep the old path.

### 2.5 Impulses (beats)

`uBurst` is already an impulse channel: a ring that expands at `0.9` world units per second with amplitude fading over 1.1 s (`shaders.ts:181`, `LiteEngine.ts:591`). A beat should call a new `kick(strength)` that sets `burstAge = 0` and the centre, but not touch `clickT`, so the scan does not restart. Other impulse-friendly uniforms: `uScanLevel` (decaying bump), `uDolly` (small push in that decays).

### 2.6 Cost notes

Audio adds no draw calls. The cell and point shaders already run at roughly 40k to 450k points (`pointBudget()`, `WebEngine.ts:69-76`, 200k / 300k / 450k tiers). A wallpaper runs all day, so cap the frame rate (section 3) and lower the point count; the lite engine already has a quality ladder (`adapt()`, `LiteEngine.ts:771`, DPR cap `maxDpr` 1.5 at `:250`).

---

## 3. Wallpaper hosts compared

| Host | How it loads a web page | Audio route | Cost and licence | Effort | Risk |
|---|---|---|---|---|---|
| **Wallpaper Engine** | Web wallpaper: an HTML file plus its assets in one folder, imported with the Create Wallpaper button; files are copied into the user's projects folder [2]. Settings live in `project.json` [2][3]. Built on CEF (Chromium Embedded Framework) [6]. | `window.wallpaperRegisterAudioListener(cb)` gives 128 floats, about 30 times a second, usually 0 to 1 with rare spikes above 1 [1]. Data comes from a recording device chosen in Settings; loopback may be blocked by some sound software [7]. | Paid app on Steam (page showed 259 rupees; US price **UNVERIFIED**). Editor extensions DLC is free; Workshop sharing is free for users [8]. Closed source. | Small to medium. | Users must own it and have Steam. Page notes websites and apps take more resources than scene or video types [8]. WebGL support and Chromium version are **not stated** in the docs [4][6]. |
| **Lively Wallpaper** | Web page as a wallpaper; Lively's web player is WebView2 by default, or CEF via CefSharp as an optional plugin (not in the Store build) [11]. A wallpaper is a folder with `LivelyInfo.json`, zipped, dragged into the library [14][15]. | `livelyAudioListener(array)`, 128 values, typically 0 to 1 but "verify", enabled with `"Arguments": "--audio"` [10]. Update rate **not stated** [10]. Also `livelyCurrentTrack` with title, artist and thumbnail [10]. | Free, **GPL-3.0**, built with WinUI 3. Microsoft Store (Windows 10 1809+) or GitHub installer (1903+) [9]. | Small. | Fullscreen apps pause rendering [13]; for the pause event, "only rendering pauses; JavaScript keeps running" [10], so our loop must stop itself. Third-party wallpaper sharing channel and GPL effect on a bundled page: **UNVERIFIED**, not legal advice. Web `Type` value in `LivelyInfo.json`: **UNVERIFIED** (the docs I could read show only the app example `Type: 0`) [14]. |
| **Own host: WorkerW / Progman** (Win32 or .NET app with a WebView2) | Send undocumented message `0x052C` to `Progman` so it creates a `WorkerW` behind the icons, then re-parent your window into it [16]. | Host captures WASAPI loopback (section 4) and calls `ExecuteScriptAsync` or posts a message with the bands. | Free (our own code). WebView2 is free to distribute (Evergreen runtime; a 2 MB bootstrapper, or a Fixed Version over 250 MB) [28]. | Large. | Message is undocumented (**no Microsoft source**). One community project reports that on Windows 11 24H2/25H2 the shell layout changed (Progman gets `WS_EX_NOREDIRECTIONBITMAP`, icons become a layered child) and many wallpaper tools show black [16]. Single non-official source, so treat as **UNVERIFIED** but a real risk. Multi-monitor, DPI, pause on fullscreen, startup, and updates are all ours to build. |
| **Own host: Electron** | Bundles Chromium and Node.js in one binary [22]. Could be wrapped as a desktop-embedded window with the WorkerW trick (needs native glue; community modules **UNVERIFIED**). | `session.setDisplayMediaRequestHandler` with `audio: 'loopback'` captures system audio, "currently only supported on Windows" [21]. No native audio code needed. Page then runs the normal Web Audio code. | **MIT** [23]. | Medium to large (installer, updater, embedding). | Large install (size **not measured**). Wallpaper embedding is the same hard part as above. |
| **Own host: Tauri** | Uses the OS webview, WebView2 on Windows [24][25]. Minimal app can be under 600 KB [24]. | Webview has no loopback switch like Electron's. Rust side would capture WASAPI and push bands over IPC. Crate choice **UNVERIFIED**. | **MIT / Apache-2.0** [26]. | Large (Rust). | Same WorkerW risk. Needs Rust skills. |
| **Own host: plain WebView2 app (C# / C++)** | WebView2 control (Chromium, Windows 10 and 11) [27]. | Native WASAPI loopback in the host [17], forwarded to the page. | Free runtime; no per-app cost found [28]. | Large. | Same WorkerW risk. |

Notes for Wallpaper Engine performance: the docs ask web wallpapers to read the user's FPS limit from `applyGeneralProperties` (`properties.fps`) and obey it, driven by `requestAnimationFrame` with an accumulator rather than `setInterval` [5]. They also tell you to bundle every file locally so the wallpaper works offline [2]. Chrome devtools attach through a CEF port set in General settings [6].

User properties: Wallpaper Engine properties are made in the editor (types: color, slider, checkbox, combo, text, file, directory) and read once on load plus on change through `window.wallpaperPropertyListener.applyUserProperties`; colour arrives as three 0 to 1 numbers [3]. Lively declares controls in `LivelyProperties.json` (slider returns an integer, checkbox, colour hex; other types **UNVERIFIED** here) and calls `livelyPropertyListener(name, value)` on load and on change [12]. Both map cleanly onto our `Params` object, so a thin adapter can translate both into one `setParams()` call.

Pros and cons for a solo developer:
- **Lively:** free, open, zero audio plumbing, our page ships as a folder. Best first target. Audience is smaller and Windows only.
- **Wallpaper Engine:** big audience and a ready Workshop, but users pay and the page cannot be tested without the app. Good second target.
- **Own host:** full control (one installer, our own audio), but you inherit shell hacking, pause logic and a fragile Windows 11 desktop layout. Not worth it before the first two prove demand.

---

## 4. System audio capture routes compared

| Route | What it is | Works with YouTube / any app | Extra user step | Needs native code | Notes |
|---|---|---|---|---|---|
| **Wallpaper Engine listener** | Host gives 128 floats ~30/s [1] | Yes, all system sound | None; user may need to pick the recording device if silent [7] | No | Layout: indices 0 to 63 left channel, 64 to 127 right, low index = bass [1]. Hz per index not stated (**UNVERIFIED**). Data only arrives if a listener is registered [1]. |
| **Lively listener** | Host gives 128 values [10] | Yes | None; wallpaper needs `--audio` argument [10] | No | Rate and per-index frequency **UNVERIFIED**. |
| **WASAPI loopback** (host code) | Win32 Core Audio: open a shared-mode capture stream on the *render* endpoint with `AUDCLNT_STREAMFLAGS_LOOPBACK` [17] | Yes, the mix of all sound played by the engine; includes all user sessions [17] | None | Yes (C++/C#/Rust) | Shared mode only; exclusive-mode streams cannot loop back [17]. Protected (DRM) streams may be blocked [17]. Event-driven loopback works from Windows 10 1703 [17]. Per-process include or exclude since Windows 10 build 20348 [18]. |
| **`getDisplayMedia({audio})`** in Chrome / Edge | Screen-share API; user picks a source [19] | Tab audio: yes for the shared tab. Whole-system audio alongside "entire screen": Chrome treats it as an option you can turn off with `systemAudio: 'exclude'`, default is `include` [20]; exact Windows picker wording and behaviour **UNVERIFIED** from a Chrome primary source | **Yes, every time**: permission is requested each call and cannot be persisted; must be called from a user gesture; secure context only [19] | No | Audio track may be missing even when requested; check `getAudioTracks().length` [19]. Whether audio-only requests are allowed, or `video: true` is required, **UNVERIFIED**; test. |
| **Electron `loopback`** | Electron hands the page a WASAPI loopback track [21] | Yes | None once the handler is set | No (Electron does it) | Windows only [21]. |
| **Microphone** (`getUserMedia`) | Mic input | Only what the mic hears (speakers into mic) | Permission prompt | No | Browsers apply echo cancellation by default settings; set `echoCancellation`, `noiseSuppression`, `autoGainControl` to false for raw level (the first is documented [34]; the other two **UNVERIFIED** here). |
| **Audio file or `<audio>` element** | `createMediaStreamSource` or `createMediaElementSource` into an `AnalyserNode` | Only our own files | None | No | Autoplay: the context must be created or resumed inside a user gesture [35]. |

Which one lets a user play from YouTube or any app with no extra step: only the host-provided routes (Wallpaper Engine, Lively, WASAPI loopback, Electron loopback). `getDisplayMedia` always asks.

### Web Audio facts the page needs

- `AnalyserNode.fftSize`: power of two from 32 to 32768, default 2048 [30]. `frequencyBinCount` is half of it [29].
- `smoothingTimeConstant`: default 0.8, range 0 to 1; 0 means no time averaging [31]. It averages the current buffer with the previous one, so call `getByteFrequencyData` **once per frame**; behaviour for several calls per frame is **UNVERIFIED**.
- `getByteFrequencyData` returns 0 to 255, a linear map of `[minDecibels, maxDecibels]` (defaults -100 and -30 dB) [32][29]. Silent bins give 0. `getFloatFrequencyData` returns dB and can be `-Infinity` for silence [29].
- Bin width = `sampleRate / fftSize`. At 48 kHz and `fftSize` 2048 that is 23.4 Hz (arithmetic). So bass up to 150 Hz is bins 1 to 6, mids bins 7 to 85 (to 2 kHz), highs bins 86 to 512 (to 12 kHz).
- Feed the analyser from `audioCtx.createMediaStreamSource(stream)` [33]. Do not connect the analyser to `destination` when capturing system audio, or the user hears the sound twice (reasoning from [33], whose own example connects to the destination).

### Beat detection methods

- **Energy threshold:** compare the current short-term energy with a running average and flag a beat when it exceeds the average by a factor. Works well on percussive music; weak on soft onsets [37] (this comes from a secondary lecture snippet of Bello et al.; the full text was not read here, **UNVERIFIED** in detail).
- **Spectral flux:** sum of the positive differences between adjacent magnitude spectra; an onset is flagged when the sum is above a threshold [37] (formula from secondary summaries, not the paper's own text, **UNVERIFIED**). Dixon reports that a magnitude-based flux function performs about as well as the phase and complex-domain alternatives [36].
- **Adaptive threshold:** the threshold follows the local mean or median of the detection function plus an offset; Dixon is the standard reference for this peak-picking step [36] (exact parameters not retrieved; **UNVERIFIED**).
- **Practical recipe for us:** flux on the 150 Hz to 4 kHz range, adaptive threshold = mean over the last ~1 s times 1.4 plus a small floor, minimum gap 333 ms between beats (this also enforces the 3-flash limit in section 5). Tune by ear. These numbers are my starting points, not from a source.

---

## 5. Audio to particle mapping, and safety rules

### 5.1 Mapping table

Terms: attack = time to rise 63% toward a higher input; release = time to fall 63% toward a lower input. Implement as `v += (target - v) * (1 - exp(-dt / tau))` with `tau = attack` when rising and `tau = release` when falling. The existing code already uses this shape (`k = 1 - Math.exp(-dt*5)`, `LiteEngine.ts:553`).

| Audio feature | Param (uniform) | Range around the user's base value | Attack | Release | Why |
|---|---|---|---|---|---|
| Overall loudness (RMS, 0 to 1) | clock rate `audioRate` (section 2.4) | x1.0 to x1.6 | 150 ms | 800 ms | Music feels faster, never jumps. |
| Overall loudness | `uBright` | +0 to +15% | 80 ms | 500 ms | Subtle glow. Hard cap, see 5.2. |
| Bass (20 to 150 Hz) | `uDolly` | 0 to +0.06 toward viewer | 50 ms | 300 ms | The picture "breathes" on kick and bass. |
| Bass | `uDepth` | +0 to +0.15 | 80 ms | 600 ms | Relief swells. Keep it slow. |
| Bass | `uScanLevel` | 3 up to 4.5 | 40 ms | 400 ms | Scan band hits harder with the low end. |
| Mids (150 Hz to 2 kHz) | `uDrift` | +0 to +0.08 | 200 ms | 1200 ms | More streamers with fuller sound; tiny range because share pops (2.3). |
| Mids | `uSway` amplitude | x1 to x2 | 300 ms | 1500 ms | Camera drifts more. |
| Highs (2 to 12 kHz) | `uTrailGain` | +0 to +60% | 60 ms | 250 ms | Trails sparkle with hi-hats. |
| Highs | `uEmitX.y` scatter | +0 to +0.4 | 60 ms | 250 ms | Launch points fizz. |
| Beat | `kick()` on `uBurst` (new, 2.5) | amplitude 0.4 to 1.0 | instant | 1.1 s (existing life) | One shock ring per beat. |
| Beat | `uTrailLen` | +0 to +0.3 for 200 ms | 30 ms | 200 ms | Trails snap longer on the hit. |
| Spectral centroid or band balance | `uLightCol` or hue | slow drift within 20 degrees | 2 s | 4 s | Colour follows tone, with no flicker. |

Compute each band as the mean of its bins from `getByteFrequencyData` divided by 255, then apply a gate and a gain (5.3) before the table above. Square-root or log the band value if low bands dominate.

### 5.2 Safety rules

WCAG 2.2 success criterion 2.3.1 (Level A): content must not flash more than three times in any one-second period, unless it stays under the general flash and red flash thresholds [38]. The Understanding document gives the area limit: flashes stay within 25% of a 10-degree visual field, roughly a 341 x 256 px block at 1024 x 768 [39]. A full-screen wallpaper is far larger than that block, so treat the three-per-second limit as binding. WCAG covers web pages, not desktop wallpapers, so this is a design rule we adopt, not a legal duty.

Rules for the audio module:
1. **Max 3 flash-class events per second.** Beat `kick()` has a minimum gap of 333 ms. Count any rise and fall of whole-image brightness as a flash.
2. **Limit the luminance swing.** Keep the global brightness change from audio under about +15% and never fully dark to fully light. A whole-image change of 10% relative luminance is the flash definition's threshold [39].
3. **No audio on `uOpacity` or on the full-image colour at beat rate.** Use position-based effects (dolly, burst ring, scan) that move light around instead of blinking it.
4. **Avoid saturated red pulses.** Red flash has its own stricter test [39]. Keep `uLightCol` away from pure red on beats.
5. **Slow attack on large-area changes.** Anything that changes the whole picture gets attack of at least 80 ms and release of at least 300 ms.
6. **A "calm" switch**: one control that halves all audio gains and doubles the release times. Default it on for the first run.
7. **Respect reduced motion.** Read `matchMedia('(prefers-reduced-motion: reduce)')` and its `change` event [44] and drop audio gains to a small fraction. Whether the Wallpaper Engine and Lively embedded Chromium report the Windows animation setting is **UNVERIFIED**; add a manual calm switch anyway.
8. **Test at full-screen size** with a flash analyser such as PEAT, as the Understanding document advises [39].

### 5.3 Calm idle look in silence

- **Noise gate.** Track the running minimum of loudness over 5 s as the noise floor. Subtract it, then `max(0, x - floor) / (1 - floor)`. Add a hysteresis: open the gate above 0.04, close below 0.02.
- **Fade to idle.** When the gate has been closed for 1.5 s, glide every audio term to 0 with a 2 s release. The scene returns to the base look: the preset's own drift, sway and shimmer, which already run with no audio (`LiteEngine.ts:579-582`).
- **Auto gain.** Normalise each band by its own slow peak (peak decays over about 10 s) so quiet songs and loud songs both fill the range. Clamp the gain so silence never gets amplified into hiss motion.
- **Wallpaper Engine detail:** its detection level (default 50) and the input device change what arrives [7]; treat all values as untrusted, clamp to 0..1 [1].
- **No audio at all:** if no data arrives for 5 s, show the idle look and a small hint; never freeze.

### 5.4 Data path in the page

```
host or Web Audio  ->  AudioFeed { bass, mid, high, rms, beat }  (0..1, per frame)
AudioFeed          ->  smoother (attack/release, gate, gain)
smoother           ->  AudioMap (table in 5.1)  ->  LiteEngine.setAudioMod({...})
LiteEngine.frame() ->  adds the mods to the base params, advances phase, sets uniforms
```

`setAudioMod` stores values. `frame()` adds them to `p.*` when it sets uniforms (`LiteEngine.ts:612-654`). The user's own sliders stay untouched, so presets and exports are not changed by music.

---

## 6. Embedding on websites

### 6.1 What exists today

`src/hero.ts` already defines `<particle-hero>` with `connectedCallback` / `disconnectedCallback` (lines 242, 264), `ResizeObserver` (179), `IntersectionObserver` pause (191), the visibility pause (200), a reduced-motion check (72) and a point-count tier by window width (lines ~97-103). Two gaps for this goal:
1. It imports the **old GPGPU engine** (`import { Engine } from './core/Engine'`, line 2), not `LiteEngine`. New looks and the stateless audio design live only in the lite engine.
2. It has **no Shadow DOM** (no `attachShadow` found) and no audio.

The budget is 200 kB gzip for the embed; last measured 192.8 kB (CLAUDE.md). The lite renderer has no framebuffers and no `GPUComputationRenderer`, so a lite-based embed should be smaller. Not measured, so **measure before promising**.

### 6.2 Recommended shape: `<particle-lite>` custom element

- **Custom element** with `connectedCallback` (set up) and `disconnectedCallback` (tear down, `WEBGL_lose_context`) [40]. Observed attributes (`src`, `depth`, `preset`, `audio`, `quality`, `pointer`) via `observedAttributes` + `attributeChangedCallback` [40].
- **Shadow DOM** (`attachShadow({mode:'open'})`) holds the canvas and a tiny style so host-page CSS cannot break it and ours cannot leak [40]. Put styles inline in the shadow root to avoid a flash of unstyled content from a `<link>` [40].
- **Size to the container** with `ResizeObserver` on the host element; set the canvas backing size from the CSS size times a capped DPR [41]. Defer work caused by resize to `requestAnimationFrame` to avoid the loop-limit error [41]. `devicePixelContentBoxSize` for exact pixels is **UNVERIFIED** (not in the page I read).
- **Start lazily** with `IntersectionObserver` and a `rootMargin` (for example `200px`) so the engine, textures and depth map load just before the element scrolls into view [42]. Do the heavy import with a dynamic `import()`.
- **Pause** when off-screen (`isIntersecting` false) [42] and when `document.hidden` [43]. Most browsers already stop `requestAnimationFrame` in background tabs [43], but audio-playing tabs are exempt from timer throttling [43], so pause explicitly.
- **Reduced motion:** if `prefers-reduced-motion: reduce` matches, render one still frame (or a poster) and do not start the loop. Listen for the `change` event [44]. The current hero shows a poster in this case.
- **Mobile budget.** Reuse the tiers in `pointBudget()` (`WebEngine.ts:69-76`): 200k on small screens, 300k mid, 450k large. For an embed, start lower (for example 60k to 120k on phones), render at a smaller backing buffer (MDN suggests shrinking `canvas.width/height` and styling to full size to cut cost [45]) and let `adapt()` lower DPR when frames are slow. Real thresholds need device tests (**UNVERIFIED**).
- **Context loss:** listen for `webglcontextlost` / `webglcontextrestored` (named in MDN's best-practice list [45]; handling steps from Khronos were not read, **UNVERIFIED**). Browsers also limit live contexts per page, so share one engine across several embeds or lose the offscreen ones.
- **`powerPreference: 'low-power'`** is a common hint for always-on animation, but I have no primary source for it here (**UNVERIFIED**).

### 6.3 Audio in an embed

Audio is optional and opt-in:
- `audio="file"` or `audio="url:..."`: an `<audio>` element feeds `createMediaElementSource` into an analyser. The context must be created or resumed from a click [35].
- `audio="mic"`: `getUserMedia({audio:{echoCancellation:false,...}})`; browser prompts [34]. Show a visible control.
- `audio="tab"`: `getDisplayMedia` with audio; requires a user gesture, secure context, prompts each time [19].
- Never start sound or capture on load. Provide mute and calm controls (the MDN guidance for any web audio is to give play, stop and volume controls [35]).
- Keep the audio module in a separate lazy chunk so pages without audio pay nothing.

### 6.4 Bundle size

Targets: core embed under 200 kB gzip (existing budget). Audio module should be a few kB (an analyser wrapper, bands, gate, flux); no library needed. Cell-look glyph atlas (`src/lite/glyphs.ts`) and the depth baker should be lazy. Measured sizes of a lite-based embed: **not measured, do it** in Phase 3.

---

## 7. Recommended path and phased plan

### Phase 1: audio in the web build (small to medium)

Goal: music moves the particles in the live lab, with no host needed. This also proves the mapping and safety rules.
- Add `src/audio/AudioFeed.ts`: sources (file, mic, `getDisplayMedia` tab/screen), `AnalyserNode` with `fftSize` 2048 and `smoothingTimeConstant` about 0.6 to 0.8, band means, gate, auto gain, beat flux with adaptive threshold and 333 ms gap.
- Add `LiteEngine.setAudioMod()`, the accumulated clock (2.4), and `kick()` (2.5). No shader edit needed except none; the clock fix is CPU-side.
- Add a small "MUSIC" section in the sidebar: source button, level meter, calm switch, per-band amount sliders. Follow the existing section style (see `RESEARCH_SIDEBAR_UX.md`).
- Verify in browser: step with `__engine.update`-style loop per CLAUDE.md tips, test a jump check (change rate 1 to 1.6 and compare positions frame to frame), and a flash check (log luminance change per second under 3 events).
- Verified so far: code facts, Web Audio API facts, `getDisplayMedia` prompt rules. Not verified: that Chrome on Windows lets "entire screen" audio through in this flow; test it on the owner's PC.
- Open questions for the owner: file, mic and tab only for now? Is "calm" the default? Which presets get audio first?

### Phase 2: Windows wallpaper via Lively, then Wallpaper Engine (medium)

- Build a static folder: `index.html` + our bundle + samples, all local (WE requires local files [2]). A thin `host.ts` detects the host and routes: `livelyAudioListener`, `wallpaperRegisterAudioListener`, or the Phase 1 feed. Map 128 values to the same `AudioFeed` bands (bass = low indices) [1][10].
- Lively: write `LivelyInfo.json` with `"Arguments": "--audio"` [10] and `LivelyProperties.json` for a few sliders (amount, calm, preset, colour) [12]. Handle `livelyWallpaperPlaybackChanged` to stop our own loop, since JavaScript keeps running while paused [10]. Check the `Type` value for web in the Lively wallpaper docs before writing the file (**UNVERIFIED** here).
- Wallpaper Engine: register the audio listener once at the end of `<body>` [1]; read `applyGeneralProperties.fps` and cap the loop [5]; declare user properties and read them in `applyUserProperties` [3]; check `supportsaudioprocessing` in `project.json` after saving [1]. Test with the CEF devtools port [6].
- Cap defaults: 30 fps, 150k to 250k points, DPR 1. Wallpapers run for hours; Steam says web wallpapers cost more than scene or video types [8].
- Verified: both audio APIs (128 values) and the property listeners. Not verified: WebGL2 works inside each host's engine; **test `WebGL2RenderingContext` exists in both** before any other work. Lively update rate; WE price in USD.
- Open questions for the owner: is Wallpaper Engine ownership OK for testing (needs a purchase)? Free distribution via Lively zip only, or also Workshop? Picture packs: ship fixed images or let users pick a folder (WE file property [3])? Licence stance on shipping a page inside GPL software (check, not legal advice).

### Phase 3: website embed on the lite engine (medium to large)

- New entry `src/embed.ts` and `vite.config.embed.ts`: `<particle-lite>` per section 6.2, built on `LiteEngine`, lazy audio chunk, optional bundled depth map (no model download, like the current hero).
- Keep the old hero until the new embed matches it, then retire `hero.ts`.
- Measure gzip against the 200 kB budget; test on a mid phone.
- Verified: standard browser APIs used. Not verified: size, mobile frame rates, multi-instance context limits.
- Open questions for the owner: one script tag + attributes, or an npm package too? Do footers need a transparent canvas over page content? Are baked depth maps per image an acceptable authoring step?

### Later, only if demand is proven: own host (large)

A single-file Windows app (WebView2 + WASAPI loopback + WorkerW) removes the need for Lively or Steam, but costs shell integration, pause logic, multi-monitor and updates, and the Windows 11 24H2/25H2 layout change adds risk [16][17]. Electron's `loopback` option would remove the audio code but not the embedding work [21].

---

## 8. Sources

Primary unless tagged otherwise. UNVERIFIED items are marked where used above.

1. https://docs.wallpaperengine.io/en/web/audio/visualizer.html : `wallpaperRegisterAudioListener`, 128 floats, ~30 per second, clamp, `supportsaudioprocessing`.
2. https://docs.wallpaperengine.io/en/web/first/gettingstarted.html : project folder, import, bundle locally, Workshop publishing.
3. https://docs.wallpaperengine.io/en/web/customization/properties.html : user property types, `wallpaperPropertyListener`.
4. https://docs.wallpaperengine.io/en/web/overview.html : web wallpapers are HTML/CSS/JS; links to FPS, audio, debug pages.
5. https://docs.wallpaperengine.io/en/web/performance/fps.html : obey the user's FPS limit via `applyGeneralProperties`; use `requestAnimationFrame`.
6. https://docs.wallpaperengine.io/en/web/debug/debug.html : CEF base, devtools port.
7. https://help.wallpaperengine.io/en/audio/audiodetection.html : recording device, loopback caveats, detection level.
8. https://store.steampowered.com/app/431960/Wallpaper_Engine/ : paid on Steam, Workshop, requirements, websites cost more resources.
9. https://github.com/rocksdanister/lively : Lively is GPL-3.0, web pages supported, Store and GitHub distribution (repo now also at lively-community/lively).
10. https://github.com/rocksdanister/lively/wiki/Web-Guide-V-:-System-Data : `livelyAudioListener` 128 values, `--audio`, `livelyCurrentTrack`, pause event.
11. https://github.com/lively-community/lively/wiki/Web-Player : WebView2 vs CefSharp web players.
12. https://github.com/rocksdanister/lively/wiki/Web-Guide-IV-:-Interaction : `LivelyProperties.json` control types and `livelyPropertyListener`.
13. https://github.com/rocksdanister/lively/wiki/Performance : pause on fullscreen, battery.
14. https://github.com/lively-community/lively/wiki/Application-Wallpaper : `LivelyInfo.json` example fields for an app wallpaper.
15. https://github.com/lively-community/lively/wiki/Lively-Wallpaper-File : the zip package and import (high level only).
16. https://raw.githubusercontent.com/RitvikDayal/featherwall/main/docs/architecture.md : community note on the `0x052C` / WorkerW technique and the Windows 11 24H2/25H2 change. Not official; single source.
17. https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording : WASAPI loopback, shared mode only, DRM note, all sessions.
18. https://github.com/microsoft/windows-classic-samples/tree/main/Samples/ApplicationLoopback : per-process loopback, Windows 10 build 20348.
19. https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia : audio option, `systemAudio`, prompt every time, user gesture, secure context.
20. https://developer.chrome.com/docs/web-platform/screen-sharing-controls : Chrome `systemAudio` include (default) and exclude behaviour.
21. https://www.electronjs.org/docs/latest/api/session : `setDisplayMediaRequestHandler`, `loopback` audio, Windows only.
22. https://www.electronjs.org/docs/latest/ : Electron bundles Chromium and Node.js.
23. https://github.com/electron/electron : MIT licence.
24. https://v2.tauri.app/start/ : Tauri uses the system webview; under 600 KB minimal app.
25. https://v2.tauri.app/reference/webview-versions/ : WebView2 on Windows.
26. https://github.com/tauri-apps/tauri : MIT and Apache-2.0.
27. https://learn.microsoft.com/en-us/microsoft-edge/webview2/ : WebView2 intro, supported Windows versions and environments.
28. https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution : Evergreen runtime, ~2 MB bootstrapper, Fixed Version over 250 MB.
29. https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode : `frequencyBinCount`, dB range, byte and float methods.
30. https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/fftSize : allowed values and default 2048.
31. https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/smoothingTimeConstant : default 0.8, range 0 to 1.
32. https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData : byte data 0 to 255 (the dB-to-byte formula is from the Web Audio spec as relayed by the fetch tool; the spec page itself was too long to read, so the formula is **UNVERIFIED** against the spec text).
33. https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamSource : `MediaStream` into the audio graph.
34. https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/echoCancellation : echo cancellation values.
35. https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices : autoplay rule, user controls.
36. https://dafx.de/paper-archive/details/_kscRgr98aSFW4l-j1YJuA : Dixon, "Onset Detection Revisited" (spectral flux vs phase and complex methods). Abstract only was read.
37. https://www.cs.bu.edu/fac/snyder/cs583/Literature%20and%20Resources/bello_onset_tutorial.pdf : Bello et al., onset detection tutorial (IEEE 2005). Only search snippets and a secondary summary were read; details **UNVERIFIED**.
38. https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold : SC 2.3.1, three flashes per second.
39. https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html : area limit (25% of 10-degree field, ~341 x 256 px), tips, PEAT.
40. https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements : lifecycle callbacks, `observedAttributes`, shadow DOM, define rules.
41. https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver : resize observation, loop-limit error and fixes.
42. https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API : lazy start, pause offscreen, `rootMargin`.
43. https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API : `visibilitychange`, background `requestAnimationFrame`, throttling exemptions.
44. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion : `reduce` / `no-preference` (the JS `matchMedia` usage is general knowledge relayed by the fetch tool, **UNVERIFIED** on that page).
45. https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices : smaller back buffer, fewer draws, context loss events listed.

### Claims marked UNVERIFIED (summary)

- Wallpaper Engine: USD price; WebGL2 availability and Chromium version inside its CEF.
- Lively: `livelyAudioListener` update rate; `LivelyInfo.json` `Type` value for a web wallpaper; control types beyond slider, checkbox, colour; WebGL2 availability in its web player; effect of GPL on a hosted page.
- Frequency per index of both 128-value arrays.
- Chrome on Windows: exact picker wording for "entire screen" system audio; whether `getDisplayMedia` allows audio-only requests.
- WorkerW / `0x052C` behaviour (no Microsoft source) and the Windows 11 24H2/25H2 change (single community source).
- Beat detection formulas and parameters (secondary summaries only).
- `devicePixelContentBoxSize` for canvas sizing; `powerPreference: 'low-power'` benefit; Khronos context-loss handling steps.
- `noiseSuppression` / `autoGainControl` constraint details.
- Whether embedded Chromium in Lively or Wallpaper Engine reports `prefers-reduced-motion`.
