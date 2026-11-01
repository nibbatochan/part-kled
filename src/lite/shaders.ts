// src/lite/shaders.ts
// Stateless particle motion. Nothing is simulated: every particle's position is a pure function of
// (home, light, hash(id), time), so there are no framebuffers, no ping-pong and no per-frame uploads.
// The scan bands come from the studio's own GLSL (src/shaders/lifecycle.ts), so both builds agree.
import { LIFECYCLE_GLSL } from '../shaders/lifecycle';

const VERSION = `#version 300 es
precision highp float;
precision highp int;
`;

const DECLS = `
layout(location = 0) in vec3 aHome;   // world x, y (height = 1), z depth -0.5..0.5
layout(location = 1) in vec4 aMeta;   // rgb colour, a = density gain / 5 (undoes importance-sampling bias)
layout(location = 2) in vec3 aHome2;  // MORPH: the arriving picture's home (same particle index)
layout(location = 3) in vec4 aMeta2;  // MORPH: the arriving picture's colour

uniform vec2 uView;       // drawing buffer size, px
uniform float uScale;     // px per world unit
uniform vec2 uOffset;     // px, picture centre relative to canvas centre (y up)
uniform float uTime;
uniform float uDrift;     // FLOW: 0..1
uniform float uDepth;     // RELIEF: 0..1
uniform float uSpeed;     // 1 = default
uniform vec2 uDir;        // drift direction (unit) * strength factor
uniform float uLean;      // -1..1 which side of the picture the streamers come from
uniform float uHalfW;     // half the picture width in world units
uniform float uRandom;    // 0..1 randomness of the path (direction and distance per particle)
uniform float uTrailSize; // dot size of drifting particles, multiplier of the picture dot
uniform float uTrailAngle; // radians, trail direction turned away from the drift path
uniform float uPSat;      // particle saturation, 1 = as sampled
uniform vec2 uLook;       // PAN: cursor tilt, already scaled by the pan amount and style
uniform vec2 uSway;       // idle camera sway, not affected by PAN
uniform vec2 uPtr;        // pointer in world units
uniform float uPtrOn;     // TRACK on and the cursor is over the stage
uniform vec2 uPtrVel;     // pointer velocity, world units per second (clamped on the CPU)
uniform float uTrackOld;  // 1 = OLD track (repel + follow the motion), 0 = SOFT track (gentle push)
uniform vec4 uBurst;      // click burst: x, y (world), age (s), amplitude (0 when done)
uniform float uCover;     // expected dots per pixel over the subject
uniform float uPointPx;
uniform float uBright;
uniform float uTrailLen;
uniform float uTrailGain;
uniform float uTrailAmount; // 0..1 share of streaks kept
uniform float uTrailDetail; // 0 soft glow .. 1 crisp taper
uniform vec3 uLightCol;
uniform float uLightOn;
uniform float uScanOn;
uniform float uScan;        // 0..1 position of the band
uniform float uScanMode;    // 0 SWEEP, 1 RING, 2 RADAR, 3 LINES, 4 DEPTH
uniform vec2 uScanCenter;   // where the user last clicked
uniform float uZScale;
uniform float uOpacity;     // picture only, trails are not dimmed
uniform float uMorph;       // 0..1 progress of the morph into the next picture
uniform float uRole;        // 0 normal, 3 morphing
uniform float uDolly;       // 3D: move through the picture (camera distance)
uniform float uLoop;        // export loop length in s, 0 = not looping
uniform float uTrailFade;   // 0..1 trails fade in while a new picture morphs in
uniform float uLineW;      // trail width in px: 1 = plain GL lines, wider = quads (export at a larger size)
uniform float uEmitW[9];   // EMITTERS: how much each region of the picture sheds (3 x 3, top left first)
uniform vec4 uEmitX;       // EMITTERS: spots, scatter, length variety, turn
uniform float uEmitOn;
uniform sampler2D uImg;     // the picture on screen: rgb colour, a = depth (cell looks and the PULSE scan)
uniform sampler2D uImg2;    // the picture arriving (cell looks)
uniform vec2 uTexSize;      // picture texture size, px
uniform float uHasImg;      // 1 when uImg holds a picture
uniform float uChrome;      // METAL filter on the dots: 1 on, 0 off
uniform float uChromeBevel; // CHROME: 0..1 how steep the edges bevel
uniform float uChromeShine; // CHROME: 0..1 strength of the highlights
uniform float uChromeHue;   // CHROME: hue turn, radians
uniform float uChromeDepth; // CHROME: 0..1 how much the depth shapes the surface
uniform float uPrism;       // PRISMATIC filter on the dots: 1 on, 0 off
uniform float uPrismLen;    // PRISMATIC: 0..1 reach of the streaks
uniform float uPrismSpread; // PRISMATIC: 0..1 how far the rainbow stretches
uniform float uPrismGlow;   // PRISMATIC: 0..1 strength of the light
uniform float uPrismThr;    // PRISMATIC: 0..1 brightness where the light starts
uniform float uAura;        // AURA filter on the dots: 1 on, 0 off
uniform float uAuraGlow;    // AURA: 0..1 strength of the glow
uniform float uAuraReach;   // AURA: 0..1 how far the glow reaches
uniform float uAuraCore;    // AURA: 0..1 how far the bright parts turn white
uniform float uAuraTint;    // AURA: 0..1 white (0) to ice blue (1)
uniform float uEcstasy;     // ECSTASY filter on the dots: 1 on, 0 off
uniform float uEcsTint;     // ECSTASY: 0..1 the picture's colour (0) to blue resin (1)
uniform float uEcsDepth;    // ECSTASY: 0..1 how far the navy shadows reach
uniform float uEcsGlow;     // ECSTASY: 0..1 light from within the body
uniform float uEcsCore;     // ECSTASY: 0..1 how far the lit parts turn pale
uniform float uBlight;      // BLIGHT filter on the dots: 1 on, 0 off
uniform float uBlSpread;    // BLIGHT: 0..1 how far the grey haze bleeds out
uniform float uBlGrain;     // BLIGHT: 0..1 speckle and ragged edge
uniform float uBlInk;       // BLIGHT: 0..1 how far the black ink reaches
uniform float uBlHaze;      // BLIGHT: 0..1 strength of the grey wash
uniform float uRedmet;      // REDMET filter on the dots: 1 on, 0 off
uniform float uRmHeat;      // REDMET: 0..1 how far the picture takes the red sky
uniform float uRmRim;       // REDMET: 0..1 white rim highlights on edges
uniform float uRmBevel;     // REDMET: 0..1 how far the slopes tilt the surface
uniform float uConv;        // CONVULSIONS filter on the dots: 1 on, 0 off
uniform float uCvLine;      // CONVULSIONS: 0..1 weight of the contour lines
uniform float uCvHatch;     // CONVULSIONS: 0..1 strength of the hatch strokes
uniform float uCvJitter;    // CONVULSIONS: 0..1 wobble in the strokes
uniform float uLined;         // LINED filter on the dots: 1 on, 0 off
uniform float uLinedCount;    // LINED: lines across the picture height
uniform float uLinedWeight;   // LINED: 0..1 how wide the lines grow where the picture is bright
uniform float uLinedContrast; // LINED: 0..1 how much the brightness stretches the line width
uniform float uBlood;         // BLOOD SHADOW filter on the dots: 1 on, 0 off
uniform float uBloodShift;    // BLOOD SHADOW: 0..1 how far the red plate sits off register
uniform float uBloodBleed;    // BLOOD SHADOW: 0..1 how far the red reaches into the mid tones
uniform float uBloodGrain;    // BLOOD SHADOW: 0..1 ink grain and ragged plate edges
uniform float uShake;         // SHAKE-MASK filter on the dots: 1 on, 0 off
uniform float uShSmear;       // SHAKE-MASK: 0..1 how far the photo is smeared sideways
uniform float uShCover;       // SHAKE-MASK: 0..1 how much of the picture the letters cover
uniform float uShPatch;       // SHAKE-MASK: 0..1 scattered letters (low) to large patches (high)
uniform sampler2D uAtlas;     // glyph atlas (see glyphs.ts): row 3 holds the letters of the SHAKE-MASK word
uniform float uGridA;      // 1 while drawing the resting cells of a cell look (no shimmer, so cells stay edge to edge)
// MUSIC looks: the sound moves the particles themselves (0 = off, 1 EQUALIZER, 2 LISTEN, 3 BLOOM, 4 RIPPLE)
uniform float uMusic;
uniform float uBands[32];  // 32 log-spaced bands of the sound, 0..1, smoothed on the CPU
uniform float uBeat;       // 1 on a beat, decaying
uniform float uLevel;      // overall loudness, 0..1
uniform float uBass;       // bass, 0..1
uniform float uAmt;        // 0..1 how far EQUALIZER, BLOOM and RIPPLE move (the AMOUNT slider and reduced motion applied)
uniform float uMotion;     // MOTION effect: 0 off, 1 STARDUST, 2 BREAKDOWN, 3 DISAPPEAR, 4 COSMIC
uniform float uMotionAmt;  // 0..1 how strong
uniform float uMotionSpeed; // 0.2..2 how fast one cycle runs

out vec3 vCol;

// EMITTERS: the 3 x 3 region weights, blended smoothly across the picture so there are no visible blocks
float regionWeight(vec2 h) {
  vec2 g = vec2(clamp(h.x / max(uHalfW, 1e-3) * 0.5 + 0.5, 0.0, 1.0), clamp(0.5 - h.y, 0.0, 1.0)) * 2.0;
  int x0 = int(min(floor(g.x), 1.0));
  int y0 = int(min(floor(g.y), 1.0));
  vec2 f = g - vec2(float(x0), float(y0));
  int i = y0 * 3 + x0;
  return mix(mix(uEmitW[i], uEmitW[i + 1], f.x), mix(uEmitW[i + 3], uEmitW[i + 4], f.x), f.y);
}

// LOOP: an angular frequency snapped to whole cycles per loop, so frame 0 and frame T match
float tw(float w, float minCycles) {
  if (uLoop <= 0.0) return w;
  float tau = 6.2831853;
  return tau * max(minCycles, floor(w * uLoop / tau + 0.5)) / uLoop;
}

uint hashu(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float rnd(uint id, uint salt) {
  return float(hashu(id * 747796405u + salt * 2891336453u)) * (1.0 / 4294967296.0);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 partSat(vec3 c) { return clamp(mix(vec3(luma(c)), c, uPSat), 0.0, 1.0); }

// MUSIC looks. Each dot's own random numbers decide which band or waveform column it follows, so the
// picture itself shows the sound. Positions depend only on uniforms and the dot's id: nothing is stored.
vec2 musicMove(uint id, vec2 h, vec2 p, float r2, float rA, float rB, float rC) {
  float xn = clamp(h.x / max(uHalfW, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
  int col = int(clamp(floor(xn * 32.0), 0.0, 31.0));
  float d = length(h);
  vec2 rad = d > 1e-4 ? h / d : vec2(0.0);
  vec2 q = p;
  if (uMusic < 1.5) {
    // EQUALIZER: each column lifts its own share of dots, a louder band lifts more of them. Height follows AMOUNT.
    float b = uBands[col];
    q.y += step(rA, b) * b * 0.08 * uAmt * (0.4 + 0.6 * r2);
  } else if (uMusic < 2.5) {
    // LISTEN: each dot follows one random band and swells with it
    float b = uBands[int(clamp(floor(rB * 32.0), 0.0, 31.0))];
    q *= 1.0 + b * 0.16;
  } else if (uMusic < 3.5) {
    // BLOOM: on every beat the dots nudge outward, only near their place, and fall back
    float s = uBeat * uAmt * (0.4 + 0.6 * rC) * 0.06 * exp(-d * 1.2);
    q += rad * s;
  } else if (uMusic < 4.5) {
    // RIPPLE: one ring travels out from the middle, moving only the dots it passes
    float ringR = fract(uTime * 0.25) * 1.1;
    float env = smoothstep(0.0, 0.1, ringR) * (1.0 - smoothstep(0.9, 1.1, ringR));
    q += rad * exp(-pow((d - ringR) / 0.07, 2.0)) * env * uLevel * uAmt * 0.05;
  }
  return q;
}

// World position and opacity of one particle; sOff pulls it back along its own path (trail tails).
vec2 place(uint id, vec3 home, float light, float sOff, float shareMul, out float alpha, out float streaming, out vec2 dirOut) {
  float r0 = rnd(id, 1u);
  float r1 = rnd(id, 2u);
  float r2 = rnd(id, 3u);
  float r3 = rnd(id, 4u);
  float r4 = rnd(id, 8u); // path randomness: direction

  // LEAN: the chance to stream depends on where the particle sits across the picture.
  // Lean right: most streamers come from the right side; lean left: from the left. A floor keeps
  // some streamers on the far side, and brightness (lw) still decides the rest.
  float xn = clamp(home.x / max(uHalfW, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
  float origin = (0.12 + exp(uLean * 8.0 * (xn - 0.5))) / 1.12;

  // Bright parts of the picture shed more particles: light weighting
  float lc = min(light, 0.7); // the brightest specks (eyes) do not get to shed more
  float lw = 0.2 + 1.6 * lc * lc;
  float emitK = 1.0;
  if (uEmitOn > 0.5) {
    emitK = regionWeight(home.xy);
    // SPOTS: a few small patches of the picture shed far more, the brighter the patch the more
    ivec2 gc = ivec2(floor(home.xy * 18.0));
    float spot = step(0.88, rnd(uint(gc.x) * 73856093u ^ uint(gc.y) * 19349663u, 21u));
    emitK *= 1.0 + uEmitX.x * 8.0 * spot * smoothstep(0.35, 0.8, light);
  }
  float share = clamp((0.02 + 0.55 * uDrift) * lw * 0.5 * shareMul * origin * emitK, 0.0, 0.95);
  bool streamer = r0 < share;

  vec2 pos = home.xy;
  alpha = 1.0;
  streaming = 0.0;

  if (streamer) {
    float cycle = (5.0 + 5.0 * r2) / max(uSpeed, 0.05);
    // LOOP: whole streamer cycles per loop (1 or more), so the last frame meets the first
    float age = uLoop > 0.0 ? fract(fract(uTime / uLoop * max(1.0, floor(uLoop / cycle + 0.5))) + r1) : fract(uTime / cycle + r1);
    float rest = 0.30;
    float s = clamp((age - rest) / (1.0 - rest) + sOff, 0.0, 1.0);
    float ease = pow(s, 1.4);

    // PATH RANDOMNESS: each streamer turns a little off the drift direction and goes its own distance
    float ang = (r4 - 0.5) * uRandom * 1.2;
    float ca = cos(ang), sa = sin(ang);
    vec2 dir = vec2(uDir.x * ca - uDir.y * sa, uDir.x * sa + uDir.y * ca);
    // Reach also sets the trail: a trail is the same path, a little further back. Max about 2 picture heights at full flow.
    float reach = (0.4 + 1.6 * uDrift) * mix(1.0, 0.45 + 1.1 * r3, uRandom);
    vec2 perp = vec2(-dir.y, dir.x);
    pos += dir * reach * ease;
    // SCATTER: the start of the path is not the exact pixel; each particle leaves from a slightly different place
    pos += (vec2(rnd(id, 13u), rnd(id, 14u)) - 0.5) * uEmitX.y * 0.05 * ease * step(0.5, uEmitOn);
    // Streamlines: the bend depends on where the particle starts, so neighbours curve together
    float flow = dot(home.xy, vec2(5.3, 3.7)) + uTime * tw(0.25, 0.0);
    pos += perp * (sin(s * 4.0 + flow) * 0.05 + sin(s * 9.0 + flow * 1.7) * 0.015) * uDrift * s * (0.6 + r3);

    alpha = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.35, 1.0, s));
    // Streaks fade out before they leave the picture's neighbourhood
    // Streaks fade only far out, so drifting particles can travel past the canvas edges
    alpha *= 1.0 - smoothstep(1.2, 2.0, length(dir * reach * ease));
    dirOut = normalize(dir);
    streaming = smoothstep(0.0, 0.12, s); // 0 on the picture, 1 once drifting (smooth, so colour blends)
  }

  // Tiny shimmer so the held picture is alive
  pos += 0.0015 * (0.3 + uDrift) * (1.0 - uGridA) * vec2(sin(uTime * tw(0.9, 1.0) + r1 * 40.0), cos(uTime * tw(0.7, 1.0) + r2 * 40.0));

  // TRACK. OLD: repel from the cursor and follow its motion (the earlier behaviour).
  // SOFT: a gentle push (the later behaviour).
  vec2 dq = pos - uPtr;
  float dl = length(dq);
  vec2 away = dq / max(dl, 1e-4);
  if (uTrackOld > 0.5) {
    float fall = uPtrOn * exp(-(dl * dl) / 0.0625);
    pos += away * fall * 0.06 + clamp(uPtrVel, -2.0, 2.0) * fall * 0.05;
  } else {
    float f = uPtrOn * smoothstep(0.14, 0.0, dl);
    pos += away * f * f * 0.03;
  }

  // Click burst (BURST scan style): a ring that travels outward and pushes what it passes
  vec2 bq = pos - uBurst.xy;
  float bl = length(bq);
  float ring = (bl - uBurst.z * 0.9) / 0.06;
  pos += bq / max(bl, 1e-4) * uBurst.w * exp(-ring * ring) * 0.05;

  // MUSIC looks (after the other motion, so they act on the final position)
  if (uMusic > 0.5) {
    float rB = rnd(id, 31u);
    pos = musicMove(id, home.xy, pos, r3, r0, rB, r4);
  }

  // MOTION effects: one cycle per loop. STARDUST and BREAKDOWN let a share of the particles or cells go; DISAPPEAR and
  // COSMIC act on all of them. Every look moves, cell looks included.
  if (uMotion > 0.5) {
    float cyc = uLoop > 0.0 ? max(1.0, floor(uLoop * uMotionSpeed * 0.25 + 0.5)) / uLoop : uMotionSpeed * 0.25;
    float ph = fract(uTime * cyc);
    float amt = uMotionAmt;
    vec2 outDir = vec2(cos(r1 * 6.2831853), sin(r1 * 6.2831853));
    float live = 1.0;
    if (uMotion < 1.5) {
      // STARDUST: a share of the particles lifts off, drifts up and out, twinkles, and fades; each on its own cycle
      float pick = step(r0, amt * 0.7) * live;
      float age = fract(ph + r2);
      pos += pick * (outDir * (0.05 + 0.35 * r3) + vec2(0.0, 0.12)) * pow(age, 0.8) * amt;
      alpha *= mix(1.0, (1.0 - age) * (0.55 + 0.45 * sin(uTime * 14.0 + r4 * 50.0)), pick);
      streaming = max(streaming, pick * smoothstep(0.0, 0.1, age));
    } else if (uMotion < 2.5) {
      // BREAKDOWN: a front sweeps across the picture; behind it the particles fall away and fade
      float x01 = clamp(home.x / max(uHalfW, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
      float t = clamp((ph * 1.6 - 0.3 - x01) / 0.35 - r2 * 0.4, 0.0, 1.0) * live;
      float fall = t * t;
      pos += vec2(outDir.x * 0.3 + 0.4 * t, outDir.y * 0.2 - 0.5) * fall * amt;
      alpha *= 1.0 - smoothstep(0.55, 1.0, t);
      streaming = max(streaming, smoothstep(0.0, 0.1, t));
    } else if (uMotion < 3.5) {
      // DISAPPEAR: particles drop out in a random order, then come back
      float tri = abs(ph * 2.0 - 1.0);
      float cut = (1.0 - tri) * amt;
      alpha *= smoothstep(cut - 0.06, cut + 0.06, r2);
    } else {
      // COSMIC: space bends around the middle, a slow swirl and a ripple that travels out
      float d = length(pos);
      float a = amt * 1.2 * exp(-d * 1.8) * sin(6.2831853 * ph);
      float ca2 = cos(a), sa2 = sin(a);
      pos = vec2(pos.x * ca2 - pos.y * sa2, pos.x * sa2 + pos.y * ca2);
      pos *= 1.0 + amt * 0.08 * sin(d * 10.0 - 12.566 * ph) * exp(-d * 0.8);
    }
  }

  return pos;
}

// Tilt the whole picture like a card in 3D: depth pushes near parts toward the viewer.
vec4 toClip(vec2 world, float z) {
  vec3 p = vec3(world, z * 0.45 * uDepth);
  float yaw = uLook.x + uSway.x * 0.14;      // uLook holds the angles (PAN cursor tilt or ORBIT drag)
  float pitch = -(uLook.y + uSway.y * 0.09);
  float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch);
  vec3 q = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  q = vec3(q.x, q.y * cp - q.z * sp, q.y * sp + q.z * cp);
  float zc = q.z + uDolly;
  float persp = 1.0 / (1.0 - zc * 0.5);
  vec2 px = q.xy * persp * uScale + uOffset;
  return vec4(px / (uView * 0.5), 0.0, 1.0);
}

// Light tint: the picture's bright parts take the chosen colour (same rule as the studio)
vec3 tint(vec3 c) {
  if (uLightOn < 0.5) return c;
  return mix(c, uLightCol, clamp(luma(c) * 0.4, 0.0, 0.55));
}

// PULSE: light glancing off the picture. A light circles the picture; where the surface (the depth map) turns
// to face it and the picture is bright, it flashes, and a soft sheet of light sweeps along the light's direction
// over the bright parts. Dark parts stay dark. Returns 0..1.
float glint(vec2 h, float lum) {
  float lit = smoothstep(0.15, 0.8, lum);
  float a = uTime * tw(0.7, 1.0);
  vec2 ld = vec2(cos(a), sin(a));
  float spec = 0.0;
  if (uHasImg > 0.5) {
    vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
    vec2 e = 2.0 / uTexSize;
    float zx = textureLod(uImg, uv + vec2(e.x, 0.0), 1.0).a - textureLod(uImg, uv - vec2(e.x, 0.0), 1.0).a;
    float zy = textureLod(uImg, uv + vec2(0.0, e.y), 1.0).a - textureLod(uImg, uv - vec2(0.0, e.y), 1.0).a;
    // depth change per picture height, as a slope of the relief (y is flipped: the texture runs downward)
    float k = 0.45 * max(uDepth, 0.3) * uTexSize.y * 0.5 * 0.25;
    vec3 n = normalize(vec3(-zx * k, zy * k, 1.0));
    vec3 l = normalize(vec3(ld * 0.9, 0.75));
    vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));
    spec = pow(max(dot(n, hv), 0.0), 40.0);
  }
  // The sheet: a band of light moving along the light's direction, only where the picture is bright
  float sheet = pow(0.5 + 0.5 * sin(dot(h, ld) * 5.0 - uTime * tw(1.6, 1.0)), 6.0);
  return clamp(spec * 1.6 + sheet * 0.5, 0.0, 1.0) * lit;
}

// METAL: a chrome finish on the dots. Only the picture makes the surface: its fine detail tilts it (a slope of
// the brightness) and its depth gives the broad curve. Flat areas stay flat, so they keep the picture's colour and
// brightness, and the light catches only edges and details. Black stays black. No cells and no settings.
vec3 chromeFinish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  // The slope is taken from a softened copy of the picture (mip level 2, wide taps), so a dot's
  // normal follows a feature's shape instead of its single-texel noise: sheets, not speckle.
  vec2 e = 4.0 / uTexSize;   // the fine slope: a feature a few dots wide
  vec2 f = 8.0 / uTexSize;   // the broad curve from depth
  float dx = luma(textureLod(uImg, uv + vec2(e.x, 0.0), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(e.x, 0.0), 2.0).rgb);
  float dy = luma(textureLod(uImg, uv + vec2(0.0, e.y), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(0.0, e.y), 2.0).rgb);
  float zx = textureLod(uImg, uv + vec2(f.x, 0.0), 2.0).a - textureLod(uImg, uv - vec2(f.x, 0.0), 2.0).a;
  float zy = textureLod(uImg, uv + vec2(0.0, f.y), 2.0).a - textureLod(uImg, uv - vec2(0.0, f.y), 2.0).a;
  float k = uChromeBevel * 6.0;                                     // BEVEL: how far the slopes tilt the surface
  float kz = uChromeDepth * 2.0;                                    // DEPTH: weight of the broad curve
  vec3 n = normalize(vec3(-(dx + zx * kz) * k, (dy + zy * kz) * k, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.6, 0.66));                       // light from the top left
  float sky = smoothstep(-0.2, 0.9, dot(n, L));
  vec3 hue = c / max(max(c.r, max(c.g, c.b)), 1e-3);
  vec3 steel = mix(vec3(0.02, 0.05, 0.12), vec3(0.36, 0.72, 1.0) * mix(vec3(1.0), hue, 0.5), sky);
  float lum = luma(c);
  // Chrome's bright horizon band: a narrow reflection where the surface turns to the sky line
  float band = exp(-pow((n.y * 0.5 + 0.5 - 0.62) / 0.09, 2.0));
  float hot = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 24.0);
  float glint = (hot + 0.6 * band) * smoothstep(0.05, 0.35, lum);
  vec3 metal = steel * lum * 1.2 + vec3(0.9, 0.95, 1.0) * glint * uChromeShine * 2.0;   // SHINE scales the highlights
  return clamp(metal * smoothstep(0.03, 0.2, lum), 0.0, 1.0);   // near-black picture stays black
}

// PRISMATIC: a starburst of light, from a bright white core at the centre of the picture. Seven sharp rays run out
// from it, each one fading with distance. The red, green and blue rays sit at slightly different angles, so every
// ray fringes into a rainbow. The core size is set by THRESHOLD. It is a light layer over the dots, so the particles
// keep their positions and colour.
vec3 prismaticFinish(vec2 h, vec3 c) {
  float r = length(h);                                    // distance from the centre; the picture is 1 unit tall
  float a = atan(h.y, h.x);
  float fr = uPrismSpread * 0.12;                         // rainbow fringe: how far the colours part, in radians
  float reach = mix(1.5, 6.0, uPrismLen);                 // LENGTH: how far the rays carry before they fade
  float fall = exp(-r * reach);
  vec3 ray = vec3(
    pow(0.5 + 0.5 * cos(7.0 * (a - fr)), 24.0),
    pow(0.5 + 0.5 * cos(7.0 * a), 24.0),
    pow(0.5 + 0.5 * cos(7.0 * (a + fr)), 24.0));
  float core = exp(-r * r / (0.001 + uPrismThr * 0.01));  // white-hot centre
  vec3 light = (ray * fall + vec3(core)) * uPrismGlow * 1.2;
  return clamp(c + light, 0.0, 1.0);
}

// AURA: a figure that glows. The bright parts turn white at the core and throw a soft ice-blue glow over the dark
// ground. The glow reads a blurred copy of the picture, so its reach follows the picture's own shape. Dark stays dark
// away from the picture. A light layer over the dots: positions and count are unchanged.
vec3 auraFinish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  float lum = luma(c);
  float lod = mix(1.0, 6.0, uAuraReach);                       // REACH: a blurrier copy reaches further
  float soft = luma(textureLod(uImg, uv, lod).rgb);
  vec3 ice = mix(vec3(1.0), vec3(0.45, 0.72, 1.0), uAuraTint); // TINT: white to ice blue
  vec3 white = mix(c, vec3(1.0), smoothstep(0.35, 1.0, lum) * uAuraCore);
  vec3 glow = ice * soft * uAuraGlow * 1.5 * (1.0 - lum * 0.5);
  return clamp(white + glow, 0.0, 1.0);
}

// ECSTASY: a translucent blue resin figure. The picture's light is mapped onto a blue ramp: navy shadows, azure mid
// tones and pale white where it is lit most. A blurred copy of the picture glows from inside the body, and only where
// the picture has light, so the ground stays dark. A light layer over the dots: positions and count are unchanged.
vec3 ecstasyFinish(vec2 h, vec3 c) {
  float lum = luma(c);
  float present = smoothstep(0.03, 0.15, lum);
  float s = clamp((lum - 0.5) * (1.0 + 2.0 * uEcsDepth) + 0.5, 0.0, 1.0);  // DEPTH: more contrast, deeper navy
  vec3 navy = vec3(0.02, 0.10, 0.34);
  vec3 azure = vec3(0.05, 0.58, 1.0);
  vec3 pale = vec3(0.88, 0.96, 1.0);
  vec3 resin = mix(mix(navy, azure, smoothstep(0.0, 0.6, s)), pale, smoothstep(0.6, 1.0, s) * uEcsCore);
  vec3 col = mix(c, resin * present, uEcsTint);                            // TINT: the picture's colour to resin
  float inner = lum;
  if (uHasImg > 0.5) {
    vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
    inner = luma(textureLod(uImg, uv, 3.0).rgb);                           // a softened copy: the light inside the body
  }
  vec3 glow = azure * inner * uEcsGlow * 0.8 * present * (1.0 - lum * 0.6);
  return clamp(col + glow, 0.0, 1.0);
}

// REDMET: polished metal mirroring a red sky. The slopes of the picture's brightness give each dot a tilt: edges
// catch white rim light, and the flat body takes the colour of the red sky above it, deepening to dark at the top.
// Black stays black. Only colour changes: dots keep their place and count.
vec3 redmetFinish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  vec2 e = 4.0 / uTexSize;
  float dx = luma(textureLod(uImg, uv + vec2(e.x, 0.0), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(e.x, 0.0), 2.0).rgb);
  float dy = luma(textureLod(uImg, uv + vec2(0.0, e.y), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(0.0, e.y), 2.0).rgb);
  float edge = clamp(length(vec2(dx, dy)) * uRmBevel * 6.0, 0.0, 1.0);   // BEVEL: how strongly slopes read as edges
  float lum = luma(c);
  float present = smoothstep(0.03, 0.2, lum);
  float sky = clamp(1.0 - uv.y, 0.0, 1.0);                               // the red sky: deep at the top, pale at the bottom
  vec3 red = mix(vec3(0.55, 0.06, 0.03), vec3(1.0, 0.22, 0.10), sky);
  vec3 mirror = red * (0.35 + 0.65 * lum);
  vec3 col = mix(c, mirror, uRmHeat);                                    // HEAT: the metal takes the red sky
  col += vec3(1.0, 0.95, 0.9) * smoothstep(0.1, 0.6, edge) * uRmRim;     // RIM: white light on the edges
  return clamp(col * present, 0.0, 1.0);
}

// CONVULSIONS: the inside of a butterfly wing. The picture is split into irregular cells, like the membrane between
// veins. Each cell edge is a dark vein, heavier where the picture is dark. Inside each cell, fine wavy striations run
// parallel to that cell's own direction, so every membrane has its own grain. JITTER sets how irregular the cells
// are. Paper stays cream. Only colour changes: dots keep their place and count.
vec2 cvHash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
vec3 convulsionsFinish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  float present = smoothstep(0.015, 0.07, max(c.r, max(c.g, c.b)));
  float dark = 1.0 - smoothstep(0.1, 0.8, luma(textureLod(uImg, uv, 1.0).rgb));
  // Cells: a grid of feature points, 10 cells per picture height. JITTER moves each point off the grid.
  vec2 q = h * 10.0;
  vec2 base = floor(q);
  float d1 = 9.0;
  float d2 = 9.0;
  vec2 f1 = q;
  vec2 id1 = base;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = base + vec2(float(i), float(j));
      vec2 pos = g + mix(vec2(0.5), cvHash2(g), 0.4 + 0.6 * uCvJitter);
      float d = length(q - pos);
      if (d < d1) { d2 = d1; d1 = d; f1 = pos; id1 = g; }
      else if (d < d2) { d2 = d; }
    }
  }
  // Veins: the cell border is where the nearest and second-nearest points are equally far
  float edge = d2 - d1;
  float vw = (0.02 + 0.07 * dark) * (0.4 + uCvLine);                      // darker picture, heavier vein
  float vein = (1.0 - smoothstep(0.0, vw, edge)) * uCvLine * (0.25 + 0.75 * dark);
  // Striations: wavy lines across each cell, at the cell's own angle
  float ang = cvHash2(id1).x * 3.14159;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 r = q - f1;
  float s = dot(r, dir) * 16.0 + sin(dot(r, vec2(-dir.y, dir.x)) * 6.0) * (0.3 + uCvJitter * 1.2);
  float sw = 0.12 + 0.3 * dark;                                           // darker membranes, thicker striations
  float stri = (1.0 - smoothstep(0.0, sw, abs(fract(s) - 0.5) * 2.0)) * dark * uCvHatch;
  float ink = clamp(max(vein, stri), 0.0, 1.0);
  vec3 col = mix(vec3(0.94, 0.92, 0.87), vec3(0.06, 0.05, 0.05), ink);
  return col * present;
}

// BLIGHT: black ink on paper, as a wash spreads. The dark masses print as ink with a speckled, ragged edge, a grey
// haze bleeds out from them (a blurred copy of the picture), and the lights stay paper. Only colour changes: dots keep
// their place and count, and dots where the picture has no light stay empty.
float blightHash(vec2 p) { return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453); }
vec3 blightFinish(vec2 h, vec3 c) {
  float present = smoothstep(0.015, 0.07, max(c.r, max(c.g, c.b)));
  float soft = luma(c);
  if (uHasImg > 0.5) {
    vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
    soft = luma(textureLod(uImg, uv, mix(0.5, 5.0, uBlSpread)).rgb);   // SPREAD: how far the grey bleeds
  }
  float g = blightHash(floor(h * 360.0));
  float rag = (g - 0.5) * 0.35 * uBlGrain;                              // ragged edge of the ink
  float ink = 1.0 - smoothstep(mix(0.22, 0.55, uBlInk) + rag, mix(0.30, 0.65, uBlInk) + rag, soft);   // INK: how dark it goes
  float wash = (1.0 - smoothstep(0.1, 0.9, soft)) * uBlHaze;           // HAZE: the grey wash between ink and paper
  vec3 col = mix(vec3(0.96, 0.96, 0.94), vec3(0.55), clamp(wash, 0.0, 1.0) * (1.0 - ink));
  col = mix(col, vec3(0.03), ink);
  float speck = step(0.9, blightHash(floor(h * 620.0) + 3.0));          // paper speckle, grey on the paper only
  col = mix(col, vec3(0.2), speck * uBlGrain * 0.5 * (1.0 - ink));
  return col * present;
}

// LINED: the dots gather into vertical lines on a fixed pitch. A line grows wider where the picture is brighter and
// thins to nothing where it is dark, so the picture reads as line weight, like a moire print. A dot keeps its own
// colour; only the dots between the lines go dark. Positions and count are unchanged: it only masks the colour.
vec3 linedFinish(vec2 h, vec3 c) {
  float tone = luma(c);
  if (uHasImg > 0.5) {
    vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
    tone = luma(textureLod(uImg, uv, 1.5).rgb);   // a softened copy, so the width changes smoothly along a line
  }
  float present = smoothstep(0.03, 0.15, tone);          // black stays empty: no lines where the picture has no light
  tone = clamp((tone - 0.5) * (1.0 + 3.0 * uLinedContrast) + 0.5, 0.0, 1.0);
  float d = abs(fract(h.x * uLinedCount) - 0.5) * 2.0;   // 0 on a line's centre, 1 halfway to the next line
  float half_ = 0.1 + tone * uLinedWeight * 1.3;         // every lit area keeps a hairline; brighter parts grow it wider
  float m = (1.0 - smoothstep(half_ - 0.18, half_ + 0.18, d)) * present;
  return clamp(c * m * 1.4, 0.0, 1.0);
}

// BLOOD SHADOW: a two-ink screenprint on cream paper. The picture's dark masses print in black ink; a second, red plate
// of the same picture is printed slightly off register (down and to the left), so red fringes the black and floods
// the mid tones, with a ragged dry-brush edge and paper speckle. The lights stay paper. Only colour changes: dots keep
// their place and count, and dots where the picture has no light stay empty.
float bloodHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 bloodFinish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  float present = smoothstep(0.015, 0.07, max(c.r, max(c.g, c.b)));
  float g = bloodHash(floor(h * 420.0));
  float rag = (g - 0.5) * 0.22 * uBloodGrain;                       // ragged plate edges
  float T = luma(textureLod(uImg, uv, 1.0).rgb);
  vec2 off = vec2(-0.7, 0.55) * 0.03 * uBloodShift;                 // the red plate: down and to the left, in picture uv
  float Tr = luma(textureLod(uImg, uv + off, 1.0).rgb);
  float ink = 1.0 - smoothstep(0.12 + rag, 0.28 + rag, T);          // black plate: only the deepest masses
  float reach = mix(0.45, 0.75, uBloodBleed);
  float redPlate = 1.0 - smoothstep(reach - 0.22 + rag, reach + rag, Tr);   // red plate: darks and mids, shifted
  float red = redPlate * (1.0 - ink);                               // red shows where the black plate is not on top
  vec3 paper = vec3(1.0, 0.97, 0.88);
  vec3 col = paper * mix(vec3(1.0), vec3(0.82, 0.20, 0.22), red) * mix(vec3(1.0), vec3(0.12, 0.10, 0.11), ink);
  col *= mix(0.6, 1.0, smoothstep(0.35, 0.95, T));                  // the lights keep a little of the picture's gradation
  col *= 1.0 - uBloodGrain * 0.35 * step(0.88, g) * (ink + red);    // paper speckle through the ink
  return col * present;
}

// SHAKE-MASK: a shaken-camera photo with a word showing through in patches. The dots carry the picture smeared sideways;
// the dots that fall inside a letter take the letter's colour, pale over dark parts and dark over light parts. The letters
// are a fixed grid of glyphs laid on the picture and read from the atlas, so the dots themselves draw the letters.
// Only colour changes: dots keep their place and count.
float shHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float shNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(shHash(i), shHash(i + vec2(1.0, 0.0)), f.x), mix(shHash(i + vec2(0.0, 1.0)), shHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 shakeFinish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  // the photo smeared sideways over five taps; the dot keeps the Effects tab by adding only the smear's difference
  float len = uShSmear * 0.07;
  float lod = 1.0 + 2.0 * uShSmear;
  vec3 sm = vec3(0.0);
  for (int k = -2; k <= 2; k++) sm += (3.0 - abs(float(k))) * textureLod(uImg, uv + vec2(float(k) * 0.5 * len, 0.0), lod).rgb;
  vec3 base = clamp(c + sm / 9.0 - textureLod(uImg, uv, lod).rgb, 0.0, 1.0);
  // the letter grid: each glyph is twice as tall as it is wide
  const vec2 LET = vec2(0.02, 0.04);
  vec2 wp = vec2(h.x + uHalfW, 0.5 - h.y);
  vec2 cc = floor(wp / LET);
  vec2 fr = fract(wp / LET);
  vec2 cuv = vec2((cc.x + 0.5) * LET.x / (uHalfW * 2.0), (cc.y + 0.5) * LET.y);
  float Lc = luma(textureLod(uImg, cuv, 4.0).rgb);
  float detail = clamp(abs(Lc - luma(textureLod(uImg, cuv, 6.0).rgb)) * 5.0, 0.0, 1.0);
  // patches: smooth noise, long sideways, gathering where the picture has structure
  vec2 pos = vec2(cc.x * 0.5, cc.y * 2.0) / mix(2.0, 12.0, uShPatch);
  float field = 0.65 * shNoise(pos) + 0.35 * shNoise(pos * 2.7 + 9.0);
  float score = field * (0.4 + 0.9 * (0.35 + 0.65 * detail)) + (shHash(cc + 3.7) - 0.5) * 0.12;
  float show = step(mix(0.95, 0.35, uShCover), score);
  show = max(show, step(1.0 - 0.03 * uShCover, shHash(cc + 41.3)));   // a few lone letters in the clear
  // one word along each row, every row starting at a different letter
  float idx = mod(cc.x + floor(shHash(vec2(0.0, cc.y)) * 9.0), 9.0);
  vec2 g = vec2((idx + mix(0.0625, 0.9375, fr.x)) / 16.0, (3.0 + mix(0.03125, 0.96875, fr.y)) / 4.0);
  float m = smoothstep(0.2, 0.65, textureLod(uAtlas, g, 0.0).r) * show;
  vec3 lc = mix(vec3(0.97, 0.97, 0.95), vec3(0.07), smoothstep(0.38, 0.62, Lc));   // pale over dark, dark over light
  return mix(base, lc, m * 0.95);
}
`;

