---
name: effect-maker
description: Translate a paired source image and same-subject target-style image into a non-destructive effect for an existing image-to-particle system. Use when the user supplies two images, source first and style-transformed target second.
---

# Universal Effect Maker — Paired Image Edition

## Purpose

Translate the visual transformation between two related images into a reusable effect for the user's existing image-to-particle system.

- **IMAGE 1 — SOURCE:** authority for subject, shape, pose, proportions, silhouette, composition, and particle placement.
- **IMAGE 2 — TARGET STYLE:** ideally the same subject, pose, camera, crop, and composition, transformed into the desired design language. It is the authority for appearance: material, palette, lighting, texture, shading, reflections, edges, and atmosphere.

Example: Image 1 is a normal 3D dog render; Image 2 is the same dog in the same view, reimagined as polished chrome. Make the source dog's particles look chrome while retaining the source dog's structure.

**Never replace Image 1 with Image 2. Never copy Image 2's geometry, silhouette, pose, or particle positions into the source.**

## Input contract

- First attachment = SOURCE. Second attachment = TARGET STYLE.
- If only one image is supplied, ask for the missing image; do not guess.
- If roles are unclear with multiple images, ask one short question.
- The pair should depict the same subject. Matching pose, camera, crop, and scale make the comparison more reliable.
- If views differ, treat Image 2 as a style reference only. Do not warp Image 1 to force alignment. State that exact region correspondence is less reliable.

## Core rule: separate content from style

### Image 1 controls CONTENT

Preserve:
- Subject identity/category, geometry, silhouette, pose, proportions, and anatomy
- Camera, crop, perspective, and composition
- Important internal shapes, markings, and structural details
- Source-to-particle coordinate mapping
- Particle count, distribution, density, and topology unless explicitly asked to change them

### Image 2 controls STYLE

Extract:
- Colour palette and colour relationships
- Material appearance (metal, glass, liquid, ceramic, fabric, organic, etc.)
- Light direction, quality, intensity, and falloff
- Shadow treatment and tonal contrast
- Specular highlights and reflections
- Surface texture, roughness, grain, and micro-detail
- Edge/rim lighting, contours, bevels, and outlines
- Glow, bloom, atmosphere, and post-processing
- Stylisation level and rendering/detail character

**Apply Image 2's appearance to Image 1's content. Whenever they disagree, Image 1's geometry wins.**

## Workflow

### 1. Inspect the project

When project code is available:
- Locate source-image ingestion, particle sampling/mapping, particle geometry, renderer, existing effects, and controls.
- Identify the current framework and rendering path; reuse them.
- Determine available particle attributes (position, source UV, colour, size, depth, normal, velocity, etc.).
- Keep the particle engine intact. Do not replace it or introduce a new stack.

If code is unavailable, give a compact implementation-ready recipe. Do not claim to have implemented anything.

### 2. Analyse the pair

First check whether aspect ratio, crop, view, pose, orientation, and scale match.

If they match closely, compare corresponding subject regions to infer the visual transformation. If they do not, do not use pixel-to-pixel differencing; compare style at the material/subject level instead. Never deform the source to force correspondence.

Build two conceptual analyses:

**A. Source structure**
- Subject/foreground mask if available
- Silhouette and boundary map
- Luminance and local contrast
- Important internal edges and markings
- Semantic/material regions when useful (for example fur, eyes, nose, collar, background)
- Existing particle coverage and density

**B. Target appearance**
- Dominant/supporting colours and highlight/shadow colours
- Material response
- Lighting direction and softness
- Reflection and shading patterns
- Texture frequency and roughness
- Edge treatment
- Glow/atmosphere
- Detail and contrast characteristics

Describe the transformation as appearance changes applied to corresponding source regions, not as a replacement image.

### 3. Extract a compact transformation recipe

Translate visible differences into concrete rendering changes. Examples:
- Replace diffuse shading with a narrow specular response.
- Convert neutral highlights into cyan-white reflections.
- Deepen shadow regions while preserving their location.
- Add broad directional reflection bands.
- Apply subtle roughness variation.
- Add thresholded glow around bright regions only.

Do not invent physical properties that the image pair cannot support. Use real depth/normals only when available and reliable. Otherwise use stable 2D lighting, source gradients, density fields, masks, and reflection bands.

### 4. Apply the style to particles

