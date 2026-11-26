export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = u => typeof u === 'string' && /^(https:\/\/|data:image\/|data:video\/|blob:|[\w][\w./%-]*$)/i.test(u.trim()) ? u.trim() : '';
