# Panel Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the web studio's right-hand panel into the flow picture → effect → image → emitter, with four tabs (Effect | Image | Emitter | Video), five always-visible picture slots, and emitters off on first load.

**Architecture:** Markup moves only. Each existing `section.box[data-collapse]` keeps its key and its controls; it is moved into one of three tab bodies. A small tab controller in `Panel.ts` shows one body at a time. No control, param key or engine code changes except the first-load default.

**Tech Stack:** TypeScript, vanilla DOM (`src/ui/Panel.ts`), CSS tokens (`src/ui/tokens.css`, `src/ui/panel.css`), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-panel-flow-design.md`

## Global Constraints

- Do not change the canvas, particle engine, depth system, shaders or `src/hero.ts` build. Only `withEffectsStart()` changes, and only `emitOn`.
- Keep every `data-collapse` key and every element `id` unchanged, so saved open state and existing code paths keep working.
- Tab keys are exactly `effect`, `image`, `emitter`, `video`, in that order. Effect is open on load.
- Five picture slots always shown, empty ones included. Dropzone and slot delete kept.

## Review Focus

- Reload with the tab state remembered from a previous session: the tab must still show one body (not zero, not two).
- A saved collapse state from before this change must still apply to the moved sections.
- Emitter controls disabled while `emitOn` is false: switching to the Emitter tab must not enable them.
- Picture slot click while on the Emitter tab must not switch tabs.
- Phone width (about 390 px): the tab bar must not overflow horizontally.

Each line above is covered by a test in the task that owns the code.

---

### Task 1: First-load emitters off

**Files:**
- Modify: `src/core/params.ts` (function `withEffectsStart`, around line 301)
- Test: `tests/params.test.ts`

**Interfaces:**
- Consumes: `withEffectsStart(): Params` (existing).
- Produces: `withEffectsStart().emitOn === false`. All other fields unchanged.

- [ ] **Step 1: Write the failing test**

Add to `tests/params.test.ts`:

```ts
import { withEffectsStart, defaults } from '../src/core/params';

