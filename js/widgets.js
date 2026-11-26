// Custom widgets: your own interactions, written as a small HTML page (HTML + CSS + JavaScript).
// Each widget runs in a sandboxed frame on the big screen and on every phone, and talks to
// LiveDeck through window.LiveDeck:
//
//   LiveDeck.mode       'stage' (big screen), 'phone' (audience), or 'edit' (authoring preview)
//   LiveDeck.prompt     the slide's title text
//   LiveDeck.config     this slide's Settings box (parsed as JSON if it is JSON, else plain text)
//   LiveDeck.theme      { bg, ink, accent, highlight, headFont, bodyFont } – also CSS vars --bg --ink --accent --highlight --hf --bf
//   LiveDeck.onUpdate(fn)   fn(state) now and whenever something changes. state has:
//        stage: { values: [every phone's latest answer], count, reveal: true/false, live }
//        phone: { value: this phone's last answer, live }
//   LiveDeck.submit(v)  (phone) send this phone's answer: any JSON value up to ~2 KB; a new submit replaces the old
//   LiveDeck.setLive(v) (stage, while presenting) broadcast state to every phone, e.g. a timer or a revealed answer
//
// The frame cannot reach your Firebase sign-in, cookies, or the rest of the page.
import { esc } from './util.js';
import { normalize, FONTS } from './themes.js';

const MAX = 2000;
export const parseConfig = c => { const t = String(c ?? '').trim(); if (!t) return null; try { return JSON.parse(t); } catch (e) { return t; } };
const parseVal = v => { try { return JSON.parse(v); } catch (e) { return null; } };
const liveVal = l => typeof l === 'string' ? parseVal(l) : (l ?? null); // custom widgets' live state travels as a JSON string

const BOOT = `(function(){
var init=__INIT__,subs=[],state=init.state||{};
function post(m){try{parent.postMessage(m,'*')}catch(e){}}
var LD={mode:init.mode,prompt:init.prompt,config:init.config,theme:init.theme,
 get state(){return state},
 submit:function(v){var s;try{s=JSON.stringify(v)}catch(e){console.error('LiveDeck.submit: value must be JSON');return false}
  if(s===undefined||s.length>${MAX}){console.error('LiveDeck.submit: value missing or too large');return false}post({ld:'submit',v:s});return true},
 setLive:function(v){var s;try{s=JSON.stringify(v)}catch(e){return false}if(s.length>${MAX})return false;post({ld:'live',v:s});return true},
 onUpdate:function(fn){subs.push(fn);try{fn(state)}catch(e){console.error(e)}},
 resize:function(){post({ld:'height',h:Math.ceil(document.documentElement.scrollHeight)})}};
window.LiveDeck=LD;
addEventListener('message',function(e){if(e.source!==parent)return;var d=e.data;if(!d||d.ld!=='update')return;state=d.state||{};
 for(var i=0;i<subs.length;i++){try{subs[i](state)}catch(err){console.error(err)}}});
if(init.mode!=='phone')addEventListener('keydown',function(e){var t=e.target,n=t&&t.tagName;if(n==='INPUT'||n==='TEXTAREA'||n==='SELECT'||(t&&t.isContentEditable))return;
 post({ld:'key',key:e.key,ctrl:e.ctrlKey,meta:e.metaKey,shift:e.shiftKey})});
addEventListener('load',function(){LD.resize();post({ld:'ready'});if(window.ResizeObserver)new ResizeObserver(LD.resize).observe(document.body)});
})();`;

