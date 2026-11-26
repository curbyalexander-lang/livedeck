// Drawing on slides while presenting: pen, highlighter, laser pointer, eraser.
// Works with a mouse, a finger, or Apple Pencil (pressure-sensitive; once a pencil is used,
// finger touches are ignored so a resting palm doesn't draw). Ink is kept per slide.
// Points are stored as fractions of the slide's width/height, so ink stays put in full screen.

const COLORS = ['#e53935', '#1d5fd1', '#111111', '#2e9e44', '#f5a623', '#ffffff'];
const SIZES = { S: 0.0025, M: 0.0045, L: 0.009 };
const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONS = {
  pen: icon('M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3'),
  hl: icon('M5 19h6M7 15l8-8 3 3-8 8H7v-3zM13 9l3 3'),
  laser: icon('M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 3v3M12 18v3M3 12h3M18 12h3'),
  eraser: icon('M8 20h11M4 15l9-9 6 6-7 7H8l-4-4zM10 9l6 6'),
  undo: icon('M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3'),
  clear: icon('M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'),
  draw: icon('M4 20l4-1 11-11-3-3L5 16l-1 4z')
};

export function createInk(host, { storageKey } = {}) {
  // host: an element positioned over the slide (same size). We add a canvas and a toolbar to it.
  const canvas = document.createElement('canvas'); canvas.className = 'ink';
  const bar = document.createElement('div'); bar.className = 'inkbar';
  const toggleBtn = document.createElement('button'); toggleBtn.className = 'inktoggle'; toggleBtn.innerHTML = ICONS.draw; toggleBtn.title = 'Draw (D)'; toggleBtn.setAttribute('aria-label', 'Draw on slide (D)');
  host.append(canvas, bar, toggleBtn);
  const g = canvas.getContext('2d');

  let strokes = {}, history = {}, slideId = null, on = false, tool = 'pen', color = COLORS[0], size = 'M';
  let cur = null, penSeen = false, laser = [], raf = 0, W = 1, H = 1, dpr = 1;
  try { const saved = storageKey && JSON.parse(sessionStorage.getItem(storageKey)); if (saved) strokes = saved; } catch (e) { }
  const persist = () => { try { storageKey && sessionStorage.setItem(storageKey, JSON.stringify(strokes)); } catch (e) { } };

  bar.innerHTML = `<div class="ig">${['pen', 'hl', 'laser', 'eraser'].map(t => `<button data-tool="${t}" title="${{ pen: 'Pen', hl: 'Highlighter', laser: 'Laser pointer', eraser: 'Eraser' }[t]}" aria-label="${{ pen: 'Pen', hl: 'Highlighter', laser: 'Laser pointer', eraser: 'Eraser' }[t]}">${ICONS[t]}</button>`).join('')}</div>
    <div class="ig">${COLORS.map(c => `<button data-color="${c}" class="sw" style="--c:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
    <div class="ig">${Object.keys(SIZES).map(k => `<button data-size="${k}" aria-label="Size ${k}">${k}</button>`).join('')}</div>
    <div class="ig"><button data-a="undo" title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">${ICONS.undo}</button><button data-a="clear" title="Clear this slide" aria-label="Clear this slide">${ICONS.clear}</button><button data-a="done" class="done">Done</button></div>`;

  function syncBar() {
    bar.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    bar.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b.dataset.color === color));
    bar.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('on', b.dataset.size === size));
    host.classList.toggle('inking', on); toggleBtn.classList.toggle('on', on); bar.hidden = !on;
    canvas.style.cursor = !on ? '' : tool === 'eraser' ? 'cell' : tool === 'laser' ? 'none' : 'crosshair';
  }
  bar.addEventListener('pointerdown', e => e.stopPropagation());
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tool) tool = b.dataset.tool;
    if (b.dataset.color) { color = b.dataset.color; if (tool === 'eraser' || tool === 'laser') tool = 'pen'; }
    if (b.dataset.size) size = b.dataset.size;
    if (b.dataset.a === 'undo') undo();
    if (b.dataset.a === 'clear') { const l = list(); if (l.length) { snapshot(); strokes[slideId] = []; persist(); redraw(); } }
    if (b.dataset.a === 'done') setOn(false);
    syncBar();
  });
  toggleBtn.onclick = () => setOn(!on);

  const list = () => slideId == null ? [] : (strokes[slideId] ||= []);
  const snapshot = () => { (history[slideId] ||= []).push(JSON.stringify(list())); if (history[slideId].length > 50) history[slideId].shift(); };
  function undo() { const h = history[slideId]; if (!h || !h.length) return; strokes[slideId] = JSON.parse(h.pop()); persist(); redraw(); }

  function resize() {
    const r = host.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    redraw();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);

  function drawStroke(s) {
    const p = s.pts; if (!p.length) return;
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = s.color; g.fillStyle = s.color;
    if (s.tool === 'hl') {
      g.globalAlpha = 0.35; g.lineWidth = s.w * W * 4; g.beginPath(); g.moveTo(p[0][0] * W, p[0][1] * H);
      for (let i = 1; i < p.length; i++) g.lineTo(p[i][0] * W, p[i][1] * H);
      if (p.length === 1) g.lineTo(p[0][0] * W + .1, p[0][1] * H);
      g.stroke(); g.globalAlpha = 1; return;
    }
    if (p.length === 1) { g.beginPath(); g.arc(p[0][0] * W, p[0][1] * H, s.w * W * (0.4 + p[0][2]) / 2, 0, 7); g.fill(); return; }
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      g.lineWidth = Math.max(1, s.w * W * (0.35 + 1.3 * ((a[2] + b[2]) / 2)));
      g.beginPath(); g.moveTo(a[0] * W, a[1] * H); g.lineTo(b[0] * W, b[1] * H); g.stroke();
    }
  }
  function redraw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    list().forEach(drawStroke); if (cur) drawStroke(cur);
    const now = performance.now(); laser = laser.filter(l => now - l.t < 700);
    if (laser.length) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 1; i < laser.length; i++) {
        const a = laser[i - 1], b = laser[i], age = (now - b.t) / 700;
        g.strokeStyle = `rgba(255,30,30,${(1 - age) * 0.7})`; g.lineWidth = Math.max(2, W * 0.006 * (1 - age));
        g.beginPath(); g.moveTo(a.x * W, a.y * H); g.lineTo(b.x * W, b.y * H); g.stroke();
      }
      const l = laser[laser.length - 1];
      g.fillStyle = 'rgba(255,30,30,.95)'; g.shadowColor = 'rgba(255,0,0,.8)'; g.shadowBlur = 14;
      g.beginPath(); g.arc(l.x * W, l.y * H, Math.max(5, W * 0.006), 0, 7); g.fill(); g.shadowBlur = 0;
    }
  }
  function loop() { redraw(); raf = laser.length ? requestAnimationFrame(loop) : 0; }
  const pt = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5]; };

  function eraseAt(x, y) {
    const rr = 0.018, l = list(); const keep = l.filter(s => !s.pts.some(p => Math.hypot((p[0] - x) * W, (p[1] - y) * H) < rr * W));
    if (keep.length !== l.length) { strokes[slideId] = keep; persist(); redraw(); return true; }
    return false;
  }

  let erasedThisDrag = false;
  canvas.addEventListener('pointerdown', e => {
    if (!on) return;
    if (e.pointerType === 'pen') penSeen = true;
    if (penSeen && e.pointerType === 'touch') return; // palm rejection
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    const p = pt(e);
    if (tool === 'laser') { laser.push({ x: p[0], y: p[1], t: performance.now() }); if (!raf) loop(); cur = { laser: true, id: e.pointerId }; return; }
    if (tool === 'eraser') { snapshot(); erasedThisDrag = eraseAt(p[0], p[1]); cur = { erase: true, id: e.pointerId }; return; }
    cur = { tool, color, w: SIZES[size], pts: [p], id: e.pointerId }; redraw();
  });
  canvas.addEventListener('pointermove', e => {
    if (on && tool === 'laser' && e.pointerType !== 'touch' && !cur) { const p = pt(e); laser.push({ x: p[0], y: p[1], t: performance.now() }); if (!raf) loop(); return; } // mouse hover laser
    if (!cur || cur.id !== e.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const p = pt(ev);
      if (cur.laser) { laser.push({ x: p[0], y: p[1], t: performance.now() }); if (!raf) loop(); }
      else if (cur.erase) erasedThisDrag = eraseAt(p[0], p[1]) || erasedThisDrag;
      else { const last = cur.pts[cur.pts.length - 1]; if (Math.hypot((p[0] - last[0]) * W, (p[1] - last[1]) * H) > 0.8) cur.pts.push(p.map(v => Math.round(v * 10000) / 10000)); }
    }
    if (!cur.laser && !cur.erase) redraw();
  });
  const end = e => {
    if (!cur || cur.id !== e.pointerId) return;
    if (cur.erase) { if (!erasedThisDrag) history[slideId].pop(); }
    else if (!cur.laser) { const { id, ...s } = cur; snapshot(); list().push(s); persist(); }
    cur = null; redraw();
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  function setOn(v) { on = v; if (!on) { cur = null; laser = []; redraw(); } syncBar(); }
  syncBar();

  return {
    setSlide(id) { slideId = id; cur = null; redraw(); },
    toggle() { setOn(!on); },
    get active() { return on; },
    key(e) { // returns true if the key was handled
      if (!on) return false;
      if (e.key === 'Escape') { setOn(false); return true; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) { undo(); return true; }
      if (e.key === 'e' || e.key === 'E') { tool = 'eraser'; syncBar(); return true; }
      if (e.key === 'p' || e.key === 'P') { tool = 'pen'; syncBar(); return true; }
      if (e.key === 'h' || e.key === 'H') { tool = 'hl'; syncBar(); return true; }
      if (e.key === 'l' || e.key === 'L') { tool = 'laser'; syncBar(); return true; }
      return false;
    },
    destroy() { ro.disconnect(); cancelAnimationFrame(raf); canvas.remove(); bar.remove(); toggleBtn.remove(); }
  };
}
