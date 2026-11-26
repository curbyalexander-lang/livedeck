// Presenter remote (#remote-CODE): run a live session from your phone or iPad.
// Timer, current slide (with live results and drawing), next slide, notes, and big controls.
// Everything goes through the session, so the display (and the audience's phones) follow along.
import { TYPES, renderSlide, esc } from './types.js?v=2.2';
import { createInk } from './ink.js?v=2.2';
import { prepare, valuesFor, inkSync, fmtTime } from './live.js?v=2.2';

const GOALS = [0, 5, 10, 15, 20, 30, 45, 50, 60, 75, 90, 120];

export async function mount(root, store, arg) {
  const code = String(arg || '').toUpperCase();
  const fail = (h, p) => { root.innerHTML = `<div class="page narrow"><h1>${h}</h1><p>${p}</p><p><a class="btn" href="#decks">Your presentations</a></p></div>`; };
  const sess0 = await store.getSession(code).catch(() => null);
  if (!sess0) return fail('No session with that code', 'Start presenting on the main screen first, then scan the remote code it shows.');
  if (!sess0.open) return fail('That session has ended', 'Start a new one from your presentations list.');
  const deck = await store.getDeck(sess0.deckId).catch(() => null);
  if (!deck) return fail('Can’t open this session', 'Sign in with the same account that started the presentation.');
  const { theme } = await prepare(store, deck);
  const notesById = {}; (deck.slides || []).forEach(s => notesById[s.id] = s.notes || '');
  // The running session's slide list is the source of truth (it's what the screen and phones show).
  const slides = (sess0.slides || []).map(s => ({ ...s, notes: notesById[s.id] || '' }));
  let cur = Math.min(sess0.current || 0, slides.length - 1), reveal = sess0.reveal || {}, live = sess0.live || {}, join = !!(sess0.ui && sess0.ui.join);
  let responses = [], timer = { running: false, start: 0, acc: 0, goal: 0 }, ended = false, drawing = false, wake = null;

  root.innerHTML = `<div class="remote" id="remote">
  <header class="rtop"><strong class="rtitle">${esc(deck.title || 'Presentation')}</strong><span class="grow"></span>
    <span class="chip" id="rjoined">● 0 joined</span><span class="chip">Code ${esc(code)}</span></header>
  <section class="rtimer" aria-label="Timer"><div><div class="relapsed" id="relapsed">0:00</div><div class="rsub"><span id="rgoal"></span></div></div>
    <div class="rtright"><div class="rclock" id="rclock"></div><div class="rtbtns"><button class="btn small" id="tgo">Start</button><button class="btn small" id="treset">Reset</button>
    <label class="sr" for="tgoal">Talk length</label><select id="tgoal" class="tsel">${GOALS.map(g => `<option value="${g}">${g ? g + ' min' : 'No limit'}</option>`).join('')}</select></div></div></section>
  <section class="rcur"><p class="rlbl"><span>Now · <b id="rnum"></b></span><span class="muted" id="rhint">Swipe the slide to move</span></p>
    <div class="rprev" id="rcurwrap"><div id="rslot"></div><div class="inkhost" id="rink"></div></div><div id="rinkbar"></div></section>
  <section class="rnext"><p class="rlbl">Next</p><div id="rnext"></div></section>
  <section class="rnotes"><p class="rlbl">Notes</p><div id="rnotes" class="rnotext"></div></section>
  <div class="rdock">
    <div class="rtools"><button class="btn" id="rreveal">Reveal</button><button class="btn" id="ract"></button><button class="btn" id="rdraw">Draw</button>
      <button class="btn" id="rjoin">Join screen</button><button class="btn" id="rall">Slides</button><button class="btn ghost" id="rend">End</button></div>
    <div class="rnav"><button class="btn rback" id="rprevb" aria-label="Previous slide">‹ Back</button><button class="btn primary rfwd" id="rnextb" aria-label="Next slide">Next ›</button></div>
  </div>
  <div class="modal" id="rgrid" hidden><div class="mbox"><div class="mhead"><h2>Jump to a slide</h2><button class="btn ghost" id="rgclose">Close</button></div><div class="rgrid" id="rgitems"></div></div></div>
  </div>`;
  const $ = s => root.querySelector(s);

  const sync = inkSync(store, code, 'remote');
  const ink = createInk($('#rink'), { storageKey: 'livedeck:rink:' + code, onCommit: sync.onCommit, onLive: sync.onLive, barParent: $('#rinkbar'), toggleButton: false });
  const push = patch => store.updateSession(code, patch).catch(e => console.warn('Session update failed', e));
  const onLive = v => { const s = slides[cur]; let j; try { j = JSON.stringify(v); } catch (e) { return; } live = { ...live, [s.id]: j }; push({ live }); refresh(); };
  const ctx = (s, extra = {}) => ({ mode: 'present', theme, onLive, thumb: s.type === 'video', values: valuesFor(responses, s), reveal: !!reveal[s.id], live: live[s.id] ?? null, ...extra });

  function draw(animate = false) {
    const s = slides[cur], T = TYPES[s.type] || {};
    $('#rslot').innerHTML = renderSlide(s, ctx(s));
    if (T.after) T.after(s, $('#rslot'), ctx(s), animate);
    ink.setSlide(s.id);
    const n = slides[cur + 1];
    $('#rnext').innerHTML = n ? renderSlide(n, ctx(n, { thumb: true, values: [], reveal: false })) : '<div class="rend">End of presentation</div>';
    if (n && TYPES[n.type]?.after) TYPES[n.type].after(n, $('#rnext'), ctx(n, { thumb: true }), false);
    $('#rnotes').textContent = s.notes || 'No notes for this slide.';
    buttons();
  }
  function refresh() { const s = slides[cur], T = TYPES[s.type] || {}; if (T.update) { T.update(s, $('#rslot'), ctx(s)); buttons(); } else draw(); }
  function buttons() {
    const s = slides[cur], T = TYPES[s.type] || {};
    $('#rnum').textContent = `${cur + 1} of ${slides.length}`;
    $('#rprevb').disabled = cur === 0 || ended; $('#rnextb').disabled = cur === slides.length - 1 || ended;
    $('#rreveal').hidden = !T.interactive; $('#rreveal').textContent = reveal[s.id] ? 'Hide results' : 'Reveal'; $('#rreveal').classList.toggle('on', !!reveal[s.id]);
    $('#ract').hidden = !T.action; $('#ract').textContent = T.action || '';
    $('#rjoin').classList.toggle('on', join); $('#rdraw').classList.toggle('on', drawing);
    $('#rjoined').textContent = `● ${responses.length} joined`;
  }

  function go(i) {
    if (ended || i < 0 || i >= slides.length || i === cur) return;
    if (!timer.running && !timer.acc && i > cur) setTimer({ running: true, start: Date.now() }); // timer starts with your first Next
    cur = i; const patch = { current: cur }; if (join) { join = false; patch.ui = { join: false }; }
    draw(); push(patch);
  }
  function toggleReveal() { const s = slides[cur]; if (!TYPES[s.type]?.interactive) return; reveal = { ...reveal, [s.id]: !reveal[s.id] }; refresh(); push({ reveal }); }
  function action() { const s = slides[cur], T = TYPES[s.type]; if (!T || !T.run) return; live = { ...live, [s.id]: T.run(s, live[s.id]) }; T.after(s, $('#rslot'), ctx(s), true); push({ live }); }

  // ---- timer (kept in the presenter-only stage doc, so it survives a reload and shows on every remote) ----
  const elapsed = () => timer.acc + (timer.running ? Date.now() - timer.start : 0);
  function setTimer(p) { timer = { ...timer, ...p }; store.setStage(code, { timer }).catch(() => { }); tick(); }
  function tick() {
    const e = elapsed();
    $('#relapsed').textContent = fmtTime(e);
    $('#tgo').textContent = timer.running ? 'Pause' : (e ? 'Resume' : 'Start');
    $('#rclock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const g = timer.goal * 60000, el = $('#rgoal'), box = $('.rtimer');
    if (g) { const left = g - e; el.textContent = left >= 0 ? `${fmtTime(left)} left of ${timer.goal} min` : `${fmtTime(-left)} over`; box.classList.toggle('warn', left >= 0 && left < 5 * 60000); box.classList.toggle('over', left < 0); }
    else { el.textContent = timer.running || e ? 'Elapsed' : 'Starts when you tap Next'; box.classList.remove('warn', 'over'); }
  }
  $('#tgo').onclick = () => timer.running ? setTimer({ running: false, acc: elapsed() }) : setTimer({ running: true, start: Date.now() });
  $('#treset').onclick = () => setTimer({ running: false, acc: 0, start: 0 });
  $('#tgoal').onchange = e => setTimer({ goal: +e.target.value });
  const tickT = setInterval(tick, 500);

  // ---- controls ----
  $('#rprevb').onclick = () => go(cur - 1); $('#rnextb').onclick = () => go(cur + 1);
  $('#rreveal').onclick = toggleReveal; $('#ract').onclick = action;
  $('#rdraw').onclick = () => { ink.toggle(); drawing = ink.active; $('#rhint').textContent = drawing ? 'Drawing shows on the main screen' : 'Swipe the slide to move'; buttons(); };
  $('#rjoin').onclick = () => { join = !join; push({ ui: { join } }); buttons(); };
  $('#rall').onclick = () => {
    $('#rgitems').innerHTML = slides.map((s, i) => `<button class="rgi${i === cur ? ' on' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"><span>${i + 1}</span>${renderSlide(s, ctx(s, { thumb: true, values: [], reveal: false }))}</button>`).join('');
    $('#rgrid').hidden = false;
  };
  $('#rgclose').onclick = () => { $('#rgrid').hidden = true; };
  $('#rgrid').onclick = e => { const b = e.target.closest('.rgi'); if (b) { $('#rgrid').hidden = true; go(+b.dataset.i); } else if (e.target.id === 'rgrid') $('#rgrid').hidden = true; };
  $('#rend').onclick = async () => {
    const b = $('#rend');
    if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Tap again to end'; setTimeout(() => { b.classList.remove('confirm'); b.textContent = 'End'; }, 3000); return; }
    await push({ open: false }); showEnded();
  };
  function showEnded() { ended = true; setTimer({ running: false, acc: elapsed() }); root.querySelector('.rcur').insertAdjacentHTML('afterbegin', '<p class="rended">This session has ended. Results are saved; download them from the main screen.</p>'); buttons(); }

  // Swipe the current slide to move (when not drawing)
  let sx = null, sy = 0;
  $('#rcurwrap').addEventListener('pointerdown', e => { if (!drawing) { sx = e.clientX; sy = e.clientY; } });
  $('#rcurwrap').addEventListener('pointerup', e => {
    if (sx == null || drawing) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(cur + (dx < 0 ? 1 : -1));
  });
  const onKey = e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (ink.key(e)) { e.preventDefault(); drawing = ink.active; buttons(); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(cur + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
    else if (e.key === 'r' || e.key === 'R') toggleReveal();
    else if (e.key === 's' || e.key === 'S') action();
    else if (e.key === 'd' || e.key === 'D') $('#rdraw').click();
  };
  document.addEventListener('keydown', onKey);

  // Keep the screen awake while presenting (where the browser allows it)
  const lock = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch (e) { } };
  const onVis = () => { if (document.visibilityState === 'visible') lock(); };
  document.addEventListener('visibilitychange', onVis); lock();

  // ---- follow the session (the display or another remote may change it) ----
  const unsubS = store.watchSession(code, s => {
    if (!s) return; if (!s.open) { if (!ended) showEnded(); return; }
    const nc = Math.max(0, Math.min(slides.length - 1, s.current || 0)), nr = s.reveal || {}, nl = s.live || {};
    join = !!(s.ui && s.ui.join);
    if (nc !== cur) { cur = nc; reveal = nr; live = nl; draw(); return; }
    const sl = slides[cur], T = TYPES[sl.type] || {};
    const lc = JSON.stringify(live[sl.id] ?? null) !== JSON.stringify(nl[sl.id] ?? null), rc = !!reveal[sl.id] !== !!nr[sl.id];
    reveal = nr; live = nl;
    if (lc && T.run) T.after(sl, $('#rslot'), ctx(sl), true); else if (lc || rc) refresh(); else buttons();
  });
  const unsubR = store.watchResponses(code, list => { responses = list; if (TYPES[slides[cur].type]?.interactive) refresh(); else buttons(); });
  const unsubT = store.watchStage(code, st => {
    sync.apply(st, ink);
    if (st.timer && JSON.stringify(st.timer) !== JSON.stringify(timer)) { timer = { ...timer, ...st.timer }; $('#tgoal').value = String(timer.goal || 0); tick(); }
  });
  const beat = () => store.setStage(code, { remoteAt: Date.now() }).catch(() => { });
  beat(); const beatT = setInterval(beat, 20000);

  draw(); tick();
  return () => { clearInterval(tickT); clearInterval(beatT); ink.destroy(); document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); try { wake && wake.release(); } catch (e) { } [unsubS, unsubR, unsubT].forEach(u => u && u()); };
}