// Levels, curve, hue, saturation and black & white: the studio's Effects tab, applied to the picture only
const FX = `
uniform vec4 uFx1;   // black, white, gamma, contrast
uniform vec2 uFx2;   // hue (radians), saturation
uniform float uBW;

vec3 hueRotate(vec3 c, float a) {
  float cs = cos(a), sn = sin(a);
  mat3 m = mat3(
    0.213 + cs * 0.787 - sn * 0.213, 0.213 - cs * 0.213 + sn * 0.143, 0.213 - cs * 0.213 - sn * 0.787,
    0.715 - cs * 0.715 - sn * 0.715, 0.715 + cs * 0.285 + sn * 0.140, 0.715 - cs * 0.715 + sn * 0.715,
    0.072 - cs * 0.072 + sn * 0.928, 0.072 - cs * 0.072 - sn * 0.283, 0.072 + cs * 0.928 + sn * 0.072);
  return m * c;
}

vec3 effects(vec3 c) {
  c = clamp((c - uFx1.x) / max(uFx1.y - uFx1.x, 1e-3), 0.0, 1.0);
  c = pow(c, vec3(1.0 / uFx1.z));
  c = clamp(0.5 + (c - 0.5) * (1.0 + uFx1.w), 0.0, 1.0);
  c = clamp(hueRotate(c, uFx2.x), 0.0, 1.0);
  c = clamp(mix(vec3(luma(c)), c, uFx2.y), 0.0, 1.0);
  if (uBW > 0.5) c = vec3(luma(c));
  return c;
}
`;

