# Research: how to shrink the desktop build without losing the three desktop features

Research only. No code or config was changed. Nothing was committed. Date: 2026-10-31. Branch `master-web`.

Evidence rules:
- "Code fact" = read from local files. Paths are relative to the repo root.
- "Measured" = I measured it on disk in this session. Byte counts come from `du -sb` and `gzip -c | wc -c`.
- Outside claims carry a source number `[n]`, listed in section 6 with its URL.
- Anything not confirmed in a primary source is marked **UNVERIFIED**. Several shells were not built or run, so their size and feature numbers are estimates and are marked as such.
- Scratch work: none needed beyond reading and measuring the existing build output.

---

## 1. Summary

- **Where the bytes are (measured).** Current `desktop/exe-out/win-unpacked` is 432.8 MB. The Electron runtime alone (`desktop/node_modules/electron/dist`) is 374.1 MB. The portable exe is 120.6 MB compressed. The 30 MB app payload is mostly one ONNX Runtime wasm file: `ort-wasm-simd-threaded.asyncify-*.wasm`, 26.2 MB raw, 6.7 MB gzipped (measured).
- **Cheapest Electron trims.** Keep only `en-US.pak` and drop the other 54 locale packs: about 50.6 MB uncompressed (measured: locales total 51.2 MB, en-US 0.59 MB). The portable target's compressed saving is UNVERIFIED until rebuilt; the exact option is `electronLanguages`, but the electron-builder docs page could not be fetched (see section 1a).
- **Biggest structural cut is the runtime, not the app.** Any Chromium shell (Electron, NW.js, Tauri via WebView2) carries 150 MB+ of browser code, unless the shell uses the Windows-preinstalled WebView2 Runtime. Tauri and a direct WebView2 host both use the Evergreen WebView2 runtime that ships with Windows 11 [4][5]. That runtime is not in the exe.
- **Loopback audio is the constraint that decides the shell.** Electron's loopback option is Windows-only and is wired through `setDisplayMediaRequestHandler` [1]. The native alternative is WASAPI loopback, which needs `AUDCLNT_STREAMFLAGS_LOOPBACK` on a render endpoint, shared mode only [3]. Any shell that exposes native code can do this. Neutralino's documented `computer` API has no audio capture [8].
- **Recommendation.** Option C in section 4: Tauri 2 (WebView2 plus a small Rust binary). It keeps the web studio code unchanged, uses the preinstalled runtime, and a Rust command can call WASAPI loopback. The WorkerW embed under WebView2 is **UNVERIFIED** and must be spiked first. If the spike fails, keep Electron and do the trims in section 3.1.

### 1a. Source gaps I hit

- `electron.build` configuration pages returned 404 or empty. Anything I say about `electronLanguages`, `compression`, `asar` or the portable target options is from the option names I know, and is **UNVERIFIED** against the docs. Confirm them against the electron-builder version in `desktop/package.json` (26.18.0 installed, measured from `desktop/node_modules/electron-builder/package.json`) before relying on them.
- The Electron application-distribution tutorial [2] gives no size guidance.

---

## 2. Measurements and code facts

### 2.1 Electron build (measured)

| Item | Size | How measured |
|---|---|---|
| `desktop/exe-out/ParticleDepthStudio.exe` (portable) | 120.6 MB | file size |
| `desktop/exe-out/win-unpacked` total | 432.8 MB | `du -sb` |
| Electron `dist` in `node_modules` | 374.1 MB | `du -sb` |
| `locales/` (55 `.pak` files) | 51.2 MB | `du -sb` |
| `locales/en-US.pak` | 0.59 MB | `ls -l` |
| `resources/app.asar` | 30.8 MB | `ls -l` |
| `resources.pak` | 13.4 MB | `ls -l` |
| `icudtl.dat` | 10.8 MB | `ls -l` |
| `dxcompiler.dll` | 25.8 MB | `ls -l` |
| `vk_swiftshader.dll` | 5.5 MB | `ls -l` |
| `d3dcompiler_47.dll` | 4.8 MB | `ls -l` |
| `ffmpeg.dll` | 3.1 MB | `ls -l` |
| `LICENSES.chromium.html` | 5.7 MB | `ls -l` |
| koffi native module (in `app.asar.unpacked`) | about 27 KB per platform | `du` |

Note: `koffi` ships a native binary for every platform in its `build/koffi/` tree. Only `win32_x64` is needed. The `files` list in `desktop/package.json` includes `node_modules/koffi/**/*`, which pulls all platforms into `app.asar.unpacked`. Restricting that glob to the win32 x64 binary is a cheap win (exact saving UNVERIFIED; the per-platform binaries measured 1.6 MB each for musl and openbsd).

### 2.2 Code facts that matter for the size work

