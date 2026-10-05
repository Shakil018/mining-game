// Two interchangeable backends with the same small API:
//   - "firebase": real, works across devices (Firestore free tier)
//   - "local":    demo mode, works between tabs of ONE browser (no setup)
import { firebaseConfig } from './firebase-config.js';

const FB = '10.12.2';
export const configured = () =>
  !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && !/PASTE/i.test(firebaseConfig.apiKey + firebaseConfig.projectId));

export async function getBackend({ demo = false } = {}) {
  if (demo) return localBackend();
  if (!configured()) return null;
  try { return await firebaseBackend(); } catch (e) { console.error('Firebase failed to load', e); return null; }
}

async function firebaseBackend() {
  const base = `https://www.gstatic.com/firebasejs/${FB}/`;
  const [{ initializeApp }, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js')]);
  const db = fs.getFirestore(initializeApp(firebaseConfig));
  const { doc, setDoc, onSnapshot, collection, serverTimestamp } = fs;
  return {
    kind: 'firebase',
    watchSession(code, cb) {
      return onSnapshot(doc(db, 'sessions', code), s => cb(s.exists() ? s.data() : null), e => cb(null, e));
    },
    async setSession(code, data) { await setDoc(doc(db, 'sessions', code), data, { merge: true }); },
    async submit(code, rec) {
      try {
        await setDoc(doc(db, 'sessions', code, 'results', `${rec.round}_${rec.cid}`), { ...rec, ts: serverTimestamp() });
        return 'ok';
      } catch (e) {
        if (e && e.code === 'permission-denied') return 'denied';
        throw e;
      }
    },
    watchResults(code, cb) {
      return onSnapshot(collection(db, 'sessions', code, 'results'),
        snap => cb(snap.docs.map(d => { const v = d.data({ serverTimestamps: 'estimate' }); return { ...v, ts: v.ts && v.ts.toMillis ? v.ts.toMillis() : Date.now() }; })),
        e => cb([], e));
    },
  };
}

function localBackend() {
  const K = (c, k) => `mine:${c}:${k}`;
  const read = (c, k, d) => { try { const v = JSON.parse(localStorage.getItem(K(c, k))); return v == null ? d : v; } catch { return d; } };
  const subs = new Set();
  const notify = () => subs.forEach(f => f());
  addEventListener('storage', notify);
  const watch = (f) => { subs.add(f); queueMicrotask(f); return () => subs.delete(f); };
  return {
    kind: 'local',
    watchSession: (c, cb) => watch(() => cb(read(c, 'session', null))),
    async setSession(c, d) { localStorage.setItem(K(c, 'session'), JSON.stringify({ ...read(c, 'session', {}), ...d })); notify(); },
    async submit(c, rec) {
      const list = read(c, 'results', []);
      if (list.some(r => r.round === rec.round && r.cid === rec.cid)) return 'denied';
      list.push({ ...rec, ts: Date.now() });
      localStorage.setItem(K(c, 'results'), JSON.stringify(list));
      notify();
      return 'ok';
    },
    watchResults: (c, cb) => watch(() => cb(read(c, 'results', []))),
  };
}