const POINTS = `
void main() {
  // MORPH: the dot moves from its place in the old picture to its place in the new one.
  uint id = uint(gl_VertexID);
  float morphing = step(2.5, uRole);
  float e = clamp(uMorph + (rnd(id, 9u) - 0.5) * 0.4, 0.0, 1.0);
  e = smoothstep(0.0, 1.0, e) * morphing;
  vec3 home = mix(aHome, aHome2, e);
  vec3 mc = mix(aMeta.rgb, aMeta2.rgb, e);

  float alpha, streaming;
  vec2 dirP;
  vec2 w = place(id, home, luma(mc), 0.0, 1.0, alpha, streaming, dirP);
  gl_Position = toClip(w, home.z);

  // IMAGE dots get the Effects tab. DRIFTING dots get particle saturation instead.
  // streaming is 0 on the picture and 1 on the drifting particles, so the two blend smoothly.
  vec3 c = tint(mix(effects(mc), partSat(mc), streaming));
  // METAL: the chrome finish on the picture's dots (drifting dots keep their colour)
  if (uChrome > 0.5) c = mix(c, hueRotate(chromeFinish(home.xy, c), uChromeHue), 1.0 - streaming);
  if (uPrism > 0.5) c = mix(c, prismaticFinish(home.xy, c), 1.0 - streaming);
  if (uAura > 0.5) c = mix(c, auraFinish(home.xy, c), 1.0 - streaming);
  if (uEcstasy > 0.5) c = mix(c, ecstasyFinish(home.xy, c), 1.0 - streaming);
  if (uBlight > 0.5) c = mix(c, blightFinish(home.xy, c), 1.0 - streaming);
  if (uRedmet > 0.5) c = mix(c, redmetFinish(home.xy, c), 1.0 - streaming);
  if (uConv > 0.5) c = mix(c, convulsionsFinish(home.xy, c), 1.0 - streaming);
  if (uLined > 0.5) c = mix(c, linedFinish(home.xy, c), 1.0 - streaming);
  if (uBlood > 0.5) c = mix(c, bloodFinish(home.xy, c), 1.0 - streaming);
  if (uShake > 0.5) c = mix(c, shakeFinish(home.xy, c), 1.0 - streaming);
  float lum = luma(c);

  // PULSE scan: a wave of light travels through the depth, front to back, and lights the dots it passes
  float pulse = 0.0;
  if (uScanOn > 0.5 && uScanMode > 5.5) {
    pulse = glint(home.xy, lum) * (uScanLevel / 3.0);
    c = clamp(c + (uLightOn > 0.5 ? uLightCol : vec3(1.0)) * pulse * (0.22 + 0.4 * lum), 0.0, 1.0);
  } else if (uScanOn > 0.5) {
    vec2 ld = normalize(uDir + vec2(1e-4, 0.0));
    float g = scanBand(w, ld, uScan, uScanMode, uScanCenter, home.z, uZScale, lum);
    c += (uLightOn > 0.5 ? uLightCol : vec3(1.0)) * g * (0.12 + 0.4 * lum);
  }
  // TRAIL SIZE: drifting dots are sized by it. The pulse makes the lit dots bigger.
  gl_PointSize = mix(uPointPx, max(1.0, uPointPx * uTrailSize), streaming) + pulse * 0.8;

  // Screen blending k overlapping dots gives 1-(1-o)^k; pick o so the stack lands on the source colour
  vec3 cb = clamp(c * uBright, 0.0, 1.0);
  vec3 o = 1.0 - pow(1.0 - cb, vec3(aMeta.a * 5.0 / max(uCover, 0.25)));
  float opacity = mix(uOpacity, 1.0, streaming); // OPACITY is for the image only
  vCol = o * alpha * (1.0 - 0.3 * streaming) * opacity * (1.0 + pulse * 0.3);
}
`;

