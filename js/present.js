// Presenter screen: starts (or resumes) a live session, drives everyone's phones, draws live results.
import { TYPES, renderSlide, esc, describe } from './types.js?v=2.0';
import { normalize, loadFonts } from './themes.js?v=2.0';
import { createInk } from './ink.js?v=2.0';

export async function mount(root, store, deckId) {
  const deck = await store.getDeck(deckId);
  if (!deck || !(deck.slides || []).length) { root.innerHTML = `<div class="page"><h1>Nothing to present</h1><p>This presentation has no slides yet.</p><p><a class="btn" href="#decks">Back</a></p></div>`; return; }
  const theme = normalize(deck.theme); loadFonts(theme);
  let lib = {}; try { (await store.listItems('widgets')).forEach(w => lib[w.id] = w); } catch (e) { }
  // Phones get a copy of each slide without speaker notes; custom widget slides carry their code with them.
  const slides = deck.slides.map(s => s.type === 'custom' && lib[s.widgetId] ? { ...s, widgetCode: lib[s.widgetId].code, widgetName: lib[s.widgetId].name } : s);
  const pub = slides.map(({ notes, ...s }) => s);
  const KEY = 'livedeck:session:' + deckId;

  // Resume this tab's session after a reload; otherwise start a new one.
  let code = null, cur = 0, reveal = {}, live = {};
  try { code = sessionStorage.getItem(KEY); } catch (e) { }
  if (code) {
    const old = await store.getSession(code).catch(() => null);
    if (old && old.open && old.deckId === deckId) { cur = Math.min(old.current || 0, slides.length - 1); reveal = old.reveal || {}; live = old.live || {}; await store.updateSession(code, { slides: pub, title: deck.title || '', theme }); }
    else code = null;
  }
  if (!code) {
    code = await store.createSession({ deckId, title: deck.title || '', theme, slides: pub, current: 0, reveal: {}, live: {}, open: true });
    try { sessionStorage.setItem(KEY, code); } catch (e) { }
  }

  const base = location.href.split('#')[0];
  const joinUrl = base + '#join-' + code;
  const shortBase = (base + '#join').replace(/^https?:\/\//, '');
  let responses = [], showJoin = true, showBadge = true, ended = false;

  root.innerHTML = `<div class="pres">
  <div class="stage" id="stage"><div id="slotwrap"><div id="slot"></div><div class="inkhost" id="inkhost"></div></div>
    <button class="badge" id="badge" title="Click to hide">Join: <b>${esc(shortBase)}</b> · code <b>${code}</b></button>
    <div class="joinov" id="joinov"><div class="jbox"><div class="qr" id="qr"></div><div class="jtext">
      <p class="jl">On your phone, scan the code or go to</p><p class="jurl">${esc(shortBase)}</p>
      <p class="jl">and enter</p><p class="jcode">${code}</p><p class="jcount" id="jcount"></p>
      <button class="btn" id="jclose">Start</button></div></div></div>
  </div>
  <div class="bar"><button class="btn" id="prev" aria-label="Previous slide">←</button><span class="num" id="num"></span><button class="btn" id="next" aria-label="Next slide">→</button>
    <button class="btn" id="reveal">Reveal results</button><button class="btn" id="act"></button><span class="grow"></span>
    <span class="joined" id="joined"></span><button class="btn" id="jbtn">Join info</button><button class="btn" id="nbtn">Notes</button>
    <button class="btn" id="csv">Results CSV</button><button class="btn" id="fs">Full screen</button><button class="btn ghost" id="end">End session</button></div>
  <div class="notes" id="notes" hidden></div>
  <p class="help">Keys: ← → move · R reveal · S spin · D draw (P pen, H highlighter, L laser, E eraser, Esc stop) · J join info · N notes · F full screen. Reloading this tab keeps the same session and code.</p>
  </div>`;
  const $ = s => root.querySelector(s);

  if (window.qrcode) { try { const q = window.qrcode(0, 'M'); q.addData(joinUrl); q.make(); $('#qr').innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); } catch (e) { $('#qr').hidden = true; } }
  else $('#qr').hidden = true;

  const ink = createInk($('#inkhost'), { storageKey: 'livedeck:ink:' + code });
  const onLive = v => { const s = slides[cur]; let j; try { j = JSON.stringify(v); } catch (e) { return; } live = { ...live, [s.id]: j }; push({ live }); refresh(); };
  const fromWidget = k => onKey({ key: k.key, ctrlKey: k.ctrl, metaKey: k.meta, shiftKey: k.shift, target: document.body, preventDefault() { } });
  const ctx = s => ({ mode: 'present', theme, onLive, onKey: fromWidget, values: valuesFor(s), reveal: !!reveal[s.id], live: live[s.id] ?? null });
  function valuesFor(s) { const T = TYPES[s.type]; if (!T || !T.valid) return []; return responses.map(x => x.r && x.r[s.id]).filter(v => v != null && T.valid(s, v)); }
  function draw(animate = false) {
    const s = slides[cur], T = TYPES[s.type] || {}, slot = $('#slot');
    slot.innerHTML = renderSlide(s, ctx(s));
    if (T.after) T.after(s, slot, ctx(s), animate);
    ink.setSlide(s.id); buttons();
  }
  // Live data changed: widgets that can update in place do; everything else re-renders.
  function refresh() {
    const s = slides[cur], T = TYPES[s.type] || {};
    if (T.update) { T.update(s, $('#slot'), ctx(s)); buttons(); } else draw();
  }
  function buttons() {
    const s = slides[cur], T = TYPES[s.type] || {};
    $('#num').textContent = `${cur + 1} / ${slides.length}`;
    $('#prev').disabled = cur === 0; $('#next').disabled = cur === slides.length - 1;
    $('#reveal').hidden = !T.interactive; $('#reveal').textContent = reveal[s.id] ? 'Hide results' : 'Reveal results'; $('#reveal').classList.toggle('on', !!reveal[s.id]);
    $('#act').hidden = !T.action; $('#act').textContent = T.action || '';
    $('#notes').textContent = s.notes || 'No notes for this slide.';
    counts();
  }
  function counts() {
    const n = responses.length;
    $('#joined').textContent = `● ${n} joined`;
    $('#jcount').textContent = n ? `${n} ${n === 1 ? 'person has' : 'people have'} joined` : 'Waiting for people to join…';
  }
  function overlays() { $('#joinov').hidden = !showJoin; $('#badge').hidden = showJoin || !showBadge; $('#jbtn').classList.toggle('on', showJoin); }
  const push = patch => store.updateSession(code, patch).catch(e => console.warn('Session update failed', e));

  function go(i) { if (ended || i < 0 || i >= slides.length || i === cur) return; cur = i; draw(); push({ current: cur }); }
  function toggleReveal() { const s = slides[cur]; if (!TYPES[s.type]?.interactive) return; reveal = { ...reveal, [s.id]: !reveal[s.id] }; refresh(); push({ reveal }); }
  function action() { const s = slides[cur], T = TYPES[s.type]; if (!T || !T.run) return; live = { ...live, [s.id]: T.run(s, live[s.id]) }; T.after(s, $('#slot'), ctx(s), true); push({ live }); }
  function fullscreen() { const st = $('#stage'); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); else st.requestFullscreen?.().catch(() => { }); }

  $('#prev').onclick = () => go(cur - 1); $('#next').onclick = () => go(cur + 1);
  $('#reveal').onclick = toggleReveal; $('#act').onclick = action; $('#fs').onclick = fullscreen;
  $('#jbtn').onclick = () => { showJoin = !showJoin; overlays(); };
  $('#jclose').onclick = () => { showJoin = false; showBadge = true; overlays(); };
  $('#badge').onclick = () => { showBadge = false; overlays(); };
  $('#nbtn').onclick = () => { $('#notes').hidden = !$('#notes').hidden; $('#nbtn').classList.toggle('on', !$('#notes').hidden); };
  $('#end').onclick = async () => {
    const b = $('#end');
    if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Click again to end'; setTimeout(() => { b.classList.remove('confirm'); b.textContent = 'End session'; }, 3000); return; }
    ended = true; await push({ open: false }); try { sessionStorage.removeItem(KEY); } catch (e) { }
    $('#slot').innerHTML = `<div class="slide"><div class="tcenter"><h1 class="big">Session ended</h1><p class="sub">${responses.length} participants · results saved</p></div></div>`;
    b.hidden = true; $('#prev').disabled = $('#next').disabled = true;
  };
  $('#csv').onclick = () => {
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const out = [['session', 'participant', 'slide', 'type', 'prompt', 'response'].join(',')];
    responses.forEach((p, n) => slides.forEach((s, i) => {
      const T = TYPES[s.type], v = p.r && p.r[s.id];
      if (T && T.valid && v != null && T.valid(s, v)) out.push([code, 'P' + (n + 1), i + 1, s.type, s.prompt || s.title || '', describe(s, v)].map(q).join(','));
    }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' }));
    a.download = `${(deck.title || 'session').replace(/[^\w-]+/g, '_')}_${code}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const onKey = e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (ink.key(e)) { e.preventDefault(); return; }
    const k = e.key;
    if (k === 'd' || k === 'D') { ink.toggle(); return; }
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); if (showJoin) { showJoin = false; overlays(); } else go(cur + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); go(cur - 1); }
    else if (k === 'r' || k === 'R') toggleReveal();
    else if (k === 's' || k === 'S') action();
    else if (k === 'f' || k === 'F') fullscreen();
    else if (k === 'j' || k === 'J') { showJoin = !showJoin; overlays(); }
    else if (k === 'n' || k === 'N') $('#nbtn').click();
  };
  document.addEventListener('keydown', onKey);

  const unsub = store.watchResponses(code, list => {
    responses = list.sort((a, b) => (a.uid < b.uid ? -1 : 1));
    if (!ended && TYPES[slides[cur].type]?.interactive) refresh(); else counts();
  });
  push({ current: cur });
  overlays(); draw();

  return () => { ink.destroy(); document.removeEventListener('keydown', onKey); unsub && unsub(); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); };
}
