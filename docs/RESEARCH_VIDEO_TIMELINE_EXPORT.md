# Research: Video input, timeline, filters and video export

**Scope:** adding video as a particle source, a timeline with scrubbing and keyframes, per-frame filters on the particle render, and export to a video file, for the Particle Depth Studio (`src/core`, `src/depth`, `src/web`, `src/lite`).
**Method:** repo code read for grounding (targeted greps and file headers only). External claims fetched from MDN, W3C, WebKit, Mozilla release notes, and Hugging Face docs this session. Each claim cites its URL. Anything not confirmed in a fetched page is marked **UNVERIFIED** and listed in section 9. No code was compiled or run.

---

## Executive summary

1. **Decode with `HTMLVideoElement`, not WebCodecs, for the first version.** The element decodes in every target browser, handles seeking and audio, and gives frame timing through `requestVideoFrameCallback` (Baseline 2024). WebCodecs `VideoDecoder` is "Limited availability" on MDN and is worker-only in practice. Use it later for offline frame-accurate export paths, not for playback.
2. **Depth is the cost center, not the particles.** Run depth on keyframes (for example 2 to 4 per second), cache the depth maps, interpolate between them, and push the home texture with `texSubImage2D`. Run inference in a worker. The sim and render loop must never wait on inference.
3. **The GPU sim is stateful, so backward scrubbing is expensive.** Ping-pong position and velocity textures carry history. Plan for checkpointed sim states (about 8 MiB per RGBA32F texture at 1024 x 512) or for a replay from the nearest checkpoint. Forward playback needs no special handling.
4. **Export offline, not by recording the screen.** Step the sim at a fixed `dt = 1/fps` per output frame, render to an `OffscreenCanvas`, wrap each frame in a `VideoFrame`, encode with `VideoEncoder`, and mux with Mediabunny (MP4 or WebM). Use `MediaRecorder` plus `canvas.captureStream()` only as a real-time fallback, because it records at wall-clock speed and drops frames under load.
5. **Build in phases with a benchmark gate per phase.** Phase 0 is a depth-cache benchmark. Phase 1 is video playback as a source. Phase 2 is the timeline and checkpoints. Phase 3 is filters with animated parameters. Phase 4 is offline export. The hero bundle (budget 200 kB gzip, last measured 192.8 kB per `CLAUDE.md`) must stay out of all of this: video, export and muxing live in the studio bundle only.

---

## Recommended v1: clip-based, low load

**Priority:** do the least work that still gives a correct result. Nothing runs that the user is not looking at. This section supersedes executive summary items 3 and 4, and the checkpoint plan in section 2.2, for v1.

**Core rule:** all video work is limited to one selected clip (in and out points, max 10 s by default). Frames outside the clip are never decoded, never depth-estimated and never simulated.

### Clip workflow

1. Load a video. Show the first frame only. No sim running.
2. User sets in and out points (max 10 s, enforced in UI).
3. Preview plays the clip at half resolution (stage canvas at 0.5 scale) and at most 30 fps.
4. Depth is computed once for the clip, as keyframes (default every 0.5 s, so at most 20 for a 10 s clip), in a Dedicated Worker, one inference at a time.
5. Export renders the same clip at full resolution, offline, only when the user clicks Export.

### Load rules (what is switched off by default)

| Feature | v1 default | Reason |
|---|---|---|
| Live depth during preview | Off | Use cached keyframe depth only. On cache miss, show the last cached frame; never block. |
| Sim while paused or tab hidden | Off | Stop the sim loop and the rAF loop. No idle GPU work. |
| Checkpoints for backward scrub | Off | Backward scrub = restart at in-point and step forward with fixed `dt`. Add checkpoints only if Phase 0 shows replay is too slow. |
| Post filters | Off | Each filter has its own toggle. Max 2 post passes, half-res targets. |
| Optical-flow depth warp | Off | Phase 5 only, if ever. |
| Audio | Off | Out of scope for v1. |
| `MediaRecorder` realtime export | Only if `VideoEncoder` is missing | Records at wall-clock speed. For a 10 s clip that is 10 s of waiting. Acceptable as fallback. |

### Resource caps (design estimates, to verify in Phase 0)

- Clip length: 10 s max. At 30 fps that is 300 frames.
- Depth input: 512 px long side by default. 768 px only if Phase 0 shows headroom.
- Depth storage: 20 keyframe maps at about 512 x 288, 8-bit, is about 3 MB. Keep in memory; optional IndexedDB cache per viewer.
- Home texture upload: once per keyframe, not per render frame. Interpolate on the CPU side between two uploaded keyframes only if Phase 0 shows the upload cost is low enough; otherwise upload the blend factor and sample two textures in the shader.
- GPU memory: sim position and velocity pair (about 16 MiB) plus home (8 MiB) plus render targets. No checkpoint ring in v1.
- Export: one encoder, one worker, `await` between frames, cancel button closes encoder and frees frames.

