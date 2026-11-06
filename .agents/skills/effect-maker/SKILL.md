---
name: effect-maker
description: Translate a paired source image and same-subject target-style image into a non-destructive effect for an existing image-to-particle system. Use when the user supplies two images, source first and style-transformed target second.
---

# Autonomous Effect Maker — Paired Image Edition

## Purpose

Translate the visual material transformation between two related images into a reusable, real-time particle shader effect for Particle Depth Studio.

- **IMAGE 1 — SOURCE:** Authority for subject, geometry, silhouette, pose, proportions, and particle placement.
- **IMAGE 2 — TARGET STYLE:** Authority for material appearance: color palette, lighting, reflectivity, roughness, and micro-texture.

> **Step 0 (mandatory, before any shader work):** Run the `image-to-effect` skill (`../image-to-effect/SKILL.md`). Write the visual brief (material, tonal structure, palette, edges, detail scale, must keep, must avoid) and treat the picture first with `tools/treat/treat.py` or a new treatment. Pass its 6-question fidelity gate. Only port the look into a shader tile if the user wants a built-in tile. Palette extraction alone (Step 2) is not a brief: it loses banding, edge lines, iridescent phase and rim detail, which is why results looked generic.
>
> **Archetype rule:** The four archetypes below are starting points, not bins. If the brief's material is none of them (foil, neon line art, stipple, faceted crystal), do not force it into one; write a new finish from the brief.
>
> **Fidelity check (replaces "tests pass = done"):** After Step 6, screenshot the effect on the same source and compare it with the reference against the brief's "Must keep / Must avoid". Report which gate lines failed. `tsc` and tests only prove the code compiles.

> **Zero-Friction Rule:** The user should only have to supply the two images. Do NOT ask the user to run commands, paste GLSL, or edit files. Execute the entire pipeline end-to-end autonomously.

---

## Autonomous Execution Protocol (Run in Sequence)

Whenever the user provides two images (attached files or file paths) and asks to create an effect, follow these exact 6 steps:

### Step 1: Save & Locate the Images
- If images are provided as file paths in the workspace, use those paths directly.
- If images are provided as chat attachments, save Image 1 to `scratch/source.png` and Image 2 to `scratch/reference.png`.

### Step 2: Extract Color Palette & Light Direction (Automated)
Run the automated extraction script:
```bash
node scripts/extract-style-inputs.mjs <path-to-image1> <path-to-image2>
```
The script aligns the subject bounding boxes, samples 5 luminance tiers, and outputs ready-to-paste GLSL constants:
- `deepShadow` (deep crevices / occlusions)
- `shadowCol` (unlit diffuse body)
- `midCol` (base material albedo)
- `crestCol` (lit crests facing key light)
- `glintCol` (specular glints / Fresnel rim)
- `L1` (normalized 3D key light vector)

### Step 3: Choose Name, Category & Controls
1. **Name:** Pick an evocative, concise uppercase name based on the material (e.g. `JADE`, `OBSIDIAN`, `BRONZE`, `MARBLE`, `VELVET`, `CORAL`, `ICE`).
2. **Category:** Default to `'SURFACE'` (or `'METAL'` for raw polished metals).
3. **Controls:** Pick 2 to 3 primary controls:
   - For Glass/Gems: `gloss,rim,refract`
   - For Stone/Granite: `cracks,grain,wear`
   - For Metal/Chrome: `bevel,spec,rim`
   - For Translucent/Organic: `gloss,glow,tone`

### Step 4: Scaffold the 9 Files in 1 Second (Automated)
Run the scaffolder CLI tool:
```bash
node scripts/scaffold-effect.mjs --name "<NAME>" --category "<CATEGORY>" --controls "<c1>,<c2>,<c3>"
```
This automatically updates all 9 files in the engine ([`styles.ts`](src/core/styles.ts), [`params.ts`](src/core/params.ts), [`LiteEngine.ts`](src/lite/LiteEngine.ts), [`WebEngine.ts`](src/web/WebEngine.ts), [`shaders.ts`](src/lite/shaders.ts), [`Panel.ts`](src/ui/Panel.ts), [`LookPicker.ts`](src/ui/LookPicker.ts), [`index.html`](index.html), and [`ExportPanel.ts`](src/ui/ExportPanel.ts)) and stubs out `<name>Finish()` in [`src/lite/shaders.ts`](src/lite/shaders.ts).

### Step 5: Fill the Shader Math in `src/lite/shaders.ts`
Open [`src/lite/shaders.ts`](src/lite/shaders.ts) and locate the newly generated `vec3 <name>Finish(vec2 h, vec3 c)`.  
Paste the extracted palette constants and light vector from Step 2 into one of the 4 canonical material archetypes:

#### Archetype 1: Dielectric Glass / Crystal / Gem
```glsl
vec3 <name>Finish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  vec2 e = 4.0 / uTexSize;
  vec2 f = 10.0 / uTexSize;
  float dx = luma(textureLod(uImg, uv + vec2(e.x, 0.0), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(e.x, 0.0), 2.0).rgb);
  float dy = luma(textureLod(uImg, uv + vec2(0.0, e.y), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(0.0, e.y), 2.0).rgb);
  float zx = textureLod(uImg, uv + vec2(f.x, 0.0), 2.0).a - textureLod(uImg, uv - vec2(f.x, 0.0), 2.0).a;
  float zy = textureLod(uImg, uv + vec2(0.0, f.y), 2.0).a - textureLod(uImg, uv - vec2(0.0, f.y), 2.0).a;
  float lum = luma(c);
  float present = smoothstep(0.012, 0.07, max(c.r, max(c.g, c.b)));

  float k = 8.0 + 8.0 * u<Name><Ctrl2>; // e.g. bevel/refract
  vec3 n = normalize(vec3(-(dx + zx * 2.5) * k, (dy + zy * 2.5) * k, 1.0));
  float form = smoothstep(0.08, 0.90, lum);

  // Base palette ramp
  vec3 body = mix(deepShadow, shadowCol, smoothstep(0.0, 0.35, form));
  body = mix(body, midCol, smoothstep(0.35, 0.75, form));
  body = mix(body, crestCol, smoothstep(0.75, 1.0, form));

  // Translucent volume transmission
  float inner = luma(textureLod(uImg, uv, 3.0).rgb);
  body += midCol * inner * 0.6;

  // Specular + Fresnel rim
  vec3 H1 = normalize(L1 + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H1), 0.0), 55.0) * u<Name><Ctrl1>; // e.g. gloss
  float fresnel = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 2.5);
  body += glintCol * (spec * 1.5 + fresnel * u<Name><Ctrl3>); // e.g. rim

  return clamp(body * present, 0.0, 1.0);
}
```

#### Archetype 2: Carved Stone / Granite / Matte Mineral
```glsl
vec3 <name>Finish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  vec2 e = 4.0 / uTexSize;
  vec2 f = 10.0 / uTexSize;
  float dx = luma(textureLod(uImg, uv + vec2(e.x, 0.0), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(e.x, 0.0), 2.0).rgb);
  float dy = luma(textureLod(uImg, uv + vec2(0.0, e.y), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(0.0, e.y), 2.0).rgb);
  float zx = textureLod(uImg, uv + vec2(f.x, 0.0), 2.0).a - textureLod(uImg, uv - vec2(f.x, 0.0), 2.0).a;
  float zy = textureLod(uImg, uv + vec2(0.0, f.y), 2.0).a - textureLod(uImg, uv - vec2(0.0, f.y), 2.0).a;
  float lum = luma(c);
  float present = smoothstep(0.012, 0.07, max(c.r, max(c.g, c.b)));

  float form = pow(smoothstep(0.25, 0.95, lum), 1.45);
  vec3 n = normalize(vec3(-(dx + zx * 2.0) * 8.0, (dy + zy * 2.0) * 8.0, 1.0));
  float lit = clamp((dot(n, L1) - 0.45) * 3.0, 0.0, 1.0);

  vec3 stone = mix(deepShadow, shadowCol, smoothstep(0.0, 0.45, form * (0.4 + 0.8 * lit)));
  stone = mix(stone, midCol, smoothstep(0.28, 0.85, form * (0.4 + 0.9 * lit)));
  stone = mix(stone, crestCol, smoothstep(0.55, 1.0, lit) * smoothstep(0.35, 0.9, form) * 0.3);

  // Mottling & mineral flecks
  stone *= 0.65 + 0.7 * shNoise(h * 55.0);
  float gr = shHash(floor(h * 560.0));
  stone *= 1.0 + (gr - 0.5) * 1.5 * u<Name><Ctrl2>; // e.g. grain

  // Chipped lips / fissures
  vec2 v = arVor(h * 7.0 + 0.9 * vec2(shNoise(h * 17.0)));
  float d = v.y - v.x;
  float core = 1.0 - smoothstep(0.0, 0.026, d);
  float lip = (1.0 - smoothstep(0.0, 0.07, d)) - core;
  stone = mix(stone, crestCol, lip * u<Name><Ctrl1> * 0.8); // e.g. cracks
  stone = mix(stone, deepShadow * 0.5, core * u<Name><Ctrl1> * 0.95);

  return clamp(stone * present, 0.0, 1.0);
}
```

