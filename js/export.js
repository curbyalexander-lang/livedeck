// Export a presentation as PDF, PowerPoint (.pptx), Google Slides (via .pptx), or a LiveDeck backup (.json).
// Interactive slides and videos become still images. Optionally include a past session's results.
import { TYPES, renderSlide, esc } from './types.js?v=2.3';
import { normalize, loadFonts } from './themes.js?v=2.3';
import { valuesFor } from './live.js?v=2.3';

const LIBS = {
  pptx: 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
  img: 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js'
};
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const loaded = {};
const loadScript = src => loaded[src] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load the export tools. Check your internet connection.')); }; document.head.appendChild(s); });
const fileName = (t, ext) => (String(t || 'presentation').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'presentation') + '.' + ext;
const waitImages = el => Promise.all([...el.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 8000); })));

export async function openExport({ store, deck, widgets = {} }) {
  let sessions = []; try { sessions = (await store.listSessions(deck.id)).sort((a, b) => b.createdAt - a.createdAt); } catch (e) { }
  const prev = document.activeElement;
  const wrap = document.createElement('div'); wrap.className = 'modal';
  wrap.innerHTML = `<div class="mbox exbox" role="dialog" aria-label="Export">
    <div class="mhead"><h2>Export “${esc(deck.title || 'Untitled')}”</h2><button class="btn ghost" data-a="close">Close</button></div>
    <fieldset class="exfmt"><legend>Format</legend>
      <label class="exopt"><input type="radio" name="fmt" value="pdf" checked><span><b>PDF</b><small>Opens your browser's print window: choose <b>Save as PDF</b>. Text stays sharp and searchable, and video links stay clickable.</small></span></label>
      <label class="exopt"><input type="radio" name="fmt" value="pptx"><span><b>PowerPoint (.pptx)</b><small>Each slide as a picture, with your speaker notes and clickable video links.</small></span></label>
      <label class="exopt"><input type="radio" name="fmt" value="gslides"><span><b>Google Slides</b><small>Makes the same .pptx file; then you open it in Google Slides (steps shown after it downloads).</small></span></label>
      <label class="exopt"><input type="radio" name="fmt" value="json"><span><b>LiveDeck backup (.json)</b><small>The full, editable presentation, including any custom widgets it uses. Import it from your presentations page.</small></span></label>
    </fieldset>
    <div class="exmore" id="exmore">
      <label class="chk"><input type="checkbox" id="exnotes"> Include speaker notes <small class="muted" id="exnoteshint">(PDF: one slide per page with notes underneath)</small></label>
      <div class="field"><label for="exres">Interactive slides</label><select id="exres"><option value="">Show the activities without results</option>${sessions.map(s => `<option value="${esc(s.code)}">Results from session ${esc(s.code)} · ${s.createdAt ? new Date(s.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}${s.open ? ' (still open)' : ''}</option>`).join('')}</select>
        <small>${sessions.length ? 'Pick a session to show its charts, rankings, and word clouds as they ended up.' : 'Once you’ve presented this deck, you can include a session’s results here.'}</small></div>
    </div>
    <div class="exgo"><button class="btn primary" data-a="go">Export</button><span class="muted small" id="exmsg" aria-live="polite"></span></div>
    <div id="exafter"></div></div>`;
  document.body.appendChild(wrap);
  const $ = s => wrap.querySelector(s), msg = t => $('#exmsg').textContent = t || '';
  const fmt = () => wrap.querySelector('input[name="fmt"]:checked').value;
  const syncOpts = () => { const f = fmt(); $('#exmore').hidden = f === 'json'; $('#exnoteshint').textContent = f === 'pdf' ? '(PDF: one slide per page with notes underneath)' : '(in the PowerPoint notes pane)'; $('#exafter').innerHTML = ''; };
  wrap.addEventListener('change', e => { if (e.target.name === 'fmt') syncOpts(); });
  wrap.addEventListener('click', async e => {
    if (e.target === wrap) return close();
    const b = e.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === 'close') return close();
    if (b.dataset.a === 'go') {
      b.disabled = true;
      try { await run(fmt(), $('#exnotes').checked, $('#exres').value); }
      catch (x) { console.error(x); msg(x.message || 'Export failed.'); }
      b.disabled = false;
    }
  });
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  function close() { document.removeEventListener('keydown', onKey); wrap.remove(); prev && prev.focus && prev.focus(); }

  // ---- prepare slides as they'll appear in the export ----
  async function prepared(resCode) {
    const theme = normalize(deck.theme); loadFonts(theme);
    let responses = [], live = {};
    if (resCode) { msg('Loading results…'); responses = await store.getResponses(resCode); live = (sessions.find(s => s.code === resCode) || {}).live || {}; }
    const slides = (deck.slides || []).map(s => s.type === 'custom' && widgets[s.widgetId] ? { ...s, widgetName: widgets[s.widgetId].name } : s);
    return slides.map(s => {
      const values = valuesFor(responses, s);
      const ctx = { mode: 'export', exporting: true, theme, values, reveal: values.length > 0, live: live[s.id] ?? null };
      return { s, ctx, html: renderSlide(s, ctx) };
    });
  }
  const after = (root, item) => { const T = TYPES[item.s.type]; if (T && T.after && item.s.type !== 'custom') T.after(item.s, root, item.ctx, false); };

  async function run(f, notes, resCode) {
    if (f === 'json') return exportJson();
    const items = await prepared(resCode);
    if (f === 'pdf') return exportPdf(items, notes);
    return exportPptx(items, notes, f === 'gslides');
  }

  function exportJson() {
    const { id: _i, owner: _o, ...rest } = deck;
    rest.widgets = {};
    (deck.slides || []).forEach(sl => { const w = sl.type === 'custom' && widgets[sl.widgetId]; if (w) rest.widgets[w.id] = { name: w.name, description: w.description || '', code: w.code, config: w.config || '' }; });
    download(new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' }), fileName(deck.title, 'json'));
    msg('Downloaded.');
  }

  // PDF: a print layout, one slide per page (or slide + notes per page), printed by the browser.
  async function exportPdf(items, notes) {
    msg('Preparing pages…');
    const pr = document.createElement('div'); pr.id = 'printroot'; pr.className = notes ? 'handout' : 'slidesonly';
    pr.innerHTML = items.map((it, i) => `<section class="ppage">${it.html}${notes ? `<div class="pnotes"><p class="pnum">Slide ${i + 1} of ${items.length}</p>${it.s.notes ? `<p>${esc(it.s.notes).replace(/\n/g, '<br>')}</p>` : '<p class="muted">No notes.</p>'}</div>` : ''}</section>`).join('');
    document.body.appendChild(pr);
    pr.querySelectorAll('.ppage').forEach((pg, i) => after(pg, items[i]));
    const page = document.createElement('style'); page.id = 'printpage';
    page.textContent = notes ? '@page{size:letter portrait;margin:0.5in}' : '@page{size:13.333in 7.5in;margin:0}';
    document.head.appendChild(page);
    await waitImages(pr); try { await document.fonts.ready; } catch (e) { }
    const cleanup = () => { pr.remove(); page.remove(); removeEventListener('afterprint', cleanup); };
    addEventListener('afterprint', cleanup);
    msg('In the print window, choose “Save as PDF” as the destination.');
    window.print();
    setTimeout(() => { if (document.getElementById('printroot')) $('#exafter').innerHTML = '<p class="muted small">Print window closed? <button class="linkbtn" data-a="close">Done</button></p>'; }, 1500);
  }

  // PPTX: each slide captured as a picture (what you see is what you get), plus notes and video links.
  async function exportPptx(items, notes, forGoogle) {
    msg('Loading export tools…');
    await Promise.all([loadScript(LIBS.pptx), loadScript(LIBS.img)]);
    const pptx = new window.PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.title = deck.title || 'Presentation';
    const stage = document.createElement('div'); stage.className = 'exstage'; document.body.appendChild(stage);
    let missing = 0;
    try {
      for (let i = 0; i < items.length; i++) {
        msg(`Capturing slide ${i + 1} of ${items.length}…`);
        const it = items[i];
        stage.innerHTML = it.html; after(stage, it);
        await waitImages(stage);
        const el = stage.querySelector('.slide');
        let data;
        try { data = await window.htmlToImage.toPng(el, { width: 1600, height: 900, pixelRatio: 1.5, imagePlaceholder: BLANK, cacheBust: false }); }
        catch (e) { missing++; data = await window.htmlToImage.toPng(el, { width: 1600, height: 900, pixelRatio: 1.5, imagePlaceholder: BLANK, skipFonts: true, filter: n => n.tagName !== 'IMG' }); }
        const sl = pptx.addSlide();
        sl.addImage({ data, x: 0, y: 0, w: 13.333, h: 7.5, altText: it.s.title || it.s.heading || it.s.prompt || `Slide ${i + 1}` });
        if (it.s.type === 'video' && /^https:\/\//.test(it.s.url || '')) sl.addText('▶ Watch the video', { x: 0.4, y: 6.75, w: 4, h: 0.5, fontSize: 16, bold: true, color: '1D5FD1', hyperlink: { url: it.s.url, tooltip: it.s.url } });
        if (notes && it.s.notes) sl.addNotes(it.s.notes);
      }
    } finally { stage.remove(); }
    msg('Building file…');
    await pptx.writeFile({ fileName: fileName(deck.title, 'pptx') });
    msg(missing ? `Downloaded. ${missing} slide(s) had pictures that couldn’t be copied (the site hosting them doesn’t allow it); the PDF export will include them.` : 'Downloaded.');
    if (forGoogle) $('#exafter').innerHTML = `<div class="note"><b>Open it in Google Slides:</b><ol><li>Go to <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener">Google Drive</a> and upload the .pptx file you just downloaded (drag it in, or New → File upload).</li><li>Right-click the file → <b>Open with → Google Slides</b>.</li><li>In Google Slides, choose <b>File → Save as Google Slides</b> to keep an editable copy you can share with students.</li></ol></div>`;
  }

  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  syncOpts();
  wrap.querySelector('input[name="fmt"]').focus();
}