- `desktop/package.json` `build.files` lists `main.js`, `preload.js`, `web/**/*`, `node_modules/koffi/**/*`. Portable target only, no `electronLanguages`, no `compression` set.
- `desktop/main.js:139-145`: `allowSystemSound()` sets `setDisplayMediaRequestHandler` with `audio: 'loopback'` on the whole screen source. This is the Electron loopback path.
- `desktop/main.js:38-70`: koffi loads `user32.dll` and does the Progman / `SendMessageTimeoutW(0x052c)` / `SetParent` WorkerW trick.
- `src/depth/depth.worker.ts:29-36`: `@huggingface/transformers` is imported at runtime, `allowLocalModels = false`, device `webgpu` with `fp16` or `wasm` with `q8`.
- `src/depth/protocol.ts:11`: `MODEL = 'onnx-community/depth-anything-v2-small'`. The model is **not** in the bundle. It is fetched at runtime from the model host (code fact; the download host is set by transformers.js defaults, not by app code).
- No `wasmPaths` override anywhere in `src/` or `desktop/` (grep, measured).

### 2.3 Web payload (measured)

| File | Raw | gzip |
|---|---|---|
| `desktop/web/assets/ort-wasm-simd-threaded.asyncify-*.wasm` (shipped) | 26.2 MB | 6.7 MB |
| `node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm` (plain) | 14.3 MB | 3.7 MB |
| `node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm` | 28.4 MB | not measured |
| `node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jspi.wasm` | 16.8 MB | not measured |
| `desktop/web/samples/` (images) | 2.2 MB | |
| `desktop/web/` total | about 30 MB | |

Which wasm the app really loads was read from code, not from a browser network log:
- `node_modules/@huggingface/transformers/dist/transformers.web.js:8726-8745`: when `wasmPaths` is unset, transformers.js sets it to a jsDelivr CDN URL and picks the `.asyncify` file for everything except Safari below 26 without WebGPU.
- ONNX Runtime docs say WebGPU/WebNN uses the `jsep.wasm` file and plain CPU uses `ort-wasm-simd-threaded.wasm` [7]. That disagrees with transformers.js's choice of `asyncify` for WebGPU. **UNVERIFIED** which file runs in Electron. Measure with the Electron network log (`webContents` or DevTools) before changing anything.

---

## 3. Options compared

### 3.1 Option A: stay on Electron 45, trim it

| Trim | Expected effect | Status |
|---|---|---|
| `electronLanguages: ["en-US"]` (electron-builder) | removes about 50.6 MB uncompressed. Portable exe saving UNVERIFIED (estimate 20-25 MB compressed). | option name from memory; docs not fetched; **UNVERIFIED** |
| Restrict koffi to `win32_x64` | a few MB uncompressed at most | glob change; measure |
| Ship `ort-wasm-simd-threaded.wasm` (14.3 MB) instead of asyncify (26.2 MB) if the WebGPU path works with it | saves about 12 MB raw, about 3 MB gzip | **UNVERIFIED**; ORT docs say jsep is the WebGPU file [7], so this needs a test run |
| Load the wasm from jsDelivr on first run (like the model) | removes about 6.7 MB gzip from the exe | needs `env.wasm.wasmPaths` set in code; ORT docs support an absolute CDN URL [7]; network-at-first-run tradeoff |
| `compression: "maximum"` (electron-builder) | small gain on the asar | **UNVERIFIED** |
| Remove `dxcompiler.dll` (25.8 MB) or `vk_swiftshader.dll` | removable only if Chromium's WebGPU/ANGLE paths do not need them | **UNVERIFIED**; Electron docs say nothing about this [2] |

Realistic floor on Electron: the Chromium runtime (about 330 MB unpacked, about 90-100 MB compressed) stays. Expect a portable exe of about 80-95 MB after the first two trims. **UNVERIFIED** until built.

Features kept: all three. Window, WorkerW (koffi, unchanged), loopback (Electron API, Windows only [1]).

### 3.2 Option B: WebView2 directly (C# or C++)

- Runtime: WebView2 Evergreen runtime is included with Windows 11 [4]. The bootstrapper for other machines is about 2 MB [4]. The fixed-version runtime is over 250 MB [4], so it is not an option for a small exe.
- Size estimate: a WinForms or WPF host is a few hundred KB to a few MB, plus the web bundle (about 30 MB, or about 10 MB gzip-compressed inside an archive). **UNVERIFIED**, not built.
- Window: yes, WebView2 is a native control. Standard.
- WorkerW: the same SetParent approach. A CodeProject article describes it for C# and says the 0x052C message works on Windows 8.1 and that newer builds may differ [9]. **UNVERIFIED** on 24H2 or 25H2.
- Loopback: WebView2 has no documented equivalent of Electron's loopback handler (not found in the search; **UNVERIFIED** that WebView2 `getDisplayMedia` supports system audio). Use WASAPI loopback directly, via NAudio or Windows COM. WASAPI loopback is documented for shared-mode render endpoints [3].
- Cost: most work of any option. You re-create the Electron glue (tray, single instance, local HTTP or virtual host mapping, IPC). Not in this research's scope to verify.

