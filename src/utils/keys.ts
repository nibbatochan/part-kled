// src/utils/keys.ts
export interface KeyHandlers {
  onNext: () => void;
  onToggleLight: () => void;
  onFullscreen: () => void;
  onToggleUi: () => void;
  onSelectSlot: (index: number) => void;
}

export function setupKeyboardShortcuts(handlers: KeyHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }

    const key = e.key.toLowerCase();

    if (e.code === 'Space' || key === ' ') {
      e.preventDefault();
      handlers.onNext();
    } else if (key === 's') {
      handlers.onToggleLight();
    } else if (key === 'f') {
      handlers.onFullscreen();
    } else if (key === 'h') {
      handlers.onToggleUi();
    } else if (key >= '1' && key <= '4') {
      handlers.onSelectSlot(parseInt(key, 10) - 1);
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
