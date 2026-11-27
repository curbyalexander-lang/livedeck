// Text formatting for body text. Stored as simple plain-text markers so it's safe to show anywhere:
//   blank line = new paragraph      - item  = bulleted list      1. item = numbered list
//   **bold**   *italic*   __underline__   ==highlight==   [link text](https://…)
// mdToHtml turns that into HTML (everything escaped first); htmlToMd turns edited HTML back.
import { esc } from './util.js?v=2.3';

const BUL = /^\s*[-•]\s+/, NUM = /^\s*(\d+)[.)]\s+/;

function inline(x) {
  let h = esc(x);
  h = h.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
       .replace(/__(.+?)__/g, '<u>$1</u>')
       .replace(/==(.+?)==/g, '<mark>$1</mark>')
       .replace(/(^|[^*\w])\*(?![\s*])(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  return h;
}

export function mdToHtml(text) {
  return String(text || '').split(/\n\s*\n/).map(block => {
    const lines = block.split('\n').filter(l => l.trim());
    let html = '', i = 0;
    while (i < lines.length) {
      if (BUL.test(lines[i])) {
        const items = []; while (i < lines.length && BUL.test(lines[i])) items.push(lines[i++].replace(BUL, ''));
        html += `<ul>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`;
      } else if (NUM.test(lines[i])) {
        const start = parseInt(lines[i].match(NUM)[1], 10), items = [];
        while (i < lines.length && NUM.test(lines[i])) items.push(lines[i++].replace(NUM, ''));
        html += `<ol${start > 1 ? ` start="${start}"` : ''}>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`;
      } else {
        const ps = []; while (i < lines.length && !BUL.test(lines[i]) && !NUM.test(lines[i])) ps.push(inline(lines[i++]));
        html += `<p>${ps.join('<br>')}</p>`;
      }
    }
    return html;
  }).join('');
}

// ---- edited HTML (from the slide) back to markers ----
const wrap = (m, s) => { if (!s.trim()) return s; const a = s.match(/^\s*/)[0], b = s.match(/\s*$/)[0]; return a + m + s.trim() + m + b; };
const BLOCKS = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION']);

function inl(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/ /g, ' '); continue; }
    if (n.nodeType !== 1) continue;
    const t = n.tagName, st = n.style || {}, inner = inl(n);
    if (t === 'BR') out += '\n';
    else if (BLOCKS.has(t)) out += '\n' + inner + '\n';
    else if (t === 'A') { const href = n.getAttribute('href') || ''; out += /^https:\/\//.test(href) && inner.trim() ? `[${inner.trim()}](${href})` : inner; }
    else {
      let s = inner;
      if (t === 'B' || t === 'STRONG' || /bold|[6-9]00/.test(st.fontWeight || '')) s = wrap('**', s);
      if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') s = wrap('*', s);
      if (t === 'U' || /underline/.test(st.textDecoration || st.textDecorationLine || '')) s = wrap('__', s);
      if (t === 'MARK' || (st.backgroundColor && !/transparent|rgba\(0, 0, 0, 0\)/.test(st.backgroundColor))) s = wrap('==', s);
      out += s;
    }
  }
  return out;
}
function blocks(root) {
  const out = []; let buf = '';
  const flush = () => { const t = buf.replace(/^\n+|\n+$/g, ''); if (t.trim()) out.push(t); buf = ''; };
  for (const n of root.childNodes) {
    const t = n.nodeType === 1 ? n.tagName : '';
    if (t === 'UL' || t === 'OL') {
      flush(); let k = parseInt(n.getAttribute('start') || '1', 10) || 1;
      const lines = [...n.children].filter(li => li.tagName === 'LI').map(li => inl(li).replace(/\s*\n\s*/g, ' ').trim().replace(/^([-•]|\d+[.)])\s+/, '')).filter(Boolean)
        .map(x => (t === 'UL' ? '- ' : (k++) + '. ') + x);
      if (lines.length) out.push(lines.join('\n'));
    } else if (t && BLOCKS.has(t)) {
      flush();
      if ([...n.children].some(c => BLOCKS.has(c.tagName))) out.push(...blocks(n));
      else { const s = inl(n).replace(/^\n+|\n+$/g, ''); if (s.trim()) out.push(s); }
    } else buf += n.nodeType === 3 ? n.nodeValue.replace(/ /g, ' ') : n.nodeType === 1 ? inl({ childNodes: [n] }) : '';
  }
  flush();
  return out;
}
export const htmlToMd = el => blocks(el).join('\n\n').replace(/[ \t]+\n/g, '\n');
