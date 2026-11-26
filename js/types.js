// =====================================================================
// Slide types. Each entry in TYPES defines one kind of slide:
//   label, group, blurb      – shown in the "Add slide" picker
//   defaults                 – starting content for a new slide
//   fields                   – what the authoring tool's properties panel edits
//   stage(s, ctx)            – HTML for the big screen
//   phone(s)                 – HTML for audience phones (content slides)
//   mount(s, el, value, submit, ctx) – live control on phones (interactive slides)
//   valid(s, v)              – is a phone response acceptable?
//   viz(s, values), stat()   – how results are drawn on the big screen
//   sim(s, rnd)              – a fake response, for sample previews
//   after(s, root, ctx, animate) – runs after render (spinner animation)
//   action, run(s, live)     – presenter button + the live state it produces
//   update(s, root, ctx)     – refresh live data without re-rendering (custom widgets)
// To invent a new interaction, add one more entry here. Nothing else changes.
// =====================================================================

import { esc, safeUrl } from './util.js?v=2.3';
import { themeStyle } from './themes.js?v=2.3';
import { customType } from './widgets.js?v=2.3';
export { esc, safeUrl };
const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const F = (k, label, type = 'text', hint = '', opts = null) => ({ k, label, type, hint, opts });
const list = (a, max) => (Array.isArray(a) ? a : []).map(x => String(x).trim()).filter(Boolean).slice(0, max);