### 3.3 Option C: Tauri 2 (WebView2 on Windows)

- Runtime: same WebView2 runtime as option B, so no Chromium in the exe [4].
- Size: Tauri says its binaries are small by default and recommends `opt-level = "s"`, `lto`, `strip`, `panic = "abort"`, `codegen-units = 1` [6]. No figures given there. Tauri's installer options add 0 MB (download bootstrapper, default), about 1.8 MB (embed bootstrapper), about 127 MB (offline installer), about 180 MB (fixed runtime) [5]. Choose the default or embed option.
- Estimate: Rust host a few MB, plus the web bundle (about 30 MB raw, compressed inside the exe). Total about 15-25 MB exe. **UNVERIFIED**, not built.
- Loopback: native. A Tauri command can run WASAPI loopback (Windows docs [3]). A community plugin, `tauri-plugin-system-audio` 0.1.1, does this with cpal, sets the loopback flag on a render device, and states Windows only and default output mix only [10]. Its README says browser `getDisplayMedia` audio is unreliable (third-party claim, not tested here).
- WorkerW: Tauri gives a raw window handle. A `SetParent` call on that HWND under the CodeProject method [9] is plausible. Not found in any primary source. **UNVERIFIED**; needs a spike.
- Cost: moderate. The web front end is unchanged. The koffi code moves to Rust (`windows` crate or raw FFI). Tray and single-instance have Tauri plugins; I did not verify them.

### 3.4 Option D: NW.js

- Ships full Chromium, so it is the same runtime class as Electron. No size advantage expected. **UNVERIFIED** (no NW.js docs fetched).
- Native code access is through Node modules, like Electron. Loopback would still need WASAPI through koffi or a native addon. Not researched further.
- Not recommended: no measured saving over Electron, and it is less maintained than Electron or Tauri. (Maintenance statement is from memory, UNVERIFIED.)

### 3.5 Option E: Neutralino

- Uses the OS web view, not Chromium, so the exe is small. Its `computer` API covers displays, GPUs, input and network, and does not capture audio [8]. The `extensions` and `custom` sections exist in the nav, but their content was not readable (fetch returned only the `computer` namespace).
- Loopback would need a native extension (a binary the app spawns). That is custom work with no documented audio API. **UNVERIFIED** whether an extension can call WASAPI cleanly.
- WorkerW: needs an extension too (koffi is Node-side, not available here). **UNVERIFIED**.
- Not recommended unless the extension route is proven.

---

## 4. Summary table

