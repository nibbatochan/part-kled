# Research Report: High-Fidelity Particle Disintegration & Disappearing Effect

**Target Reference:** `docs/reference/ref-target-trail.png`  
**Authoritative Specification:** `C:\Users\suman\Downloads\Particle Depth Studio — Build Documentation.md` (Sections 6, 8.4, 8.5, 9)  
**Investigation Framework:** Primary Source Research (`mattpocock-research` skill) & Karpathy Behavioral Guidelines

---

## 1. Executive Summary & Root Cause Analysis

Visual comparison between the reference screenshot `ref-target-trail.png` (Goku's right half dissolving into horizontal silk-like vapor filaments streaming into blackness) and the current simulation reveals three distinct physical and architectural gaps:

1. **Missing Ping-Pong Trail Accumulation Render Target (`tTrail`)**:
   - *Primary Source:* PRD Section 8.5:
     > *"Trails: render the scene into a half-resolution render target that is multiplied by 0.94 each frame (a full-screen quad with `rgba(0,0,0,.06)`), then composite it over the live frame. TRAILS off clears the target."*
   - *Current Implementation:* `ParticleRenderer.ts` was only rendering the scene directly to the canvas in a single pass. When `trails` was toggled, it only showed `streakMesh`, leaving no optical persistence. Without temporal feedback accumulation, particles appeared as discrete moving dots rather than velvety, continuous streaming smoke/vapor.

2. **Spatially Anisotropic Peeling (Laminar Wind Directional Peel vs. Random Swiss-Cheese Void)**:
   - *Current Implementation:* `sim_velocity.glsl` selected peeling particles using a uniform random test `seed < peelThreshold`. This caused particles everywhere across Goku's face, chest, and arms to pop out and disintegrate uniformly.
   - *Reference Reality:* The windward (left) side of the subject is completely solid and intact. Only the downwind trailing edges (right arm, shoulder, hair, aura) peel off into the slipstream.
   - *Fix:* Weight peeling probability by spatial projection along the wind vector $\vec{L}_{\text{unit}} = \mathbf{uLine} / \|\mathbf{uLine}\|$:
     $$u_{\text{wind}} = \mathbf{home} \cdot \vec{L}_{\text{unit}}$$
     $$P_{\text{peel}} = \text{smoothstep}(-0.15, 0.40, u_{\text{wind}} + \text{snoise}(\mathbf{home} \cdot 3.5) \cdot 0.12) \cdot (0.10 + 0.65 \cdot \mathbf{uDrift})$$

3. **Laminar Streamlines vs. Chaotic 3D Turbulence**:
   - *Current Implementation:* Ash particles experienced large 3D isotropic curl noise and vertical thermal buoyancy, making them scatter like a swarm of insects.
   - *Reference Reality:* Streamlines are strictly directional and laminar along $\vec{L}$ ($\sim 90\%$ velocity along the line vector, with gentle perpendicular flutter $\le 10\%$).

4. **Dynamic Velocity Extrusion for Streaks & Soft Gaussian Point Sprites**:
   - In `streak.vert.glsl`, extrude vertex 1 backwards along the actual dynamic particle velocity vector $(-\mathbf{v} \cdot \Delta t \cdot \text{scale})$ rather than a static 2D angle, fading alpha to 0 at the tail.
   - In `particle.frag.glsl`, replace the hard step disc with a soft Gaussian intensity profile $\exp(-3.5 \cdot r^2)$ with 4×4 Bayer ordered dithering to eliminate dark gradient banding.

---

## 2. Technical Architecture Blueprint

```
+-------------------------------------------------------------+
|                  GPGPU Particle Simulation                  |
|    sim_position.glsl (Lifecycle, Extinction & Respawn)       |
|    sim_velocity.glsl (Laminar Wind & Spatial Peeling)       |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                     Scene Geometry Pass                     |
|  - THREE.Points (Soft Gaussian Sprites)                     |
|  - THREE.LineSegments (Dynamic Velocity Extruded Streaks)   |
|  Rendered into full-resolution rtScene (HalfFloatType)      |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|             Ping-Pong Trail Feedback Accumulation           |
|  Half-resolution rtTrailA & rtTrailB (HalfFloatType)        |
|  Accumulation: accum = prior * 0.94 + current               |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                       Composite Pass                        |
|  Full-screen quad combining rtScene + rtTrail with Bayer    |
|  ordered dither, outputting directly to HTMLCanvasElement   |
+-------------------------------------------------------------+
```

---

## 3. Primary Citations
- PRD: `C:\Users\suman\Downloads\Particle Depth Studio — Build Documentation.md` (Sections 6, 8.4, 8.5)
- Three.js WebGL2 HalfFloatType Render Targets (`THREE.HalfFloatType`, `THREE.RGBAFormat`)
- Reference: `docs/reference/ref-target-trail.png` (high-speed particle slipstream)
