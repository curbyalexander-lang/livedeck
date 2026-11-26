// Router. Views live behind the URL hash so the whole app is one static page:
//   #decks            your presentations
//   #edit-<deckId>    authoring tool
//   #present-<deckId> presenter screen (starts a live session)
//   #join  /  #join-<CODE>   audience phones
import { getStore } from './store.js?v=2.0';
import { esc } from './types.js?v=2.0';

const root = document.getElementById('app');
let store, cleanup = null, token = 0;

function parse() {
  const h = location.hash.slice(1);
  const m = h.match(/^(edit|present|join)(?:-([\w-]+))?$/);
  return m ? { view: m[1], arg: m[2] || '' } : { view: 'decks', arg: '' };
}

async function route() {
  const my = ++token;
  if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
  window.scrollTo(0, 0);
  const { view, arg } = parse();
  if (view !== 'join' && !store.isPresenter()) return signIn();
  root.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const mod = await import(`./${({ decks: 'dashboard', edit: 'editor' })[view] || view}.js?v=2.0`);
    if (my !== token) return;
    cleanup = (await mod.mount(root, store, arg)) || null;
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="page"><h1>Something went wrong</h1><p class="err">${esc(e.message || e)}</p><p><a class="btn" href="#decks">Back to presentations</a></p></div>`;
  }
}

function signIn() {
  root.innerHTML = `<div class="page narrow center"><h1>LiveDeck</h1><p>Sign in to build and present your decks.</p>
  <button class="btn primary big" id="si">Sign in with Google</button><p class="err" id="err"></p>
  <p class="muted">Joining a presentation? <a href="#join">Enter a code</a></p></div>`;
  document.getElementById('si').onclick = async () => {
    try { await store.signIn(); route(); }
    catch (e) { document.getElementById('err').textContent = e.code === 'auth/unauthorized-domain' ? 'This web address is not on your Firebase Authorized domains list yet (see README).' : (e.message || 'Sign-in failed.'); }
  };
}

(async () => {
  try { store = await getStore(); await store.ready(); }
  catch (e) { root.innerHTML = `<div class="page"><h1>Could not start</h1><p class="err">${esc(e.message || e)}</p><p>Check js/config.js and your connection.</p></div>`; return; }
  store.onUser(() => route());
  addEventListener('hashchange', route);
  route();
})();
