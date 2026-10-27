// src/depth/protocol.ts
// Shared by the depth worker and the page-side client. No DOM, no model code: safe to import from both.

/**
 * Depth is estimated and refined at this size, not at the picture's full size. The particle sampler
 * reads the picture at the same size (src/lite/sample.ts), so nothing is lost, and the guided filter
 * (the slow part) works on about a tenth of the pixels.
 */
export const DEPTH_MAX_SIDE = 768;

export const MODEL = 'onnx-community/depth-anything-v2-small';

/**
 * Page -> worker. `bitmap` is already at working size w x h and is transferred, not copied.
 * Warmup is a 64 x 64 estimate with id 0: it loads the model and compiles the shaders, and its result is dropped.
 */
export type DepthRequest = { type: 'estimate'; id: number; bitmap: ImageBitmap; w: number; h: number };

/** Worker -> page. Progress and result carry the job id; progress is 0..1 for the whole job. */
export type DepthResponse =
  | { type: 'progress'; id: number; p: number; text: string }
  | { type: 'result'; id: number; depth: Float32Array; width: number; height: number }
  | { type: 'error'; id: number; message: string };
