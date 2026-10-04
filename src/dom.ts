type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; html?: string; style?: string };

/** Tiny hyperscript: h('button', { class: 'x', onclick }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function toast(message: string, action?: { label: string; run: () => void }, ms = 4000) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, message));
  if (action) el.append(h('button', { onclick: () => { action.run(); el.remove(); } }, action.label));
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** A modal bottom sheet. Returns a close function. */
export function sheet(content: HTMLElement, opts: { label: string; onClose?: () => void; tall?: boolean } = { label: '' }) {
  const prevFocus = document.activeElement as HTMLElement | null;
  const backdrop = h('div', { class: 'modal-backdrop' });
  const panel = h('div', { class: `modal${opts.tall ? ' tall' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label, tabindex: '-1' },
    h('div', { class: 'grabber', 'aria-hidden': 'true' }), content);
  const close = () => {
    backdrop.classList.remove('show');
    panel.classList.remove('show');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { backdrop.remove(); panel.remove(); }, 280);
    prevFocus?.focus?.();
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  dragToClose(panel, close);
  document.body.append(backdrop, panel);
  requestAnimationFrame(() => {
    backdrop.classList.add('show');
    panel.classList.add('show');
    panel.focus({ preventScroll: true });
  });
  return close;
}

/** Swipe down on a sheet's grabber/header area (or anywhere when scrolled to top) to dismiss. */
function dragToClose(panel: HTMLElement, close: () => void) {
  let startY = 0;
  let dy = 0;
  let active = false;
  panel.addEventListener('touchstart', (e) => {
    const scroller = (e.target as HTMLElement).closest('.modal-scroll');
    if (scroller && scroller.scrollTop > 0) return;
    active = true;
    startY = e.touches[0].clientY;
    dy = 0;
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (!active) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
    panel.style.transition = 'none';
  }, { passive: true });
  panel.addEventListener('touchend', () => {
    if (!active) return;
    active = false;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 90) close();
  });
}