const TRAILS = `
void main() {
  // One trail per particle: a fixed length back along the drift direction, so trails show at any FLOW,
  // not only near the maximum. Live they are GL lines (always 1 px). An export at a larger size draws them
  // as quads uLineW wide, so the trails grow with the picture like the dots do (4 vertices: head, head, tail, tail).
  bool strip = uLineW > 1.25;
  bool tail = strip ? gl_VertexID >= 2 : gl_VertexID == 1;
  float side = (gl_VertexID & 1) == 0 ? -1.0 : 1.0;
  uint id = uint(gl_InstanceID);
  // TRAIL AMOUNT: 0..2, where 1 keeps half of the particles
  // EMITTERS: the trails shed by region too. A region with weight 0 has no trails; 2 has up to twice the share.
  float regionK = uEmitOn > 0.5 ? clamp(regionWeight(aHome.xy), 0.0, 2.0) : 1.0;
  if (rnd(id, 6u) > uTrailAmount * 0.5 * regionK) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec3(0.0);
    return;
  }
  // LENGTH VARIETY (EMITTERS): 1 = no two streaks the same length, 0 = all the same
  float lenVar = mix(1.0, 0.4 + rnd(id, 5u), uEmitOn > 0.5 ? uEmitX.z : 1.0);
  float luminance = luma(aMeta.rgb);

  float alpha, streaming;
  vec2 dirT;
  vec2 head = place(id, aHome, luminance, 0.0, 1.0, alpha, streaming, dirT);
  if (streaming < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec3(0.0);
    return;
  }
  // TRAIL DIRECTION: turn the tail away from the drift path by uTrailAngle
  // Positive length: the tail runs back along the particle's own path and stops at its home pixel.
  // Negative length: the tail runs forward along the drift direction.
  float L = uTrailLen * lenVar;
  vec2 disp = head - aHome.xy;
  vec2 back = L >= 0.0 ? -normalize(disp + vec2(1e-6)) * min(L, length(disp)) : -dirT * L;
  // TURN (EMITTERS): each trail leans a tiny random angle off the common direction
  float turn = uEmitOn > 0.5 ? (rnd(id, 12u) - 0.5) * uEmitX.w * 0.35 : 0.0;
  float ca = cos(uTrailAngle + turn), sa = sin(uTrailAngle + turn);
  vec2 tailW = head + vec2(back.x * ca - back.y * sa, back.x * sa + back.y * ca);
  gl_Position = toClip(tail ? tailW : head, aHome.z);
  if (strip) {
    // Push the two vertices of each end apart, across the trail, by half the width in px
    vec2 a = toClip(head, aHome.z).xy * uView * 0.5;
    vec2 b = toClip(tailW, aHome.z).xy * uView * 0.5;
    vec2 d = b - a;
    vec2 dir = d / max(length(d), 1e-4);
    gl_Position.xy += vec2(-dir.y, dir.x) * side * (uLineW * 0.43) / (uView * 0.5); // 0.43 = half of 0.86: matches a 1 px GL line's coverage
  }
  // Trails carry no Effects: only particle saturation and the light tint. Head bright, tail tapers with detail.
  // Thinner than 1.25 px they stay 1 px lines, so the brightness drops with the width instead.
  float tailK = mix(0.22, 0.04, uTrailDetail);
  float gain = strip ? 1.0 : min(uLineW, 1.25);
  vCol = tint(partSat(aMeta.rgb)) * alpha * (tail ? tailK : 0.3) * uTrailGain * gain * uTrailFade;
}
`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 o;
void main() { o = vec4(vCol, 1.0); }
`;

// CELL LOOKS: one instance per grid cell (HALFTONE, MOSAIC, DITHER, ASCII). A cell is treated as
// a particle (place()), so flow, pointer, burst, scan and pulse all act on it, but its colour and tone come
// from the picture under the whole cell, so every cell is one clean value.
const CELLS = `
uniform vec4 uGrid;         // nx, ny, cell width, cell height (world units)
uniform float uGap;         // cell looks: share of each cell left empty between the particles
uniform float uGridAng;     // radians, the grid turned about the picture centre
uniform float uLayer;       // 0 the picture, 1 the cells that have drifted off it
uniform vec2 uLv;           // AUTO LEVELS: brightness range stretched to 0..1
uniform float uColorMode;   // 0 SOURCE, 1 MONO, 2 DUO
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uInvert;
uniform float uStyle;       // 1 HALFTONE, 2 MOSAIC, 3 DITHER, 4 ASCII
uniform vec4 uSP;           // settings of the look