test('first load has emitters off and nothing else changed', () => {
  const p = withEffectsStart();
  expect(p.emitOn).toBe(false);
  expect({ ...p, emitOn: true }).toEqual({ ...withEffectsStart(), emitOn: true });
  expect(defaults.emitOn).toBe(true); // the defaults object is untouched
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c npx vitest run tests/params.test.ts -t "first load"`
Expected: FAIL, `expected true to be false`.

- [ ] **Step 3: Set emitOn false in withEffectsStart**

In `src/core/params.ts`, inside the object returned by `withEffectsStart`, add `emitOn: false,` next to the other overrides. Do not change `defaults`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd.exe /c npx vitest run tests/params.test.ts`
Expected: PASS, all tests in the file.

---

### Task 2: Tab bar and tab controller

**Files:**
- Modify: `index.html` (add tab bar and three bodies; placement is done in Task 3)
- Modify: `src/ui/Panel.ts` (add `bindPanelTabs()`, call it from the constructor path that calls `buildCollapsibles()`)
- Modify: `src/ui/panel.css` (tab bar styles)
- Test: `tests/panelTabs.test.ts` (new; jsdom)

**Interfaces:**
- Consumes: none.
- Produces: `type PanelTab = 'effect' | 'image' | 'emitter' | 'video'`. Markup: `<nav class="panel-tabs">` with buttons `data-panel-tab="effect|image|emitter"`, and bodies `<div class="panel-tab-body" data-tab-body="effect|image|emitter">`. Storage key `particled.panelTab` in localStorage, read and written inside try/catch.

- [ ] **Step 1: Write the failing test**

```ts
// tests/panelTabs.test.ts
// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { showPanelTab, PANEL_TABS } from '../src/ui/panelTabs';

beforeEach(() => {
  document.body.innerHTML = `
    <nav class="panel-tabs">
      <button data-panel-tab="effect" class="active">EFFECT</button>
      <button data-panel-tab="image">IMAGE</button>
      <button data-panel-tab="emitter">EMITTER</button>
      <button data-panel-tab="video">VIDEO</button>
    </nav>
    <div data-tab-body="effect"></div><div data-tab-body="image" hidden></div><div data-tab-body="emitter" hidden></div><div data-tab-body="video" hidden></div>`;
});

test('tab keys are in flow order', () => {
  expect(PANEL_TABS).toEqual(['effect', 'image', 'emitter', 'video']);
});

test('exactly one body is shown and one button is active', () => {
  showPanelTab('image');
  const shown = [...document.querySelectorAll<HTMLElement>('[data-tab-body]')].filter((b) => !b.hidden);
  expect(shown.map((b) => b.dataset.tabBody)).toEqual(['image']);
  expect(document.querySelectorAll('[data-panel-tab].active').length).toBe(1);
  expect(document.querySelector('[data-panel-tab].active')?.getAttribute('data-panel-tab')).toBe('image');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c npx vitest run tests/panelTabs.test.ts`
Expected: FAIL, cannot resolve `../src/ui/panelTabs`.

- [ ] **Step 3: Implement the controller**

Create `src/ui/panelTabs.ts` exporting `PANEL_TABS`, `showPanelTab(tab)` (sets `hidden` on bodies, `active` and `aria-pressed` on buttons), and `bindPanelTabs()` (click handlers; restores the last tab from localStorage key `particled.panelTab`, default `effect`; storage in try/catch). `Panel.ts` calls `bindPanelTabs()` once, next to `buildCollapsibles()`. Clicking a picture slot must not call `showPanelTab`.

- [ ] **Step 4: Add the tab bar markup and styles**

Add the `<nav class="panel-tabs">` above the three bodies in `index.html`. Style it in `panel.css` with `tokens.css` colours and spacing; active button uses the same accent as the active picture slot. Give the nav `overflow-x: auto` so it never forces page scroll at 390 px.

- [ ] **Step 5: Run test to verify it passes**

Run: `cmd.exe /c npx vitest run tests/panelTabs.test.ts`
Expected: PASS, 2 tests.

---

### Task 3: Move existing sections into the tab bodies

**Files:**
- Modify: `index.html` (move markup only; ids and `data-collapse` values unchanged)

**Interfaces:**
- Consumes: the tab bodies from Task 2.
- Produces: this mapping, nothing else.

| Tab body | Sections moved in, in this order |
|---|---|
| `effect` | `#effects-box` (data-collapse `look`), `#particle-box` (data-collapse `particle`) |
| `image` | `#fx-panel` (data-collapse `tone`) |
| `emitter` | `#emit-panel` (data-collapse `emitters`), `section[data-collapse="particles"]`, `section[data-collapse="reactions"]`, `#music-panel` (data-collapse `music`) |

| `video` | `#clip-panel` (no `data-collapse` key; leave as is) |

`#source-box` is handled in Task 4.

- [ ] **Step 1: Write the failing check**

Add to `tests/panelTabs.test.ts`:

```ts
test('every existing collapsible section sits in exactly one tab body', async () => {
  const html = await (await import('node:fs')).promises.readFile('index.html', 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const expected: Record<string, string> = {
    look: 'effect', particle: 'effect', tone: 'image',
    emitters: 'emitter', particles: 'emitter', reactions: 'emitter', music: 'emitter',
  };
  expect(doc.querySelector('#clip-panel')!.closest('[data-tab-body]')?.getAttribute('data-tab-body')).toBe('video');
  for (const [key, tab] of Object.entries(expected)) {
    const sec = doc.querySelector(`section[data-collapse="${key}"]`);
    expect(sec, key).not.toBeNull();
    expect(sec!.closest('[data-tab-body]')?.getAttribute('data-tab-body'), key).toBe(tab);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c npx vitest run tests/panelTabs.test.ts -t "exactly one tab body"`
Expected: FAIL, `closest(...)` is null for `look`.

- [ ] **Step 3: Move the markup**

Cut each section listed above and paste it into its tab body, keeping its attributes and children unchanged. Do not edit inner markup, classes or ids.

- [ ] **Step 4: Run test to verify it passes, then check the canvas is unchanged**

Run: `cmd.exe /c npx vitest run tests/panelTabs.test.ts`
Expected: PASS.
Then run `cmd.exe /c npx tsc --noEmit`. Expected: no errors.

---

### Task 4: Merge picture row into the effects header; place VIDEO

**Files:**
- Modify: `index.html` (`#source-box`, `#thumbnail-strip`, `#effects-box`)
- Modify: `src/main.ts` only if the thumbnail selector changes (it is `#thumbnail-strip`, line 97; keep that id)

**Interfaces:**
- Consumes: `new Thumbs('#thumbnail-strip', ...)` (existing, `src/main.ts:97`).
- Produces: `#thumbnail-strip` as the first child of `#effects-box`, placed above the `02 EFFECTS` heading. `#source-box` removed as a separate box. Five slots always rendered.

- [ ] **Step 1: Write the failing test**

```ts
test('picture strip sits inside the effects box and there is no separate picture box', async () => {
  const html = await (await import('node:fs')).promises.readFile('index.html', 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(doc.querySelector('#effects-box #thumbnail-strip')).not.toBeNull();
  expect(doc.querySelector('#source-box')).toBeNull();
  expect(doc.querySelectorAll('#thumbnail-strip .thumb-slot:not(.add-slot)').length).toBe(5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c npx vitest run tests/panelTabs.test.ts -t "picture strip"`
Expected: FAIL, `#effects-box #thumbnail-strip` is null.

- [ ] **Step 3: Merge the markup**

Move `#thumbnail-strip` into `#effects-box`, above its `<h2>`. Remove the now-empty `#source-box` section. Render five `.thumb-slot` elements (add `data-index="2"`, `"3"`, `"4"` as needed; `main.ts` already handles index 4). Keep the add button and the file input.

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd.exe /c npx vitest run tests/panelTabs.test.ts`
Expected: PASS.

---

### Task 5: Spacing and hierarchy pass

**Files:**
- Modify: `src/ui/panel.css`
- Modify: `src/ui/tokens.css` only to add spacing tokens if none fit

**Interfaces:**
- Consumes: existing tokens.
- Produces: one heading style and one inner padding for every `.box`; one row gap.

- [ ] **Step 1: Write the failing check**

Add a CSS-value test to `tests/panelTabs.test.ts` that reads `panel.css` and asserts `.box` uses a single `padding` token and that `section.box h2` has one font-size token. Expected initial result: FAIL (values differ per block today).

- [ ] **Step 2: Run to verify it fails**

Run: `cmd.exe /c npx vitest run tests/panelTabs.test.ts -t "spacing"`
Expected: FAIL.

- [ ] **Step 3: Make the change**

Set one `padding` token on `.box`, one heading size, one row gap. Remove per-block overrides only where they conflict with these. Do not change control sizes.

- [ ] **Step 4: Run to verify it passes**

Run: `cmd.exe /c npx vitest run tests/panelTabs.test.ts`
Expected: PASS.

---

### Task 6: Verification

**Files:**
- Create: `scripts/verify-panel.mjs` (Playwright, same pattern as `scripts/shot-still.mjs`)

- [ ] **Step 1: Typecheck and unit tests**

Run: `cmd.exe /c npx tsc --noEmit` then `cmd.exe /c npm test`
Expected: no tsc errors; all tests pass.

- [ ] **Step 2: Browser check**

Run: `node scripts/verify-panel.mjs`. The script opens the studio at desktop (1440x900) and phone (390x844) width, screenshots first load, then clicks each tab and screenshots it, and fails if:
- more than one tab body is visible;
- a body holds no visible control;
- the page scrolls horizontally;
- `#emit-panel` controls are enabled on first load.

Expected: prints `panel ok` and writes PNGs to `docs/effect-library/panel/`.

- [ ] **Step 3: Canvas unchanged**

Compare the first-load canvas before and after with `scripts/shot-still.mjs`. Expected: differs only by the emitter state (emitters off, per spec decision 4). Report the difference; do not hide it.

---
