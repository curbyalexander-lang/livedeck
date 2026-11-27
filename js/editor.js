// Authoring tool: slide rail (left), live preview (center), properties (right). Autosaves.
import { TYPES, renderSlide, newSlide, esc, sampleValues } from './types.js?v=2.3';
import { normalize, loadFonts, DEFAULT_THEME } from './themes.js?v=2.3';
import { openThemePanel } from './themepanel.js?v=2.3';
import { openWidgetLib } from './widgetlib.js?v=2.3';
import { VERSION } from './version.js?v=2.3';
import { createArrange } from './arrange.js?v=2.3';
import { createInline } from './inline.js?v=2.3';
import { safeUrl } from './util.js?v=2.3';

export async function mount(root, store, id) {
  const deck = await store.getDeck(id);
  if (!deck) { root.innerHTML = `<div class="page"><h1>Presentation not found</h1><p><a class="btn" href="#decks">Back</a></p></div>`; return; }
  deck.id = id; deck.slides = Array.isArray(deck.slides) ? deck.slides : [];
  if (!deck.slides.length) deck.slides.push(newSlide('title'));
  deck.theme = normalize(deck.theme || DEFAULT_THEME); loadFonts(deck.theme);
  let sel = 0, sample = true, timer = 0, saving = Promise.resolve(), dragFrom = -1, widgets = {}, arr = null, inl = null;
  const setWidgets = arr => { widgets = {}; (arr || []).forEach(w => widgets[w.id] = w); };
  try { setWidgets(await store.listItems('widgets')); } catch (e) { }

  root.innerHTML = `<div class="ed">
  <header class="edbar"><a class="btn ghost" href="#decks">← Presentations</a>
    <input id="dtitle" class="dtitle" aria-label="Presentation title" maxlength="120">
    <span class="status" id="status" aria-live="polite">Saved</span><span class="status" title="LiveDeck version">v${VERSION}</span><span class="grow"></span>
    <button class="btn" id="theme">Theme</button><button class="btn" id="wlib">Widgets</button><button class="btn" id="export">Export</button><button class="btn primary" id="present">Present</button></header>
  <aside class="rail"><ol id="thumbs" class="thumbs"></ol><button class="btn add" id="add">+ Add slide</button></aside>
  <main class="canvas"><div class="ctop"><span id="slabel" class="muted"></span>
    <label class="chk"><input type="checkbox" id="sample" checked> Preview with sample results</label></div>
    <div class="fmtbar" id="fmtbar" role="toolbar" aria-label="Text formatting" hidden>
      <button data-cmd="bold" title="Bold (Cmd/Ctrl+B)" aria-label="Bold"><b>B</b></button><button data-cmd="italic" title="Italic (Cmd/Ctrl+I)" aria-label="Italic"><i>I</i></button><button data-cmd="underline" title="Underline (Cmd/Ctrl+U)" aria-label="Underline"><u>U</u></button><button data-cmd="highlight" title="Highlight" aria-label="Highlight"><mark>ab</mark></button>
      <span class="fsep"></span><button data-cmd="insertUnorderedList" title="Bulleted list" aria-label="Bulleted list">• List</button><button data-cmd="insertOrderedList" title="Numbered list" aria-label="Numbered list">1. List</button>
      <span class="fsep"></span><button data-cmd="link" title="Link" aria-label="Add link">Link</button><button data-cmd="removeFormat" title="Clear formatting" aria-label="Clear formatting">Clear</button>
      <span class="flink" id="flink" hidden><input id="flinkurl" type="text" inputmode="url" placeholder="https://…" aria-label="Link address"><button id="flinkok">Add link</button><button id="flinkno" aria-label="Cancel">✕</button></span>
      <span class="grow"></span>
      <label>Size <select id="fsize"><option value="m">Normal</option><option value="s">Small</option><option value="l">Large</option><option value="xl">Extra large</option></select></label>
      <label>Align <select id="falign"><option value="left">Left</option><option value="center">Centered</option></select></label>
    </div>
    <div class="stagewrap" id="preview"></div><p class="muted small">Click any text on the slide to edit it right there. Media, video, and wheel spins play in the preview just as they will when presenting.</p></main>
  <section class="props" id="props"></section>
  <div class="modal" id="picker" hidden><div class="mbox" role="dialog" aria-label="Add a slide"><div class="mhead"><h2>Add a slide</h2><button class="btn ghost" id="pclose">Close</button></div><div id="pgrid"></div></div></div>
  </div>`;
  const $ = s => root.querySelector(s);
  const status = t => $('#status').textContent = t;
  $('#dtitle').value = deck.title || '';
  $('#dtitle').oninput = e => { deck.title = e.target.value; queue(); };

  function queue() { status('Unsaved changes'); clearTimeout(timer); timer = setTimeout(save, 700); }
  function save() {
    clearTimeout(timer); timer = 0; status('Saving…');
    saving = store.saveDeck(deck).then(() => status('Saved'), e => status('Save failed: ' + e.message));
    return saving;
  }

  // ---- thumbnails ----
  const ctxFor = (s, mode) => ({ mode, theme: deck.theme, widgets, thumb: mode === 'thumb', values: sample ? sampleValues(s) : [], reveal: sample, live: sample && s.type === 'spinner' ? { idx: 0, n: 1 } : null });
  function thumbHtml(s, i) { return `<span class="tn">${i + 1}</span><div class="tb">${renderSlide(s, ctxFor(s, 'thumb'))}</div>`; }
  function drawThumbs() {
    $('#thumbs').innerHTML = deck.slides.map((s, i) => `<li draggable="true" data-i="${i}" class="${i === sel ? 'on' : ''}" tabindex="0" aria-label="Slide ${i + 1}: ${esc(TYPES[s.type]?.label || s.type)}">${thumbHtml(s, i)}</li>`).join('');
    root.querySelectorAll('.thumbs li').forEach(li => li.querySelectorAll('.tb').forEach(tb => { const T = TYPES[deck.slides[+li.dataset.i].type]; if (T && T.after) T.after(deck.slides[+li.dataset.i], tb, ctxFor(deck.slides[+li.dataset.i], 'thumb'), false); }));
  }
  function updateThumb() {
    const li = $(`.thumbs li[data-i="${sel}"]`); if (!li) return drawThumbs();
    const s = deck.slides[sel]; li.innerHTML = thumbHtml(s, sel);
    const T = TYPES[s.type]; if (T.after) T.after(s, li.querySelector('.tb'), ctxFor(s, 'thumb'), false);
  }
  const th = $('#thumbs');
  th.onclick = e => { const li = e.target.closest('li'); if (li) select(+li.dataset.i); };
  th.onkeydown = e => {
    const li = e.target.closest('li'); if (!li) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(+li.dataset.i); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); select(Math.max(0, Math.min(deck.slides.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)))); $(`.thumbs li[data-i="${sel}"]`)?.focus(); }
  };
  th.ondragstart = e => { const li = e.target.closest('li'); if (!li) return; dragFrom = +li.dataset.i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (x) { } };
  th.ondragover = e => { if (dragFrom < 0) return; e.preventDefault(); root.querySelectorAll('.thumbs li').forEach(l => l.classList.remove('dropbefore')); e.target.closest('li')?.classList.add('dropbefore'); };
  th.ondrop = e => {
    e.preventDefault(); const li = e.target.closest('li'); const to = li ? +li.dataset.i : deck.slides.length - 1;
    if (dragFrom >= 0 && to !== dragFrom) { const [m] = deck.slides.splice(dragFrom, 1); deck.slides.splice(to, 0, m); sel = to; queue(); }
    dragFrom = -1; drawAll();
  };
  th.ondragend = () => { dragFrom = -1; root.querySelectorAll('.thumbs li').forEach(l => l.classList.remove('dropbefore')); };

  // ---- preview ----
  function drawPreview() {
    const s = deck.slides[sel], T = TYPES[s.type], el = $('#preview');
    el.innerHTML = renderSlide(s, { ...ctxFor(s, 'edit'), inline: true });
    if (T && T.after) T.after(s, el, ctxFor(s, 'edit'), false);
    if (arr) arr.render();
    if (inl) inl.enable();
    fmtSync();
    $('#slabel').textContent = `Slide ${sel + 1} of ${deck.slides.length} · ${T ? T.label : s.type}`;
  }
  $('#sample').onchange = e => { sample = e.target.checked; drawPreview(); drawThumbs(); };

  // ---- properties ----
  function fieldHtml(f, v) {
    const id = 'f-' + f.k, hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
    let input;
    if (f.type === 'textarea') input = `<textarea id="${id}" data-k="${f.k}" rows="7">${esc(v)}</textarea>`;
    else if (f.type === 'list') input = `<textarea id="${id}" data-k="${f.k}" data-list="1" rows="6">${esc((v || []).join('\n'))}</textarea>`;
    else if (f.type === 'number') input = `<input id="${id}" data-k="${f.k}" type="number" step="1" value="${esc(v)}">`;
    else if (f.type === 'select') input = `<select id="${id}" data-k="${f.k}">${f.opts.map(([val, lab]) => `<option value="${esc(val)}"${val === v ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
    else if (f.type === 'media') input = `<div class="mediaf"><input id="${id}" data-k="${f.k}" type="text" inputmode="url" placeholder="https://…  or  media/photo.jpg" value="${esc(String(v || '').startsWith('data:') ? '' : v)}">
      ${store.canUpload ? `<label class="btn small">Upload<input type="file" accept="image/*" data-up="${f.k}" hidden></label>` : ''}</div>
      ${String(v || '').startsWith('data:') ? '<small>Uploaded image stored in this browser. <button class="linkbtn" data-clear="' + f.k + '">Remove</button></small>' : ''}<small class="uperr" data-uperr="${f.k}"></small>`;
    else if (f.type === 'widget') {
      const ws = Object.values(widgets).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      input = `<select id="${id}" data-k="${f.k}"><option value="">Choose a widget…</option>${ws.map(w => `<option value="${esc(w.id)}"${w.id === v ? ' selected' : ''}>${esc(w.name || 'Untitled')}</option>`).join('')}</select>
      <div class="wact"><button class="btn small" data-act="wedit">${v && widgets[v] ? 'Edit this widget' : 'Open widget library'}</button></div>${v && !widgets[v] ? '<small class="uperr">This widget is missing from your library.</small>' : ''}`;
    }
    else input = `<input id="${id}" data-k="${f.k}" type="text" value="${esc(v)}">`;
    return `<div class="field"><label for="${id}">${esc(f.label)}</label>${input}${hint}</div>`;
  }
  function drawProps() {
    const s = deck.slides[sel], T = TYPES[s.type];
    $('#props').innerHTML = `<div class="phead"><h2>${esc(T ? T.label : s.type)}</h2>
      <div class="ptools"><button class="btn small" data-act="up" aria-label="Move slide up"${sel === 0 ? ' disabled' : ''}>↑</button><button class="btn small" data-act="down" aria-label="Move slide down"${sel === deck.slides.length - 1 ? ' disabled' : ''}>↓</button><button class="btn small" data-act="dup">Duplicate</button><button class="btn small ghost" data-act="del"${deck.slides.length < 2 ? ' disabled' : ''}>Delete</button></div></div>
      ${T ? `<p class="muted small">${esc(T.blurb)}</p>` + T.fields.map(f => fieldHtml(f, s[f.k])).join('') : ''}
      <div class="field"><label for="f-hsize">Heading size</label><div class="mediaf"><select id="f-hsize" data-k="hsize">${[['m', 'Normal'], ['s', 'Small'], ['l', 'Large'], ['xl', 'Extra large']].map(([v, l]) => `<option value="${v}"${(s.hsize || 'm') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn small" data-act="hsizeall" title="Give every slide in this presentation this heading size">Use on all slides</button></div><small id="hsizemsg"></small></div>
      ${picsPanel(s)}
      <div class="field"><label for="f-notes">Speaker notes</label><textarea id="f-notes" data-k="notes" rows="4">${esc(s.notes || '')}</textarea><small>Only you see these, below the slide while presenting.</small></div>`;
  }
  // ---- pictures (any slide can hold several, placed freely) ----
  function picsPanel(s) {
    const list = Array.isArray(s.pics) ? s.pics : [], on = arr && arr.selected;
    return `<div class="field picsf"><label>Pictures on this slide${list.length ? ` (${list.length})` : ''}</label>
      <div class="piclist">${list.map((p, i) => `<div class="picrow${p.id === on ? ' on' : ''}" data-pid="${esc(p.id)}">
        <button class="pthumb" data-pa="sel" aria-label="Select picture ${i + 1}">${safeUrl(p.src) ? `<img src="${esc(safeUrl(p.src))}" alt="">` : ''}</button>
        <div class="pfields"><input data-pk="alt" value="${esc(p.alt || '')}" placeholder="Alt text (describe it)" aria-label="Alt text for picture ${i + 1}">
        <div class="prow2"><select data-pk="fit" aria-label="Fit"><option value="contain"${p.fit !== 'cover' ? ' selected' : ''}>Whole picture</option><option value="cover"${p.fit === 'cover' ? ' selected' : ''}>Crop to fill box</option></select>
        <label class="chk small"><input type="checkbox" data-pk="back"${p.back ? ' checked' : ''}> Behind text</label></div></div>
        <div class="pbtns"><button class="btn small" data-pa="up" aria-label="Bring forward"${i === list.length - 1 ? ' disabled' : ''}>↑</button><button class="btn small" data-pa="down" aria-label="Send backward"${i === 0 ? ' disabled' : ''}>↓</button><button class="btn small ghost" data-pa="del" aria-label="Remove picture">✕</button></div>
      </div>`).join('')}</div>
      <div class="mediaf"><input id="newpic" type="text" inputmode="url" placeholder="Paste an image link…" aria-label="Image link"><button class="btn small" data-act="addpic">Add</button>
      ${store.canUpload ? '<label class="btn small">Upload<input type="file" accept="image/*" multiple data-picup="1" hidden></label>' : ''}</div>
      <small class="uperr" id="picerr"></small>
      <small>${list.length ? 'Drag pictures on the slide to move them. Drag a corner to resize (hold Shift to stretch), or an edge to stretch one side. Arrow keys nudge the selected picture; Delete removes it.' : 'Add as many pictures as you like (you can upload several at once), then drag them into place on the slide.'}</small></div>`;
  }
  function addPics(srcs) {
    const s = deck.slides[sel]; s.pics = Array.isArray(s.pics) ? s.pics : [];
    let last = null, pending = srcs.length;
    srcs.forEach((src, k) => {
      const img = new Image();
      const place = ar => {
        const n = s.pics.length, w = srcs.length > 1 ? Math.min(30, 90 / srcs.length) : 36, h = Math.min(80, w * 16 / 9 / (ar || 4 / 3));
        const p = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), src, alt: '', fit: 'contain', back: false, w: +w.toFixed(2), h: +h.toFixed(2),
          x: +(srcs.length > 1 ? 5 + k * (90 / srcs.length) : 8 + (n * 6) % 48).toFixed(2), y: +(srcs.length > 1 ? (100 - h) / 2 : 12 + (n * 6) % 40).toFixed(2) };
        s.pics.push(p); last = p.id;
        if (--pending === 0) { if (deck.slides[sel] === s) { drawPreview(); arr.select(last); drawProps(); } updateThumb(); queue(); }
      };
      img.onload = () => place(img.naturalWidth / img.naturalHeight); img.onerror = () => place(4 / 3); img.src = src;
    });
  }
  function picAction(a, pid) {
    const s = deck.slides[sel], L = s.pics || [], i = L.findIndex(p => p.id === pid); if (i < 0) return;
    if (a === 'sel') { arr.select(pid); return; }
    if (a === 'up' && i < L.length - 1) [L[i], L[i + 1]] = [L[i + 1], L[i]];
    else if (a === 'down' && i > 0) [L[i], L[i - 1]] = [L[i - 1], L[i]];
    else if (a === 'del') L.splice(i, 1);
    else return;
    drawPreview(); drawProps(); updateThumb(); queue();
  }

  function setField(k, el) {
    const s = deck.slides[sel], T = TYPES[s.type], f = T.fields.find(x => x.k === k) || { type: 'text' };
    if (f.type === 'list') s[k] = el.value.split('\n').map(x => x.trim()).filter(Boolean);
    else if (f.type === 'number') {
      let n = Math.round(Number(el.value)); if (!Number.isFinite(n)) return;
      s[k] = n;
      if (s.type === 'slider') { if (k === 'min' && s.max <= s.min) s.max = s.min + 1; if (k === 'max' && s.max <= s.min) s.min = s.max - 1; if (s.max - s.min > 20) { if (k === 'min') s.max = s.min + 20; else s.min = s.max - 20; } }
    } else s[k] = el.value;
    drawPreview(); updateThumb(); queue();
    if (f.type === 'widget') drawProps();
  }
  const props = $('#props');
  props.oninput = e => {
    const pk = e.target.dataset.pk;
    if (pk) { const row = e.target.closest('.picrow'), p = (deck.slides[sel].pics || []).find(x => x.id === row.dataset.pid); if (!p) return; p[pk] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; drawPreview(); updateThumb(); queue(); return; }
    const k = e.target.dataset.k; if (k && e.target.type !== 'file') setField(k, e.target);
  };
  props.onkeydown = e => { if (e.target.id === 'newpic' && e.key === 'Enter') { e.preventDefault(); props.querySelector('[data-act="addpic"]').click(); } };
  props.onchange = async e => {
    if (e.target.tagName === 'SELECT') return; // handled by input
    if (e.target.dataset.picup && e.target.files.length) {
      const err = props.querySelector('#picerr'); err.textContent = 'Uploading…'; const urls = [];
      for (const f of [...e.target.files].slice(0, 12)) { try { urls.push(await store.upload(f)); } catch (x) { err.textContent = x.message || 'Upload failed.'; } }
      if (urls.length) { if (err.textContent === 'Uploading…') err.textContent = ''; addPics(urls); }
      return;
    }
    const k = e.target.dataset.up; if (!k || !e.target.files[0]) return;
    const msg = props.querySelector(`[data-uperr="${k}"]`); msg.textContent = 'Uploading…';
    try { deck.slides[sel][k] = await store.upload(e.target.files[0]); drawProps(); drawPreview(); updateThumb(); queue(); }
    catch (x) { msg.textContent = x.message || 'Upload failed.'; }
  };
  props.onclick = e => {
    const c = e.target.closest('[data-clear]'); if (c) { deck.slides[sel][c.dataset.clear] = ''; drawProps(); drawPreview(); updateThumb(); queue(); return; }
    const pa = e.target.closest('[data-pa]'); if (pa) return picAction(pa.dataset.pa, pa.closest('.picrow').dataset.pid);
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, S = deck.slides;
    if (a === 'addpic') { const u = props.querySelector('#newpic').value.trim(); if (!safeUrl(u)) { props.querySelector('#picerr').textContent = 'That doesn\u2019t look like an image link (it should start with https://).'; return; } addPics([u]); return; }
    if (a === 'wedit') return openLib(S[sel].widgetId);
    if (a === 'hsizeall') { const v = S[sel].hsize || 'm'; S.forEach(x => { if (v === 'm') delete x.hsize; else x.hsize = v; }); drawThumbs(); drawPreview(); queue(); props.querySelector('#hsizemsg').textContent = `All ${S.length} slides now use this heading size.`; return; }
    if (a === 'up' && sel > 0) { [S[sel - 1], S[sel]] = [S[sel], S[sel - 1]]; sel--; }
    else if (a === 'down' && sel < S.length - 1) { [S[sel + 1], S[sel]] = [S[sel], S[sel + 1]]; sel++; }
    else if (a === 'dup') { const copy = JSON.parse(JSON.stringify(S[sel])); copy.id = newSlide(copy.type).id; S.splice(sel + 1, 0, copy); sel++; }
    else if (a === 'del') {
      if (S.length < 2) return;
      if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Confirm delete'; return; }
      S.splice(sel, 1); sel = Math.min(sel, S.length - 1);
    } else return;
    queue(); drawAll();
  };

  // ---- add-slide picker ----
  const groups = {};
  for (const [k, T] of Object.entries(TYPES)) (groups[T.group] ||= []).push([k, T]);
  $('#pgrid').innerHTML = Object.entries(groups).map(([g, list]) => `<h3>${esc(g)}</h3><div class="pgrid">${list.map(([k, T]) => `<button class="ptype" data-type="${k}"><strong>${esc(T.label)}</strong><span>${esc(T.blurb)}</span></button>`).join('')}</div>`).join('');
  const openPicker = () => { $('#picker').hidden = false; $('#picker .ptype').focus(); };
  const closePicker = () => { $('#picker').hidden = true; $('#add').focus(); };
  $('#add').onclick = openPicker; $('#pclose').onclick = closePicker;
  $('#picker').onclick = e => {
    if (e.target.id === 'picker') return closePicker();
    const b = e.target.closest('.ptype'); if (!b) return;
    deck.slides.splice(sel + 1, 0, newSlide(b.dataset.type)); sel++; closePicker(); queue(); drawAll();
  };
  const onKey = e => {
    if (e.key === 'Escape' && !$('#picker').hidden) return closePicker();
    if (document.querySelector('.modal:not([hidden])') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (arr.key(e)) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  // ---- theme + widget library ----
  $('#theme').onclick = () => openThemePanel({ store, deck, slide: () => deck.slides[sel], ctxFor, onChange: () => { queue(); drawPreview(); drawThumbs(); } });
  function openLib(startId) {
    openWidgetLib({ store, theme: deck.theme, startId, onSaved: arr => { setWidgets(arr); drawAll(); } });
  }
  $('#wlib').onclick = () => openLib();

  // ---- export / present ----
  $('#export').onclick = async () => { const { openExport } = await import('./export.js?v=2.3'); openExport({ store, deck, widgets }); };
  $('#present').onclick = async () => { await save(); location.hash = '#present-' + id; };

  arr = createArrange($('#preview'), {
    getSlide: () => deck.slides[sel],
    onSelect: id => root.querySelectorAll('.picrow').forEach(r => r.classList.toggle('on', r.dataset.pid === id)),
    onCommit: structural => { if (structural) { drawPreview(); drawProps(); } updateThumb(); queue(); }
  });
  // Type directly on the slide; keep the panel's fields in step.
  inl = createInline($('#preview'), {
    getSlide: () => deck.slides[sel],
    onField: f => { const el = props.querySelector(`[data-k="${f}"]`), v = deck.slides[sel][f]; if (el && document.activeElement !== el) el.value = Array.isArray(v) ? v.join('\n') : (v ?? ''); updateThumb(); queue(); },
    onDone: () => drawPreview(),
    onFocus: () => fmtSync()
  });

  // ---- formatting bar (shown on slides with body text) ----
  const fbar = $('#fmtbar');
  function fmtSync() {
    const s = deck.slides[sel], hasBody = TYPES[s.type] && TYPES[s.type].fields.some(f => f.k === 'body');
    fbar.hidden = !hasBody; if (!hasBody) return;
    const on = !!(inl && inl.bodyActive);
    fbar.classList.toggle('active', on);
    fbar.querySelectorAll('[data-cmd]').forEach(b => { b.disabled = !on; b.classList.toggle('on', on && ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'].includes(b.dataset.cmd) && inl.state(b.dataset.cmd)); });
    $('#fsize').value = s.size || 'm'; $('#falign').value = s.align || 'left';
  }
  fbar.addEventListener('mousedown', e => { if (e.target.closest('[data-cmd]')) e.preventDefault(); }); // keep the text selection
  fbar.addEventListener('click', e => {
    const b = e.target.closest('[data-cmd]'); if (!b || b.disabled) return;
    if (b.dataset.cmd === 'link') { inl.keep(); $('#flink').hidden = false; $('#flinkurl').value = ''; $('#flinkurl').focus(); return; }
    inl.apply(b.dataset.cmd); fmtSync();
  });
  const linkDone = ok => {
    let u = $('#flinkurl').value.trim(); $('#flink').hidden = true;
    if (!ok || !u) { inl.reset(); return; }
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    u = u.replace(/^http:\/\//i, 'https://');
    if (inl.collapsed) inl.apply('insertHTML', `<a href="${esc(u)}">${esc(u)}</a>`); else inl.apply('createLink', u);
  };
  $('#flinkok').onclick = () => linkDone(true); $('#flinkno').onclick = () => linkDone(false);
  $('#flinkurl').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); linkDone(true); } if (e.key === 'Escape') { e.preventDefault(); linkDone(false); } };
  document.addEventListener('selectionchange', () => { if (inl && inl.bodyActive) fmtSync(); });
  const setStyle = (k, v) => { deck.slides[sel][k] = v; const el = props.querySelector(`[data-k="${k}"]`); if (el) el.value = v; drawPreview(); updateThumb(); queue(); };
  $('#fsize').onchange = e => setStyle('size', e.target.value);
  $('#falign').onchange = e => setStyle('align', e.target.value);
  function select(i) { sel = i; root.querySelectorAll('.thumbs li').forEach(l => l.classList.toggle('on', +l.dataset.i === sel)); drawPreview(); drawProps(); }
  function drawAll() { drawThumbs(); drawPreview(); drawProps(); }
  drawAll();

  return () => { document.removeEventListener('keydown', onKey); if (timer) save(); };
}