out vec2 vUv;               // 0..1 across the cell
out vec3 vInk;

// THERMAL and ACID colour the cell from its brightness (colour modes 3 and 4)
vec3 thermalRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.0, 0.0, 0.18), vec3(0.45, 0.0, 0.55), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(0.95, 0.15, 0.1), smoothstep(0.25, 0.55, t));
  c = mix(c, vec3(1.0, 0.85, 0.1), smoothstep(0.5, 0.8, t));
  return mix(c, vec3(1.0), smoothstep(0.78, 1.0, t));
}
vec3 acidRamp(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t * 1.1 + vec3(0.0, 0.33, 0.67)));
}
vec3 rampColour(float t, float mode) {
  return mode < 3.5 ? thermalRamp(t) : acidRamp(t);
}
out vec3 vBg;
out float vTone;
out float vFade;
out vec4 vEdge;             // MOSAIC outline: left, right, bottom, top border a cell of another brightness
flat out ivec2 vCell;

float toneOf(vec3 c) {
  float t = clamp((luma(c) - uLv.x) / max(uLv.y - uLv.x, 0.05), 0.0, 1.0);
  return mix(t, 1.0 - t, uInvert);
}
float toneAt(vec2 uv, float lod) { return toneOf(effects(textureLod(uImg2, uv, lod).rgb)); }
void main() {
  int nx = int(uGrid.x + 0.5);
  int id = gl_InstanceID;
  ivec2 ij = ivec2(id % nx, id / nx);
  vec2 cw = uGrid.zw;
  float ca = cos(uGridAng), sa = sin(uGridAng);
  mat2 R = mat2(ca, sa, -sa, ca);
  vec2 local = (vec2(ij) + 0.5 - 0.5 * uGrid.xy) * cw;
  vec2 c = R * local;
  float aspect = uHalfW * 2.0;
  vCell = ij;
  vUv = vec2(0.0);
  vInk = vec3(0.0);
  vBg = vec3(0.0);
  vTone = 0.0;
  vFade = 0.0;
  vEdge = vec4(0.0);

  // Outside the picture
  if (abs(c.x) > uHalfW + 0.5 * cw.x || abs(c.y) > 0.5 + 0.5 * cw.y) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  // The picture under the whole cell (mip level = cell size in texels), mixed old to new during a morph
  vec2 uv = vec2(c.x / aspect + 0.5, 0.5 - c.y);
  float lod = log2(max(0.5 * (cw.x + cw.y) * uTexSize.y, 1.0));
  float morphing = step(2.5, uRole);
  float e = smoothstep(0.0, 1.0, clamp(uMorph + (rnd(uint(id), 9u) - 0.5) * 0.4, 0.0, 1.0)) * morphing;
  vec4 t = mix(textureLod(uImg, uv, lod), textureLod(uImg2, uv, lod), e);
  vec3 mc = t.rgb;
  float z = t.a - 0.5;

  float alpha, streaming;
  vec2 dirP;
  vec2 w = place(uint(id), vec3(c, z), luma(mc), 0.0, uLayer, alpha, streaming, dirP);
  if (uLayer > 0.5 && streaming < 0.02) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec3 col = tint(mix(effects(mc), partSat(mc), streaming));
  float lum = luma(col);
  float pulse = 0.0;
  if (uScanOn > 0.5 && uScanMode > 5.5) {
    pulse = glint(c, lum) * (uScanLevel / 3.0);
    col = clamp(col + (uLightOn > 0.5 ? uLightCol : vec3(1.0)) * pulse * (0.22 + 0.4 * lum), 0.0, 1.0);
  } else if (uScanOn > 0.5) {
    vec2 ld = normalize(uDir + vec2(1e-4, 0.0));
    float g = scanBand(w, ld, uScan, uScanMode, uScanCenter, z, uZScale, lum);
    col += (uLightOn > 0.5 ? uLightCol : vec3(1.0)) * g * (0.12 + 0.4 * lum);
  }
  vec3 cb = clamp(col * uBright, 0.0, 1.0);
  float tone = toneOf(col);
  float opacity = mix(uOpacity, 1.0, streaming);
  vFade = alpha * (1.0 - 0.3 * streaming) * opacity * (1.0 + pulse * 0.3);
  vTone = tone;
  // The gap: the quad shrinks inside its cell and the shape fills the quad, so empty space shows between particles
  cw *= 1.0 - uGap;

  // Ink: the cell's colour at full value (the shape carries the brightness), or the chosen ink
  vec3 hue = cb / max(max(cb.r, cb.g), max(cb.b, 1e-3));
  vInk = uColorMode < 0.5 ? hue : uInk;
  if (uColorMode > 2.5) vInk = rampColour(tone, uColorMode);   // THERMAL, ACID: the colour comes from the brightness
  vBg = (uColorMode > 1.5 && uColorMode < 2.5) ? uPaper : vec3(0.0);

  int st = int(uStyle + 0.5);
  if (st == 22) vInk = cb;                         // PIXEL ART: the true colour, snapped in the fragment
  if (st == 2) {
    // MOSAIC: flat colour, optionally limited to a few levels per channel
    float lv = uSP.x;
    bool smooth_ = lv >= 31.5;
    vec3 q = smooth_ ? cb : floor(cb * (lv - 1.0) + 0.5) / (lv - 1.0);
    if (uInvert > 0.5) q = 1.0 - q;
    float qt = smooth_ ? tone : floor(tone * (lv - 1.0) + 0.5) / (lv - 1.0);
    vInk = uColorMode < 0.5 ? q : (uColorMode < 1.5 ? uInk * qt : (uColorMode < 2.5 ? mix(uPaper, uInk, qt) : rampColour(qt, uColorMode)));
    if (uSP.w > 0.0) {
      vec2 dx = R * vec2(cw.x, 0.0);
      vec2 dy = R * vec2(0.0, cw.y);
      vec2 ux = vec2(dx.x / aspect, -dx.y);
      vec2 uy = vec2(dy.x / aspect, -dy.y);
      vEdge = step(0.12, abs(vec4(toneAt(uv - ux, lod), toneAt(uv + ux, lod), toneAt(uv - uy, lod), toneAt(uv + uy, lod)) - tone));
    }
  } else if (st == 22) {
    // PIXEL ART outline: a cell with a brighter neighbour sits on the dark side of an edge and is drawn in a dark shade
    vec2 dx = R * vec2(cw.x, 0.0);
    vec2 dy = R * vec2(0.0, cw.y);
    vec2 ux = vec2(dx.x / aspect, -dx.y);
    vec2 uy = vec2(dy.x / aspect, -dy.y);
    vEdge = step(0.3, vec4(toneAt(uv - ux, lod), toneAt(uv + ux, lod), toneAt(uv - uy, lod), toneAt(uv + uy, lod)) - tone);
  }

  // Corners of the cell, a little oversize so neighbours overlap; the fragment keeps only its own cell
  int v = gl_VertexID;
  vec2 corner = vec2(float(v & 1), float(v >> 1));
  vec2 q = (corner - 0.5) * 1.06;
  vUv = q + 0.5;
  gl_Position = toClip(w + R * (q * cw), z);
}
`;

const CELL_FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
in vec3 vInk;
in vec3 vBg;
in float vTone;
in float vFade;
in vec4 vEdge;
flat in ivec2 vCell;
uniform float uStyle;
uniform float uColorMode;
uniform vec4 uSP;
uniform vec3 uPalArt[24];   // PIXEL ART palette
uniform vec4 uSP2;
uniform vec4 uGrid;     // nx, ny, cell width, cell height: the RINGS pattern needs the cell's place on the grid
uniform sampler2D uAtlas;   // ASCII glyphs: 16 columns, one row per ramp, each glyph 16 x 32 px
out vec4 o;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// Triangular remap of a uniform value to [0,1], centred on 0.5: removes the banding of a plain threshold (Wronski)
float triRemap(float u) { return u < 0.5 ? sqrt(u * 0.5) : 1.0 - sqrt((1.0 - u) * 0.5); }

// Oklab, Ottosson's matrices: lightness that tracks the eye, so ramps and nearest-colour tests stay even
vec3 srgbToLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 linToSrgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toOklab(vec3 c) {
  vec3 v = srgbToLin(c);
  vec3 lms = pow(vec3(dot(v, vec3(0.4122214708, 0.5363325363, 0.0514459929)),
                      dot(v, vec3(0.2119034982, 0.6806995451, 0.1073969566)),
                      dot(v, vec3(0.0883024619, 0.2817188376, 0.6299787005))), vec3(1.0 / 3.0));
  return vec3(dot(lms, vec3(0.2104542553, 0.7936177850, -0.0040720468)),
              dot(lms, vec3(1.9779984951, -2.4285922050, 0.4505937099)),
              dot(lms, vec3(0.0259040371, 0.7827717662, -0.8086757660)));
}
vec3 fromOklab(vec3 o) {
  vec3 lms = vec3(o.x + 0.3963377774 * o.y + 0.2158037573 * o.z,
                  o.x - 0.1055613458 * o.y - 0.0638541728 * o.z,
                  o.x - 0.0894841775 * o.y - 1.2914855480 * o.z);
  lms = lms * lms * lms;
  return linToSrgb(vec3(dot(lms, vec3(4.0767416621, -3.3077115913, 0.2309699292)),
                        dot(lms, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
                        dot(lms, vec3(-0.0041960863, -0.7034186147, 1.7076147010))));
}

// DISSOLVE ramp: six sRGB stops from black (no ink, so the cell adds nothing) through navy and teal to pink and hot white
vec3 dissolveStop(int i) {
  if (i <= 0) return vec3(0.0);
  if (i == 1) return vec3(0.070, 0.110, 0.200);
  if (i == 2) return vec3(0.122, 0.353, 0.431);
  if (i == 3) return vec3(0.498, 0.722, 0.769);
  if (i == 4) return vec3(0.910, 0.471, 0.561);
  return vec3(1.0, 0.941, 0.902);
}

// CGA 16-colour palette 1 in mode 4: black, cyan, magenta, light grey, and the bright cyan, magenta, white [CGA, Wikipedia]
vec3 cgaColour(int i) {
  if (i == 0) return vec3(0.0);
  if (i == 1) return vec3(0.0, 0.667, 0.667);
  if (i == 2) return vec3(0.667, 0.0, 0.667);
  if (i == 3) return vec3(0.667);
  if (i == 4) return vec3(0.333, 1.0, 1.0);
  if (i == 5) return vec3(1.0, 0.333, 1.0);
  return vec3(1.0);
}
// The nearest colour of the PIXEL ART palette in Oklab
vec3 palArt(vec3 src) {
  vec3 so = toOklab(src);
  float best = 1e9;
  vec3 pick = uPalArt[0];
  for (int i = 0; i < 24; i++) {
    vec3 e = so - toOklab(uPalArt[i]);
    float d = dot(e, e);
    if (d < best) { best = d; pick = uPalArt[i]; }
  }
  return pick;
}
// The nearest CGA colour in Oklab; the second nearest where the Bayer threshold b falls under the mix amount
vec3 cgaPick(vec3 src, float b, float amt) {
  vec3 so = toOklab(src);
  float d1 = 1e9; float d2 = 1e9; int i1 = 0; int i2 = 0;
  for (int i = 0; i < 7; i++) {
    vec3 e = so - toOklab(cgaColour(i));
    float d = dot(e, e);
    if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; }
    else if (d < d2) { d2 = d; i2 = i; }
  }
  float frac = clamp(2.0 * amt * d1 / (d1 + d2 + 1e-6), 0.0, 1.0);   // 0.5 between the two, so amt sets the full mix
  return cgaColour(frac > b ? i2 : i1);
}

// Ordered dither threshold built from bits, no texture. Rows y, columns x, M2 = [[0,2],[3,1]]/4.
float bayer(ivec2 cell, int n) {        // n = 2 gives 4x4, n = 3 gives 8x8
  ivec2 p = cell & ((1 << n) - 1);
  int a = p.x ^ p.y;
  int v = 0;
  for (int k = 0; k < 3; k++) {
    if (k < n) v += (((a >> k) & 1) << (2 * (n - 1 - k) + 1)) + (((p.y >> k) & 1) << (2 * (n - 1 - k)));
  }
  return (float(v) + 0.5) / float(1 << (2 * n));
}

void main() {
  // The oversize quad overlaps its neighbours; each pixel belongs to exactly one cell
  if (vUv.x < 0.0 || vUv.x >= 1.0 || vUv.y < 0.0 || vUv.y >= 1.0) discard;
  vec2 fw = fwidth(vUv);
  float aa = max(0.5 * (fw.x + fw.y), 1e-3);
  float tone = vTone;
  vec3 col = vBg;
  int st = int(uStyle + 0.5);
  vec2 p = vUv - 0.5;

  if (st == 1) {                                   // HALFTONE
    float area = pow(tone, 1.0 / (1.0 + uSP.y));
    float sq = sqrt(area);
    float m;
    if (uSP.x < 0.5)      m = 1.0 - smoothstep(sq * 0.7072 - aa, sq * 0.7072 + aa, length(p));   // ROUND: the newsprint dot
    else if (uSP.x < 1.5) m = 1.0 - smoothstep(sq * 0.5 - aa, sq * 0.5 + aa, max(abs(p.x), abs(p.y)));   // SQUARE
    else if (uSP.x < 2.5) m = 1.0 - smoothstep(sq * 0.7072 - aa, sq * 0.7072 + aa, abs(p.x) + abs(p.y));   // DIAMOND
    else if (uSP.x < 3.5) m = (1.0 - smoothstep(area * 0.5 - aa, area * 0.5 + aa, min(abs(p.x), abs(p.y)))) * step(max(abs(p.x), abs(p.y)), 0.5);   // CROSS
    else if (uSP.x < 4.5) m = 1.0 - smoothstep(area * 0.5 - aa, area * 0.5 + aa, abs(p.y));   // LINE
    else if (uSP.x < 5.5) {                                                                   // DASH: short diagonal strokes
      float across = 1.0 - smoothstep(area * 0.35 - aa, area * 0.35 + aa, abs(p.x + p.y) * 0.7072);
      float along = 1.0 - smoothstep(0.42 - aa, 0.42 + aa, abs(p.x - p.y) * 0.7072);
      m = across * along;
    } else if (uSP.x < 6.5) {                                                                 // STAR: three strokes through the cell, a hexagon net
      float d = min(abs(p.x * 0.0 + p.y), min(abs(p.x * 0.8660 - p.y * 0.5), abs(p.x * 0.8660 + p.y * 0.5)));
      m = 1.0 - smoothstep(area * 0.25 - aa, area * 0.25 + aa, d);
    } else {                                                                                  // RINGS: rings about the picture centre, thicker where brighter
      vec2 w = (vec2(vCell) + 0.5 - 0.5 * uGrid.xy) * uGrid.zw + p * uGrid.zw;
      float band = abs(fract(length(w) / uGrid.z * 0.3) - 0.5);
      m = 1.0 - smoothstep(area * 0.5 - aa, area * 0.5 + aa, band);
    }
    m *= step(0.003, area);
    col = mix(col, vInk, m);
  } else if (st == 2) {                            // MOSAIC
    float half_ = 0.5 - uSP.y * 0.5;
    float r = uSP.z * half_;
    float d = length(max(abs(p) - (half_ - r), 0.0)) - r;
    float m = 1.0 - smoothstep(0.0, aa, d);
    float edge = max(max(vEdge.x * smoothstep(0.14, 0.0, vUv.x), vEdge.y * smoothstep(0.14, 0.0, 1.0 - vUv.x)),
                     max(vEdge.z * smoothstep(0.14, 0.0, vUv.y), vEdge.w * smoothstep(0.14, 0.0, 1.0 - vUv.y)));
    col = mix(col, vInk * (1.0 - uSP.w * 0.85 * edge), m);
  } else if (st == 3 || st == 13 || st == 17) {    // DITHER, SCAN and PALETTE
    float b;
    if (st == 3) {
      b = uSP.x < 0.5 ? bayer(vCell, 2) : (uSP.x < 1.5 ? bayer(vCell, 3) : ign(vec2(vCell)));
    } else if (st == 13) {                         // SCAN: rows alternate dense and sparse, so lines of light show
      b = 0.5 * bayer(vCell, 2) + 0.5 * (((vCell.y & 1) == 0) ? 0.2 : 0.8);
    } else {                                       // PALETTE
      b = bayer(vCell, 3);
    }
    float L = uSP.y;
    float tt = clamp(pow(tone, 0.75) + uSP.z, 0.0, 1.0); // a lift, so dark pictures keep their shape
    if (st == 17) {                                // PALETTE: four colours, dithered between neighbours
      float f = tt * 3.0;
      int i0 = int(floor(f));
      int idx = clamp(i0 + ((f - float(i0)) > b ? 1 : 0), 0, 3);
      col = idx == 0 ? vec3(0.04, 0.04, 0.05) : (idx == 1 ? vec3(0.11, 0.25, 0.58) : (idx == 2 ? vec3(1.0, 0.54, 0.12) : vec3(0.89, 0.89, 0.54)));
    } else {
      float v = clamp(floor(tt * (L - 1.0) + b) / (L - 1.0), 0.0, 1.0);
      col = mix(col, vInk, v);
    }
  } else if (st == 18) {                           // INK: one ink on paper, a per-pixel noise threshold
    float n = triRemap(ign(gl_FragCoord.xy));
    col = mix(vBg, vInk, step(uSP.y + (n - 0.5) * uSP.x, tone));
  } else if (st == 19) {                           // DISSOLVE: the brightness through the ramp, dithered per cell so it breaks into dots
    float f = clamp(tone, 0.0, 1.0) * 5.0;
    float fl = floor(f);
    float thr = bayer(vCell, 2) + (hash21(vec2(vCell)) - 0.5) * 0.12;
    col = dissolveStop(int(fl) + int(step(thr, f - fl)));
  } else if (st == 27) {                           // X-RAY: black where the picture is dark, blue scan in the middle, pale bone where bright
    float t = clamp(tone, 0.0, 1.0);
    vec3 deep = vec3(0.0, 0.10, 0.30);
    vec3 blue = vec3(0.04, 0.45, 0.95);
    vec3 bone = vec3(0.62, 0.92, 1.0);
    vec3 ramp = t < 0.2 ? mix(vec3(0.0), deep, smoothstep(0.02, 0.2, t))
              : t < 0.55 ? mix(deep, blue, smoothstep(0.2, 0.55, t))
              : mix(blue, bone, smoothstep(0.55, 0.85, t));
    float r = length(p);
    float body = 1.0 - smoothstep(0.25, 0.5, r);
    float glow = exp(-r * r * 5.0) * 0.4 * smoothstep(0.55, 0.9, t);   // soft bloom off the bright bone cells
    col = ramp * (0.6 + 0.4 * body) + vec3(0.2, 0.7, 1.0) * glow;
  } else if (st == 22) {                           // PIXEL ART: each cell one colour of the fixed palette
    // one palette colour per cell; an outline cell takes the dark shade of its own colour
    float edge = max(max(vEdge.x, vEdge.y), max(vEdge.z, vEdge.w));
    col = edge > 0.5 ? palArt(vInk * 0.4) : palArt(vInk);
  } else if (st == 20) {                           // CGA: the source colour snapped to the CGA palette, dithered per pixel
    col = cgaPick(vInk * clamp(tone, 0.0, 1.0), bayer(ivec2(gl_FragCoord.xy), 3), uSP.x);
  } else if (st == 21) {                           // STIPPLE: one dot per cell, placed at random, denser in the dark
    vec2 h = vec2(hash21(vec2(vCell)), hash21(vec2(vCell) + 17.3));
    float r = uSP.y * 0.5 * sqrt(tone);
    float keep = step(h.x, uSP.x * pow(tone, 1.2));
    float m = keep * (1.0 - smoothstep(r - aa, r + aa, length(p - (h - 0.5) * (1.0 - 2.0 * r))));
    col = mix(vBg, vInk, m);
  } else if (st == 4) {                            // ASCII
    float N = uSP2.x;
    float idx = floor(clamp(pow(tone, 0.8), 0.0, 0.999) * N);
    vec2 g = vec2((idx + mix(0.0625, 0.9375, vUv.x)) / 16.0, (uSP.x + mix(0.03125, 0.96875, 1.0 - vUv.y)) / 4.0);
    float m = smoothstep(0.2, 0.65, texture(uAtlas, g).r);
    vec3 bg = uColorMode > 1.5 ? vBg : vInk * uSP.y * tone;
    col = mix(bg, vInk, m);
  } else if (st == 33) {                           // SOFTWORD: ASCII glyphs in the picture colour, with a soft glow spreading around each one
    float N = uSP2.x;
    float idx = floor(clamp(pow(tone, 0.8), 0.0, 0.999) * N);
    // one glyph sample, read at a point inside the cell (0..1 across it); the row is the chosen ramp
    float gl = 0.0;
    vec2 at = vUv;
    gl = texture(uAtlas, vec2((idx + mix(0.0625, 0.9375, at.x)) / 16.0, (uSP.x + mix(0.03125, 0.96875, 1.0 - at.y)) / 4.0)).r;
    float core = smoothstep(0.2, 0.65, gl);
    // the halo: the same glyph read a little to each side, so the glow spreads past the letter's edge
    vec2 o = vec2(0.22, 0.0);
    vec2 oy = vec2(0.0, 0.22);
    float halo = 0.0;
    halo += texture(uAtlas, vec2((idx + mix(0.0625, 0.9375, clamp(at.x + o.x, 0.0, 1.0))) / 16.0, (uSP.x + mix(0.03125, 0.96875, 1.0 - at.y)) / 4.0)).r;
    halo += texture(uAtlas, vec2((idx + mix(0.0625, 0.9375, clamp(at.x - o.x, 0.0, 1.0))) / 16.0, (uSP.x + mix(0.03125, 0.96875, 1.0 - at.y)) / 4.0)).r;
    halo += texture(uAtlas, vec2((idx + mix(0.0625, 0.9375, at.x)) / 16.0, (uSP.x + mix(0.03125, 0.96875, 1.0 - clamp(at.y + oy.y, 0.0, 1.0))) / 4.0)).r;
    halo += texture(uAtlas, vec2((idx + mix(0.0625, 0.9375, at.x)) / 16.0, (uSP.x + mix(0.03125, 0.96875, 1.0 - clamp(at.y - oy.y, 0.0, 1.0))) / 4.0)).r;
    halo *= 0.25;
    float glow = clamp(halo * uSP.z * 0.9, 0.0, 1.0);                  // SOFT GLOW: how far the warm light spreads
    vec3 bg = vInk * tone * 0.25;
    col = mix(bg, vInk, clamp(core + glow * (1.0 - core), 0.0, 1.0));
    col += vInk * glow * 0.35 * (1.0 - core);                         // a little extra light around the letter
  } else if (st == 7) {                            // WIRE: the grid as lines; brighter parts draw thicker lines
    float w = uSP.x * (0.35 + 0.65 * tone);
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float m = 1.0 - smoothstep(w - aa, w + aa, edge);
    if (uSP.y > 0.5) {
      m = max(m, 1.0 - smoothstep(w - aa, w + aa, abs(vUv.x - vUv.y) * 0.7071));
    }
    if (uSP.y > 1.5) {
      m = max(m, 1.0 - smoothstep(w - aa, w + aa, abs(vUv.x + vUv.y - 1.0) * 0.7071));
    }
    col = mix(vBg + vInk * uSP.z * tone, vInk, m);
  } else if (st == 8) {                            // GLASS: bevelled tiles lit from the top left
    float gap = uSP.w * 0.5;
    vec2 q = abs(p);
    float e = 0.5 - gap - max(q.x, q.y);
    float inside = smoothstep(0.0, aa, e);
    float bev = 1.0 - smoothstep(0.0, max(uSP.x, 0.02), e);
    vec2 nrm = q.x > q.y ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y));
    float facing = dot(nrm, normalize(vec2(-0.6, 0.8)));
    vec3 base = vInk * (0.55 + 0.45 * tone);
    vec3 lit = base * (1.0 + uSP.y * bev * facing * 1.2);
    float spec = exp(-length(p - vec2(-0.22, 0.22)) * 9.0) * uSP.z;
    col = mix(vBg, clamp(lit + spec * (0.4 + 0.6 * tone), 0.0, 1.0), inside);
  } else if (st == 9) {                            // CRT: a red, a green and a blue bar per cell, and a scan line
    vec3 c = vInk * (0.25 + 0.95 * tone);
    float k = floor(vUv.x * 3.0);
    float fx = fract(vUv.x * 3.0) - 0.5;
    float bar = 1.0 - smoothstep(uSP.x * 0.5 - aa * 3.0, uSP.x * 0.5 + aa * 3.0, abs(fx));
    vec3 phos = k < 0.5 ? vec3(1.0, 0.0, 0.0) : (k < 1.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0));
    float scan = 1.0 - uSP.y * pow(abs(p.y) * 2.0, 4.0);
    col = clamp(c * phos * bar * scan * uSP.z * 1.6, 0.0, 1.0);
  } else if (st == 10) {                           // BARS: a little 3D block per cell, taller where it is brighter
    float gp = uSP.z * 0.5;
    float lean = uSP.y;
    float h = 0.08 + 0.85 * tone * uSP.x;
    float bx0 = gp + 0.02;
    float bx1 = 1.0 - lean - gp;
    float fy0 = gp;
    vec2 q = vUv;
    float inFront = step(bx0, q.x) * step(q.x, bx1) * step(fy0, q.y) * step(q.y, fy0 + h);
    float ty = (q.y - fy0 - h) / max(lean, 1e-3);
    float inTop = step(0.0, ty) * step(ty, 1.0) * step(bx0 + ty * lean, q.x) * step(q.x, bx1 + ty * lean);
    float sx = (q.x - bx1) / max(lean, 1e-3);
    float inSide = step(0.0, sx) * step(sx, 1.0) * step(fy0 + sx * lean, q.y) * step(q.y, fy0 + h + sx * lean);
    vec3 baseC = vInk * (0.45 + 0.55 * tone);
    col = vBg;
    col = mix(col, baseC * 0.55, inSide);
    col = mix(col, baseC * 1.1, inTop);
    col = mix(col, baseC * 0.8, inFront);
  } else if (st == 11) {                           // STICKER: a glossy tile with a white border and a drop shadow
    float r = uSP.z;
    vec2 qd = abs(p) - vec2(0.38 - r) ;
    float d = length(max(qd, 0.0)) + min(max(qd.x, qd.y), 0.0) - r;
    vec2 ps = p - vec2(0.03, -0.045);
    vec2 qs = abs(ps) - vec2(0.38 - r);
    float ds = length(max(qs, 0.0)) + min(max(qs.x, qs.y), 0.0) - r;
    col = mix(col, vec3(0.0), smoothstep(0.06, -0.01, ds) * 0.55 * uSP.y);
    float body = 1.0 - smoothstep(0.0, aa * 1.5, d);
    float inner = 1.0 - smoothstep(0.0, aa * 1.5, d + uSP.x);
    float shine = smoothstep(0.25, -0.05, (p.y - 0.12) + (p.x + 0.12) * 0.35) * 0.18 * inner;
    col = mix(col, vec3(1.0), body);
    col = mix(col, clamp(vInk * (0.5 + 0.6 * tone) + shine, 0.0, 1.0), inner);
  }
  o = vec4(clamp(col * vFade, 0.0, 1.0), 1.0);
}
`;

