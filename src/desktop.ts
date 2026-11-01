// The desktop app (desktop/, Electron) gives the page window.desktop. In a browser there is none and nothing here runs.
export interface DesktopApi {
  isDesktop: true;
  setWallpaper(on: boolean): Promise<boolean>;
  onWallpaper(cb: (on: boolean) => void): void;
  onPause(cb: (paused: boolean) => void): void;
}

export function desktopApi(): DesktopApi | null {
  return (window as unknown as { desktop?: DesktopApi }).desktop ?? null;
}

/** As a wallpaper only the picture shows: no console, no grid lines of the UI, no buttons. */
function setPictureOnly(v: boolean): void {
  document.body.dataset.wallpaper = v ? '1' : '';
  document.getElementById('ui-layer')?.classList.toggle('hide-ui', v);
}

/**
 * Desktop app: the WALLPAPER button. Pressing it opens the sound settings (the MUSIC section) first,
 * and START WALLPAPER turns the wallpaper on. The MUSIC section goes back to the console afterwards.
 */
export function initDesktopMode(desk: DesktopApi): void {
  document.body.dataset.desktop = '1';
  const btn = document.getElementById('desk-wall') as HTMLButtonElement | null;
  const modal = document.getElementById('wall-modal') as HTMLElement | null;
  const slot = document.getElementById('wall-slot');
  const music = document.getElementById('music-panel');
  let on = false;
  let home: HTMLElement | null = null;
  let next: Element | null = null;

  const show = (v: boolean) => {
    on = v;
    if (btn) {
      btn.textContent = v ? 'WALLPAPER ON' : 'WALLPAPER';
      btn.classList.toggle('active', v);
    }
    setPictureOnly(v);
  };
  desk.onWallpaper(show);
  if (!btn || !modal || !slot || !music) return;
  btn.hidden = false;

  const putMusicBack = () => {
    if (home) home.insertBefore(music, next);
    home = null;
    next = null;
    modal.hidden = true;
  };

  btn.addEventListener('click', () => {
    if (on) {
      void desk.setWallpaper(false).then(show);
      return;
    }
    home = music.parentElement;
    next = music.nextElementSibling;
    slot.appendChild(music);
    const body = music.querySelector<HTMLElement>('.sec-body');
    if (body) body.hidden = false;
    modal.hidden = false;
  });
  document.getElementById('wall-cancel')?.addEventListener('click', putMusicBack);
  document.getElementById('wall-start')?.addEventListener('click', () => {
    putMusicBack();
    void desk.setWallpaper(true).then(show);
  });
}

/** Lock screen is paused (Windows refuses the image from this app). */
