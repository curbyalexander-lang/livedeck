// Quiz-style interactive slides: True or False, Quiz (multiple choice), Matching, Hotspot / 2-axis plot,
// Sort into groups, Open response, Number estimate. Each follows the same shape as the other types in
// types.js (see the comment at the top of that file). Answers stay hidden until the presenter reveals.

export function quizTypes({ F, esc, rows }) {
  const R = (a, max) => (Array.isArray(a) ? a : []).filter(r => r && String(r.text ?? r.a ?? '').trim()).slice(0, max);
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const chip = (t, cls = '') => `<span class="qchip${cls ? ' ' + cls : ''}">${esc(t)}</span>`;
  const seedRnd = seed => { let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ h >>> 15, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; };
  const shuffled = (n, seed) => { const a = [...Array(n).keys()], r = seedRnd(seed); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const LET = 'ABCDEFGH';

  // ---------- True or False ----------
  const tf = {
    label: 'True or False', group: 'Quiz', blurb: 'Several statements; everyone marks each one True or False', interactive: true,
    defaults: { prompt: 'True or false?', statements: [{ text: 'First statement', ans: 't' }, { text: 'Second statement', ans: 'f' }, { text: 'Third statement', ans: '' }] },
    fields: [F('prompt', 'Question'), { k: 'statements', label: 'Statements', type: 'rows', max: 10, addLabel: 'Add statement', hint: 'Set an answer to show it when you reveal results, or leave "No answer" for opinion questions.', cols: [{ k: 'text', ph: 'Statement' }, { k: 'ans', type: 'select', opts: [['', 'No answer'], ['t', 'True'], ['f', 'False']] }] }],
    valid: (s, v) => Array.isArray(v) && v.length === R(s.statements, 10).length && v.every(x => x === true || x === false || x === null),
    sim: (s, rnd) => R(s.statements, 10).map(st => { const r = rnd(); if (r < 0.06) return null; const right = st.ans ? st.ans === 't' : rnd() < 0.5; return r < 0.74 ? right : !right; }),
    stat: (s, v) => { const st = R(s.statements, 10), keyed = st.map((x, i) => [x, i]).filter(([x]) => x.ans); if (!keyed.length || !v.length) return ''; let ok = 0, n = 0; v.forEach(a => keyed.forEach(([x, i]) => { if (a[i] !== null) { n++; if (a[i] === (x.ans === 't')) ok++; } })); return ` · ${pct(ok, n)}% correct overall`; },
    viz(s, v) {
      return rows(R(s.statements, 10).map((st, i) => {
        let t = 0, f = 0; v.forEach(a => { if (a[i] === true) t++; else if (a[i] === false) f++; });
        const n = t + f;
        if (st.ans) { const ok = st.ans === 't' ? t : f; return { label: `${i + 1}. ${st.text}`, chip: chip(st.ans === 't' ? 'True' : 'False', 'ok'), pct: pct(ok, n), top: true, right: `${pct(ok, n)}% <small>correct</small>` }; }
        return { label: `${i + 1}. ${st.text}`, pct: pct(t, n), right: `${pct(t, n)}% <small>true</small>` };
      }));
    },
    still: s => `<ol class="exlist tfl">${R(s.statements, 10).map(st => `<li>${esc(st.text)} <span class="tfo">True / False</span></li>`).join('')}</ol>`,
    mount(s, el, v, submit) {
      const st = R(s.statements, 10); let mine = Array.isArray(v) && v.length === st.length ? v.slice() : st.map(() => null);
      const draw = () => { el.innerHTML = st.map((x, i) => `<div class="qcard"><p>${i + 1}. ${esc(x.text)}</p><div class="qbtns"><button class="qb${mine[i] === true ? ' sel' : ''}" data-i="${i}" data-v="1">True</button><button class="qb${mine[i] === false ? ' sel' : ''}" data-i="${i}" data-v="0">False</button></div></div>`).join(''); };
      el.onclick = e => { const b = e.target.closest('.qb'); if (!b) return; mine[+b.dataset.i] = b.dataset.v === '1'; draw(); submit(mine.slice()); };
      draw();
    },
    describe: (s, v) => v.map((x, i) => `${i + 1}:${x === null ? '-' : x ? 'T' : 'F'}`).join(' ')
  };

  // ---------- Quiz (multiple choice) ----------
  const quiz = {
    label: 'Quiz', group: 'Quiz', blurb: 'Multiple choice with a correct answer (or several)', interactive: true,
    defaults: { prompt: 'Which one is correct?', choices: [{ text: 'Option A', ok: true }, { text: 'Option B', ok: false }, { text: 'Option C', ok: false }, { text: 'Option D', ok: false }], multi: 'one' },
    fields: [F('prompt', 'Question'), { k: 'choices', label: 'Choices', type: 'rows', max: 8, addLabel: 'Add choice', hint: 'Tick the correct choice(s). They are marked when you reveal results.', cols: [{ k: 'text', ph: 'Choice' }, { k: 'ok', type: 'check', label: 'Correct' }] },
      F('multi', 'Answers allowed', 'select', '', [['one', 'Pick one'], ['many', 'Select all that apply']])],
    valid(s, v) { const n = R(s.choices, 8).length; if (s.multi === 'many') return Array.isArray(v) && new Set(v).size === v.length && v.every(x => Number.isInteger(x) && x >= 0 && x < n); return Number.isInteger(v) && v >= 0 && v < n; },
    sim(s, rnd) { const c = R(s.choices, 8), right = c.map((x, i) => x.ok ? i : -1).filter(i => i >= 0); if (s.multi === 'many') { return c.map((x, i) => (x.ok ? rnd() < 0.8 : rnd() < 0.2) ? i : -1).filter(i => i >= 0); } return rnd() < 0.6 && right.length ? right[0] : Math.floor(rnd() * c.length); },
    stat(s, v) { const c = R(s.choices, 8); if (!c.some(x => x.ok) || !v.length) return ''; const ok = v.filter(a => s.multi === 'many' ? c.every((x, i) => !!x.ok === a.includes(i)) : c[a] && c[a].ok).length; return ` · ${pct(ok, v.length)}% got it right`; },
    viz(s, v) {
      const c = R(s.choices, 8), n = c.map(() => 0); v.forEach(a => (s.multi === 'many' ? a : [a]).forEach(i => n[i]++));
      return rows(c.map((x, i) => ({ label: `${LET[i]}. ${x.text}`, chip: x.ok ? chip('✓ Correct', 'ok') : '', top: !!x.ok, pct: pct(n[i], v.length), right: `${pct(n[i], v.length)}% <small>(${n[i]})</small>` })));
    },
    still: s => `<ol class="exlist abc">${R(s.choices, 8).map(x => `<li>${esc(x.text)}</li>`).join('')}</ol>${s.multi === 'many' ? '<p class="wl">Select all that apply</p>' : ''}`,
    mount(s, el, v, submit) {
      const c = R(s.choices, 8), many = s.multi === 'many'; let mine = many ? (Array.isArray(v) ? v.slice() : []) : v;
      const draw = () => { el.innerHTML = (many ? '<p class="hint">Select all that apply</p>' : '') + c.map((x, i) => `<button class="opt${(many ? mine.includes(i) : mine === i) ? ' sel' : ''}" data-i="${i}"><b>${LET[i]}.</b> ${esc(x.text)}</button>`).join(''); };
      el.onclick = e => { const b = e.target.closest('.opt'); if (!b) return; const i = +b.dataset.i; if (many) { mine = mine.includes(i) ? mine.filter(x => x !== i) : [...mine, i].sort(); submit(mine.slice()); } else { mine = i; submit(i); } draw(); };
      draw();
    },
    describe: (s, v) => (Array.isArray(v) ? v : [v]).map(i => LET[i]).join(', ')
  };

  // ---------- Matching ----------
  const match = {
    label: 'Matching', group: 'Quiz', blurb: 'Match each item with its partner', interactive: true,
    defaults: { prompt: 'Match each term with its definition', pairs: [{ a: 'Term one', b: 'Definition one' }, { a: 'Term two', b: 'Definition two' }, { a: 'Term three', b: 'Definition three' }] },
    fields: [F('prompt', 'Instructions'), { k: 'pairs', label: 'Pairs', type: 'rows', max: 8, addLabel: 'Add pair', hint: 'Write each correct pair on one row. Phones show the right-hand column shuffled.', cols: [{ k: 'a', ph: 'Item' }, { k: 'b', ph: 'Matches with' }] }],
    valid: (s, v) => { const n = R(s.pairs, 8).length; return Array.isArray(v) && v.length === n && v.every(x => x === null || (Number.isInteger(x) && x >= 0 && x < n)); },
    sim: (s, rnd) => { const n = R(s.pairs, 8).length; return [...Array(n).keys()].map(i => rnd() < 0.7 ? i : Math.floor(rnd() * n)); },
    stat(s, v) { const n = R(s.pairs, 8).length; if (!v.length || !n) return ''; const tot = v.reduce((a, r) => a + r.filter((x, i) => x === i).length, 0); return ` · average ${(tot / v.length).toFixed(1)} of ${n} correct`; },
    viz(s, v) { return rows(R(s.pairs, 8).map((p, i) => { const ok = v.filter(r => r[i] === i).length; return { label: `${p.a} → ${p.b}`, pct: pct(ok, v.length), top: true, right: `${pct(ok, v.length)}% <small>correct</small>` }; })); },
    still(s) {
      const p = R(s.pairs, 8), order = shuffled(p.length, s.id);
      return `<div class="mcols"><ol class="exlist">${p.map(x => `<li>${esc(x.a)}</li>`).join('')}</ol><ol class="exlist abc">${order.map(j => `<li>${esc(p[j].b)}</li>`).join('')}</ol></div>`;
    },
    mount(s, el, v, submit) {
      const p = R(s.pairs, 8), order = shuffled(p.length, s.id); let mine = Array.isArray(v) && v.length === p.length ? v.slice() : p.map(() => null);
      el.innerHTML = p.map((x, i) => `<div class="qcard"><label for="m${i}"><b>${i + 1}.</b> ${esc(x.a)}</label><select id="m${i}" data-i="${i}" class="msel"><option value="">Choose a match…</option>${order.map((j, k) => `<option value="${j}"${mine[i] === j ? ' selected' : ''}>${LET[k]}. ${esc(p[j].b)}</option>`).join('')}</select></div>`).join('');
      el.onchange = e => { const sl = e.target.closest('.msel'); if (!sl) return; mine[+sl.dataset.i] = sl.value === '' ? null : +sl.value; submit(mine.slice()); };
    },
    describe: (s, v) => { const p = R(s.pairs, 8); return v.map((x, i) => `${p[i] ? p[i].a : i + 1} → ${x === null ? '-' : (p[x] ? p[x].b : x)}`).join('; '); }
  };

  // ---------- Hotspot / 2-axis plot ----------
  const hsArea = (s, dots, showTarget) => {
    const ar = Number(s.ar) > 0 ? Number(s.ar) : (s.src ? 4 / 3 : 16 / 9);
    const plot = !String(s.src || '').trim();
    const t = showTarget && Number(s.tr) > 0 ? `<i class="htarget" style="left:${(s.tx * 100).toFixed(2)}%;top:${(s.ty * 100).toFixed(2)}%;width:${(s.tr * 200).toFixed(2)}%;aspect-ratio:1"></i>` : '';
    const inner = plot
      ? `<div class="hplot"><i class="hax hx"></i><i class="hax hy"></i>${['yt', 'yb', 'xl', 'xr'].map(k => s[k] ? `<span class="hl ${k}">${esc(s[k])}</span>` : '').join('')}</div>`
      : `<img src="${esc(s.src)}" alt="${esc(s.alt || '')}" draggable="false">`;
    return `<div class="harea"><div class="hwrap" style="--ar:${ar.toFixed(4)}">${inner}${t}<div class="hdots">${dots}</div></div></div>`;
  };
  const inTarget = (s, d) => Number(s.tr) > 0 && Math.hypot((d[0] - s.tx), (d[1] - s.ty) / (Number(s.ar) > 0 ? Number(s.ar) : (s.src ? 4 / 3 : 16 / 9))) <= s.tr;
  const hotspot = {
    label: 'Hotspot / plot', group: 'Quiz', blurb: 'Everyone taps a picture to drop a dot; or, with no picture, places themselves on a 2-axis plot', interactive: true,
    defaults: { prompt: 'Tap where you think it is', src: '', alt: '', ar: 0, tx: 0.5, ty: 0.5, tr: 0, yt: 'More interested', yb: 'Less interested', xl: 'Less confident', xr: 'More confident' },
    fields: [F('prompt', 'Question'), F('src', 'Picture', 'media', 'Leave empty to use a 2-axis plot with the labels below.'), F('alt', 'Alt text'),
      { k: 'tr', label: 'Correct area', type: 'hotarea', hint: 'Optional: shown as a circle when you reveal, with the % of dots inside it.' },
      F('yt', 'Plot: top label'), F('yb', 'Plot: bottom label'), F('xl', 'Plot: left label'), F('xr', 'Plot: right label')],
    valid: (s, v) => Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'number' && x >= 0 && x <= 1),
    sim(s, rnd) { const g = () => (rnd() + rnd() + rnd() - 1.5) / 1.5; const c = Number(s.tr) > 0 && rnd() < 0.65 ? [s.tx, s.ty] : [0.5, 0.5], sp = Number(s.tr) > 0 ? s.tr * 1.6 : 0.3; return [Math.min(1, Math.max(0, +(c[0] + g() * sp).toFixed(3))), Math.min(1, Math.max(0, +(c[1] + g() * sp).toFixed(3)))]; },
    stat: (s, v) => Number(s.tr) > 0 && v.length ? ` · ${pct(v.filter(d => inTarget(s, d)).length, v.length)}% in the correct area` : '',
    viz: (s, v) => hsArea(s, v.map(d => `<i class="hdot${Number(s.tr) > 0 && inTarget(s, d) ? ' in' : ''}" style="left:${(d[0] * 100).toFixed(2)}%;top:${(d[1] * 100).toFixed(2)}%"></i>`).join(''), true),
    pending: (s, v) => hsArea(s, '', false),
    still: s => hsArea(s, '', false),
    edit: s => hsArea(s, '', true), // the editor shows the correct area while you set it
    mount(s, el, v, submit) {
      const dot = d => d ? `<i class="hdot mine" style="left:${(d[0] * 100).toFixed(2)}%;top:${(d[1] * 100).toFixed(2)}%"></i>` : '';
      let mine = Array.isArray(v) ? v : null;
      el.innerHTML = `<p class="hint">Tap to place your dot. Tap again to move it.</p><div class="phot">${hsArea(s, dot(mine), false)}</div>`;
      const wrap = el.querySelector('.hwrap');
      wrap.addEventListener('pointerdown', e => {
        const r = wrap.getBoundingClientRect(); mine = [+Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)).toFixed(3), +Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)).toFixed(3)];
        wrap.querySelector('.hdots').innerHTML = dot(mine); submit(mine.slice());
      });
    },
    describe: (s, v) => `x ${v[0]}, y ${v[1]}${Number(s.tr) > 0 ? (inTarget(s, v) ? ' (in area)' : ' (outside)') : ''}`
  };

  // ---------- Sort into groups ----------
  const cats = s => (Array.isArray(s.categories) ? s.categories : []).map(x => String(x).trim()).filter(Boolean).slice(0, 5);
  const sort = {
    label: 'Sort into groups', group: 'Quiz', blurb: 'Everyone puts each item into a category', interactive: true,
    defaults: { prompt: 'Sort each example into a group', categories: ['Group 1', 'Group 2'], items: [{ text: 'Example one', cat: '0' }, { text: 'Example two', cat: '1' }, { text: 'Example three', cat: '' }] },
    fields: [F('prompt', 'Instructions'), F('categories', 'Groups', 'list', 'One per line, 2 to 5'), { k: 'items', label: 'Items to sort', type: 'rows', max: 10, addLabel: 'Add item', hint: 'Pick each item’s correct group to show it when you reveal, or leave "No answer".', cols: [{ k: 'text', ph: 'Item' }, { k: 'cat', type: 'select', opts: s => [['', 'No answer'], ...cats(s).map((c, i) => [String(i), c])] }] }],
    valid: (s, v) => { const n = R(s.items, 10).length, k = cats(s).length; return Array.isArray(v) && v.length === n && v.every(x => x === null || (Number.isInteger(x) && x >= 0 && x < k)); },
    sim: (s, rnd) => { const k = cats(s).length; return R(s.items, 10).map(it => it.cat !== '' && it.cat != null && rnd() < 0.7 ? +it.cat : Math.floor(rnd() * k)); },
    viz(s, v) {
      const c = cats(s);
      return rows(R(s.items, 10).map((it, i) => {
        const n = c.map(() => 0); let tot = 0; v.forEach(a => { if (a[i] !== null && a[i] < c.length) { n[a[i]]++; tot++; } });
        if (it.cat !== '' && it.cat != null && c[+it.cat] != null) return { label: it.text, chip: chip(c[+it.cat], 'ok'), top: true, pct: pct(n[+it.cat], tot), right: `${pct(n[+it.cat], tot)}% <small>correct</small>` };
        const best = n.indexOf(Math.max(...n));
        return { label: it.text, pct: pct(n[best] || 0, tot), right: tot ? `<small>most:</small> ${esc(c[best])} ${pct(n[best], tot)}%` : '—' };
      }));
    },
    still: s => `<div class="sortg">${cats(s).map(c => `<div class="sortc">${esc(c)}</div>`).join('')}</div><ul class="exlist sorti">${R(s.items, 10).map(it => `<li>${esc(it.text)}</li>`).join('')}</ul>`,
    mount(s, el, v, submit) {
      const c = cats(s), its = R(s.items, 10); let mine = Array.isArray(v) && v.length === its.length ? v.slice() : its.map(() => null);
      const draw = () => { el.innerHTML = its.map((it, i) => `<div class="qcard"><p>${esc(it.text)}</p><div class="qbtns wrap">${c.map((x, k) => `<button class="qb${mine[i] === k ? ' sel' : ''}" data-i="${i}" data-k="${k}">${esc(x)}</button>`).join('')}</div></div>`).join(''); };
      el.onclick = e => { const b = e.target.closest('.qb'); if (!b) return; mine[+b.dataset.i] = +b.dataset.k; draw(); submit(mine.slice()); };
      draw();
    },
    describe: (s, v) => { const c = cats(s), its = R(s.items, 10); return v.map((x, i) => `${its[i] ? its[i].text : i + 1}: ${x === null ? '-' : c[x]}`).join('; '); }
  };

  // ---------- Open response ----------
  const open = {
    label: 'Open response', group: 'Quiz', blurb: 'Everyone types a short answer; answers appear as cards', interactive: true,
    defaults: { prompt: 'What is one question you still have?' },
    fields: [F('prompt', 'Question')],
    norm: t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    valid: (s, v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 140,
    sim: (s, rnd) => ['How does this apply to young children?', 'Can we see another example?', 'What does the research say?', 'How would I use this in my classroom?', 'Is this the same in other countries?', 'What about families without internet?'][Math.floor(rnd() * 6)],
    viz: (s, v) => `<div class="cards">${v.slice(-40).map(t => `<div class="card">${esc(t)}</div>`).join('')}</div>`,
    still: () => '<p class="wl">Everyone types a short answer</p>',
    mount(s, el, v, submit) {
      el.innerHTML = `<form class="openf"><textarea maxlength="140" rows="3" placeholder="Type your answer" aria-label="Your answer">${esc(v || '')}</textarea><div class="openrow"><span class="hint" data-n>${(v || '').length}/140</span><button class="pbtn">Send</button></div></form>`;
      const ta = el.querySelector('textarea'), n = el.querySelector('[data-n]');
      ta.oninput = () => { n.textContent = `${ta.value.length}/140`; };
      el.querySelector('form').onsubmit = e => { e.preventDefault(); const t = open.norm(ta.value); if (t) submit(t); };
    }
  };

  // ---------- Number estimate ----------
  const estimate = {
    label: 'Number estimate', group: 'Quiz', blurb: 'Everyone guesses a number; dots show the spread; reveal the real answer', interactive: true,
    defaults: { prompt: 'Guess the number', min: 0, max: 100, answer: '', unit: '' },
    fields: [F('prompt', 'Question'), F('min', 'Scale starts at', 'number'), F('max', 'Scale ends at', 'number'), F('answer', 'Correct answer (optional)', 'text', 'Shown as a line when you reveal results.'), F('unit', 'Unit (optional)', 'text', 'e.g. %, years, million')],
    valid: (s, v) => typeof v === 'number' && Number.isFinite(v),
    sim(s, rnd) { const a = +s.min, b = +s.max, c = s.answer !== '' && !isNaN(+s.answer) ? +s.answer : (a + b) / 2; return Math.round(c + (rnd() + rnd() + rnd() - 1.5) * (b - a) * 0.25); },
    stat(s, v) { if (!v.length) return ''; const so = [...v].sort((a, b) => a - b), med = so[Math.floor(so.length / 2)]; return ` · median ${med}${s.unit ? ' ' + s.unit : ''}`; },
    viz(s, v) {
      const a = +s.min, b = +s.max > +s.min ? +s.max : +s.min + 1, P = x => Math.max(0, Math.min(100, (x - a) / (b - a) * 100)), u = s.unit ? ' ' + esc(s.unit) : '';
      const stack = {}; const dots = v.map(x => { const k = Math.round(P(x) / 1.5); stack[k] = (stack[k] || 0) + 1; return `<i class="edot" style="left:${P(x).toFixed(2)}%;bottom:${((stack[k] - 1) * 2.2).toFixed(1)}cqi"></i>`; }).join('');
      const ans = s.answer !== '' && !isNaN(+s.answer) ? `<span class="eans" style="left:${P(+s.answer).toFixed(2)}%"><b>${esc(String(s.answer))}${u}</b></span>` : '';
      return `<div class="vcol est"><div class="etrack">${dots}${ans}</div><div class="slide-ends ends"><span>${esc(String(a))}${u}</span><span>${esc(String(b))}${u}</span></div></div>`;
    },
    still: s => `<div class="vcol est"><div class="etrack"></div><div class="ends"><span>${esc(String(s.min))}${s.unit ? ' ' + esc(s.unit) : ''}</span><span>${esc(String(s.max))}${s.unit ? ' ' + esc(s.unit) : ''}</span></div></div>`,
    mount(s, el, v, submit) {
      el.innerHTML = `<form class="wordrow"><input type="number" inputmode="decimal" step="any" placeholder="Your guess${s.unit ? ' (' + esc(s.unit) + ')' : ''}" aria-label="Your guess" value="${v ?? ''}"><button class="pbtn">Send</button></form><p class="hint">You can change it anytime.</p>`;
      el.querySelector('form').onsubmit = e => { e.preventDefault(); const x = parseFloat(el.querySelector('input').value); if (Number.isFinite(x)) submit(x); else el.querySelector('.hint').textContent = 'Type a number first.'; };
    }
  };

  return { truefalse: tf, quiz, match, hotspot, sort, open, estimate };
}
