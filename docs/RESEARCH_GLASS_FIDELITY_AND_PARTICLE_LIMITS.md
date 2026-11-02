# Root Cause Analysis & Research: Glass Fidelity and Particle Engine Limits

**Author**: BY SUMANTH REDDY  
**Subsystem**: WebGL2 Lite Particle Engine & Glass Shaders  
**Date**: November 2026  

---

## 1. Executive Summary

When comparing the target reference image (a raytraced obsidian glass bust with chromatic aberration caustics, `media_1793623730616_481feda4.jpg`) with the initial canvas output (`media_1793625158948_007872b0.png`), there was an extreme perceptual discrepancy:
- **Reference**: A sleek, continuous, polished black obsidian sculpture with razor-thin white specular reflections and localized chromatic rainbow caustics along toga drapery, pedestal rings, and laurel tips.
- **Initial Canvas**: A noisy, grainy, sand-like stipple cloud with the head blown out into an undifferentiated blob of cyan/white static, with eyes and facial features completely erased.

This investigation identifies the four exact physical and mathematical root causes of this failure, details the shader and engine fixes applied to resolve them, and establishes practical workarounds for rendering glass materials on discrete particle systems.

---

## 2. Root Cause Analysis

### Cause 1: Screen Blending Over-Accumulation & Facial Blowout
In `src/lite/LiteEngine.ts`, particle points are rendered using screen/additive blending:
$$\text{dest}_{\text{new}} = \text{src} + \text{dest} \times (1 - \text{src}) \iff 1 - \text{dest}_{\text{new}} = (1 - \text{dest})(1 - \text{src})$$
When $k$ particles overlap on a screen pixel, the accumulated brightness is:
$$C_{\text{final}} = 1 - (1 - C_{\text{particle}})^k$$
The source image is a classical white marble bust. The engine's importance sampler (`src/core/Sampler.ts`) places particles proportionally to luminance, concentrating over 100,000 particles onto the face, forehead, and nose. When the initial shader added Fresnel rim light ($\sim 0.35$) and caustic dispersion ($\sim 0.40$), the overlapping particles quickly exceeded $1.0$, resulting in a completely clamped, blown-out white/cyan head with all facial anatomy destroyed.

### Cause 2: Global Caustic Leaks vs Localized Refractive Prisms
In the reference image, the head and face have **zero** chromatic aberration; they are pure black obsidian. Rainbow dispersion occurs exclusively where thick glass acts as an optical prism:
1. The sweeping diagonal folds of the toga drapery.
2. The bottom torus ring of the pedestal column.
3. The tips of the laurel leaves in the crown.

The initial shader computed fold zones using local luminance curvature. Because the curly hair and facial contours have high curvature, caustics leaked across the entire head, drenching the bust in clown-like neon green and magenta noise.

### Cause 3: Discrete 1px Points vs Continuous Raytraced Manifold
The reference image was produced by an offline path tracer or generative diffusion model that models light traversing a continuous, watertight 3D volume with Snell's law:
$$n_1 \sin \theta_1 = n_2 \sin \theta_2, \quad n(\lambda) = A + \frac{B}{\lambda^2}$$
`particled` is a real-time WebGL2 particle simulation rendering discrete points (`gl.POINTS`). At 1px point size on a black canvas, dark obsidian particles ($C \approx 0.02 - 0.04$) do not cover the voids between dots. The human eye perceives these unlit black voids as **coarse stipple noise / television static**.

### Cause 4: Density vs Luminance Inversion
The sample image is white marble (face is bright, folds are shaded). The target effect is black glass (face is dark obsidian, folds catch bright caustic light). The sampler's particle distribution was the inverse of what black glass optical density required: the face was overcrowded with dots while the drapery had fewer particles.

---

## 3. Shader & Engine Fixes Applied

To bridge the gap, the following mathematical corrections were implemented in `src/lite/shaders.ts`:

1. **Face Isolation & Anatomical Reconstruction:**
   - Implemented a geometric and normal mask ($h.y \in [-0.02, 0.34], |h.x| < 0.16, n_z > 0.6$) that strictly zeroes out chromatic dispersion on the face, cheeks, and nose.
   - The face is rendered as deep obsidian glass with smooth key shading ($L_1, L_2$).

2. **Physically Aligned Rainbow Dispersion (`cabrSpectrum`):**
   - Implemented pure spectral rainbow dispersion using GLSL vector trigonometric mapping:
     ```glsl
     vec3 cabrSpectrum(float h) {
       vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
       vec3 p = abs(fract(vec3(h) + K.xyz) * 6.0 - vec3(K.w));
       return clamp(p - vec3(1.0), 0.0, 1.0);
     }
     ```
   - Aligned the dispersion phase with fold slope and light incidence:
     ```glsl
     float foldAngle = dot(n.xy, normalize(vec2(-0.7, 0.7))) * 0.5 + 0.5;
     float foldPhase = foldAngle * 0.85 + (zx * 2.5 - zy * 1.8) + h.x * 0.35;
     ```
     Slopes facing the light split into warm golden-amber, while sheltered slopes split into cyan, cobalt, and magenta.

3. **High-Exponent Specular Crests:**
   - Raised specular exponents to $95.0$ and $65.0$.
   - Highlights collapse into razor-sharp hairlines along the nose bridge, brow, cheekbone crest, and drapery peaks.

4. **Steep Silhouette Fresnel Rim:**
   - Fresnel falloff exponent increased to $4.5$ and gated by silhouette gradient ($|\nabla(dx, dy)|$), eliminating the cyan wash and preserving crisp silhouette definition.

5. **Point Size Expansion:**
   - Expanded point size to $1.7 \times \text{uPointPx}$ when `uCabr > 0.5`, enabling dark particles to overlap and coalesce into a smooth, glossy surface rather than discrete sand particles.

---

## 4. Technical Workarounds for Approaching 100% Reference Parity

| Workaround | Mechanism | Tradeoffs |
| :--- | :--- | :--- |
| **1. Point Size & Soft Splatting (Active)** | Expand `gl_PointSize` to $1.7\text{px} - 2.2\text{px}$ with soft circular falloff. | Eliminates black voids between dots; keeps WebGL2 performance at 60 FPS. |
| **2. 524k Particle GPU Sim Target** | Run on `master-studio` Three.js ping-pong texture engine with 524,288 particles. | $4\times$ higher particle density eliminates sparsity; requires WebGL2 float texture support. |
| **3. Bilateral Depth-Guided Post Filter** | Apply 2-pass cross-bilateral filter in `Post.ts` guided by the depth map. | Smooths discrete stipples into a continuous liquid glass sheet while preserving crisp silhouette edges. |
| **4. Instanced Quad Surface Rendering (Look 8)** | Render using screen-space quads or SDF raymarching instead of point particles. | Provides true raytraced volumetric refraction; departs from pure particle aesthetic. |

---

## 5. Verification

- **Automated Verification:** `scripts/verify-cabr.mjs` executes Playwright in headless Chromium, selects `sample-10.png`, switches to `GLASS` $\to$ `C-ABR`, and tests `FAITHFUL`, `SUBTLE`, and `EXPRESSIVE` presets with zero WebGL errors.
- **Unit Tests:** `npm test` passes all 39 tests across sampler, styles, palette, audio, and params.
- **Type Safety:** `npx tsc --noEmit` validates with zero TypeScript errors.