export function widgetDoc(code, init) {
  const t = normalize(init.theme);
  const fonts = [t.headFont, t.bodyFont].filter((f, i, a) => FONTS[f].g !== undefined && a.indexOf(f) === i)
    .map(f => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}${FONTS[f].g ? ':wght@' + FONTS[f].g : ''}&display=swap">`).join('');
  const json = JSON.stringify({ ...init, theme: t }).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${fonts}
<style>:root{--bg:${t.bg};--ink:${t.ink};--accent:${t.accent};--highlight:${t.highlight};--hf:${FONTS[t.headFont].css};--bf:${FONTS[t.bodyFont].css}}
*{box-sizing:border-box}html,body{margin:0}body{color:var(--ink);font-family:var(--bf);background:${init.mode === 'phone' ? '#fff' : 'transparent'};${init.mode === 'phone' ? 'color:#111' : 'height:100vh;overflow:hidden'}}</style>
<script>${BOOT.replace('__INIT__', json)}</script></head><body>${code || ''}</body></html>`;
}

// ---- message routing between the page and widget frames ----
const frames = new WeakMap();
addEventListener('message', e => {
  const h = e.source && frames.get(e.source); const d = e.data;
  if (!h || !d || typeof d.ld !== 'string') return;
  if (d.ld === 'ready') { h.ready = true; h.flush(); }
  else if (d.ld === 'submit' && typeof d.v === 'string' && d.v.length <= MAX) h.onSubmit && h.onSubmit(d.v);
  else if (d.ld === 'live' && typeof d.v === 'string' && d.v.length <= MAX) h.onLive && h.onLive(parseVal(d.v));
  else if (d.ld === 'height' && Number.isFinite(d.h)) h.onHeight && h.onHeight(d.h);
  else if (d.ld === 'key' && typeof d.key === 'string' && d.key.length < 20) h.onKey && h.onKey(d); // presenter shortcuts still work after clicking into a widget
});
export function attach(iframe, handlers) {
  if (!iframe || !iframe.contentWindow) return null;
  const h = { ...handlers, ready: false, state: null, flush() { if (this.ready && this.state && iframe.contentWindow) iframe.contentWindow.postMessage({ ld: 'update', state: this.state }, '*'); } };
  frames.set(iframe.contentWindow, h); iframe._ld = h; return h;
}
export function send(iframe, state) { const h = iframe && iframe._ld; if (!h) return; h.state = state; h.flush(); }

// ---- the "Custom widget" slide type ----
export function customType({ F, h1 }) {
  const codeOf = (s, ctx) => s.widgetCode ?? (ctx.widgets && ctx.widgets[s.widgetId] && ctx.widgets[s.widgetId].code);
  const nameOf = (s, ctx) => s.widgetName || (ctx.widgets && ctx.widgets[s.widgetId] && ctx.widgets[s.widgetId].name) || 'Custom widget';
  const stageState = ctx => ({ values: (ctx.values || []).map(parseVal), count: (ctx.values || []).length, reveal: !!ctx.reveal, live: liveVal(ctx.live) });
  return {
    label: 'Custom widget', group: 'Interactive', blurb: 'An interaction you built with the Widgets button', interactive: true,
    defaults: { prompt: '', widgetId: '', config: '' },
    fields: [F('widgetId', 'Widget', 'widget', 'Build and edit widgets with the Widgets button at the top.'), F('prompt', 'Title (optional)', 'text', 'Shown above the widget, and on phones.'), F('config', 'Settings for this slide', 'textarea', 'Passed to the widget as LiveDeck.config (JSON or plain text).')],
    valid: (s, v) => typeof v === 'string' && v.length <= MAX && parseVal(v) !== null,
    stage(s, ctx) {
      const code = codeOf(s, ctx), name = nameOf(s, ctx);
      let body;
      if (!code) body = `<div class="ph">Choose a widget in the panel</div>`;
      else if (ctx.thumb) body = `<div class="ph">Widget: ${esc(name)}</div>`;
      else body = `<iframe class="wframe" sandbox="allow-scripts" title="${esc(name)}" srcdoc="${esc(widgetDoc(code, { mode: ctx.mode === 'present' ? 'stage' : 'edit', prompt: s.prompt || '', config: parseConfig(s.config), theme: ctx.theme, state: stageState(ctx) }))}"></iframe>`;
      return `${h1(s.prompt)}<div class="wbox">${body}</div>`;
    },
    after(s, root, ctx) {
      const f = root.querySelector('iframe.wframe'); if (!f) return;
      if (ctx.mode === 'phone') { send(f, { value: parseVal(ctx.value ?? 'null'), live: liveVal(ctx.live) }); return; }
      if (!f._ld) attach(f, { onLive: v => ctx.onLive && ctx.onLive(v), onKey: k => ctx.onKey && ctx.onKey(k) });
      send(f, stageState(ctx));
    },
    update(s, root, ctx) { const f = root.querySelector('iframe.wframe'); if (f) send(f, stageState(ctx)); },
    mount(s, el, v, submit, ctx = {}) {
      const code = codeOf(s, ctx);
      if (!code) { el.innerHTML = '<p class="look">Eyes on the screen.</p>'; return; }
      el.innerHTML = `<iframe class="wframe pframe" sandbox="allow-scripts" title="${esc(nameOf(s, ctx))}" srcdoc="${esc(widgetDoc(code, { mode: 'phone', prompt: s.prompt || '', config: parseConfig(s.config), theme: ctx.theme, state: { value: parseVal(v ?? 'null'), live: liveVal(ctx.live) } }))}"></iframe>`;
      const f = el.querySelector('iframe');
      attach(f, { onSubmit: submit, onHeight: h => { f.style.height = Math.max(120, Math.min(h + 4, 2000)) + 'px'; } });
      send(f, { value: parseVal(v ?? 'null'), live: liveVal(ctx.live) });
    }
  };
}

// ---- starter widgets (copy one, then change it) ----
export const EXAMPLES = [
  {
    name: 'Blank starter', description: 'The smallest possible widget, with comments.', config: '',
    code: `<style>
  .stage { height: 100%; display: flex; align-items: center; justify-content: center; font-size: 8vw; font-weight: 700; }
  .phone { padding: 4px; }
  button { font: inherit; font-size: 18px; width: 100%; min-height: 52px; border: 0; border-radius: 10px; background: #000; color: #fff; }
</style>
<div id="root"></div>
<script>
  var root = document.getElementById('root');
  if (LiveDeck.mode === 'phone') {
    // Audience phone: show a control and send an answer.
    root.className = 'phone';
    root.innerHTML = '<button id="b">Tap me</button>';
    document.getElementById('b').onclick = function () { LiveDeck.submit(1); };
  } else {
    // Big screen: draw the results every time they change.
    root.className = 'stage';
    LiveDeck.onUpdate(function (state) {
      root.textContent = (state.count || 0) + ' taps';
    });
  }
</script>`
  },
  {
    name: 'Estimation', description: 'Everyone guesses a number; dots show the spread; reveal shows the real answer.',
    config: '{ "answer": 1971, "min": 1900, "max": 2020, "unit": "" }',
    code: `<style>
  #stage { height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 4vw; }
  .track { position: relative; height: 34vh; border-bottom: 3px solid var(--ink); }
  .dot { position: absolute; bottom: 0; width: 2.4vw; height: 2.4vw; margin-left: -1.2vw; border-radius: 50%; background: var(--accent); opacity: .8; }
  .ans { position: absolute; top: -4vh; bottom: -1vh; width: 4px; margin-left: -2px; background: var(--highlight); }
  .ans b { position: absolute; top: -5vh; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 3vw; color: var(--highlight); }
  .axis { display: flex; justify-content: space-between; font-size: 2.2vw; padding-top: 1vh; }
  .sum { font-size: 2.6vw; margin-top: 4vh; text-align: center; }
  input { font-size: 22px; width: 100%; min-height: 56px; padding: 0 14px; border: 2px solid #bbb; border-radius: 10px; }
  button { margin-top: 10px; font: inherit; font-size: 18px; width: 100%; min-height: 52px; border: 0; border-radius: 10px; background: #000; color: #fff; }
  p { color: #555; }
</style>
<div id="root"></div>
<script>
  var c = LiveDeck.config || {}, min = +c.min || 0, max = +c.max || 100, unit = c.unit || '';
  var root = document.getElementById('root');
  if (LiveDeck.mode === 'phone') {
    root.innerHTML = '<input id="g" type="number" inputmode="decimal" placeholder="Your guess"><button id="b">Send guess</button><p id="m"></p>';
    document.getElementById('b').onclick = function () {
      var v = parseFloat(document.getElementById('g').value);
      if (isNaN(v)) { document.getElementById('m').textContent = 'Type a number first.'; return; }
      LiveDeck.submit(v); document.getElementById('m').textContent = 'Sent ' + v + unit + '. You can change it.';
    };
  } else {
    root.id = 'stage';
    LiveDeck.onUpdate(function (s) {
      var vals = (s.values || []).filter(function (v) { return typeof v === 'number'; });
      var pct = function (v) { return Math.max(0, Math.min(100, (v - min) / (max - min) * 100)); };
      var stack = {}, html = '<div class="track">';
      vals.forEach(function (v) { var k = Math.round(pct(v)); stack[k] = (stack[k] || 0) + 1;
        html += '<i class="dot" style="left:' + pct(v) + '%;bottom:' + ((stack[k] - 1) * 2.6) + 'vw"></i>'; });
      if (s.reveal && c.answer != null) html += '<span class="ans" style="left:' + pct(+c.answer) + '%"><b>' + c.answer + unit + '</b></span>';
      html += '</div><div class="axis"><span>' + min + unit + '</span><span>' + max + unit + '</span></div>';
      var avg = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
      html += '<div class="sum">' + vals.length + (vals.length === 1 ? ' guess' : ' guesses') + (s.reveal && avg !== null ? ' · class average ' + Math.round(avg * 10) / 10 + unit : '') + '</div>';
      root.innerHTML = html;
    });
  }
</script>`
  },
  {
    name: 'Applause meter', description: 'Phones tap as fast as they can; the meter fills on the big screen.',
    config: '{ "goal": 300, "label": "Make some noise" }',
    code: `<style>
  #stage { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3vh; }
  .meter { width: 70%; height: 9vh; border: 3px solid var(--ink); border-radius: 99px; overflow: hidden; }
  .fill { height: 100%; width: 0; background: var(--highlight); transition: width .3s; }
  .n { font-size: 9vw; font-weight: 700; line-height: 1; font-family: var(--hf); }
  .l { font-size: 2.6vw; }
  button { font: inherit; font-size: 28px; font-weight: 700; width: 100%; height: 46vh; min-height: 220px; border: 0; border-radius: 24px; background: var(--accent); color: #fff; touch-action: manipulation; }
  button:active { transform: scale(.98); }
  p { text-align: center; color: #555; }
</style>
<div id="root"></div>
<script>
  var c = LiveDeck.config || {}, goal = +c.goal || 300, root = document.getElementById('root');
  if (LiveDeck.mode === 'phone') {
    var taps = 0;
    LiveDeck.onUpdate(function (s) { if (typeof s.value === 'number' && s.value > taps) taps = s.value; });
    root.innerHTML = '<button id="b">TAP</button><p id="m">Tap as fast as you can</p>';
    document.getElementById('b').onclick = function () { taps++; LiveDeck.submit(taps); document.getElementById('m').textContent = taps + ' taps'; };
  } else {
    root.id = 'stage';
    LiveDeck.onUpdate(function (s) {
      var total = (s.values || []).reduce(function (a, v) { return a + (typeof v === 'number' ? Math.min(v, 5000) : 0); }, 0);
      root.innerHTML = '<div class="l">' + (c.label || 'Tap your phones') + '</div><div class="n">' + total + '</div><div class="meter"><div class="fill" style="width:' + Math.min(100, total / goal * 100) + '%"></div></div><div class="l">' + (s.count || 0) + ' people tapping</div>';
    });
  }
</script>`
  },
  {
    name: 'Shared timer', description: 'Click the big screen to start or pause; every phone shows the same countdown.',
    config: '{ "seconds": 90, "label": "Turn and talk" }',
    code: `<style>
  .wrap { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; user-select: none; }
  .t { font-size: 16vw; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; font-family: var(--hf); }
  .l { font-size: 3vw; margin-top: 2vh; }
  .h { font-size: 1.8vw; opacity: .6; margin-top: 2vh; }
  .phone .t { font-size: 72px; } .phone .l { font-size: 20px; } .phone { padding: 20px 0; }
  .done { color: var(--highlight); }
</style>
<div id="root" class="wrap"></div>
<script>
  var c = LiveDeck.config || {}, total = (+c.seconds || 60) * 1000, root = document.getElementById('root');
  var live = null; // { start: ms timestamp or null, left: ms remaining when paused }
  var phone = LiveDeck.mode === 'phone'; if (phone) root.className = 'wrap phone';
  function left() { if (!live) return total; return live.start ? Math.max(0, live.left - (Date.now() - live.start)) : live.left; }
  function fmt(ms) { var s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function draw() {
    var ms = left();
    root.innerHTML = '<div class="t' + (ms === 0 ? ' done' : '') + '">' + fmt(ms) + '</div><div class="l">' + (c.label || '') + '</div>' +
      (phone ? '' : '<div class="h">' + (LiveDeck.mode === 'stage' ? 'Click to ' + (live && live.start ? 'pause' : 'start') + ' · double-click to reset' : 'Timer starts when you click it while presenting') + '</div>');
  }
  LiveDeck.onUpdate(function (s) { if (s.live) live = s.live; draw(); });
  if (LiveDeck.mode === 'stage') {
    root.onclick = function () {
      var ms = left();
      live = live && live.start ? { start: null, left: ms } : { start: Date.now(), left: ms || total };
      LiveDeck.setLive(live); draw();
    };
    root.ondblclick = function () { live = { start: null, left: total }; LiveDeck.setLive(live); draw(); };
  }
  setInterval(draw, 250);
</script>`
  }
];