| Option | Approx. exe size | Window | WorkerW embed | System loopback | Sources | Status |
|---|---|---|---|---|---|---|
| Current Electron 45 (portable) | 120.6 MB (measured) | yes | yes, koffi, unchanged | yes, Electron `loopback`, Windows only [1] | [1][2] | measured |
| A. Electron, trimmed | about 80-95 MB | yes | yes | yes | [1][2], local measurements | estimate, **UNVERIFIED** |
| B. WebView2 direct (C#/C++) | about 2-5 MB + web bundle | yes | SetParent, plausible [9]; **UNVERIFIED** on 24H2+ | WASAPI loopback [3] | [3][4][9] | estimate, **UNVERIFIED** |
| C. Tauri 2 (WebView2) | about 15-25 MB | yes | raw HWND + SetParent; **UNVERIFIED** | WASAPI via Rust or `tauri-plugin-system-audio` [3][10] | [3][4][5][6][10] | estimate, **UNVERIFIED** |
| D. NW.js | about 100 MB+ (Chromium) | yes | likely, UNVERIFIED | native addon needed | none fetched | **UNVERIFIED** |
| E. Neutralino | about 5-10 MB | yes | needs extension, **UNVERIFIED** | needs extension, **UNVERIFIED** | [8] | **UNVERIFIED** |

Shared item for every option: the ONNX Runtime wasm. In B and C it is still about 26 MB raw, unless it is moved to a CDN on first run [7]. Only the browser shell differs.

---

## 5. Recommendation

Order of work, with the cheapest and least risky first:

1. **Do the Electron trims now (option A).** Measure `electronLanguages`, the koffi glob and the wasm choice. Target: portable under 95 MB. Run the depth model once in the built exe and check which wasm loads, using the browser network log. This keeps every feature and costs little.
2. **Spike Tauri 2 (option C) for the three features only.** One Rust command for WASAPI loopback (or the plugin [10]), one SetParent call on the Tauri HWND into WorkerW, one window showing the studio. Measure the exe size and the WorkerW result on Windows 11 24H2 or 25H2 (the machine here is 10.0.26300, which is 25H2 or later by build number; confirm with `winver`).
3. Switch only if the spike passes all three features and the size gain is real. Expected gain: about 75-100 MB less than the current exe, UNVERIFIED.

Risks:
- **WorkerW on Windows 11 24H2+.** The searches found no primary source describing a WorkerW layout change in 24H2. The 24H2 wallpaper issues found were a compatibility hold for wallpaper apps [11] and a Wallpaper Engine icon-visibility bug [11]. Treat the current koffi code as unproven on the current build too. **UNVERIFIED**; test it, do not assume it.
- **Undocumented message 0x052C.** The trick relies on an undocumented Progman message [9]. It can break in any update. Any shell has this risk, including the current one.
- **WebView2 runtime.** Windows 11 includes it [4]. For Windows 10 targets, a bootstrapper is needed (about 2 MB, online) [4]. Evergreen updates are automatic [4].
- **Loopback scope.** WASAPI loopback captures the whole mix of the default render device [3]. Per-app capture is a different API and was not researched.
- **Electron loopback** needs a whole-screen source (`desktopCapturer` with `types: ['screen']`) and is Windows only [1]. The current `main.js` already does that.

---

## 6. Sources

1. Electron, `session.setDisplayMediaRequestHandler`, `audio` option, `loopback` / `loopbackWithMute`, Windows only. https://www.electronjs.org/docs/latest/api/session (fetched)
2. Electron, Application distribution tutorial. No size guidance. https://www.electronjs.org/docs/latest/tutorial/application-distribution (fetched)
3. Microsoft Learn, WASAPI loopback recording: shared mode only, `AUDCLNT_STREAMFLAGS_LOOPBACK`, system mix. https://learn.microsoft.com/windows/win32/coreaudio/loopback-recording (fetched)
4. Microsoft Learn, Distribute your app and the WebView2 Runtime: Evergreen vs Fixed Version, bootstrapper about 2 MB, fixed version over 250 MB, included in Windows 11. https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution (fetched)
5. Tauri 2, Windows installer, WebView2 install options and their sizes (0 MB, 1.8 MB, 127 MB, 180 MB). https://v2.tauri.app/distribute/windows-installer/ (fetched)
6. Tauri 2, Binary size guide, Cargo profile recommendations. https://v2.tauri.app/concept/size/ (fetched)
7. ONNX Runtime Web, deployment: `jsep.wasm` for WebGPU/WebNN, plain `.wasm` for CPU, `ort.env.wasm.wasmPaths` override. https://onnxruntime.ai/docs/tutorials/web/deploy.html (fetched)
8. Neutralino, `computer` API reference: no audio or loopback methods. http://neutralino.js.org/docs/api/computer/ (fetched; redirect from https://neutralino.js.org/docs/api/computer)
9. CodeProject, "Draw Behind Desktop Icons in Windows 8+" (WorkerW / 0x052C / SetParent). https://www.codeproject.com/Articles/856020/Draw-Behind-Desktop-Icons-in-Windows-plus (search snippet, not fetched in full)
10. docs.rs, `tauri-plugin-system-audio` 0.1.1 (loopback via cpal, Windows only, default output mix). https://docs.rs/crate/tauri-plugin-system-audio/latest (search snippet, not fetched in full)
11. The Register, Windows 11 24H2 safeguard hold for wallpaper apps (April 2025). https://www.theregister.com/2025/04/14/windows_11_24h2_hold/ (search snippet)
12. electron-builder configuration docs (`electronLanguages`, `compression`, `asar`, portable options). https://www.electron.build/configuration.html : **attempted, returned empty or 404; not relied on.** Confirm the option names in the installed electron-builder 26.18.0.

Local files (code facts and measurements):
- `desktop/package.json`, `desktop/main.js` (lines 38-70, 113-145), `desktop/preload.js`
- `src/depth/depth.worker.ts` (lines 29-36), `src/depth/protocol.ts` (line 11)
- `vite.config.desktop.ts`
- `node_modules/@huggingface/transformers/dist/transformers.web.js` (lines 8726-8745): wasm path selection
- `node_modules/onnxruntime-web/dist/` (wasm file sizes)
- `desktop/exe-out/win-unpacked/` and `desktop/exe-out/ParticleDepthStudio.exe` (sizes)
- `desktop/node_modules/electron/dist` (374 MB), `desktop/node_modules/electron-builder/package.json` (26.18.0)

---

## 7. Open items (nothing here was done)

- Build with `electronLanguages` and the koffi glob change, and record the new portable size.
- Load the depth model in the built exe and record which ORT wasm is requested (network log).
- Spike Tauri 2 for WASAPI loopback and WorkerW on the current Windows build.
- Not done: no code edits, no commit, no package installs, no global installs.
