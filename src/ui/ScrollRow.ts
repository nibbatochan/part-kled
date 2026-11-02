// src/ui/ScrollRow.ts
// A row of tags or buttons that never wraps: the items stay on one line, with a small arrow at each end that
// moves along the list. The arrows only show when the row overflows, and the one for a finished direction dims.

export function scrollRow(row: HTMLElement): void {
  if (row.parentElement?.classList.contains('scroll-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'scroll-wrap';
  row.before(wrap);
  const arrow = (glyph: string, label: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'scroll-arrow';
    b.textContent = glyph;
    b.setAttribute('aria-label', label);
    return b;
  };
  const back = arrow('\u2039', 'Previous part of the list');
  const next = arrow('\u203a', 'Next part of the list');
  wrap.append(back, row, next);
  row.classList.add('scroll-row');

  const update = () => {
    const over = row.scrollWidth > row.clientWidth + 1;
    back.hidden = next.hidden = !over;
    back.disabled = row.scrollLeft <= 1;
    next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;
  };
  back.addEventListener('click', () => row.scrollBy({ left: -row.clientWidth * 0.8, behavior: 'smooth' }));
  next.addEventListener('click', () => row.scrollBy({ left: row.clientWidth * 0.8, behavior: 'smooth' }));
  row.addEventListener('scroll', update);

  // Mouse drag scrolls the row, and the wheel moves it sideways. A drag that moved does not also click a tile.
  let drag: { x: number; left: number } | null = null;
  let moved = false;
  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: row.scrollLeft };
    moved = false;
  });
  row.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) moved = true;
    if (moved) row.scrollLeft = drag.left - dx;
  });
  const endDrag = () => { drag = null; };
  row.addEventListener('pointerup', endDrag);
  row.addEventListener('pointerleave', endDrag);
  row.addEventListener('pointercancel', endDrag);
  row.addEventListener('click', (e) => {
    if (!moved) return;
    e.stopPropagation();
    e.preventDefault();
    moved = false;
  }, true);
  row.addEventListener('wheel', (e) => {
    if (row.scrollWidth <= row.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    row.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  new ResizeObserver(update).observe(row);
  update();
}
