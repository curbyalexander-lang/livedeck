// Audience phone view. No account needed: Firebase anonymous sign-in gives each phone an id.
import { TYPES, esc } from './types.js?v=2.0';
import { normalize, loadFonts, FONTS } from './themes.js?v=2.0';

export async function mount(root, store, arg) {
  const code = String(arg || '').toUpperCase();
  if (!code) {
    root.innerHTML = `<div class="phone"><h2>Join a presentation</h2><form id="jf" class="wordrow"><input id="jc" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="Code" aria-label="Session code"><button class="pbtn">Join</button></form><p class="hint" id="jm">Enter the 5-character code on the screen.</p></div>`;
    root.querySelector('#jf').onsubmit = e => {
      e.preventDefault(); const c = root.querySelector('#jc').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length === 5) location.hash = '#join-' + c; else root.querySelector('#jm').textContent = 'Codes are 5 letters or numbers.';
    };
    root.querySelector('#jc').focus();
    return;
  }

  root.innerHTML = `<div class="phone"><p class="look">Connecting…</p></div>`;
  let uid;
  try { uid = await store.audienceId(); }
  catch (e) { root.innerHTML = `<div class="phone"><h2>Can't connect</h2><p class="look">Ask the presenter to turn on Anonymous sign-in in Firebase. (${esc(e.code || e.message)})</p></div>`; return; }

  const MKEY = 'livedeck:mine:' + code;
  let mine = {}; try { mine = JSON.parse(localStorage.getItem(MKEY)) || {}; } catch (e) { }
  let session = null, cur = -1, registered = false, sendT = 0, liveN = null, sig = '';

  function send(msg) {
    try { localStorage.setItem(MKEY, JSON.stringify(mine)); } catch (e) { }
    clearTimeout(sendT);
    sendT = setTimeout(() => store.setResponse(code, uid, mine)
      .then(() => saved(msg || 'Response sent.'), () => saved('Could not send. Check your connection and try again.')), 250);
  }
  const saved = t => { const el = root.querySelector('#saved'); if (el) el.textContent = t; };

  function draw() {
    const s = session.slides[cur], T = TYPES[s && s.type];
    const th = normalize(session.theme); loadFonts(th);
    root.innerHTML = `<div class="phone" style="--acc:${th.accent};--hf:${esc(FONTS[th.headFont].css)}"><div class="ptop"><span><i class="dot"></i>${esc(session.title || 'Live')}</span><span>${cur + 1} / ${session.slides.length}</span></div>
      <div id="pc"></div><p class="saved" id="saved" aria-live="polite"></p></div>`;
    const pc = root.querySelector('#pc');
    if (!T) { pc.innerHTML = '<p class="look">Eyes on the screen.</p>'; return; }
    if (T.mount) {
      pc.innerHTML = `<h2>${esc(s.prompt || s.title || '')}</h2><div id="ctl"></div>`;
      const ctl = pc.querySelector('#ctl');
      const pctx = { mode: 'phone', theme: th, live: (session.live || {})[s.id], value: mine[s.id] };
      T.mount(s, ctl, mine[s.id], v => { mine[s.id] = v; send(s.type === 'words' ? `Sent “${v}”. You can change it anytime.` : null); }, pctx);
      if (T.after && s.type !== 'custom') T.after(s, ctl, pctx, false);
      if (T.interactive && session.reveal && session.reveal[s.id]) saved('Results are up on the screen.');
    } else pc.innerHTML = T.phone(s);
  }

  const unsub = store.watchSession(code, s => {
    if (!s) { root.innerHTML = `<div class="phone"><h2>No session with code ${esc(code)}</h2><p class="look">Check the code on the screen.</p><p><a class="btn" href="#join">Try another code</a></p></div>`; return; }
    if (!s.open) { root.innerHTML = `<div class="phone"><h2>This session has ended</h2><p class="look">Thanks for taking part.</p></div>`; return; }
    if (!registered) { registered = true; store.setResponse(code, uid, mine).catch(() => { }); }
    session = s;
    const i = Math.max(0, Math.min(s.current || 0, s.slides.length - 1)), slide = s.slides[i];
    const nsig = JSON.stringify(slide) + JSON.stringify(s.theme || null), live = (s.live || {})[slide.id], n = live == null ? null : (typeof live === 'string' ? live : live.n);
    if (i !== cur || nsig !== sig) { cur = i; sig = nsig; liveN = n; draw(); return; }
    const T = TYPES[slide.type];
    if (T && T.after && n !== liveN) { liveN = n; T.after(slide, root.querySelector('#ctl'), { mode: 'phone', live, value: mine[slide.id] }, true); }
    if (T && T.interactive && s.reveal && s.reveal[slide.id]) saved('Results are up on the screen.');
  });

  return () => { clearTimeout(sendT); unsub && unsub(); };
}
