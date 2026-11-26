// Drag-to-arrange pictures on the editor's slide preview.
// Drag a picture to move it; drag a corner to resize (keeps its shape; hold Shift to stretch);
// drag an edge to stretch one side. Edges and centres snap to the slide's edges and centre line.
import { esc } from './util.js?v=2.3';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const SNAP = 1.2; // percent

export function createArrange(host, { getSlide, onSelect, onChange, onCommit }) {
  // host: the element wrapping the preview .slide (we overlay it exactly)
  const layer = document.createElement('div'); layer.className = 'arrange';
  const gx = document.createElement('div'), gy = document.createElement('div');
  gx.className = 'guide gx'; gy.className = 'guide gy';
  let sel = null, drag = null;
  const pics = () => (getSlide().pics || []);
  const find = id => pics().find(p => p.id === id);
  const box = p => `left:${p.x}%;top:${p.y}%;width:${p.w}%;height:${p.h}%`;

  function render() {
    if (!host.contains(layer)) host.append(layer);
    if (sel && !find(sel)) sel = null;
    layer.innerHTML = pics().map(p => `<div class="abox${p.id === sel ? ' on' : ''}" data-pid="${esc(p.id)}" style="${box(p)}" tabindex="-1" aria-label="Picture${p.alt ? ': ' + esc(p.alt) : ''}">${p.id === sel ? HANDLES.map(h => `<i class="hd ${h}" data-h="${h}"></i>`).join('') : ''}</div>`).join('');
    layer.append(gx, gy); gx.hidden = gy.hidden = true;
  }
  function paint(p) { // move the picture and its box without re-rendering everything
    const img = host.querySelector(`.pic[data-pid="${CSS.escape(p.id)}"]`); if (img) Object.assign(img.style, { left: p.x + '%', top: p.y + '%', width: p.w + '%', height: p.h + '%' });
    const b = layer.querySelector(`.abox[data-pid="${CSS.escape(p.id)}"]`); if (b) b.setAttribute('style', box(p));
  }
  function select(id) { sel = id; render(); onSelect && onSelect(id); }

  function snap(v, size, axisGuide) {
    for (const [edge, off] of [[v, 0], [v + size / 2, size / 2], [v + size, size]]) for (const t of [0, 50, 100])
      if (Math.abs(edge - t) < SNAP) { axisGuide.hidden = false; axisGuide.style[axisGuide === gx ? 'left' : 'top'] = t + '%'; return t - off; }
    return v;
  }
  const r2 = v => Math.round(v * 100) / 100;

  layer.addEventListener('pointerdown', e => {
    const b = e.target.closest('.abox'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) document.activeElement.blur(); // so arrow keys / Delete act on the picture
    const id = b.dataset.pid; if (id !== sel) select(id);
    const p = find(id); if (!p) return;
    const rect = host.getBoundingClientRect();
    drag = { id, h: e.target.dataset.h || null, sx: e.clientX, sy: e.clientY, o: { ...p }, W: rect.width, H: rect.height, moved: false };
    layer.setPointerCapture(e.pointerId);
  });
  layer.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = find(drag.id); if (!p) return;
    const dx = (e.clientX - drag.sx) / drag.W * 100, dy = (e.clientY - drag.sy) / drag.H * 100, o = drag.o;
    if (Math.abs(dx) + Math.abs(dy) > 0.2) drag.moved = true;
    gx.hidden = gy.hidden = true;
    if (!drag.h) {
      p.x = r2(e.altKey ? o.x + dx : snap(o.x + dx, o.w, gx));
      p.y = r2(e.altKey ? o.y + dy : snap(o.y + dy, o.h, gy));
    } else {
      const h = drag.h, L = h.includes('w'), T = h.includes('n'), corner = h.length === 2;
      let w = o.w, ht = o.h;
      if (h.includes('e') || L) w = o.w + (L ? -dx : dx);
      if (h.includes('s') || T) ht = o.h + (T ? -dy : dy);
      if (corner && !e.shiftKey) { // keep the picture's shape
        const ratio = (o.h * drag.H) / (o.w * drag.W);
        if (Math.abs(dx) * drag.W >= Math.abs(dy) * drag.H) ht = w * drag.W * ratio / drag.H; else w = ht * drag.H / ratio / drag.W;
      }
      w = Math.max(3, w); ht = Math.max(3, ht);
      p.w = r2(w); p.h = r2(ht);
      p.x = r2(L ? o.x + o.w - w : o.x); p.y = r2(T ? o.y + o.h - ht : o.y);
    }
    paint(p); onChange && onChange(p);
  });
  const end = () => { if (!drag) return; const moved = drag.moved; drag = null; gx.hidden = gy.hidden = true; if (moved) onCommit && onCommit(); };
  layer.addEventListener('pointerup', end); layer.addEventListener('pointercancel', end);
  host.addEventListener('pointerdown', e => { if (!e.target.closest('.abox') && sel) select(null); });

  return {
    render, select, get selected() { return sel; },
    key(e) { // arrow keys nudge, Delete removes; returns true if handled
      if (!sel) return false; const p = find(sel); if (!p) return false;
      const st = e.shiftKey ? 5 : 0.5;
      const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      if (mv) { p.x = r2(p.x + mv[0]); p.y = r2(p.y + mv[1]); paint(p); onChange && onChange(p); onCommit && onCommit(); return true; }
      if (e.key === 'Delete' || e.key === 'Backspace') { const s = getSlide(); s.pics = s.pics.filter(x => x.id !== sel); sel = null; onCommit && onCommit(true); return true; }
      if (e.key === 'Escape') { select(null); return true; }
      return false;
    }
  };
}
