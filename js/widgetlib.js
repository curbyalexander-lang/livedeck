// Widget library: write, test, and save your own interactive widgets.
// The test area runs the widget exactly as it will run live: a big-screen frame plus test phones,
// with answers from the test phones flowing to the big screen.
import { EXAMPLES, widgetDoc, attach, send, parseConfig } from './widgets.js?v=2.0';
import { themeStyle } from './themes.js?v=2.0';
import { esc } from './util.js?v=2.0';

export async function openWidgetLib({ store, theme, startId, onSaved }) {
  let list = []; try { list = await store.listItems('widgets'); } catch (e) { }
  let cur = null, phones = 1, answers = {}, live = null, reveal = false, dirty = false;
  const prev = document.activeElement;
  const wrap = document.createElement('div'); wrap.className = 'modal';
  wrap.innerHTML = `<div class="mbox xwide" role="dialog" aria-label="Widget library">
    <div class="mhead"><h2>Widget library</h2><button class="btn primary" data-a="close">Done</button></div>
    <div class="wlib"><aside class="wlist"><button class="btn add" data-a="new">+ New widget</button><div id="wl-items"></div></aside>
    <section class="wedit" id="wedit"></section></div></div>`;
  document.body.appendChild(wrap);
  const $ = s => wrap.querySelector(s);

  function drawList() {
    $('#wl-items').innerHTML = list.length ? list.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(w => `<button class="witem${cur && cur.id === w.id ? ' on' : ''}" data-open="${esc(w.id)}"><strong>${esc(w.name || 'Untitled')}</strong><span>${esc(w.description || '')}</span></button>`).join('') : '<p class="muted small">Your widgets will be listed here.</p>';
  }
  function drawStart() {
    cur = null; drawList();
    $('#wedit').innerHTML = `<h3>Start a new widget</h3><p class="muted">A widget is a small web page (HTML, CSS, JavaScript) that runs on the big screen and on every phone. Pick a starting point, change it, and test it right here. You can also describe what you want to Claude and paste the code it writes.</p>
      <div class="pgrid">${EXAMPLES.map((x, i) => `<button class="ptype" data-ex="${i}"><strong>${esc(x.name)}</strong><span>${esc(x.description)}</span></button>`).join('')}</div>`;
  }
  function drawEditor() {
    drawList();
    $('#wedit').innerHTML = `<div class="cgrid"><div class="field"><label for="w-name">Name</label><input id="w-name" value="${esc(cur.name)}" maxlength="60"></div>
      <div class="field"><label for="w-desc">Description</label><input id="w-desc" value="${esc(cur.description || '')}" maxlength="140"></div></div>
      <div class="field"><label for="w-code">Code <small>(HTML with &lt;style&gt; and &lt;script&gt;; uses window.LiveDeck. See README.)</small></label><textarea id="w-code" class="code" rows="16" spellcheck="false">${esc(cur.code)}</textarea></div>
      <div class="field"><label for="w-config">Test settings <small>(what a slide's Settings box would pass in as LiveDeck.config)</small></label><textarea id="w-config" class="code" rows="2" spellcheck="false">${esc(cur.config || '')}</textarea></div>
      <div class="wact"><button class="btn" data-a="run">Run test</button><button class="btn primary" data-a="save">Save</button><button class="btn ghost" data-a="del"${cur.id ? '' : ' hidden'}>Delete</button><span class="muted small" id="wmsg" aria-live="polite"></span></div>
      <div class="wtest"><div class="wstage"><p class="lbl2">Big screen</p><div class="slide" style="${themeStyle(theme)}"><div class="wbox" id="w-stage"></div></div>
        <div class="wact"><label class="chk"><input type="checkbox" id="w-reveal"${reveal ? ' checked' : ''}> Results revealed</label><button class="btn small" data-a="clear">Clear test answers</button><span class="muted small" id="w-count"></span></div></div>
        <div class="wphones"><p class="lbl2">Test phones <button class="btn small" data-a="addphone"${phones >= 3 ? ' disabled' : ''}>+ Phone</button></p><div class="prow" id="w-phones"></div></div></div>`;
    run();
  }
  const status = m => { const e = $('#wmsg'); if (e) e.textContent = m || ''; };
  const stageState = () => { const v = Object.values(answers); return { values: v.map(x => JSON.parse(x)), count: v.length, reveal, live }; };
  function run() {
    if (!cur) return;
    const init = mode => ({ mode, prompt: cur.name, config: parseConfig(cur.config), theme });
    $('#w-stage').innerHTML = `<iframe class="wframe" sandbox="allow-scripts" title="Big screen test" srcdoc="${esc(widgetDoc(cur.code, { ...init('stage'), state: stageState() }))}"></iframe>`;
    const sf = $('#w-stage iframe');
    attach(sf, { onLive: v => { live = v; pushPhones(); send(sf, stageState()); } });
    send(sf, stageState());
    $('#w-phones').innerHTML = Array.from({ length: phones }, (_, i) => `<div class="tphone"><span class="muted small">Phone ${i + 1}</span><iframe class="wframe pframe" sandbox="allow-scripts" title="Test phone ${i + 1}" srcdoc="${esc(widgetDoc(cur.code, { ...init('phone'), state: { value: answers[i] ? JSON.parse(answers[i]) : null, live } }))}"></iframe></div>`).join('');
    wrap.querySelectorAll('#w-phones iframe').forEach((f, i) => {
      attach(f, { onSubmit: v => { answers[i] = v; send(sf, stageState()); count(); }, onHeight: h => { f.style.height = Math.max(120, Math.min(h + 4, 640)) + 'px'; } });
    });
    pushPhones(); count();
  }
  function pushPhones() { wrap.querySelectorAll('#w-phones iframe').forEach((f, i) => send(f, { value: answers[i] ? JSON.parse(answers[i]) : null, live })); }
  function count() { const e = $('#w-count'); if (e) e.textContent = `${Object.keys(answers).length} test answer(s)`; }
  function readForm() { if (!cur || !$('#w-code')) return; cur.name = $('#w-name').value.trim() || 'Untitled widget'; cur.description = $('#w-desc').value.trim(); cur.code = $('#w-code').value; cur.config = $('#w-config').value; }
  function openItem(item) { cur = { ...item }; answers = {}; live = null; reveal = false; phones = 1; dirty = false; drawEditor(); }

  wrap.addEventListener('input', e => {
    if (e.target.id === 'w-reveal') { reveal = e.target.checked; send($('#w-stage iframe'), stageState()); return; }
    if (['w-name', 'w-desc', 'w-code', 'w-config'].includes(e.target.id)) { dirty = true; status('Unsaved changes'); }
  });
  wrap.addEventListener('keydown', e => {
    if (e.target.id === 'w-code' && e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const t = e.target, a = t.selectionStart; t.setRangeText('  ', a, t.selectionEnd, 'end'); dirty = true; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && cur) { e.preventDefault(); readForm(); run(); }
  });
  wrap.addEventListener('click', async e => {
    if (e.target === wrap) return close();
    const ex = e.target.closest('[data-ex]'); if (ex) { const x = EXAMPLES[+ex.dataset.ex]; openItem({ name: x.name === 'Blank starter' ? 'My widget' : x.name, description: x.description, code: x.code, config: x.config }); dirty = true; status('Not saved yet'); return; }
    const op = e.target.closest('[data-open]'); if (op) { const w = list.find(x => x.id === op.dataset.open); if (w) openItem(w); return; }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') return close();
    if (a === 'new') return drawStart();
    if (a === 'run') { readForm(); run(); return; }
    if (a === 'clear') { answers = {}; live = null; run(); return; }
    if (a === 'addphone') { readForm(); phones = Math.min(3, phones + 1); drawEditor(); return; }
    if (a === 'save') {
      readForm();
      try {
        const id = await store.saveItem('widgets', { id: cur.id, name: cur.name, description: cur.description, code: cur.code, config: cur.config });
        cur.id = id; dirty = false; list = await store.listItems('widgets'); drawList(); b.nextElementSibling.hidden = false; status('Saved.');
        onSaved && onSaved(list);
      } catch (x) { status('Could not save: ' + x.message); }
    }
    if (a === 'del') {
      if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Click again to delete'; return; }
      try { await store.deleteItem('widgets', cur.id); list = list.filter(x => x.id !== cur.id); onSaved && onSaved(list); drawStart(); } catch (x) { status(x.message); }
    }
  });
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  function close() {
    if (dirty && !wrap.dataset.warned) { wrap.dataset.warned = '1'; status('You have unsaved changes. Save, or press Done again to discard them.'); return; }
    document.removeEventListener('keydown', onKey); wrap.remove(); prev && prev.focus && prev.focus();
  }

  const start = startId && list.find(w => w.id === startId);
  if (start) openItem(start); else drawStart();
}