export const CELL_VERT = VERSION + LIFECYCLE_GLSL + DECLS + FX + CELLS;
export const CELL_FRAG_SRC = CELL_FRAG;

// The studio's scan bands come from LIFECYCLE_GLSL (which also declares uScanLevel).
export const POINT_VERT = VERSION + LIFECYCLE_GLSL + DECLS + FX + POINTS;
export const TRAIL_VERT = VERSION + LIFECYCLE_GLSL + DECLS + FX + TRAILS;
export const FRAG_SRC = FRAG;

// EQUALIZER: particles beside the picture, one point per dot, in the picture's colours. Stateless like the picture's
// dots: each dot's place is a function of its id, the column levels, the waveform and the time. Styles (uEqStyle):
// 1 DOTS: LED columns mirrored about the middle, unlit dots as faint ghosts. 2 CROSS: the waveform as two lines crossing.
// 3 SPARKS: dots rising from the middle line and fading.
// Layout: side (2) x half (2) x column (12) x row (20).
export const EQ_VERT = `#version 300 es
precision highp float;
uniform vec2 uView;
uniform float uScale;
uniform vec2 uOffset;
uniform float uHalfW;
uniform float uTime;
uniform float uEqSize;      // dot size, device px
uniform float uEqStyle;     // 1 DOTS, 2 CROSS, 3 SPARKS
uniform float uEqLevel[12]; // level of each column, 0..1, column 0 nearest the picture
uniform float uEqWave[12];  // the waveform in 12 columns, -1..1
uniform vec3 uEqCol[5];     // the picture's colours
out vec3 vCol;
const int COLS = 12;
const int ROWS = 20;
float hash1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  int id = gl_VertexID;
  int row = id % ROWS;
  int rest = id / ROWS;
  int col = rest % COLS;
  rest = rest / COLS;
  int half_ = rest % 2;
  int side = rest / 2;
  float fr = float(row) + 0.5;
  float lvl = uEqLevel[col];
  float r = hash1(float(id) * 1.7);
  float xs = side == 0 ? -1.0 : 1.0;
  float ys = half_ == 0 ? 1.0 : -1.0;
  float x = xs * (uHalfW + 0.05 + float(col) * 0.04);
  float y = 0.0;
  float size = uEqSize;
  bool show = true;
  vec3 colour = uEqCol[col % 5];
  if (uEqStyle < 1.5) {
    // DOTS
    bool lit = fr < lvl * float(ROWS);
    y = ys * (0.012 + fr / float(ROWS) * 0.36); // tall range: a loud column still has room above it
    if (lit) y += ys * sin(uTime * (2.0 + 3.0 * r) + r * 30.0) * 0.012 * (0.4 + lvl);
    colour = lit ? colour : colour * 0.12;
    size *= lit ? 1.0 : 0.7;
  } else if (uEqStyle < 2.5) {
    // CROSS: the waveform as two lines of dots crossing along the margin, one flipped and one column along
    float along = float(col * ROWS + row) / float(COLS * ROWS); // 0 next to the picture, 1 at the outer edge
    x = xs * (uHalfW + 0.05 + along * 0.5);
    y = half_ == 0 ? uEqWave[col] * 0.3 : -uEqWave[(col + 6) % COLS] * 0.3;
    y += (r - 0.5) * 0.006;
    size *= 0.9;
  } else {
    // SPARKS: each dot rises from the middle line, fades as it goes, and starts again. Louder columns
    // send up more dots, and the dots climb higher.
    float life = fract(uTime * (0.15 + 0.25 * r) + r * 17.0);
    show = fr < lvl * float(ROWS);
    x += (hash1(float(id) * 3.1) - 0.5) * 0.12 * xs; // a spray, not a grid: each dot strays sideways
    y = ys * (0.012 + life * (0.08 + 0.4 * lvl));
    colour = colour * (1.0 - 0.8 * life);
    size *= 0.9;
  }
  if (!show) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec3(0.0);
    gl_PointSize = 1.0;
    return;
  }
  vec2 px = vec2(x, y) * uScale + uOffset;
  gl_Position = vec4(px / (uView * 0.5), 0.0, 1.0);
  vCol = colour;
  gl_PointSize = size;
}
`;
