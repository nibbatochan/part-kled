// The four tabs of the right-hand panel, in the order a person works: pick an effect, adjust the picture,
// shape the emitters, or work with a video. One body is shown at a time.
export const PANEL_TABS = ['effect', 'image', 'emitter', 'video'] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

/** A saved value back to a tab. Anything unknown means EFFECT, the tab that opens on load. */
export function parseTab(v: string | null): PanelTab {
  return (PANEL_TABS as readonly string[]).includes(v ?? '') ? (v as PanelTab) : 'effect';
}

/** The tab a page load opens: EFFECT in the lab, VIDEO in the video view. Not remembered across reloads (spec section 7). */
export function startTab(mode: string): PanelTab {
  return mode === 'video' ? 'video' : 'effect';
}

/** Which body is visible for the active tab: exactly one. */
export function tabVisibility(active: PanelTab): Record<PanelTab, boolean> {
  return { effect: active === 'effect', image: active === 'image', emitter: active === 'emitter', video: active === 'video' };
}

export function showPanelTab(tab: PanelTab, root: ParentNode = document): void {
  const vis = tabVisibility(tab);
  root.querySelectorAll<HTMLElement>('[data-tab-body]').forEach((b) => {
    b.hidden = !vis[parseTab(b.dataset.tabBody ?? null)];
  });
  root.querySelectorAll<HTMLButtonElement>('[data-panel-tab]').forEach((b) => {
    const on = b.dataset.panelTab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

/** Wires the tab buttons and opens the starting tab. Picture slots never touch the tabs. */
export function bindPanelTabs(root: ParentNode = document): void {
  showPanelTab(startTab(document.body.dataset.mode ?? 'lab'), root);
  root.querySelectorAll<HTMLButtonElement>('[data-panel-tab]').forEach((b) =>
    b.addEventListener('click', () => showPanelTab(parseTab(b.dataset.panelTab ?? null), root)),
  );
}
