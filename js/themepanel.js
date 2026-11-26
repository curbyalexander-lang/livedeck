// Theme picker and editor (opened from the authoring tool's Theme button).
import { PRESETS, FONTS, normalize, swatch, loadFonts, DEFAULT_THEME } from './themes.js';
import { renderSlide, TYPES } from './types.js';
import { esc } from './util.js';

const six = c => /^#[0-9a-f]{3}$/i.test(c) ? '#' + [...c.slice(1)].map(x => x + x).join('') : c;
const fontOpts = sel => {
  const sys = Object.keys(FONTS).filter(f => FONTS[f].g === undefined), g = Object.keys(FONTS).filter(f => FONTS[f].g !== undefined);
  const o = list => list.map(f => `<option${f === sel ? ' selected' : ''}>${esc(f)}</option>`).join('');
  return `<optgroup label="Built in">${o(sys)}</optgroup><optgroup label="Google Fonts">${o(g)}</optgroup>`;
};

export async function openThemePanel({ store, deck, slide, ctxFor, onChange }) {
  let mine = []; try { mine = await store.listItems('themes'); } catch (e) { }
  let t = normalize(deck.theme || DEFAULT_THEME);
  const prev = document.activeElement;
  const wrap = document.createElement('div'); wrap.className = 'modal';
  wrap.innerHTML = `<div class="mbox wide" role="dialog" aria-label="Theme">
    <div class="mhead"><h2>Theme</h2><button class="btn primary" data-a="close">Done</button></div>
    <div class="thgrid"><div class="thleft"><h3>Presets</h3><div class="swgrid" id="presets"></div><h3>My themes</h3><div class="swgrid" id="mine"></div></div>
    <div class="thright"><div class="thprev" id="thprev"></div><div class="thform" id="thform"></div>
    <div class="thactions"><button class="btn primary" data-a="save" id="savebtn"></button><button class="btn" data-a="saveas">Save as new</button><button class="btn ghost" data-a="del" id="delbtn">Delete</button><span class="muted small" id="thmsg" aria-live="polite"></span></div></div></div></div>`;
  document.body.appendChild(wrap);
  const $ = s => wrap.querySelector(s), msg = m => $('#thmsg').textContent = m || '';
  const isMine = () => mine.some(m => m.id === t.id);

  const sw = (th, kind) => `<button class="swbtn${th.id === t.id ? ' on' : ''}" data-kind="${kind}" data-id="${esc(th.id)}" aria-label="${esc(th.name)} theme">${swatch(th)}</button>`;
  function drawLists() {
    $('#presets').innerHTML = PRESETS.map(p => sw(p, 'preset')).join('');
    $('#mine').innerHTML = mine.length ? mine.map(m => sw(normalize(m), 'mine')).join('') : '<p class="muted small">Themes you save show up here, ready for any deck.</p>';
    [...PRESETS, ...mine].forEach(loadFonts);
  }
  function drawForm() {
    const c = (k, label) => `<div class="field cfield"><label for="t-${k}">${label}</label><div class="crow"><input type="color" id="t-${k}" data-k="${k}" value="${six(t[k])}"><input type="text" data-hex="${k}" value="${esc(t[k])}" aria-label="${label} hex code" maxlength="7"></div></div>`;
    $('#thform').innerHTML = `<div class="field"><label for="t-name">Theme name</label><input id="t-name" data-k="name" value="${esc(t.name)}" maxlength="60"></div>
      <div class="cgrid">${c('bg', 'Background')}${c('ink', 'Text')}${c('accent', 'Accent (charts)')}${c('highlight', 'Highlight')}</div>
      <div class="cgrid"><div class="field"><label for="t-hf">Heading font</label><select id="t-hf" data-k="headFont">${fontOpts(t.headFont)}</select></div>
      <div class="field"><label for="t-bf">Body font</label><select id="t-bf" data-k="bodyFont">${fontOpts(t.bodyFont)}</select></div></div>
      <div class="field"><label for="t-img">Background image (optional)</label><div class="mediaf"><input id="t-img" data-k="bgImage" type="text" inputmode="url" placeholder="https://…  or  media/bg.jpg" value="${esc(t.bgImage.startsWith('data:') ? '' : t.bgImage)}">
        ${store.canUpload ? '<label class="btn small">Upload<input type="file" accept="image/*" data-up="1" hidden></label>' : ''}</div>
        ${t.bgImage.startsWith('data:') ? '<small>Uploaded image stored in this browser. <button class="linkbtn" data-a="clearimg">Remove</button></small>' : ''}</div>
      <div class="field"><label for="t-dim">Fade the background image: <span id="dimv">${Math.round(t.dim * 100)}%</span></label><input id="t-dim" data-k="dim" type="range" min="0" max="90" step="5" value="${Math.round(t.dim * 100)}"><small>Fading toward the background colour keeps text readable over photos.</small></div>`;
    $('#savebtn').textContent = isMine() ? `Update “${t.name}”` : 'Save to My themes';
    $('#delbtn').hidden = !isMine();
  }
  function drawPreview() {
    const s = slide(), T = TYPES[s.type], ctx = { ...ctxFor(s, 'edit'), theme: t };
    $('#thprev').innerHTML = renderSlide(s, ctx);
    if (T && T.after) T.after(s, $('#thprev'), ctx, false);
  }
  function apply(redrawForm) {
    t = normalize(t); deck.theme = t; loadFonts(t); onChange(t);
    drawPreview(); if (redrawForm) { drawForm(); drawLists(); }
  }
  function edited() { // editing a preset turns it into your own copy
    const p = PRESETS.find(x => x.id === t.id);
    if (p) { t.id = 'custom'; if (t.name === p.name) t.name = p.name + ' (edited)'; const n = $('#t-name'); if (n) n.value = t.name; drawLists(); $('#savebtn').textContent = 'Save to My themes'; $('#delbtn').hidden = true; }
  }

  wrap.addEventListener('input', e => {
    const el = e.target, k = el.dataset.k, hx = el.dataset.hex;
    if (hx) { if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(el.value)) { edited(); t[hx] = el.value; $('#t-' + hx).value = six(el.value); apply(); } return; }
    if (!k) return;
    edited();
    if (k === 'dim') { t.dim = el.value / 100; $('#dimv').textContent = el.value + '%'; }
    else t[k] = el.value;
    if (el.type === 'color') { const h = wrap.querySelector(`[data-hex="${k}"]`); if (h) h.value = el.value; }
    if (k === 'name') { $('#savebtn').textContent = isMine() ? `Update “${t.name}”` : 'Save to My themes'; }
    apply();
  });
  wrap.addEventListener('change', async e => {
    if (!e.target.dataset.up || !e.target.files[0]) return;
    msg('Uploading…');
    try { edited(); t.bgImage = await store.upload(e.target.files[0]); msg(''); apply(true); } catch (x) { msg(x.message || 'Upload failed.'); }
  });
  wrap.addEventListener('click', async e => {
    if (e.target === wrap) return close();
    const b = e.target.closest('[data-a],.swbtn'); if (!b) return;
    if (b.classList.contains('swbtn')) {
      const src = b.dataset.kind === 'preset' ? PRESETS.find(p => p.id === b.dataset.id) : mine.find(m => m.id === b.dataset.id);
      if (src) { t = normalize({ ...src }); msg(''); apply(true); }
      return;
    }
    const a = b.dataset.a;
    if (a === 'close') return close();
    if (a === 'clearimg') { edited(); t.bgImage = ''; apply(true); return; }
    if (a === 'save' || a === 'saveas') {
      try {
        const item = { ...t, id: a === 'save' && isMine() ? t.id : undefined };
        if (a === 'saveas' && mine.some(m => m.name === t.name)) item.name = t.name + ' copy';
        const id = await store.saveItem('themes', item);
        t = normalize({ ...item, id }); mine = await store.listItems('themes'); msg('Saved.'); apply(true);
      } catch (x) { msg('Could not save: ' + x.message); }
    }
    if (a === 'del') {
      if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Click again to delete'; return; }
      try { await store.deleteItem('themes', t.id); mine = mine.filter(m => m.id !== t.id); t.id = 'custom'; msg('Deleted from My themes. This deck keeps its colours.'); apply(true); } catch (x) { msg(x.message); }
    }
  });
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  function close() { document.removeEventListener('keydown', onKey); wrap.remove(); prev && prev.focus && prev.focus(); }

  drawLists(); drawForm(); drawPreview();
  $('[data-a="close"]').focus();
}