function richText(t) {
  return String(t || '').split(/\n\s*\n/).map(block => {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length && lines.every(l => /^\s*[-•]\s+/.test(l)))
      return `<ul>${lines.map(l => `<li>${esc(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    return lines.length ? `<p>${lines.map(esc).join('<br>')}</p>` : '';
  }).join('');
}
const img = (src, alt) => safeUrl(src) ? `<img src="${esc(safeUrl(src))}" alt="${esc(alt || '')}">` : `<div class="ph">Add an image in the panel</div>`;
const h1 = t => t ? `<h1>${esc(t)}</h1>` : '';

function videoEmbed(url, thumb) {
  const u = String(url || '').trim();
  if (!u) return `<div class="ph">Paste a YouTube, Vimeo, or .mp4 link</div>`;
  if (thumb) return `<div class="ph vidph">▶ Video</div>`;
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return `<iframe src="https://www.youtube-nocookie.com/embed/${m[1]}?rel=0" title="Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `<iframe src="https://player.vimeo.com/video/${m[1]}" title="Video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  const s = safeUrl(u);
  return s ? `<video src="${esc(s)}" controls playsinline></video>` : `<div class="ph">That link doesn't look like a video</div>`;
}

// ---------- shared pieces for interactive slides ----------
function interactiveStage(T, s, ctx) {
  const v = ctx.values || [], on = !!ctx.reveal;
  const stat = `${v.length} ${v.length === 1 ? 'response' : 'responses'}${on && T.stat ? T.stat(s, v) : ''}`;
  const foot = on ? (ctx.mode === 'edit' ? 'Sample results shown for preview' : '') : (ctx.mode === 'present' ? 'Results hidden. Press R to reveal.' : 'Results stay hidden until you reveal them');
  return `<div class="head">${h1(s.prompt)}<p class="stat">${stat}</p></div>
  <div class="viz">${on ? T.viz(s, v) : `<div class="wait"><span class="wn">${v.length}</span><span class="wl">${v.length === 1 ? 'response' : 'responses'} so far</span></div>`}</div>
  <p class="foot">${foot}</p>`;
}
const rows = items => `<div class="rows">${items.map(r => `<div class="row${r.top ? ' lead' : ''}"><span>${esc(r.label)}</span><span class="rt"><span class="rb" style="width:${Math.max(0, Math.min(100, r.pct)).toFixed(1)}%"></span></span><span class="rv">${r.right}</span></div>`).join('')}</div>`;

// ---------- spinner drawing ----------
function wheel(items) {
  const k = Math.max(items.length, 1), R = 100, a = 2 * Math.PI / k; let p = '';
  for (let i = 0; i < k; i++) {
    const a0 = i * a - Math.PI / 2, a1 = a0 + a;
    p += `<path d="M0 0L${(R * Math.cos(a0)).toFixed(2)} ${(R * Math.sin(a0)).toFixed(2)}A${R} ${R} 0 0 1 ${(R * Math.cos(a1)).toFixed(2)} ${(R * Math.sin(a1)).toFixed(2)}Z" class="seg${i % 2 ? '' : ' alt'}"/>`;
    p += `<text transform="rotate(${((a0 + a / 2) * 180 / Math.PI).toFixed(2)}) translate(66 0) rotate(90)" font-size="${k > 8 ? 12 : 15}" font-weight="700" class="segn" text-anchor="middle" dominant-baseline="middle">${i + 1}</text>`;
  }
  return `<svg viewBox="-112 -124 224 238" role="img" aria-label="Spinner wheel"><g class="wg">${p}<circle r="8" class="hub"/></g><path d="M-10 -122L10 -122L0 -99Z" class="ptr"/></svg>`;
}
function spinTo(root, s, live, animate, mode) {
  const its = list(s.items, 12), g = root.querySelector('.wg'), res = root.querySelector('[data-res]');
  const pick = (i, text) => {
    if (res) res.textContent = text ?? (i == null ? (mode === 'phone' ? 'Waiting for the spin…' : mode === 'present' ? 'Press Spin (or S)' : 'Spin while presenting') : its[i]);
    root.querySelectorAll('.plist li').forEach((li, j) => li.classList.toggle('pick', j === i));
  };
  clearTimeout(root._spinT);
  if (!g || !live || !Number.isInteger(live.idx) || live.idx < 0 || live.idx >= its.length) return pick(null);
  const deg = 360 / its.length, from = +g.dataset.r || 0, want = -(live.idx + .5) * deg;
  const next = from + (animate ? 1800 : 0) + (((want - from) % 360) + 360) % 360;
  g.style.transition = animate && !reduce ? 'transform 3.2s cubic-bezier(.15,.85,.2,1)' : 'none';
  g.style.transform = `rotate(${next}deg)`; g.dataset.r = next;
  if (animate && !reduce) { pick(null, 'Spinning…'); root._spinT = setTimeout(() => pick(live.idx), 3300); } else pick(live.idx);
}

// ---------- the registry ----------
export const TYPES = {
  title: {
    label: 'Title', group: 'Content', blurb: 'Big title and subtitle',
    defaults: { title: 'Presentation title', sub: 'Subtitle' },
    fields: [F('title', 'Title'), F('sub', 'Subtitle')],
    stage: s => `<div class="tcenter"><h1 class="big">${esc(s.title)}</h1>${s.sub ? `<p class="sub">${esc(s.sub)}</p>` : ''}</div>`,
    phone: s => `<h2>${esc(s.title)}</h2><p class="look">${esc(s.sub)}</p>`
  },
  text: {
    label: 'Text', group: 'Content', blurb: 'Heading with paragraphs or bullets',
    defaults: { heading: 'Heading', body: 'Write a paragraph here.\n\n- Start lines with a dash\n- to make bullet points' },
    fields: [F('heading', 'Heading'), F('body', 'Body', 'textarea', 'Leave a blank line between paragraphs. Start lines with "- " for bullets.')],
    stage: s => `${h1(s.heading)}<div class="body">${richText(s.body)}</div>`,
    phone: s => `<h2>${esc(s.heading)}</h2><div class="pbody">${richText(s.body)}</div>`
  },
  image: {
    label: 'Image', group: 'Content', blurb: 'One picture, with optional heading and caption',
    defaults: { heading: '', src: '', alt: '', caption: '', fit: 'contain' },
    fields: [F('heading', 'Heading (optional)'), F('src', 'Image', 'media'), F('alt', 'Alt text', 'text', 'Describes the image for screen readers'), F('caption', 'Caption'), F('fit', 'Fit', 'select', '', [['contain', 'Show the whole image'], ['cover', 'Fill the space']])],
    stage: s => `${h1(s.heading)}<div class="media fit-${s.fit === 'cover' ? 'cover' : 'contain'}">${img(s.src, s.alt)}</div>${s.caption ? `<p class="cap">${esc(s.caption)}</p>` : ''}`,
    phone: s => `${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}<div class="pimg">${img(s.src, s.alt)}</div>${s.caption ? `<p class="look">${esc(s.caption)}</p>` : ''}`
  },
  split: {
    label: 'Image + text', group: 'Content', blurb: 'Text on one side, picture on the other',
    defaults: { heading: 'Heading', body: 'Explain the picture here.', src: '', alt: '', side: 'right' },
    fields: [F('heading', 'Heading'), F('body', 'Body', 'textarea', 'Blank line = new paragraph. "- " = bullet.'), F('src', 'Image', 'media'), F('alt', 'Alt text'), F('side', 'Image side', 'select', '', [['right', 'Right'], ['left', 'Left']])],
    stage: s => `<div class="split${s.side === 'left' ? ' rev' : ''}"><div>${h1(s.heading)}<div class="body">${richText(s.body)}</div></div><div class="media">${img(s.src, s.alt)}</div></div>`,
    phone: s => `<h2>${esc(s.heading)}</h2><div class="pbody">${richText(s.body)}</div><div class="pimg">${img(s.src, s.alt)}</div>`
  },
  blank: {
    label: 'Free layout', group: 'Content', blurb: 'Place several pictures anywhere; drag to move and resize',
    defaults: { heading: '', pics: [] },
    fields: [F('heading', 'Heading (optional)')],
    stage: s => h1(s.heading) || (s.pics && s.pics.length ? '' : '<div class="ph">Add pictures in the panel, then drag them into place</div>'),
    phone: s => s.heading ? `<h2>${esc(s.heading)}</h2>` : ''
  },
  video: {
    label: 'Video', group: 'Content', blurb: 'YouTube, Vimeo, or an .mp4 file',
    defaults: { heading: '', url: '' },
    fields: [F('heading', 'Heading (optional)'), F('url', 'Video link', 'text', 'YouTube, Vimeo, or a direct .mp4 link (a file in your repo works too, e.g. media/clip.mp4)')],
    stage: (s, ctx) => `${h1(s.heading)}<div class="media vid">${videoEmbed(s.url, ctx.thumb)}</div>`,
    phone: s => `${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}<p class="look"><strong>Watch the screen.</strong></p>`
  },

  poll: {
    label: 'Poll', group: 'Interactive', blurb: 'Everyone picks one option; live bars', interactive: true,
    defaults: { prompt: 'Your question?', options: ['Option A', 'Option B', 'Option C'] },
    fields: [F('prompt', 'Question'), F('options', 'Options', 'list', 'One per line, 2 to 8')],
    valid: (s, v) => Number.isInteger(v) && v >= 0 && v < list(s.options, 8).length,
    sim: (s, rnd) => Math.min(Math.floor(rnd() ** 1.4 * list(s.options, 8).length), list(s.options, 8).length - 1),
    viz(s, v) {
      const o = list(s.options, 8), c = o.map(() => 0); v.forEach(x => c[x]++);
      const t = Math.max(1, v.length), mx = Math.max(...c);
      return rows(o.map((label, i) => ({ label, pct: c[i] / t * 100, top: mx > 0 && c[i] === mx, right: `${Math.round(c[i] / t * 100)}% <small>(${c[i]})</small>` })));
    },
    mount(s, el, v, submit) {
      el.innerHTML = list(s.options, 8).map((o, i) => `<button class="opt${v === i ? ' sel' : ''}" data-i="${i}">${esc(o)}</button>`).join('');
      el.onclick = e => { const b = e.target.closest('.opt'); if (!b) return; el.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === b)); submit(+b.dataset.i); };
    }
  },
  slider: {
    label: 'Slider', group: 'Interactive', blurb: 'Rate on a scale; live histogram and average', interactive: true,
    defaults: { prompt: 'How confident are you?', min: 0, max: 10, lo: 'Not at all', hi: 'Completely' },
    fields: [F('prompt', 'Question'), F('min', 'Lowest value', 'number'), F('max', 'Highest value', 'number', 'Up to 20 steps from lowest to highest'), F('lo', 'Low-end label'), F('hi', 'High-end label')],
    valid: (s, v) => Number.isInteger(v) && v >= +s.min && v <= +s.max,
    sim: (s, rnd) => { const a = +s.min, b = +s.max; return Math.max(a, Math.min(b, Math.round(a + (b - a) * (.62 + (rnd() + rnd() + rnd() - 1.5) * .3)))); },
    stat: (s, v) => v.length ? ` · average ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}` : '',
    viz(s, v) {
      const a = +s.min, bins = Array(+s.max - a + 1).fill(0); v.forEach(x => bins[x - a]++); const mx = Math.max(1, ...bins);
      return `<div class="vcol"><div class="hist">${bins.map(c => `<div class="col"><div class="b" style="height:${c / mx * 100}%"><span class="cn">${c || ''}</span></div></div>`).join('')}</div><div class="cls">${bins.map((c, i) => `<span>${i + a}</span>`).join('')}</div><div class="ends"><span>${esc(s.lo)}</span><span>${esc(s.hi)}</span></div></div>`;
    },
    mount(s, el, v, submit) {
      const mid = Math.round((+s.min + +s.max) / 2);
      el.innerHTML = `<div class="bigval">${v ?? '–'}</div><input type="range" min="${+s.min}" max="${+s.max}" step="1" value="${v ?? mid}" aria-label="Your answer"><div class="ends"><span>${esc(s.lo)}</span><span>${esc(s.hi)}</span></div>`;
      const r = el.querySelector('input'), bv = el.querySelector('.bigval');
      r.oninput = () => { bv.textContent = r.value; submit(+r.value); };
    }
  },
  rank: {
    label: 'Ranking', group: 'Interactive', blurb: 'Everyone puts items in order; shows the group ranking', interactive: true,
    defaults: { prompt: 'Rank these from most to least important', items: ['First item', 'Second item', 'Third item', 'Fourth item'] },
    fields: [F('prompt', 'Prompt'), F('items', 'Items', 'list', 'One per line, 2 to 8')],
    valid(s, v) { const k = list(s.items, 8).length; return Array.isArray(v) && v.length === k && new Set(v).size === k && v.every(x => Number.isInteger(x) && x >= 0 && x < k); },
    sim(s, rnd) { const a = [...list(s.items, 8).keys()]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    viz(s, v) {
      const its = list(s.items, 8), k = its.length, sum = Array(k).fill(0);
      v.forEach(o => o.forEach((it, pos) => sum[it] += pos + 1));
      const avg = sum.map(x => v.length ? x / v.length : 0), order = [...its.keys()].sort((a, b) => avg[a] - avg[b]);
      return rows(order.map((i, r) => ({ label: `${r + 1}. ${its[i]}`, pct: v.length ? (k + 1 - avg[i]) / k * 100 : 0, top: r === 0 && v.length > 0, right: `<small>avg rank</small> ${avg[i].toFixed(1)}` })));
    },
    mount(s, el, v, submit) {
      const its = list(s.items, 8); let o = (Array.isArray(v) ? v : [...its.keys()]).slice(); let locked = Array.isArray(v);
      const draw = () => {
        el.innerHTML = `<ol class="slist">${o.map((it, p) => `<li><span class="rk">${p + 1}</span><span class="nm">${esc(its[it])}</span><button class="mv" data-p="${p}" data-d="-1" aria-label="Move up"${p === 0 ? ' disabled' : ''}>↑</button><button class="mv" data-p="${p}" data-d="1" aria-label="Move down"${p === o.length - 1 ? ' disabled' : ''}>↓</button></li>`).join('')}</ol><button class="pbtn lock">${locked ? 'Update my ranking' : 'Lock in my ranking'}</button>`;
      };
      el.onclick = e => {
        const m = e.target.closest('.mv');
        if (m) { const p = +m.dataset.p, q = p + +m.dataset.d; [o[p], o[q]] = [o[q], o[p]]; draw(); return; }
        if (e.target.closest('.lock')) { locked = true; submit(o.slice()); draw(); }
      };
      draw();
    }
  },
  words: {
    label: 'Word cloud', group: 'Interactive', blurb: 'Short answers grow bigger as more people send them', interactive: true,
    defaults: { prompt: 'In one word…' },
    fields: [F('prompt', 'Prompt')],
    norm: w => String(w || '').toLowerCase().replace(/[^a-z0-9' -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30),
    valid: (s, v) => typeof v === 'string' && /^[a-z0-9][a-z0-9' -]{0,29}$/.test(v),
    sim: (s, rnd) => ['engaging', 'curious', 'alive', 'playful', 'surprising', 'clear', 'memorable', 'focused', 'fun', 'energizing'][Math.floor(rnd() ** 1.7 * 10)],
    viz(s, v) {
      const m = new Map(); v.forEach(w => m.set(w, (m.get(w) || 0) + 1));
      const arr = [...m].sort((a, b) => b[1] - a[1]).slice(0, 40), mx = arr.length ? arr[0][1] : 1;
      return arr.length ? `<div class="cloud">${arr.map(([w, c]) => `<span style="font-size:${(1.8 + c / mx * 5).toFixed(2)}cqi">${esc(w)}</span>`).join('')}</div>` : '<p class="wl">No answers yet</p>';
    },
    mount(s, el, v, submit) {
      el.innerHTML = `<form class="wordrow"><input maxlength="30" autocomplete="off" placeholder="Type your answer" aria-label="Your answer" value="${esc(v || '')}"><button class="pbtn">Send</button></form><p class="hint">A word or short phrase. You can change it anytime.</p>`;
      el.querySelector('form').onsubmit = e => {
        e.preventDefault(); const w = TYPES.words.norm(el.querySelector('input').value);
        if (TYPES.words.valid(s, w)) submit(w); else el.querySelector('.hint').textContent = 'Use letters or numbers, up to 30 characters.';
      };
    }
  },
  spinner: {
    label: 'Spinner', group: 'Interactive', blurb: 'You spin; every phone sees where it lands', action: 'Spin',
    defaults: { title: 'Spin for a discussion prompt', items: ['A lesson that flopped', 'A tool you abandoned', 'Your best "aha" moment', 'A student who surprised you'] },
    fields: [F('title', 'Title'), F('items', 'Wheel items', 'list', 'One per line, 2 to 12')],
    stage: s => `${h1(s.title)}<div class="split spinrow"><div class="wheelbox">${wheel(list(s.items, 12))}</div><div><p class="lbl">The wheel says</p><p class="result" data-res></p><ol class="plist">${list(s.items, 12).map(x => `<li>${esc(x)}</li>`).join('')}</ol></div></div>`,
    after: (s, root, ctx, animate) => spinTo(root, s, ctx.live, animate, ctx.mode),
    run(s, prev) { const k = list(s.items, 12).length; let idx = Math.floor(Math.random() * k); if (prev && k > 1 && idx === prev.idx) idx = (idx + 1) % k; return { idx, n: Date.now() }; },
    mount(s, el) { el.innerHTML = `<div class="pwheel">${wheel(list(s.items, 12))}</div><p class="result" data-res></p>`; }
  }
};

TYPES.custom = customType({ F, h1 });
for (const T of Object.values(TYPES)) if (T.interactive && !T.stage) T.stage = (s, ctx) => interactiveStage(T, s, ctx);

export function newSlide(type) {
  const T = TYPES[type];
  return { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, ...JSON.parse(JSON.stringify(T.defaults)), notes: '' };
}
export function renderSlide(s, ctx = {}) {
  const T = TYPES[s && s.type];
  if (!T) return `<div class="slide"><p class="body">Unknown slide type</p></div>`;
  return `<div class="slide t-${s.type}" style="${themeStyle(ctx.theme)}">${picsHtml(s, true)}${T.stage(s, ctx)}${picsHtml(s, false)}</div>`;
}
// Pictures layer: any slide can carry freely placed pictures (s.pics), each positioned in
// percent of the slide: { id, src, alt, x, y, w, h, fit: 'contain'|'cover', back: behind the text? }
const pct = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0)).toFixed(2);
export const picStyle = p => `left:${pct(p.x, -100, 200)}%;top:${pct(p.y, -100, 200)}%;width:${pct(p.w, 1, 300)}%;height:${pct(p.h, 1, 300)}%;object-fit:${p.fit === 'cover' ? 'cover' : 'contain'}`;
function picsHtml(s, back) {
  const list = (Array.isArray(s.pics) ? s.pics : []).filter(p => !!p.back === back && safeUrl(p.src));
  if (!list.length) return '';
  return `<div class="pics${back ? ' back' : ''}">${list.map(p => `<img class="pic" data-pid="${esc(p.id)}" src="${esc(safeUrl(p.src))}" alt="${esc(p.alt || '')}" style="${picStyle(p)}" draggable="false">`).join('')}</div>`;
}
export const phonePics = s => (Array.isArray(s.pics) ? s.pics : []).filter(p => safeUrl(p.src)).map(p => `<div class="pimg"><img src="${esc(safeUrl(p.src))}" alt="${esc(p.alt || '')}"></div>`).join('');
// Stable fake responses for previews (seeded by the slide id, so they don't jump while you type)
export function sampleValues(s, n = 20) {
  const T = TYPES[s.type]; if (!T || !T.sim) return [];
  let h = 2166136261; for (const ch of String(s.id) + JSON.stringify(s.options || s.items || [s.min, s.max])) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h = Math.imul(h ^ h >>> 15, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  return Array.from({ length: n }, () => T.sim(s, rnd)).filter(v => T.valid(s, v));
}
export function describe(s, v) {
  if (s.type === 'poll') return list(s.options, 8)[v] ?? '';
  if (s.type === 'rank') return v.map(i => list(s.items, 8)[i]).join(' > ');
  if (s.type === 'custom') return v;
  return String(v);
}
