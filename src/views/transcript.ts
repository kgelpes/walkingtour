import { narrator } from '../app';
import { h } from '../dom';
import type { Clip } from '../types';

/**
 * The narration text, split into paragraphs. While this clip plays, the
 * paragraph being spoken is highlighted (estimated from character position).
 */
export function transcript(clip: Clip): HTMLElement {
  const paras = clip.text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  const total = paras.reduce((a, t) => a + t.length, 0);
  let acc = 0;
  const ends = paras.map((t) => (acc += t.length) / total);
  const els = paras.map((t) => h('p', null, t));
  const el = h('div', { class: 'transcript' }, ...els);
  let current = -1;
  let mounted = false;
  const unsub = narrator.subscribe((s) => {
    if (el.isConnected) mounted = true;
    else if (mounted) return void unsub(); // sheet closed
    const active = s.clip?.id === clip.id && s.duration > 0 && (s.playing || s.time > 0);
    const f = active ? s.time / s.duration : -1;
    const idx = f < 0 ? -1 : ends.findIndex((e) => f <= e);
    if (idx === current) return;
    current = idx;
    els.forEach((p, i) => p.classList.toggle('active', i === idx));
  });
  return el;
}