Use the minimum existing renderer capabilities needed:
- Per-particle material/colour response
- Colour ramps and luminance remapping
- Directional light/reflection bands
- Source edge/silhouette masks
- Local contrast/detail preservation
- Optional depth/normal response only if reliable
- Separate highlight, edge-light, texture, and bloom passes when useful
- Animation only when requested or visibly required

Use Image 1's particle locations and source mapping to place the effect. Use Image 2 to infer appearance only.

### 5. Implement non-destructively

When code is available:
- Add the effect as an isolated, toggleable material/effect preset.
- Do not modify source pixels or particle geometry.
- Prefer GPU shader uniforms and cached analysis textures.
- Avoid per-frame CPU processing, duplicated pipelines, unnecessary dependencies, and large assets.
- Reuse shared utilities and existing controls.
- Add only controls that matter for this particular image pair.
- Keep geometry deformation off unless explicitly requested.
- Run available build/type-check/tests and report only checks actually performed.

If similar effects already exist, extend shared capabilities or create a preset/configuration rather than duplicate the renderer.

## Preservation defaults

- Particle coordinates: unchanged
- Source UV/pixel mapping: unchanged
- Particle count/topology: unchanged
- Source crop/aspect ratio: unchanged
- Silhouette/composition: unchanged
- Geometry displacement: off
- Generative reconstruction: off
- Glow/bloom: separate, thresholded pass
- Background: follow source unless a mask and explicit background treatment are available

The effect may change particle colour, brightness, material response, reflections, highlights, controlled opacity, and optional surface texture. Particle size changes must be optional and off unless essential to the target style.

Do not use face-specific rules. Protect important visual information generically through source edges, local contrast, silhouette, masks, and source luminance. This must work for animals, people, objects, products, architecture, and illustrations.

## Controls

Do not create an enormous control panel. Start with 4–8 primary controls; put secondary settings under Advanced. Choose only controls supported by the visual evidence in the pair.

Possible controls:
- Style strength / blend
- Palette strength, colour stops, hue, saturation
- Light direction and intensity
- Reflection direction, width, softness, intensity
- Highlight threshold, sharpness, and intensity
- Shadow depth and contrast
- Roughness, smoothness, or surface texture
- Edge/rim treatment
- Refraction or appearance distortion (never particle movement)
- Glow/bloom threshold, radius, and intensity
- Animation speed/phase
- Source-detail preservation
- Background/subject-mask influence
- Variation amount and seed

Use clear labels, meaningful ranges, and starting values inferred from the target. Do not add sliders with no visual purpose for this effect.

## Controlled variations

When useful, create 2–3 alternatives:
- **Faithful:** closest match to Image 2
- **Subtle:** same design language at lower intensity
- **Expressive:** stronger material/lighting while preserving source structure

Variation may change palette accents, light placement, reflection position, or texture. It must never change source geometry, particle positions/count, pose, or silhouette. Use a stable seed for reproducibility.

## Output behaviour

### If project code is available

Implement the effect and report briefly:
- Effect name
- How Image 1 content and Image 2 appearance were interpreted
- What was implemented
- Controls/presets added
- Files changed
- Build/test status
- Genuine remaining limitations

Do not produce a long specification or separate large document unless asked.

### If only the image pair is available

Return a concise recipe:

**Source:** structure to preserve.
**Target style:** appearance extracted from Image 2.
**Transformation:** concrete appearance changes.
**Particle implementation:** minimal shader/material/rendering approach.
**Controls:** 4–8 relevant controls with suggested values/ranges.
**Preservation:** geometry/detail safeguards.
**Uncertainty:** any view/pose/crop mismatch that limits correspondence.

Do not claim the simulator was modified unless its project code was actually changed.

## Quality checks

Before finishing, verify:
1. Image 1 remains authority for subject, pose, proportions, silhouette, and composition.
2. Image 2's design language is recognisable.
3. The result translates appearance rather than replacing the source with Image 2.
4. Particle coordinates, count, and mapping remain unchanged by default.
5. Important details and negative spaces remain readable.
6. Reflections/highlights/texture/glow are coherent, not random noise.
7. The method works for non-human subjects.
8. The implementation reuses the existing particle system and stays lightweight.
9. The effect can be toggled, adjusted, and reset independently.

## Invocation reminder

**Image 1 = what must stay the same.**
**Image 2 = how it should look.**

Apply Image 2's visual language to Image 1's existing particle representation. Preserve Image 1's geometry.
