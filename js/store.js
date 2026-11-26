// Data layer. The rest of the app only talks to the object returned by getStore(),
// so it works the same whether it's backed by Firebase or by this browser (local mode).
import { FIREBASE_CONFIG as CFG } from './config.js';

const FIREBASE_VERSION = '10.12.2';
const configured = !!(CFG && CFG.apiKey && !/^PASTE/.test(CFG.apiKey) && CFG.projectId);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const clean = o => JSON.parse(JSON.stringify(o)); // drops undefined, which Firestore rejects

export async function getStore() { return configured ? firebaseStore() : localStore(); }

async function firebaseStore() {
  const B = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const [{ initializeApp }, A, F, S] = await Promise.all(['app', 'auth', 'firestore', 'storage'].map(m => import(`${B}firebase-${m}.js`)));
  const app = initializeApp(CFG), auth = A.getAuth(app), db = F.getFirestore(app);
  let storage = null; try { if (CFG.storageBucket) storage = S.getStorage(app); } catch (e) { }
  let user = null; const subs = new Set();
  const ready = new Promise(res => { let first = true; A.onAuthStateChanged(auth, u => { user = u; if (first) { first = false; res(u); } else subs.forEach(f => f(u)); }); });
  const withId = d => ({ ...d.data(), id: d.id });
  return {
    mode: 'firebase',
    ready: () => ready, user: () => user,
    onUser(f) { subs.add(f); return () => subs.delete(f); },
    isPresenter: () => !!(user && !user.isAnonymous),
    label: () => user ? (user.email || user.displayName || 'Signed in') : '',
    signIn: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    signOut: () => A.signOut(auth),
    async audienceId() { if (!user) user = (await A.signInAnonymously(auth)).user; return user.uid; },
    async listDecks() { const s = await F.getDocs(F.query(F.collection(db, 'decks'), F.where('owner', '==', user.uid))); return s.docs.map(withId); },
    async getDeck(id) { const d = await F.getDoc(F.doc(db, 'decks', id)); return d.exists() ? withId(d) : null; },
    async createDeck(deck) { const ref = F.doc(F.collection(db, 'decks')); await F.setDoc(ref, clean({ ...deck, id: undefined, owner: user.uid, updatedAt: Date.now() })); return ref.id; },
    async saveDeck(deck) { const { id, ...rest } = deck; await F.setDoc(F.doc(db, 'decks', id), clean({ ...rest, owner: user.uid, updatedAt: Date.now() })); },
    deleteDeck: id => F.deleteDoc(F.doc(db, 'decks', id)),
    async getSession(code) { const d = await F.getDoc(F.doc(db, 'sessions', code)); return d.exists() ? d.data() : null; },
    async createSession(data) {
      for (let t = 0; t < 8; t++) {
        const code = makeCode(), ref = F.doc(db, 'sessions', code);
        if ((await F.getDoc(ref)).exists()) continue;
        await F.setDoc(ref, clean({ ...data, owner: user.uid, createdAt: Date.now() })); return code;
      }
      throw new Error('Could not find a free session code. Try again.');
    },
    updateSession: (code, patch) => F.updateDoc(F.doc(db, 'sessions', code), clean(patch)),
    watchSession: (code, cb) => F.onSnapshot(F.doc(db, 'sessions', code), d => cb(d.exists() ? d.data() : null), () => cb(null)),
    setResponse: (code, uid, r) => F.setDoc(F.doc(db, 'sessions', code, 'responses', uid), clean({ r, updatedAt: Date.now() })),
    watchResponses: (code, cb) => F.onSnapshot(F.collection(db, 'sessions', code, 'responses'), s => cb(s.docs.map(d => ({ uid: d.id, ...d.data() }))), () => { }),
    // Your libraries of saved themes and custom widgets (kind = 'themes' or 'widgets')
    async listItems(kind) { const s = await F.getDocs(F.query(F.collection(db, kind), F.where('owner', '==', user.uid))); return s.docs.map(withId); },
    async saveItem(kind, item) {
      const ref = item.id ? F.doc(db, kind, item.id) : F.doc(F.collection(db, kind));
      const { id, ...rest } = item; await F.setDoc(ref, clean({ ...rest, owner: user.uid, updatedAt: Date.now() })); return ref.id;
    },
    deleteItem: (kind, id) => F.deleteDoc(F.doc(db, kind, id)),
    canUpload: !!storage,
    async upload(file) {
      const r = S.ref(storage, `media/${user.uid}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`);
      await S.uploadBytes(r, file, { contentType: file.type }); return S.getDownloadURL(r);
    }
  };
}

