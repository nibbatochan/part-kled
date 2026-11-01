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
  new ResizeObserver(update).observe(row);
  update();
}