#### Archetype 3: Slick Polished Metal / Chrome
```glsl
vec3 <name>Finish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  vec2 e = 4.0 / uTexSize;
  vec2 f = 10.0 / uTexSize;
  float dx = luma(textureLod(uImg, uv + vec2(e.x, 0.0), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(e.x, 0.0), 2.0).rgb);
  float dy = luma(textureLod(uImg, uv + vec2(0.0, e.y), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(0.0, e.y), 2.0).rgb);
  float zx = textureLod(uImg, uv + vec2(f.x, 0.0), 2.0).a - textureLod(uImg, uv - vec2(f.x, 0.0), 2.0).a;
  float zy = textureLod(uImg, uv + vec2(0.0, f.y), 2.0).a - textureLod(uImg, uv - vec2(0.0, f.y), 2.0).a;
  float lum = luma(c);
  float present = smoothstep(0.012, 0.07, max(c.r, max(c.g, c.b)));

  float k = 10.0 + 10.0 * u<Name><Ctrl1>; // e.g. bevel
  vec3 n = normalize(vec3(-(dx + zx * 2.5) * k, (dy + zy * 2.5) * k, 1.0));
  float form = smoothstep(0.12, 0.92, lum);

  float lit = clamp((dot(n, L1) - 0.45) * 3.5, 0.0, 1.0);
  vec3 body = deepShadow + midCol * lit * (0.35 + 0.95 * form);

  // Sharp specular crests
  vec3 H1 = normalize(L1 + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H1), 0.0), 65.0) * u<Name><Ctrl2>; // e.g. spec
  float fresnel = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
  body += glintCol * (spec * 1.5 + fresnel * 0.5) * u<Name><Ctrl3>; // e.g. rim

  return clamp(body * present, 0.0, 1.0);
}
```

#### Archetype 4: Translucent Organic / Gelatinous / Candy
```glsl
vec3 <name>Finish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  vec2 e = 4.0 / uTexSize;
  vec2 f = 10.0 / uTexSize;
  float dx = luma(textureLod(uImg, uv + vec2(e.x, 0.0), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(e.x, 0.0), 2.0).rgb);
  float dy = luma(textureLod(uImg, uv + vec2(0.0, e.y), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(0.0, e.y), 2.0).rgb);
  float zx = textureLod(uImg, uv + vec2(f.x, 0.0), 2.0).a - textureLod(uImg, uv - vec2(f.x, 0.0), 2.0).a;
  float zy = textureLod(uImg, uv + vec2(0.0, f.y), 2.0).a - textureLod(uImg, uv - vec2(0.0, f.y), 2.0).a;
  float lum = luma(c);
  float present = smoothstep(0.012, 0.07, max(c.r, max(c.g, c.b)));

  vec3 n = normalize(vec3(-(dx + zx * 2.5) * 9.0, (dy + zy * 2.5) * 9.0, 1.0));
  float form = smoothstep(0.06, 0.92, lum);
  float candyBody = pow(form, 1.15);

  vec3 body = mix(deepShadow, shadowCol, smoothstep(0.0, 0.4, candyBody));
  body = mix(body, midCol, smoothstep(0.4, 0.85, candyBody));
  body = mix(body, crestCol, smoothstep(0.85, 1.0, candyBody));

  // Subsurface inner scatter
  float inner = luma(textureLod(uImg, uv, 3.5).rgb);
  body += midCol * inner * u<Name><Ctrl2>; // e.g. glow

  // Wet specular
  vec3 H1 = normalize(L1 + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H1), 0.0), 45.0) * u<Name><Ctrl1>; // e.g. gloss
  body += glintCol * spec;

  return clamp(body * present, 0.0, 1.0);
}
```

### Step 6: Verify Code Integrity
Run the standard verification commands:
```bash
cmd.exe /c npm test
cmd.exe /c npx tsc --noEmit
```
Both must pass with zero errors.

### Step 7: Report Back to User
Report in 6 brief bullet points:
1. **Effect name & category:** (e.g. `JADE` in `SURFACE`, slot N)
2. **Visual transformation:** (e.g. Translucent imperial green jade with subsurface scatter and glossy crests)
3. **Controls added:** (e.g. GLOSS, GLOW, RIM)
4. **Files changed:** List of files modified
5. **Verification status:** Tests and TypeScript checks passed
6. **How to test in browser:** Slot and tile instructions