### Failure handling

- Depth slower than the frame budget: the preview keeps the last cached depth; the export runs slower but never blocks the UI.
- Out of memory risk: clip cap is the first control to lower (for example to 5 s).
- No WebCodecs (Safari and Firefox gaps): show export in fallback mode with a clear note, or fall back to `MediaRecorder`.
- Preview and export differ: same shader and params; only resolution changes. If a filter cannot match, disable it in export and say so in the UI.

### What changed in the phased plan (section 7.2)

- Phase 0 now also measures: clip-length export time at 512 px depth, and sim cost per frame at half-res preview.
- Phase 1: clip in/out selection and cached-depth preview, no live depth.
- Phase 2: in/out scrub with restart-and-replay. Checkpoints deferred until measured.
- Phase 3: filters off by default, max 2 passes.
- Phase 4: clip export, offline, cancellable.

---

## Repo facts this doc depends on

These are read from the repo, not from external sources.

| Fact | Where |
|---|---|
| Fixed grid: 1024 x 512 = 524,288 particles, `texWidth = 1024` | `src/core/Sampler.ts` (comment at line ~239), `src/core/Engine.ts` line 53 |
| Sim is GPU ping-pong via `GPUComputationRenderer` (position and velocity in shaders) | `CLAUDE.md`, `src/core/Simulation.ts` |
| `Params` is one serialisable object; every control is a field there | `src/core/params.ts`, `CLAUDE.md` |
| Depth model: `onnx-community/depth-anything-v2-small`; `device: 'webgpu'` with `dtype: 'fp16'`, then `device: 'wasm'` with `dtype: 'q8'` | `src/depth/DepthEstimator.ts` lines 20 to 40 |
| Depth is refined in-browser (guided filter) and baked offline for the hero | `src/depth/refine.ts`, `src/depth/bake.ts` |
| Dependency: `@huggingface/transformers` `^4.3.1`, `three` `^0.186.1`, Vite `^6.4.1` | `package.json` |
| Samples decoded at up to 768 px on the long side, then discarded after sampling | `docs/RESEARCH_STYLE_REFINEMENT.md` section 0 (reads `src/lite/sample.ts`) |
| Ping-pong render targets exist for trails (`rtScene`, `rtTrailA`, half-res buffers) | `src/core/ParticleRenderer.ts` lines 93 to 96, 400, 442 to 443 |
| Canvas sizes from `#stage-wrap` via ResizeObserver | `CLAUDE.md` |
| Hero bundle budget under 200 kB gzip | `CLAUDE.md` |

Gap found: the repo never calls `gl.getParameter(gl.MAX_TEXTURE_SIZE)`. Video frames of arbitrary size would be uploaded without a limit check. Add one before video input (section 6).

---

## 1. Video input as particle source

### 1.1 Decode options

| Option | What it does | Status | Fit |
|---|---|---|---|
| `HTMLVideoElement` (`<video>`, hidden, `muted`, `playsInline`) | Browser decodes; you read frames by drawing or uploading the element to a texture | Core web platform | **Use for playback and as the source of frames for depth.** |
| `HTMLVideoElement.requestVideoFrameCallback()` | Fires once per presented video frame; gives `metadata.mediaTime` (seconds on the `currentTime` timeline), `metadata.presentedFrames`, `expectedDisplayTime`, `processingDuration` | Baseline 2024 ("Newly available") | **Use for frame-accurate tick and dropped-frame detection.** |
| WebCodecs `VideoDecoder` | Decodes `EncodedVideoChunk`s you feed in (you need a demuxer, for example Mediabunny) | "Limited availability"; secure contexts; available in Dedicated Workers | Use for offline frame extraction in a worker, if you already need a demuxer. Not for playback. |
| `MediaStreamTrackProcessor` | Exposes a `ReadableStream` of `VideoFrame` from a `MediaStreamTrack` (camera or track) | "Limited availability"; browsers differ on whether it is on `window` or only in workers | Camera input only. Not a file-decode path. |

Sources: MDN `VideoDecoder` (https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder), MDN `requestVideoFrameCallback` (https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback), MDN `MediaStreamTrackProcessor` (https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor).

Key points, cited:
- `VideoDecoder` methods: `configure()`, `decode()`, `flush()`, `close()`. It is a secure-context API and is exposed in Dedicated Workers (MDN, link above).
- `requestVideoFrameCallback` runs at the lower of the video frame rate and the paint rate: a 25 fps video in a 60 Hz browser fires at 25 Hz (MDN, link above; the rate caveat is from the fetched summary of the same page).
- `MediaStreamTrackProcessor` is worker-only in some browsers, and its MDN compatibility table did not load in the fetch. Check the table before relying on it (MDN link above).

### 1.2 Upload to WebGL2