function localStore() {
  const K = 'livedeck:';
  const get = k => { try { return JSON.parse(localStorage.getItem(K + k)); } catch (e) { return null; } };
  const subs = new Map();
  const emit = k => (subs.get(k) || []).forEach(f => f());
  const set = (k, v) => { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch (e) { throw new Error('This browser is out of local storage space (large uploaded images use a lot). Connect Firebase or use image links.'); } emit(k); };
  const watch = (k, f) => { if (!subs.has(k)) subs.set(k, new Set()); subs.get(k).add(f); f(); return () => subs.get(k).delete(f); };
  addEventListener('storage', e => { if (e.key && e.key.startsWith(K)) emit(e.key.slice(K.length)); });
  let aud = null; try { aud = sessionStorage.getItem(K + 'aud'); } catch (e) { }
  if (!aud) { aud = 'a' + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem(K + 'aud', aud); } catch (e) { } }
  const user = { uid: 'local' };
  return {
    mode: 'local',
    ready: async () => user, user: () => user, onUser: () => () => { },
    isPresenter: () => true, label: () => 'Local mode', signIn: async () => { }, signOut: async () => { },
    audienceId: async () => aud,
    listDecks: async () => Object.values(get('decks') || {}),
    getDeck: async id => (get('decks') || {})[id] || null,
    async createDeck(deck) { const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); const all = get('decks') || {}; all[id] = clean({ ...deck, id, owner: 'local', updatedAt: Date.now() }); set('decks', all); return id; },
    async saveDeck(deck) { const all = get('decks') || {}; all[deck.id] = clean({ ...deck, updatedAt: Date.now() }); set('decks', all); },
    async deleteDeck(id) { const all = get('decks') || {}; delete all[id]; set('decks', all); },
    getSession: async code => get('s:' + code),
    async createSession(data) { let code; do code = makeCode(); while (get('s:' + code)); set('s:' + code, clean({ ...data, owner: 'local', createdAt: Date.now() })); set('r:' + code, {}); return code; },
    async updateSession(code, patch) { const s = get('s:' + code); if (s) set('s:' + code, clean({ ...s, ...patch })); },
    watchSession: (code, cb) => watch('s:' + code, () => cb(get('s:' + code))),
    async setResponse(code, uid, r) { const all = get('r:' + code) || {}; all[uid] = clean({ r, updatedAt: Date.now() }); set('r:' + code, all); },
    watchResponses: (code, cb) => watch('r:' + code, () => cb(Object.entries(get('r:' + code) || {}).map(([uid, v]) => ({ uid, ...v })))),
    listItems: async kind => Object.values(get('lib:' + kind) || {}),
    async saveItem(kind, item) { const all = get('lib:' + kind) || {}; const id = item.id || 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); all[id] = clean({ ...item, id, owner: 'local', updatedAt: Date.now() }); set('lib:' + kind, all); return id; },
    async deleteItem(kind, id) { const all = get('lib:' + kind) || {}; delete all[id]; set('lib:' + kind, all); },
    canUpload: true,
    upload: file => new Promise((res, rej) => {
      if (file.size > 1.5e6) return rej(new Error('In local mode, uploads must be under 1.5 MB. Paste a link instead, or connect Firebase.'));
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file);
    })
  };
}
