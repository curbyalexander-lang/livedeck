// Themes: colours, fonts, and an optional background image applied to every slide in a deck.
// A theme is plain data, so presets, your saved themes, and a deck's own theme all look alike:
//   { id, name, bg, ink, accent, highlight, headFont, bodyFont, bgImage, dim }
import { esc, safeUrl } from './util.js?v=2.3';

export const FONTS = {
  // system fonts (always available)
  'Arial': { css: 'Arial, Helvetica, sans-serif' },
  'Verdana': { css: 'Verdana, Geneva, sans-serif' },
  'Trebuchet MS': { css: '"Trebuchet MS", Helvetica, sans-serif' },
  'Georgia': { css: 'Georgia, "Times New Roman", serif' },
  'Times New Roman': { css: '"Times New Roman", Times, serif' },
  'Courier New': { css: '"Courier New", Courier, monospace' },
  // Google Fonts (loaded on demand)
  'Atkinson Hyperlegible': { g: '400;700', css: '"Atkinson Hyperlegible", Arial, sans-serif' },
  'Lexend': { g: '400;700', css: 'Lexend, Arial, sans-serif' },
  'Inter': { g: '400;700', css: 'Inter, Arial, sans-serif' },
  'Source Sans 3': { g: '400;700', css: '"Source Sans 3", Arial, sans-serif' },
  'Nunito': { g: '400;800', css: 'Nunito, Arial, sans-serif' },
  'Space Grotesk': { g: '400;700', css: '"Space Grotesk", Arial, sans-serif' },
  'Fredoka': { g: '400;600', css: 'Fredoka, Arial, sans-serif' },
  'Merriweather': { g: '400;700', css: 'Merriweather, Georgia, serif' },
  'Libre Baskerville': { g: '400;700', css: '"Libre Baskerville", Georgia, serif' },
  'Playfair Display': { g: '400;700', css: '"Playfair Display", Georgia, serif' },
  'Roboto Slab': { g: '400;700', css: '"Roboto Slab", Georgia, serif' },
  'Patrick Hand': { g: '', css: '"Patrick Hand", "Comic Sans MS", cursive' },
  'Caveat': { g: '400;700', css: 'Caveat, "Comic Sans MS", cursive' }
};

export const PRESETS = [
  { id: 'classic', name: 'Classic', bg: '#ffffff', ink: '#000000', accent: '#1d5fd1', highlight: '#e8590c', headFont: 'Arial', bodyFont: 'Arial' },
  { id: 'chalkboard', name: 'Chalkboard', bg: '#24392d', ink: '#f4f1e6', accent: '#f2c94c', highlight: '#ff8a65', headFont: 'Patrick Hand', bodyFont: 'Atkinson Hyperlegible' },
  { id: 'midnight', name: 'Midnight', bg: '#0f1726', ink: '#e8edf5', accent: '#5ab0ff', highlight: '#ffb020', headFont: 'Space Grotesk', bodyFont: 'Inter' },
  { id: 'paper', name: 'Paper', bg: '#f6f2e9', ink: '#262320', accent: '#2f6f8f', highlight: '#d1495b', headFont: 'Merriweather', bodyFont: 'Source Sans 3' },
  { id: 'royal', name: 'Royal', bg: '#ffffff', ink: '#1b1430', accent: '#4d1979', highlight: '#e0a100', headFont: 'Lexend', bodyFont: 'Lexend' },
  { id: 'garden', name: 'Garden', bg: '#eef5ec', ink: '#1d3527', accent: '#2e7d4f', highlight: '#e07a1f', headFont: 'Nunito', bodyFont: 'Nunito' },
  { id: 'contrast', name: 'High contrast', bg: '#000000', ink: '#ffffff', accent: '#ffd400', highlight: '#00e5ff', headFont: 'Atkinson Hyperlegible', bodyFont: 'Atkinson Hyperlegible' }
];
export const DEFAULT_THEME = PRESETS[0];

const hex = (v, d) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v || '')) ? v : d;
const font = (v, d) => FONTS[v] ? v : d;

// Always returns a complete, safe theme (unknown fonts or bad colours fall back to Classic).
export function normalize(t) {
  t = t || {}; const D = DEFAULT_THEME;
  return {
    id: String(t.id || 'custom').slice(0, 60), name: String(t.name || 'Custom').slice(0, 60),
    bg: hex(t.bg, D.bg), ink: hex(t.ink, D.ink), accent: hex(t.accent, D.accent), highlight: hex(t.highlight, D.highlight),
    headFont: font(t.headFont, D.headFont), bodyFont: font(t.bodyFont, D.bodyFont),
    bgImage: safeUrl(t.bgImage || ''), dim: Math.max(0, Math.min(0.9, Number(t.dim) || 0))
  };
}

// CSS custom properties for a slide's style attribute.
export function themeStyle(t) {
  t = normalize(t);
  let s = `--s-bg:${t.bg};--s-ink:${t.ink};--s-acc:${t.accent};--s-hot:${t.highlight};--s-hf:${FONTS[t.headFont].css};--s-bf:${FONTS[t.bodyFont].css};`;
  if (t.bgImage) {
    const p = Math.round(t.dim * 100);
    s += `background-image:linear-gradient(color-mix(in srgb,var(--s-bg) ${p}%,transparent),color-mix(in srgb,var(--s-bg) ${p}%,transparent)),url("${t.bgImage.replace(/["\\]/g, '')}");background-size:cover;background-position:center;`;
  }
  return esc(s);
}

const loaded = new Set();
export function loadFonts(t) {
  t = normalize(t);
  for (const name of [t.headFont, t.bodyFont]) {
    const f = FONTS[name]; if (!f || f.g === undefined || loaded.has(name)) continue;
    loaded.add(name);
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}${f.g ? ':wght@' + f.g : ''}&display=swap`;
    document.head.appendChild(l);
  }
}

// A small sample slide used for theme swatches in the picker.
export const swatch = t => `<div class="slide swatch" style="${themeStyle(t)}"><div class="tcenter"><h1 class="big">Aa</h1><p class="sub">${esc(normalize(t).name)}</p><div class="swbars"><i style="background:var(--s-acc)"></i><i style="background:var(--s-hot)"></i></div></div></div>`;