- Upload the `<video>` element or a `VideoFrame` with `texImage2D` (WebGL2). **UNVERIFIED** in this session; the fetched WebGL tutorial covered only `Image` sources. Confirm against the WebGL2 spec or the MDN `texImage2D` reference.
- A cross-origin video without CORS taints the source and cannot be used as a texture (the fetched MDN WebGL tutorial states this for canvases; the same rule for video is **UNVERIFIED**). Local `File` / `blob:` URLs avoid this.
- Use the video only for depth input and colour sampling. Do not upload full-resolution frames every render frame.

### 1.3 Frame sampling

- **Sample rate is a quality knob, not a fidelity requirement.** The particle grid is 1024 x 512 and the sample path already decodes at up to 768 px on the long side (`docs/RESEARCH_STYLE_REFINEMENT.md` section 0). Sample colour and depth at the same resolution the stills use, and reuse the existing `Sampler.ts` path per frame.
- Use `requestVideoFrameCallback` in playback mode, and a fixed frame index in export mode (section 4).

### 1.4 Depth per frame: cost, cache, keyframes

- **Measured (Phase 0, WASM q8 path only):** warm runs, 6 per size, `scripts/bench-depth.mjs`, headless Chromium on Windows, input sample 1125 x 2000 scaled to the long side:
  - 512 px: median 1090 ms, p95 1212 ms.
  - 768 px: median 5387 ms, p95 5669 ms.
