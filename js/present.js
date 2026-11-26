// The display: the forward-facing screen you project. It starts (or resumes) a live session and
// follows the session state, so it can be driven by its own keys/buttons OR by the presenter
// remote on your phone or iPad (#remote-CODE). Opening #screen-CODE shows the display for a
// session that's already running (e.g. started from your iPad).
import { TYPES, renderSlide, esc } from './types.js?v=2.3';
import { createInk } from './ink.js?v=2.3';
import { prepare, valuesFor, downloadCsv, qrSvg, inkSync } from './live.js?v=2.3';

export const mount = (root, store, deckId) => display(root, store, { deckId });

export async function display(root, store, { deckId, code }) {
  const fail = (h, p) => { root.innerHTML = `<div class="page"><h1>${h}</h1><p>${p}</p><p><a class="btn" href="#decks">Back to presentations</a></p></div>`; };
  let sess = null;
  if (code) {
    sess = await store.getSession(code).catch(() => null);
    if (!sess) return fail('No session with that code', 'Check the code, or start presenting from your presentations list.');
    if (!sess.open) return fail('That session has ended', 'Start a new one from your presentations list.');
    deckId = sess.deckId;
  }
  const deck = await store.getDeck(deckId).catch(() => null);
  if (!deck || !(deck.slides || []).length) return fail('Nothing to present', code ? 'Sign in with the account that started this session.' : 'This presentation has no slides yet.');
  const { theme, slides, pub } = await prepare(store, deck);
  const KEY = 'livedeck:session:' + deckId;

  // Resume a session (this tab's, or the code we were given); otherwise start a new one.
  let cur = 0, reveal = {}, live = {}, showJoin = true;
  if (!code) { try { code = sessionStorage.getItem(KEY); } catch (e) { } if (code) sess = await store.getSession(code).catch(() => null); }
  if (code && sess && sess.open && sess.deckId === deckId) {
    cur = Math.min(sess.current || 0, slides.length - 1); reveal = sess.reveal || {}; live = sess.live || {}; showJoin = !!(sess.ui && sess.ui.join);
    await store.updateSession(code, { slides: pub, title: deck.title || '', theme });
  } else {
    code = await store.createSession({ deckId, title: deck.title || '', theme, slides: pub, current: 0, reveal: {}, live: {}, ui: { join: true }, open: true });
  }
  try { sessionStorage.setItem(KEY, code); } catch (e) { }

  const base = location.href.split('#')[0];
  const joinUrl = base + '#join-' + code, remoteUrl = base + '#remote-' + code;
  const shortBase = (base + '#join').replace(/^https?:\/\//, '');
  let responses = [], showBadge = true, ended = false, remoteAt = 0;

  root.innerHTML = `<div class="pres">
  <div class="stage" id="stage"><div id="slotwrap"><div id="slot"></div><div class="inkhost" id="inkhost"></div></div>
    <button class="badge" id="badge" title="Click to hide">Join: <b>${esc(shortBase)}</b> · code <b>${code}</b></button>
    <div class="joinov" id="joinov"><div class="jbox"><div class="qr">${qrSvg(joinUrl)}</div><div class="jtext">
      <p class="jl">On your phone, scan the code or go to</p><p class="jurl">${esc(shortBase)}</p>
      <p class="jl">and enter</p><p class="jcode">${code}</p><p class="jcount" id="jcount"></p>
      <button class="btn" id="jclose">Start</button></div></div></div>
  </div>
  <div class="bar"><button class="btn" id="prev" aria-label="Previous slide">←</button><span class="num" id="num"></span><button class="btn" id="next" aria-label="Next slide">→</button>
    <button class="btn" id="reveal">Reveal results</button><button class="btn" id="act"></button><span class="grow"></span>
    <span class="joined" id="joined"></span><span class="rchip" id="rchip" hidden>Remote connected</span>
    <button class="btn primary" id="rbtn">Presenter remote</button><button class="btn" id="jbtn">Join info</button><button class="btn" id="nbtn">Notes</button>
    <button class="btn" id="csv">Results CSV</button><button class="btn" id="fs">Full screen</button><button class="btn ghost" id="end">End session</button></div>
  <div class="notes" id="notes" hidden></div>
  <p class="help">Keys: ← → move · R reveal · S spin · D draw (P pen, H highlighter, L laser, E eraser, Esc stop) · J join info · N notes · F full screen. Reloading keeps the same session and code.</p>
  <div class="modal" id="rmodal" hidden><div class="mbox rbox" role="dialog" aria-label="Presenter remote">
    <div class="mhead"><h2>Run the slides from your phone or iPad</h2><button class="btn ghost" id="rclose">Close</button></div>
    <div class="rmgrid"><div class="qr">${qrSvg(remoteUrl)}</div><div>
      <p>Scan this with your phone or iPad's camera. You'll get the presenter view there: a timer, the current and next slides, your notes, big Next and Back buttons, and drawing that shows up on this screen.</p>
      <p class="muted small">${store.mode === 'firebase' ? 'Sign in on that device with the same Google account you use here.' : 'Local mode: the remote only works in another tab of this same browser. Connect Firebase to use a real phone.'}</p>
      <p><a class="btn" href="${esc(remoteUrl)}" target="_blank" rel="noopener">Open presenter view in a new window</a></p>
      <p class="muted small">Two screens on one computer? Open the presenter view in a new window, keep it on your laptop screen, and drag this window to the projector.</p>
      <p class="muted small rurl">${esc(remoteUrl)}</p></div></div></div></div>
  </div>`;
  const $ = s => root.querySelector(s);
  if (!$('.joinov .qr').innerHTML) $('.joinov .qr').hidden = true;

  const sync = inkSync(store, code, 'display');
  const ink = createInk($('#inkhost'), { storageKey: 'livedeck:ink:' + code, onCommit: sync.onCommit, onLive: sync.onLive });
  const push = patch => store.updateSession(code, patch).catch(e => console.warn('Session update failed', e));
  const onLive = v => { const s = slides[cur]; let j; try { j = JSON.stringify(v); } catch (e) { return; } live = { ...live, [s.id]: j }; push({ live }); refresh(); };
  const fromWidget = k => onKey({ key: k.key, ctrlKey: k.ctrl, metaKey: k.meta, shiftKey: k.shift, target: document.body, preventDefault() { } });
  const ctx = s => ({ mode: 'present', theme, onLive, onKey: fromWidget, values: valuesFor(responses, s), reveal: !!reveal[s.id], live: live[s.id] ?? null });

  function draw(animate = false) {
    const s = slides[cur], T = TYPES[s.type] || {}, slot = $('#slot');
    slot.innerHTML = renderSlide(s, ctx(s));
    if (T.after) T.after(s, slot, ctx(s), animate);
    ink.setSlide(s.id); buttons();
  }
  function refresh() { const s = slides[cur], T = TYPES[s.type] || {}; if (T.update) { T.update(s, $('#slot'), ctx(s)); buttons(); } else draw(); }
  function buttons() {
    const s = slides[cur], T = TYPES[s.type] || {};
    $('#num').textContent = `${cur + 1} / ${slides.length}`;
    $('#prev').disabled = cur === 0 || ended; $('#next').disabled = cur === slides.length - 1 || ended;
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
  function setJoin(v) { showJoin = v; overlays(); push({ ui: { join: v } }); }

  function go(i) { if (ended || i < 0 || i >= slides.length || i === cur) return; cur = i; draw(); push({ current: cur }); }
  function toggleReveal() { const s = slides[cur]; if (!TYPES[s.type]?.interactive) return; reveal = { ...reveal, [s.id]: !reveal[s.id] }; refresh(); push({ reveal }); }
  function action() { const s = slides[cur], T = TYPES[s.type]; if (!T || !T.run) return; live = { ...live, [s.id]: T.run(s, live[s.id]) }; T.after(s, $('#slot'), ctx(s), true); push({ live }); }
  function fullscreen() { const st = $('#stage'); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); else st.requestFullscreen?.().catch(() => { }); }
  function showEnded() {
    ended = true; try { sessionStorage.removeItem(KEY); } catch (e) { }
    $('#slot').innerHTML = `<div class="slide"><div class="tcenter"><h1 class="big">Session ended</h1><p class="sub">${responses.length} participants · results saved</p></div></div>`;
    $('#end').hidden = true; showJoin = false; overlays(); buttons();
  }

  // Follow the session: changes made by the remote (or another display) show up here.
  function apply(s) {
    if (!s) return;
    if (!s.open) { if (!ended) showEnded(); return; }
    const nc = Math.max(0, Math.min(slides.length - 1, s.current || 0)), nr = s.reveal || {}, nl = s.live || {}, nj = !!(s.ui && s.ui.join);
    if (nj !== showJoin) { showJoin = nj; overlays(); }
    if (nc !== cur) { cur = nc; reveal = nr; live = nl; draw(); return; }
    const sl = slides[cur], T = TYPES[sl.type] || {};
    const liveChanged = JSON.stringify(live[sl.id] ?? null) !== JSON.stringify(nl[sl.id] ?? null), revChanged = !!reveal[sl.id] !== !!nr[sl.id];
    reveal = nr; live = nl;
    if (liveChanged && T.run) T.after(sl, $('#slot'), ctx(sl), true); // e.g. the remote spun the wheel
    else if (liveChanged || revChanged) refresh();
  }

  $('#prev').onclick = () => go(cur - 1); $('#next').onclick = () => go(cur + 1);
  $('#reveal').onclick = toggleReveal; $('#act').onclick = action; $('#fs').onclick = fullscreen;
  $('#jbtn').onclick = () => setJoin(!showJoin);
  $('#jclose').onclick = () => { showBadge = true; setJoin(false); };
  $('#badge').onclick = () => { showBadge = false; overlays(); };
  $('#nbtn').onclick = () => { $('#notes').hidden = !$('#notes').hidden; $('#nbtn').classList.toggle('on', !$('#notes').hidden); };
  $('#rbtn').onclick = () => { $('#rmodal').hidden = false; $('#rclose').focus(); };
  $('#rclose').onclick = () => { $('#rmodal').hidden = true; $('#rbtn').focus(); };
  $('#rmodal').onclick = e => { if (e.target.id === 'rmodal') $('#rmodal').hidden = true; };
  $('#end').onclick = async () => {
    const b = $('#end');
    if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Click again to end'; setTimeout(() => { b.classList.remove('confirm'); b.textContent = 'End session'; }, 3000); return; }
    await push({ open: false }); showEnded();
  };
  $('#csv').onclick = () => downloadCsv(deck.title, code, slides, responses);

  const onKey = e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (!$('#rmodal').hidden) { if (e.key === 'Escape') $('#rmodal').hidden = true; return; }
    if (ink.key(e)) { e.preventDefault(); return; }
    const k = e.key;
    if (k === 'd' || k === 'D') { ink.toggle(); return; }
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); if (showJoin) setJoin(false); else go(cur + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); go(cur - 1); }
    else if (k === 'r' || k === 'R') toggleReveal();
    else if (k === 's' || k === 'S') action();
    else if (k === 'f' || k === 'F') fullscreen();
    else if (k === 'j' || k === 'J') setJoin(!showJoin);
    else if (k === 'n' || k === 'N') $('#nbtn').click();
  };
  document.addEventListener('keydown', onKey);

  const unsubR = store.watchResponses(code, list => {
    responses = list.sort((a, b) => (a.uid < b.uid ? -1 : 1));
    if (!ended && TYPES[slides[cur].type]?.interactive) refresh(); else counts();
  });
  const unsubS = store.watchSession(code, apply);
  const chip = () => { $('#rchip').hidden = !(Date.now() - remoteAt < 45000); };
  const unsubT = store.watchStage(code, st => { sync.apply(st, ink); remoteAt = st.remoteAt || 0; chip(); });
  const chipT = setInterval(chip, 10000);
  overlays(); draw();

  return () => { clearInterval(chipT); ink.destroy(); document.removeEventListener('keydown', onKey); [unsubR, unsubS, unsubT].forEach(u => u && u()); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); };
}
