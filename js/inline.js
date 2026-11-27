import { htmlToMd } from './format.js?v=2.3';

// Edit slide text directly on the editor's preview. The renderer marks editable text with
// data-f (field name) and data-i (index into a list field such as poll options).
// Single-line fields: Enter finishes. Body text is rich: Enter makes a new paragraph or list item,
// and the formatting bar (or Cmd/Ctrl+B, I, U) styles the selection. It's saved as plain markers (see format.js).

export function createInline(host, { getSlide, onField, onDone, onFocus }) {
  let editing = null, rendering = false, saved = null;
  const keyOf = el => ({ f: el.dataset.f, i: el.dataset.i != null ? +el.dataset.i : null });
  const isBody = el => el.dataset.f === 'body';

  function enable() {
    host.querySelectorAll('[data-f]').forEach(el => {
      if (isBody(el)) el.contentEditable = 'true';
      else { try { el.contentEditable = 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; } if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; }
      el.spellcheck = true; el.setAttribute('role', 'textbox'); el.setAttribute('aria-label', 'Edit ' + (el.dataset.f === 'body' ? 'text' : el.dataset.f));
      if (isBody(el)) el.setAttribute('aria-multiline', 'true');
    });
  }
  function caretEnd(el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  function focusField(k) {
    const el = host.querySelector(`[data-f="${k.f}"]${k.i != null ? `[data-i="${k.i}"]` : ''}`);
    if (el) caretEnd(el);
  }
  const valueOf = el => isBody(el) ? htmlToMd(el) : el.textContent.replace(/\s*\n\s*/g, ' ');

  host.addEventListener('focusin', e => {
    const el = e.target.closest && e.target.closest('[data-f]'); if (!el || el === editing) return;
    editing = el;
    if (isBody(el)) { try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch (x) { } }
    onFocus && onFocus(isBody(el));
  });
  host.addEventListener('input', e => {
    const el = e.target.closest && e.target.closest('[data-f]'); if (!el) return;
    const s = getSlide(), { f, i } = keyOf(el), v = valueOf(el);
    if (i != null) { const arr = Array.isArray(s[f]) ? s[f].slice() : []; arr[i] = v; s[f] = arr; }
    else s[f] = v;
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
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.flink')) return; // using the formatting bar's link box
    editing = null; onFocus && onFocus(false);
    const next = e.relatedTarget && host.contains(e.relatedTarget) && e.relatedTarget.closest('[data-f]');
    const nk = next ? keyOf(next) : null;
    setTimeout(() => { rendering = true; try { onDone(); if (nk) focusField(nk); } finally { rendering = false; } }, 0); // re-render formatted, then keep focus where you clicked
  });
  // ---- formatting (used by the editor's formatting bar) ----
  function apply(cmd, val) {
    if (!editing || !isBody(editing)) return;
    if (saved) { editing.focus(); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(saved); saved = null; }
    if (cmd === 'highlight') {
      const n = getSelection().anchorNode, inMark = n && (n.nodeType === 1 ? n : n.parentElement).closest('mark,[style*="background"]');
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('hiliteColor', false, inMark ? 'transparent' : '#fff3a3');
      document.execCommand('styleWithCSS', false, false);
    } else document.execCommand(cmd, false, val ?? null);
    editing.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const keep = () => { const sel = getSelection(); saved = sel.rangeCount && editing && editing.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null; return !!saved; };
  const state = cmd => { try { return document.queryCommandState(cmd); } catch (e) { return false; } };
  const finish = () => { if (editing) editing.blur(); };
  const reset = () => { saved = null; if (!editing) return; editing = null; onFocus && onFocus(false); rendering = true; try { onDone(); } finally { rendering = false; } };
  return { enable, apply, keep, state, finish, reset, get collapsed() { return !saved || saved.collapsed; }, get bodyActive() { return !!(editing && isBody(editing)); } };
}
