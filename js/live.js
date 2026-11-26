// Helpers shared by the display (big screen) and the presenter remote.
import { TYPES, describe } from './types.js?v=2.2';
import { normalize, loadFonts } from './themes.js?v=2.2';

// Slides as they run live: custom widget slides carry their code; phones get a copy without notes.
export async function prepare(store, deck) {
  const theme = normalize(deck.theme); loadFonts(theme);
  let lib = {}; try { (await store.listItems('widgets')).forEach(w => lib[w.id] = w); } catch (e) { }
  const slides = (deck.slides || []).map(s => s.type === 'custom' && lib[s.widgetId] ? { ...s, widgetCode: lib[s.widgetId].code, widgetName: lib[s.widgetId].name } : s);
  return { theme, slides, pub: slides.map(({ notes, ...s }) => s) };
}

export function valuesFor(responses, s) {
  const T = TYPES[s.type]; if (!T || !T.valid) return [];
  return responses.map(x => x.r && x.r[s.id]).filter(v => v != null && T.valid(s, v));
}

export function downloadCsv(title, code, slides, responses) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const out = [['session', 'participant', 'slide', 'type', 'prompt', 'response'].join(',')];
  responses.forEach((p, n) => slides.forEach((s, i) => {
    const T = TYPES[s.type], v = p.r && p.r[s.id];
    if (T && T.valid && v != null && T.valid(s, v)) out.push([code, 'P' + (n + 1), i + 1, s.type, s.prompt || s.title || '', describe(s, v)].map(q).join(','));
  }));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' }));
  a.download = `${(title || 'session').replace(/[^\w-]+/g, '_')}_${code}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function qrSvg(text) {
  if (!window.qrcode) return '';
  try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); } catch (e) { return ''; }
}

// Drawing sync: ink lives in the session's presenter-only "stage" document.
// `by` names this device so it ignores its own echoes.
export function inkSync(store, code, by) {
  const applied = {};
  return {
    onCommit(sid, strokes) { const j = JSON.stringify(strokes); applied[sid] = j; store.setStage(code, { ink: { [sid]: j }, pen: { by, slide: sid, cur: null, laser: null } }).catch(() => { }); },
    onLive(o) { store.setStage(code, { pen: { by, slide: o.slide, cur: o.cur ? JSON.stringify(o.cur) : null, laser: o.laser || null, t: Date.now() } }).catch(() => { }); },
    apply(stage, ink) { // call with each stage snapshot
      for (const [sid, j] of Object.entries(stage.ink || {})) {
        if (applied[sid] === j) continue; applied[sid] = j;
        try { ink.setStrokes(sid, JSON.parse(j)); } catch (e) { }
      }
      const p = stage.pen;
      if (p && p.by !== by) { let cur = null; try { cur = p.cur ? JSON.parse(p.cur) : null; } catch (e) { } ink.setRemote({ slide: p.slide, cur, laser: p.laser }); }
    }
  };
}

export const fmtTime = ms => { const s = Math.floor(Math.max(0, ms) / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