- **WebGPU path NOT measured:** in the same run `DepthEstimator` logged `The device (webgpu) does not support fp16.` twice, then fell back to WASM. The headless browser's GPU lacks fp16 shader support. A real desktop GPU may differ; this is an open check.
- **Consequence for the clip plan:** 20 keyframes at 512 px is about 22 s of depth prep per 10 s clip on WASM. At 768 px it is about 108 s. Keep 512 px as the default. Prep needs a progress bar and cancel.
- **Model and runtime facts** (cited):
  - `device: 'webgpu'` runs the model on the GPU; the transformers.js docs say the WebGPU API is still experimental in many browsers (https://huggingface.co/docs/transformers.js/en/index).
  - `dtype` options named in the docs: `fp32` (WebGPU default), `fp16`, `q8` (WASM default), `q4` (same page). The repo's choices (fp16 on WebGPU, q8 on WASM) match these options.
  - The pipeline list on that page includes depth estimation, with Depth Anything named (same page).
- **Keyframe depth plus interpolation (recommended):**
  - Run depth at keyframes (for example every 0.5 s of video, or on scene cuts detected by colour-histogram change; the scene-cut detector is **UNVERIFIED** as a method, a design choice).
  - Interpolate depth linearly between two keyframes per particle home. Linear interpolation of depth is a design choice, not a sourced fact. Test visually: depth across a fast pan can ghost.
  - Between keyframes, optionally warp the previous depth by optical flow. Flow is expensive; treat as Phase 5 (**UNVERIFIED** cost).
- **Caching:** store depth as 8-bit or 16-bit single-channel maps at the sample resolution. A 768 x 432 8-bit map is about 0.33 MB. Cache to IndexedDB keyed by (file hash, frame index, model id). Caching is a per-viewer convenience, so it lives in the browser, not in the URL or in the `Params` object.
- **Worker:** run inference in a Dedicated Worker so the render loop never waits on it. Whether transformers.js runs inside a worker with WebGPU is **UNVERIFIED** in this session; the fetched page did not cover worker use. Test in Phase 0.

### 1.5 Mapping video to the particle home

- Per frame, the home texture (`home.xyz`) gets new depth-driven positions. Upload with `texSubImage2D` (1024 x 512, RGBA32F: 8 MiB per texture; upload cost is **UNVERIFIED** and must be measured).
- The sim formula already uses `home.z * depth * 0.55` and `DEPTH_RELIEF` in `ParticleRenderer.ts`. Keep them equal, as `CLAUDE.md` requires.
- Changing home per frame makes particles spring toward a moving target. Decide whether that reads as motion (preferred, it is video) or as jitter (then smooth the home between frames). This is a design call to test in Phase 1.

---

## 2. Timeline mechanics

### 2.1 Playback clock

- Two clocks: the **media clock** (`video.currentTime`, the source of truth for video) and the **sim clock** (sim time, advanced by `dt` each render frame).
- Map sim time to media time with a linear transform (`mediaTime = offset + speed * simTime`). Drift is corrected by re-seeking only when the error passes a threshold (for example 1 frame).
- `requestVideoFrameCallback` gives the media time of each presented frame, so the render can key the depth and home update to the frame actually on screen (sourced: `metadata.mediaTime`, MDN link above).

### 2.2 Scrubbing and seek cost

- Seeking a `<video>` element is asynchronous; `seeked` fires when the new frame is ready. Event semantics are **UNVERIFIED** in this session; check the HTML media-element section (https://html.spec.whatwg.org/multipage/media.html, not fetched).
- **The sim is stateful.** Position and velocity carry history, so the particle state at time T depends on every step before T. A seek has three costs:
  1. Re-run depth for the new frame (or use the cached one).
  2. Upload home for the new frame.
  3. Restore the sim state at T. Without a checkpoint, this means replaying from t = 0 or from the last checkpoint.
- **Checkpoints:** save position and velocity ping-pong pairs every N seconds of sim time. At RGBA32F, one 1024 x 512 texture is 8 MiB (524,288 texels x 16 bytes); a position-plus-velocity pair is about 16 MiB, and a checkpoint is the same size if it holds the ping-pong pair. Keep at most a few in GPU memory; spill others to CPU as `Float32Array` (readback cost **UNVERIFIED**, measure). Alternatively store checkpoints on a bounded ring and accept replay for far seeks.
- Simple alternative for v1: scrubbing is a **replay from the nearest checkpoint with a fixed-dt step loop**, run at render time with the render paused. Show a progress indicator during replay. Measure replay cost per second of sim time first; do not assume.

### 2.3 Keyframes (parameter animation over the timeline)

- Store keyframes as data: `{ t: seconds, paramKey: string, value: number, ease: string }`, where `paramKey` names a field in `params.ts`. This matches the repo rule that every control is a field in `params.ts`.
- Interpolate in the JS layer once per render frame, then write uniforms. Do not interpolate in shaders from a keyframe texture unless the keyframe count is large (**UNVERIFIED** threshold).
- Keyframe storage is shareable state, so it belongs in the project file (JSON), not in the URL. Never put file data in URL query strings (repo privacy rule in the system prompt applies to user data).

### 2.4 Syncing sim dt to video time

- **Realtime playback:** `dt` per render frame is the wall-clock delta, clamped (the existing sim already clamps `dt`: see the `Math.max(0.004, …)` pattern in `Engine.ts` for pointer timing; clamp sim dt similarly).
- **Export:** `dt` is always exactly `1 / outputFps`. This is the only way to get identical frames regardless of machine speed (section 4).

---

## 3. Filters and effects on the particle render

### 3.1 Where effects can run

| Stage | Example | Cost driver | Notes |
|---|---|---|---|
| Sim shader | Turbulence, flow field, lifecycle changes | Per particle, every frame | The sim is already the heaviest pass; add cheap terms only. |
| Vertex shader (render) | Point size from depth, colour from video | Per particle | Free to vary; samples a texture per vertex. |
| Fragment shader (point sprite) | Per-particle colour, falloff | Per fragment | Cheap at point size under 64 px (`ALIASED_POINT_SIZE_RANGE` figure in the style doc; **UNVERIFIED** on target GPUs). |
| Full-screen post pass | Bloom, grade, vignette, chromatic offset, pixelate | Per output pixel, per pass | Needs an FBO. Each pass costs a full-screen draw. |

- The render already uses ping-pong targets for trails (`rtTrailA` and a half-res buffer). New post passes can reuse that pattern: read from one target, write to another, swap.
- **Budget:** a full-screen pass at the stage resolution is a fixed cost per pass. Limit to 2 to 3 passes for a 60 fps target on a laptop GPU. Measure, do not assume (**UNVERIFIED** GPU numbers).
- Use half-resolution targets for blur-type passes (the repo already creates half-res buffers).

### 3.2 Float targets

- Float render targets in WebGL2 need `EXT_color_buffer_float`. MDN lists the related `WEBGL_color_buffer_float` extension with `RGBA32F_EXT` constants (https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Constants). The exact extension name and the WebGL2 requirement are **UNVERIFIED** against the Khronos registry in this session; check before writing code.
- Use RGBA8 for post passes where precision is enough (grade, vignette). Use float only for the sim and checkpoints.

### 3.3 Animated parameters

- Param animation is a JS-side function of media time. Shader uniforms are updated per frame. No shader recompilation is needed for value changes.
- Changing a shader define (for example a filter on or off) recompiles; keep toggles as uniforms where possible.

---

## 4. Export as a video file

### 4.1 Options

| Option | Realtime or offline | Quality | Fit |
|---|---|---|---|
| `MediaRecorder` + `canvas.captureStream(fps)` | Realtime (wall-clock) | Depends on load; drops frames under GPU stalls | Fallback and quick preview export. |
| WebCodecs `VideoEncoder` + muxer (Mediabunny) | Offline-capable (frame-exact timestamps) | You control timestamps and frame count | **Recommended export path.** |
| ffmpeg.wasm | Offline, CPU | Full codec choice; large download | Not recommended for the main path (size and speed **UNVERIFIED**; must not enter the hero bundle). |

Sources: MDN MediaRecorder usage (https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API/Using_the_MediaStream_Recording_API); MDN `VideoEncoder` (https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder).

Key points, cited:
- `canvas.captureStream(frameRate)` returns a `MediaStream` whose video track is a `CanvasCaptureMediaStreamTrack`. A positive `frameRate` captures at that rate; `0` or omitted can switch to manual capture with `track.requestFrame()` (**UNVERIFIED** against the MDN Canvas page; checked only through a secondary fetch summary of the MediaRecorder page).
- `MediaRecorder.isTypeSupported(mimeType)` is a static check to run before choosing a container and codec. WebM (VP8, VP9, AV1 video with Opus audio) is common in Chromium and Firefox; Safari has favoured MP4 (H.264, AAC). Test with `isTypeSupported` (**container-by-browser support UNVERIFIED** in this session).
- `VideoEncoder.encode(frame, options)` asynchronously encodes a `VideoFrame`. Timestamps are presentation timestamps in integer microseconds relative to the media origin (W3C WebCodecs, https://www.w3.org/TR/webcodecs/). The `keyFrame` option is in section 7.13 of the spec; not read in full here.
- `VideoEncoder` is "Limited availability" on MDN: secure contexts; available in Dedicated Workers (https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder).
- Spec guidance: close codec output and `VideoFrame`s as soon as they are no longer needed, because holding them can stall decoding (W3C WebCodecs link above). `close()` on a codec "Immediately aborts all pending work and releases system resources. Close is final." (same spec).

### 4.2 Offline render loop (recommended)

Pseudocode, design only:

```
configure encoder (codec, width, height, bitrate, framerate)
for i in 0 .. frameCount-1:
    t = i / fps
    sim.step(dt = 1/fps)            # fixed dt, identical on every machine
    home = depthForFrame(i)         # cached or interpolated keyframe depth
    renderer.drawTo(offscreenCanvas)
    frame = new VideoFrame(offscreenCanvas, { timestamp: i * 1e6 / fps })
    encoder.encode(frame, { keyFrame: i % gop == 0 })
    frame.close()
    await yieldIfBusy()             # keep the page responsive
mux(encoder output chunks) -> .mp4 or .webm
```

- `new VideoFrame(canvas, …)` accepting a canvas source is **UNVERIFIED** in this session. Confirm in the WebCodecs spec before use. If not supported, read pixels from a same-context copy and build the frame from a `Uint8Array`.
- Use `OffscreenCanvas` for the export render so the on-screen canvas does not change size or stall (section 6).

### 4.3 Muxers

- **Mediabunny** (formerly the mp4-muxer and webm-muxer line): zero-dependency TypeScript library for reading, writing and converting media in the browser; writes MP4 (including fast start and fragmented variants) and WebM; supports custom coders when the browser lacks a codec (https://mediabunny.dev/guide/introduction; format list at https://mediabunny.dev/guide/supported-formats-and-codecs). Use Mediabunny as the first choice to avoid writing a muxer.
- Version and exact bundle size: **UNVERIFIED** (measure in Phase 4; it must be code-split and loaded only when export is used).
- Audio: out of scope for the first version. If audio is added later, decode with `<video>` or Mediabunny; the encoder path doubles.

### 4.4 Realtime versus offline trade-offs

- Realtime export (`MediaRecorder`) records at wall-clock speed. A 30-second, 60 fps export takes 30 seconds and drops frames when the GPU stalls.
- Offline export (`VideoEncoder`) runs as fast as the GPU and encoder allow. A 30-second export at 30 fps is 900 frames; time per frame is **UNVERIFIED** and must be measured. The result is deterministic: same frames, same timestamps.
- Offline export still needs depth per frame. Depth inference is the likely bottleneck, not encoding. Measure per-frame inference first (Phase 0).

---

## 5. Tech stack (libraries, versions, bundle impact)

| Need | Library or API | Version | Bundle impact | Notes |
|---|---|---|---|---|
| Playback decode | `HTMLVideoElement` | platform | 0 kB | Core. |
| Frame timing | `requestVideoFrameCallback` | platform | 0 kB | Baseline 2024. |
| Depth inference | `@huggingface/transformers` | `^4.3.1` in repo | Already present (studio). | Keep out of hero. |
| Export encoder | WebCodecs `VideoEncoder` | platform | 0 kB | Limited availability; feature-detect. |
| Muxing | Mediabunny | **UNVERIFIED** latest | **UNVERIFIED** (must measure) | Code-split; never in hero. |
| Fallback export | `MediaRecorder` | platform | 0 kB | Fallback path. |
| Heavy fallback | ffmpeg.wasm | **UNVERIFIED** | **UNVERIFIED** (typically large) | Avoid in v1. |

**Hero budget:** the hero is 192.8 kB gzip against a 200 kB limit (`CLAUDE.md`). Video, depth and export must not be imported from `src/hero.ts` or anything it reaches. Verify with `npm run build:hero` and the bundle size after each phase. Add a size check to the verification step.

---

## 6. Technical issues

### 6.1 CPU and GPU throttling

- **Main thread:** keep depth inference, decode and muxing off the render thread. Use Workers. `OffscreenCanvas` (Baseline "Widely available" since March 2023) lets a worker own the render canvas via `transferControlToOffscreen()`, and `requestAnimationFrame` is available in workers (https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas). Whether the studio's WebGL2 renderer (`three`, `GPUComputationRenderer`) can run in a worker without DOM access is **UNVERIFIED**; `three` supports OffscreenCanvas in principle, but this repo's `Engine.ts` and `ParticleRenderer.ts` must be checked for `document`/`window` use. Test before committing.
- **GPU:** one full-screen pass per filter adds cost. Use adaptive resolution (the repo already has `frameSize.ts` in `src/web`; read it before adding a second sizing path).
- **Quality tiers:** tier by device: sim resolution (texWidth 1024 vs 512), depth keyframe interval, number of post passes. Make the tier a `Params` field so it stays in sync with the UI.

### 6.2 Memory

- **GPU textures:** each 1024 x 512 RGBA32F is 8 MiB. Sim (position, velocity, home) plus trails plus checkpoints can add up. Count them explicitly per phase; set a budget (for example 256 MiB) and a checkpoint ring size from it. The budget figure is a design choice; the device limits are **UNVERIFIED**.
- **WebGL2 max texture size:** query `gl.getParameter(gl.MAX_TEXTURE_SIZE)` at startup and clamp source frames to it. The MDN constants page lists `MAX_TEXTURE_SIZE` for `getParameter` (https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Constants) but gives no typical values (**UNVERIFIED** values). The repo does not query it today.
- **VideoFrame lifetime:** `VideoFrame` holds decoder or GPU memory. Call `close()` as soon as the frame is used (W3C WebCodecs, link above). A held `VideoFrame` can stall decoding.
- **Encoder lifetime:** call `close()` on the encoder when export ends or fails. `close()` is final (W3C WebCodecs).
- **Object URLs:** `URL.createObjectURL` for the source file must be revoked when the source changes.

### 6.3 Frame budget

- 60 fps is 16.7 ms per frame. Depth inference per frame will exceed that on most devices (**UNVERIFIED**; Phase 0 measures). Hence keyframe depth in a worker, with the render loop reading the latest completed depth.
- Export frame budget is not real time. Target throughput, not latency: frames per second of export, measured per device.

### 6.4 Depth inference per frame

- Keyframes (section 1.4). Interpolate between keyframes.
- Inference on WebGPU is experimental in many browsers (transformers.js docs, link above). Keep the WASM fallback the repo already has.
- Batch depth for export: run all keyframes first, then render. Avoid interleaving inference and encoding in the same frame loop.

### 6.5 WebCodecs support and browser gaps

- **Chromium:** WebCodecs is available; the version it shipped in is **UNVERIFIED** here.
- **Safari:** WebKit's Safari 16.4 notes say "Safari 16.4 adds support for the video portion of the API" (https://webkit.org/blog/13966/webkit-features-in-safari-16-4/). The same article does not name `VideoDecoder` or `VideoEncoder`. Confirm Safari's current `VideoEncoder` and codec list (MDN compatibility table, not loaded in this session).
- **Firefox:** Firefox 130 enabled WebCodecs on desktop platforms (Mozilla release notes, https://developer.mozilla.org/ja/docs/Mozilla/Firefox/Releases/130; the page was found in search and not fetched in full). Android Firefox support was Nightly-only at that point (same source as seen in search). Confirm the current state from MDN's table.
- **Conclusion:** WebCodecs is safe for export only with a feature check (`VideoEncoder.isConfigSupported`, documented on the MDN page) and a `MediaRecorder` fallback. Playback needs no WebCodecs.

### 6.6 Responsiveness

- Yield between export frames (`await` a microtask or `setTimeout(0)`) so the UI stays live. Measure long tasks in the Browser pane, not only in theory.
- Show progress and allow cancel. Cancel closes the encoder and frees the `VideoFrame`.
- Verify in a real browser. `CLAUDE.md` notes the browser pane throttles `requestAnimationFrame`; step the sim manually with `__engine.update(1/30, t)` as the repo does.

---

## 7. Feature list and phased plan

### 7.1 Prioritised features

| Priority | Feature | Why |
|---|---|---|
| P0 | Load a video file as a source (muted, looped playback) | Core of the request. |
| P0 | Depth keyframes in a worker with a cache | Makes video usable at all. |
| P1 | Clip in/out range, play, pause, scrub within the clip | Basic timeline, clip-bounded. |
| P1 | Export: offline MP4 (H.264) or WebM via `VideoEncoder` and Mediabunny | The export deliverable. |
| P2 | Keyframes for `params.ts` fields | Animated look over time. |
| P2 | Backward scrub by restart-and-replay (checkpoints only if Phase 0 says so) | Keeps GPU memory and CPU load low. |
| P2 | `MediaRecorder` fallback export | Browsers without WebCodecs encoders. |
| P3 | Post passes: grade, vignette, bloom (half-res) | Filters. |
| P3 | Quality tiers and adaptive resolution | Device range. |
| P4 | Optical-flow depth warp between keyframes | Quality, expensive. |
| P4 | Audio passthrough in export | Adds decode and mux work. |

### 7.2 Phases, milestones and verification

**Phase 0: benchmark (no product code shipped)**
- Milestone: measured per-frame depth time (median, p95) at 768 px on WebGPU fp16 and on WASM q8, in a Dedicated Worker, on the target laptop. Also measured: home-texture upload time, one-frame replay cost for the sim, and GPU memory per checkpoint.
- Verify: a scratch script under `scripts/` (Playwright, following `CLAUDE.md`), with numbers written to the research doc, not claimed from memory.
- Status: depth timing done (`scripts/bench-depth.mjs`, see section 1.4). Still open: WebGPU timing on a real GPU, worker timing, home upload, sim step at half res, clip export throughput.

**Phase 1: video as source**
- Milestone: a video clip (10 s max, in/out points) plays muted and loops inside its range; the home texture follows cached depth keyframes. No live depth, no sim while paused.
- Verify: `npm test`, `npx tsc --noEmit`, `npm run build:hero` size unchanged (under 200 kB gzip), and a Playwright screenshot pair at two timestamps showing different particle layouts. Check `gl.getParameter(gl.MAX_TEXTURE_SIZE)` is logged.
- Status (2026-10-28): functional, not yet meeting the load rule. Built: `src/video/clip.ts` (timing, tests in `tests/clip.test.ts`), `src/video/ClipSampler.ts` (one sample per keyframe), `src/video/ClipPlayer.ts` (video element, range, loop), wired in `src/main.ts` with clip controls in `index.html`. The studio's LiteEngine has no `home` texture; keyframes switch with its existing morph (`WebEngine.morphTo`, `LiteEngine.transitionTo`). `MAX_TEXTURE_SIZE` is not queried yet (still open).
- Measured with `scripts/verify-clip.mjs` (headless Chromium, WASM path, 6 s test clip): 12 keyframes, prepare 72 s, 89 main-thread long tasks, longest 4247 ms. Depth runs on the main thread, so the page freezes for seconds at a time during prepare. This was the blocker for the load rule. Phase 1b moved depth into a Dedicated Worker.
- Phase 1b (2026-10-28): `src/depth/depth.worker.ts` now owns the model, inference and refinement. `src/depth/DepthEstimator.ts` is a thin client with the same API; `src/depth/protocol.ts` holds the shared message types. Verified: clip prepare works (15 to 16 keyframes), a picture without baked depth still gets sampled through the worker (`scripts/verify-still-depth.mjs`), tsc and 21 tests pass.
- Phase 1b result, measured (`scripts/verify-clip.mjs`, headless Chromium, WASM): depth is 0.9 to 2.1 s per keyframe in the worker after the first two (model load about 10 s each). Main-thread JavaScript during prepare is small (about 1.5 s total, mostly `sampleLite`, about 100 ms per keyframe). Playback alone has 0 to 1 long tasks in 5 s.
- Still open: during prepare, the main thread reports 233 to 258 long tasks, longest 2.7 to 3.3 s, and the CDP profile attributes about 59 s of 67 s to `(program)` (native time, no JS frame). Cause not found. An ONNX thread cap (half the cores) did not change it, so it was removed. Suspects, untested: video seek and decode in headless, software WebGL, CPU contention from the worker's WASM threads. Next check: run the same prepare in the user's real Chrome with the Performance panel.
- The ONNX runtime loads its `.wasm` from `cdn.jsdelivr.net` by default in transformers.js (`wasmPaths`), so a prepare needs network on first use. Self-hosting is a separate decision.
- Hero bundle: `npm run build:hero` gives 195.29 kB gzip. The hero does not import any changed module, so this is not from Phase 1. It is above the 192.8 kB noted in `CLAUDE.md` and close to the 200 kB limit. Check before the next hero change.

**Phase 2: clip timeline (no checkpoints in v1)**
- Milestone: play, pause, scrub, loop region, all inside the clip; backward scrub by restart-and-replay within a stated time budget, measured in Phase 0.
- Verify: unit test for the media-to-sim time mapping (`tests/`); Playwright step through `__engine.update` at fixed dt; compare particle state at T from forward play vs. scrub-to-T (positions must match within tolerance).

**Phase 3: filters and animated params**
- Milestone: two post passes with half-res targets; keyframed `params.ts` fields.
- Verify: visual diff at a fixed timestamp with the pass on and off; frame time in the Browser pane with the pass on (no regression beyond the agreed budget).

**Phase 4: offline export**
- Milestone: export a 10-second clip as MP4 and WebM with the same frames on two runs (byte or perceptual match).
- Verify: `VideoEncoder.isConfigSupported` gate; frame count and duration checked with a media probe (ffprobe or Mediabunny read); bundle check: export code is code-split and absent from the hero.

**Phase 5: fallbacks and polish**
- Milestone: `MediaRecorder` fallback; quality tiers; cancel and progress.
- Verify: Safari and Firefox run the fallback path without errors (test in the Browser pane or on real devices; no claim without a run).

---

## 8. Open risks

- Depth temporal flicker: per-frame depth from a single-frame model flickers. Keyframe interpolation reduces it but may ghost. Test on a handheld clip.
- Stateful sim makes exact frame-reproducible export depend on fixed `dt` and identical GPU results across devices. Floating-point differences may produce different frames on different GPUs. Expect "same frames up to tolerance", not byte-identical.
- Mediabunny and transformers.js version pins: check licences and bundle size before adding.
- Feature-detect every WebCodecs call. Do not assume the API exists.

---

## 9. Unverified

- Depth Anything V2 Small inference time on the WebGPU fp16 path (fp16 unsupported in the headless test browser; WASM numbers are in section 1.4).
- First-call model load time (144 s in the Phase 0 run) depends on network and cache; not a per-frame cost.
- Whether depth inference blocks the main thread during a WASM run.
- Upload cost of 1024 x 512 RGBA32F home textures per frame.
- Readback cost for CPU-side checkpoints.
- Whether `three`/`GPUComputationRenderer` can run inside a Worker with OffscreenCanvas in this repo.
- `texImage2D` accepting `HTMLVideoElement` and `VideoFrame` in WebGL2 (general knowledge, not fetched from the spec).
- `new VideoFrame(canvas, …)` accepting a canvas source.
- `MAX_TEXTURE_SIZE` typical values on target GPUs.
- Exact WebGL2 extension name and requirement for float render targets (`EXT_color_buffer_float` vs `WEBGL_color_buffer_float`).
- Chromium's WebCodecs first-shipped version.
- Safari's current `VideoEncoder`, `VideoDecoder` and codec list.
- Firefox 130 desktop WebCodecs details beyond the search-result summary; current Firefox state.
- Which container and codec each browser accepts through `MediaRecorder.isTypeSupported`.
- Canvas `captureStream(0)` manual-capture behaviour and `requestFrame()` semantics (only checked through secondary text).
- `requestVideoFrameCallback` frame-accurate seek behaviour (MDN does not discuss it).
- HTML media seek events (`seeked`) timing details (HTML spec not fetched).
- Scene-cut detection method for keyframe placement (a design choice, not sourced).
- Linear depth interpolation quality across fast motion (design choice, to test).
- Mediabunny latest version, bundle size and browser coverage details.
- ffmpeg.wasm size, speed and licence (not researched).
- Whether the WebCodecs W3C spec version fetched (dated 26 Oct 2026 per the fetch summary) is the current state; the summary also said the document is a Working Draft, not a Recommendation.
- Hardware acceleration preference options in WebCodecs (spec section 7.9 not read).

---

## Sources

Primary (fetched this session unless marked "search result"):

- MDN, VideoDecoder: https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder
- MDN, VideoEncoder: https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder
- MDN, Web Codecs API overview: https://developer.mozilla.org/en-US/docs/Web/API/Web_Codecs_API (fetch returned 404; not used)
- MDN, MediaStreamTrackProcessor: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor
- MDN, HTMLVideoElement.requestVideoFrameCallback: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- MDN, OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- MDN, MediaRecorder usage: https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API/Using_the_MediaStream_Recording_API
- MDN, WebGL constants: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Constants
- MDN, WebGL textures tutorial: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
- W3C, WebCodecs: https://www.w3.org/TR/webcodecs/
- WebKit, Safari 16.4 features: https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
- Hugging Face, transformers.js docs: https://huggingface.co/docs/transformers.js/en/index

Search results only (not fetched in full; treat as leads):

- Mozilla, Firefox 130 for developers: https://developer.mozilla.org/ja/docs/Mozilla/Firefox/Releases/130
- Mediabunny introduction: https://mediabunny.dev/guide/introduction
- Mediabunny supported formats: https://mediabunny.dev/guide/supported-formats-and-codecs

Repo (read this session):

- `C:\Users\suman\Projects\particled\src\depth\DepthEstimator.ts`
- `C:\Users\suman\Projects\particled\src\core\Engine.ts`, `Sampler.ts`, `ParticleRenderer.ts`, `FlowField.ts`
- `C:\Users\suman\Projects\particled\docs\RESEARCH_STYLE_REFINEMENT.md`
- `C:\Users\suman\Projects\particled\package.json`
- `C:\Users\suman\Projects\particled\CLAUDE.md`
