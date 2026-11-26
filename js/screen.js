// #screen-CODE: the display for a session that's already running.
import { display } from './present.js?v=2.2';
export const mount = (root, store, code) => display(root, store, { code: String(code || '').toUpperCase() });
