// Authoring tool: slide rail (left), live preview (center), properties (right). Autosaves.
import { TYPES, renderSlide, newSlide, esc, sampleValues } from './types.js';

export async function mount(root, store, id) {
  const deck = await store.getDeck(id);
  if (!deck) { root.innerHTML = `<div class="page"><h1>Presentation not found</h1><p><a class="btn" href="#decks">Back</a></p></div>`; return; }
  deck.id = id; deck.slides = Array.isArray(deck.slides) ? deck.slides : [];
  if (!deck.slides.length) deck.slides.push(newSlide('title'));
  let sel = 0, sample = true, timer = 0, saving = Promise.resolve(), dragFrom = -1;

  root.innerHTML = `<div class="ed">
  <header class="edbar"><a class="btn ghost" href="#decks">← Presentations</a>
    <input id="dtitle" class="dtitle" aria-label="Presentation title" maxlength="120">
    <span class="status" id="status" aria-live="polite">Saved</span><span class="grow"></span>
    <button class="btn" id="export">Export JSON</button><button class="btn primary" id="present">Present</button></header>
  <aside class="rail"><ol id="thumbs" class="thumbs"></ol><button class="btn add" id="add">+ Add slide</button></aside>
  <main class="canvas"><div class="ctop"><span id="slabel" class="muted"></span>
    <label class="chk"><input type="checkbox" id="sample" checked> Preview with sample results</label></div>
    <div class="stagewrap" id="preview"></div><p class="muted small">Media, video, and wheel spins play in the preview just as they will when presenting.</p></main>
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
  const ctxFor = (s, mode) => ({ mode, thumb: mode === 'thumb', values: sample ? sampleValues(s) : [], reveal: sample, live: sample && s.type === 'spinner' ? { idx: 0, n: 1 } : null });
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
    el.innerHTML = renderSlide(s, ctxFor(s, 'edit'));
    if (T && T.after) T.after(s, el, ctxFor(s, 'edit'), false);
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
    else input = `<input id="${id}" data-k="${f.k}" type="text" value="${esc(v)}">`;
    return `<div class="field"><label for="${id}">${esc(f.label)}</label>${input}${hint}</div>`;
  }
  function drawProps() {
    const s = deck.slides[sel], T = TYPES[s.type];
    $('#props').innerHTML = `<div class="phead"><h2>${esc(T ? T.label : s.type)}</h2>
      <div class="ptools"><button class="btn small" data-act="up" aria-label="Move slide up"${sel === 0 ? ' disabled' : ''}>↑</button><button class="btn small" data-act="down" aria-label="Move slide down"${sel === deck.slides.length - 1 ? ' disabled' : ''}>↓</button><button class="btn small" data-act="dup">Duplicate</button><button class="btn small ghost" data-act="del"${deck.slides.length < 2 ? ' disabled' : ''}>Delete</button></div></div>
      ${T ? `<p class="muted small">${esc(T.blurb)}</p>` + T.fields.map(f => fieldHtml(f, s[f.k])).join('') : ''}
      <div class="field"><label for="f-notes">Speaker notes</label><textarea id="f-notes" data-k="notes" rows="4">${esc(s.notes || '')}</textarea><small>Only you see these, below the slide while presenting.</small></div>`;
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
  }
  const props = $('#props');
  props.oninput = e => { const k = e.target.dataset.k; if (k && e.target.type !== 'file') setField(k, e.target); };
  props.onchange = async e => {
    if (e.target.tagName === 'SELECT') return; // handled by input
    const k = e.target.dataset.up; if (!k || !e.target.files[0]) return;
    const msg = props.querySelector(`[data-uperr="${k}"]`); msg.textContent = 'Uploading…';
    try { deck.slides[sel][k] = await store.upload(e.target.files[0]); drawProps(); drawPreview(); updateThumb(); queue(); }
    catch (x) { msg.textContent = x.message || 'Upload failed.'; }
  };
  props.onclick = e => {
    const c = e.target.closest('[data-clear]'); if (c) { deck.slides[sel][c.dataset.clear] = ''; drawProps(); drawPreview(); updateThumb(); queue(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, S = deck.slides;
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
  const onKey = e => { if (e.key === 'Escape' && !$('#picker').hidden) closePicker(); };
  document.addEventListener('keydown', onKey);

  // ---- export / present ----
  $('#export').onclick = () => {
    const { id: _i, owner: _o, ...rest } = deck;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' }));
    a.download = (deck.title || 'presentation').replace(/[^\w-]+/g, '_') + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#present').onclick = async () => { await save(); location.hash = '#present-' + id; };

  function select(i) { sel = i; root.querySelectorAll('.thumbs li').forEach(l => l.classList.toggle('on', +l.dataset.i === sel)); drawPreview(); drawProps(); }
  function drawAll() { drawThumbs(); drawPreview(); drawProps(); }
  drawAll();

  return () => { document.removeEventListener('keydown', onKey); if (timer) save(); };
}
