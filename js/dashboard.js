import { esc, newSlide } from './types.js?v=2.0';
import { EXAMPLES } from './widgets.js?v=2.0';
import { VERSION } from './version.js?v=2.0';

export function sampleDeck(w = {}) {
  const s = (type, o) => Object.assign(newSlide(type), o);
  return {
    title: 'Sample: Beyond the Slide',
    slides: [
      s('title', { title: 'Beyond the Slide', sub: 'A presentation the room plays with you', notes: 'Show the join code. Wait for phones.' }),
      s('slider', { prompt: 'How confident are you using AI in your teaching?', min: 0, max: 10, lo: 'Not at all', hi: 'Completely' }),
      s('poll', { prompt: 'Which framework best explains why teachers adopt new technology?', options: ['TPACK', 'Technology Acceptance Model', 'Constructionism', 'SAMR'] }),
      s('text', { heading: 'Learning by making', body: 'Papert argued that people learn best when they build things they can share, test, and talk about.\n\n- Objects to think with\n- Ideas made visible\n- Learning in public' }),
      s('rank', { prompt: 'Rank what matters most for student engagement', items: ['Choice', 'Challenge', 'Relevance', 'Collaboration'] }),
      s('video', { heading: 'Watch together', url: '' }),
      s('spinner', { title: 'Spin for a discussion prompt', items: ['A lesson that flopped', 'A tool you abandoned', 'Your best "aha" moment', 'A student who surprised you', 'Something you would never automate', 'A rule you broke on purpose'] }),
      s('words', { prompt: 'In one word: what should a presentation feel like?' }),
      ...(w.estimate ? [s('custom', { prompt: 'In what year was the first email sent?', widgetId: w.estimate, config: '{ "answer": 1971, "min": 1950, "max": 2000 }' })] : []),
      ...(w.timer ? [s('custom', { prompt: '', widgetId: w.timer, config: '{ "seconds": 90, "label": "Turn and talk" }' })] : []),
      s('title', { title: 'Thank you', sub: 'What interaction should we try next?' })
    ]
  };
}

export async function mount(root, store) {
  const local = store.mode === 'local';
  root.innerHTML = `<div class="page">
  <header class="top"><strong class="brand">LiveDeck</strong><span class="grow"></span><span class="muted">${esc(store.label())}</span>${local ? '' : '<button class="btn ghost" id="so">Sign out</button>'}</header>
  ${local ? `<div class="note"><strong>Local mode.</strong> Decks are saved in this browser only, and phones can't join yet. Add your Firebase config to <code>js/config.js</code> to go live (see README). To try the audience side now, open the join link in another tab of this browser.</div>` : ''}
  <div class="titlerow"><h1>My presentations</h1><div class="actions">
    <button class="btn primary" id="new">New presentation</button>
    <button class="btn" id="sample">Add sample deck</button>
    <label class="btn">Import JSON<input type="file" accept="application/json,.json" id="imp" hidden></label>
  </div></div>
  <p class="err" id="err"></p>
  <div id="list" class="decklist"><p class="muted">Loading…</p></div>
  <p class="muted small ver">LiveDeck version ${VERSION} · ${local ? 'local mode' : 'Firebase'}</p></div>`;
  const $ = s => root.querySelector(s), err = m => $('#err').textContent = m || '';
  if (!local) $('#so').onclick = () => store.signOut();

  async function create(deck) {
    try { const id = await store.createDeck(deck); location.hash = '#edit-' + id; } catch (e) { err(e.message); }
  }
  $('#new').onclick = () => create({ title: 'Untitled presentation', slides: [newSlide('title')] });
  $('#sample').onclick = async () => {
    // The sample also adds two example custom widgets to your library.
    const w = {};
    try {
      const have = await store.listItems('widgets');
      for (const [key, name] of [['estimate', 'Estimation'], ['timer', 'Shared timer']]) {
        const found = have.find(x => x.name === name); const ex = EXAMPLES.find(x => x.name === name);
        w[key] = found ? found.id : await store.saveItem('widgets', { name: ex.name, description: ex.description, code: ex.code, config: ex.config });
      }
    } catch (e) { }
    create(sampleDeck(w));
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.slides)) throw new Error('That file is not a LiveDeck export.');
      const remap = {}; // bring bundled custom widgets into your library
      for (const [oldId, w] of Object.entries(d.widgets || {})) if (w && typeof w.code === 'string') remap[oldId] = await store.saveItem('widgets', { name: String(w.name || 'Imported widget'), description: String(w.description || ''), code: w.code, config: String(w.config || '') });
      create({ title: String(d.title || 'Imported presentation'), theme: d.theme || null, slides: d.slides.map(s => ({ ...s, ...(s.type === 'custom' && remap[s.widgetId] ? { widgetId: remap[s.widgetId] } : {}), id: newSlide('title').id + Math.random().toString(36).slice(2, 4) })) });
    } catch (x) { err(x.message); }
  };

  async function draw() {
    let decks;
    try { decks = await store.listDecks(); } catch (e) { $('#list').innerHTML = ''; return err(e.message); }
    decks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!decks.length) { $('#list').innerHTML = `<div class="empty"><p>No presentations yet.</p><p class="muted">Start a new one, or add the sample deck to see every slide type.</p></div>`; return; }
    $('#list').innerHTML = decks.map(d => `<div class="deck">
      <div class="dmeta"><a class="dname" href="#edit-${esc(d.id)}">${esc(d.title || 'Untitled')}</a>
      <span class="muted">${(d.slides || []).length} slides · edited ${d.updatedAt ? new Date(d.updatedAt).toLocaleString() : '—'}</span></div>
      <a class="btn" href="#edit-${esc(d.id)}">Edit</a><a class="btn primary" href="#present-${esc(d.id)}">Present</a>
      <button class="btn ghost del" data-id="${esc(d.id)}">Delete</button></div>`).join('');
    root.querySelectorAll('.del').forEach(b => b.onclick = async () => {
      if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Click again to delete'; setTimeout(() => { b.classList.remove('confirm'); b.textContent = 'Delete'; }, 3000); return; }
      try { await store.deleteDeck(b.dataset.id); draw(); } catch (e) { err(e.message); }
    });
  }
  draw();
}
