// Edit slide text directly on the editor's preview. The renderer marks editable text with
// data-f (field name) and data-i (index into a list field such as poll options).
// Single-line fields: Enter finishes. Body text: Enter makes a new line; while you edit it you see
// the plain text (blank line = new paragraph, "- " = bullet); it's formatted again when you click away.

export function createInline(host, { getSlide, onField, onDone }) {
  let editing = null, rendering = false;
  const keyOf = el => ({ f: el.dataset.f, i: el.dataset.i != null ? +el.dataset.i : null });
  const isBody = el => el.dataset.f === 'body';

  function enable() {
    host.querySelectorAll('[data-f]').forEach(el => {
      try { el.contentEditable = 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; }
      if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
      el.spellcheck = true; el.setAttribute('role', 'textbox'); el.setAttribute('aria-label', 'Edit ' + (el.dataset.f === 'body' ? 'text' : el.dataset.f));
      if (isBody(el)) el.setAttribute('aria-multiline', 'true');
    });
  }
  function caretEnd(el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  function focusField(k) {
    const el = host.querySelector(`[data-f="${k.f}"]${k.i != null ? `[data-i="${k.i}"]` : ''}`);
    if (el) caretEnd(el);
  }
  const valueOf = el => isBody(el) ? el.innerText.replace(/ /g, ' ').replace(/\n$/, '') : el.textContent.replace(/\s*\n\s*/g, ' ');

  host.addEventListener('focusin', e => {
    const el = e.target.closest && e.target.closest('[data-f]'); if (!el || el === editing) return;
    editing = el;
    if (isBody(el) && !el.classList.contains('rawedit')) { // show the plain text while editing
      el.classList.add('rawedit'); el.textContent = el.dataset.raw || ''; caretEnd(el);
    }
  });
  host.addEventListener('input', e => {
    const el = e.target.closest && e.target.closest('[data-f]'); if (!el) return;
    const s = getSlide(), { f, i } = keyOf(el), v = valueOf(el);
    if (i != null) { const arr = Array.isArray(s[f]) ? s[f].slice() : []; arr[i] = v; s[f] = arr; }
    else s[f] = v;
    if (isBody(el)) el.dataset.raw = v;
    onField(f);
  });
  host.addEventListener('keydown', e => {
    const el = e.target.closest && e.target.closest('[data-f]'); if (!el) return;
    e.stopPropagation(); // keep editor shortcuts (Delete removes a picture, etc.) out of typing
    if (e.key === 'Escape' || (e.key === 'Enter' && !isBody(el) && !e.shiftKey)) { e.preventDefault(); el.blur(); }
  });
  host.addEventListener('paste', e => {
    const el = e.target.closest && e.target.closest('[data-f]'); if (!el) return;
    e.preventDefault();
    let t = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    if (!isBody(el)) t = t.replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, t);
  });
  host.addEventListener('focusout', e => {
    const el = e.target.closest && e.target.closest('[data-f]'); if (!el || rendering) return; // removing elements during a redraw also fires focusout
    editing = null;
    const next = e.relatedTarget && host.contains(e.relatedTarget) && e.relatedTarget.closest('[data-f]');
    const nk = next ? keyOf(next) : null;
    setTimeout(() => { rendering = true; try { onDone(); if (nk) focusField(nk); } finally { rendering = false; } }, 0); // re-render formatted, then keep focus where you clicked
  });
  return { enable };
}
