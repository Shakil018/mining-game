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
  const { doc, setDoc, getDoc, onSnapshot, collection, serverTimestamp } = fs;
  const ms = v => (v.ts && v.ts.toMillis ? v.ts.toMillis() : Date.now());
  return {
    kind: 'firebase',
    watchSession(code, cb) {
      return onSnapshot(doc(db, 'sessions', code), s => cb(s.exists() ? s.data() : null), e => cb(null, e));
    },
    async setSession(code, data) { await setDoc(doc(db, 'sessions', code), data, { merge: true }); },
    // A student's valid result (for the leaderboard). One per student per round.
    async submit(code, rec) {
      try {
        await setDoc(doc(db, 'sessions', code, 'results', `${rec.gen}_${rec.round}_${rec.cid}`), { ...rec, ts: serverTimestamp() });
        return 'ok';
      } catch (e) { if (e && e.code === 'permission-denied') return 'denied'; throw e; }
    },
    // The race for the block reward: the first valid claim creates the document, everyone else is refused.
    async claim(code, rec) {
      const ref = doc(db, 'sessions', code, 'winners', `${rec.gen}_r${rec.round}`);
      try { await setDoc(ref, { ...rec, ts: serverTimestamp() }); return 'won'; }
      catch (e) {
        if (e && e.code === 'permission-denied') {
          try { if ((await getDoc(ref)).exists()) return 'late'; } catch {}
          return 'denied';
        }
        throw e;
      }
    },
    watchResults(code, cb) {
      return onSnapshot(collection(db, 'sessions', code, 'results'),
        snap => cb(snap.docs.map(d => { const v = d.data({ serverTimestamps: 'estimate' }); return { ...v, ts: ms(v) }; })),
        e => cb([], e));
    },
    watchWinners(code, cb) {
      return onSnapshot(collection(db, 'sessions', code, 'winners'),
        snap => cb(snap.docs.map(d => { const v = d.data({ serverTimestamps: 'estimate' }); return { ...v, ts: ms(v) }; })),
        e => cb([], e));
    },
    // lobby: students announce themselves, the teacher sees who has joined
    async join(code, rec) {
      try { await setDoc(doc(db, 'sessions', code, 'players', rec.cid), { nick: rec.nick, roster: rec.roster || '', ts: serverTimestamp() }); }
      catch (e) { console.warn('join failed', e); }
    },
    watchPlayers(code, cb) {
      return onSnapshot(collection(db, 'sessions', code, 'players'),
        snap => cb(snap.docs.map(d => { const v = d.data({ serverTimestamps: 'estimate' }); return { cid: d.id, nick: v.nick, roster: v.roster || '', ts: ms(v) }; })),
        e => cb([], e));
    },
  };
}

function localBackend() {
  const K = (c, k) => `mine:${c}:${k}`;
  const read = (c, k, d) => { try { const v = JSON.parse(localStorage.getItem(K(c, k))); return v == null ? d : v; } catch { return d; } };
  const write = (c, k, v) => localStorage.setItem(K(c, k), JSON.stringify(v));
  // like Firestore, each watcher is only told about changes to ITS OWN data
  const subs = { session: new Set(), results: new Set(), winners: new Set(), players: new Set() };
  const notify = kind => subs[kind].forEach(f => f());
  addEventListener('storage', e => { const kind = (e.key || '').split(':').pop(); if (subs[kind]) notify(kind); });
  const watch = (kind, f) => { subs[kind].add(f); queueMicrotask(f); return () => subs[kind].delete(f); };
  return {
    kind: 'local',
    watchSession: (c, cb) => watch('session', () => cb(read(c, 'session', null))),
    async setSession(c, d) { write(c, 'session', { ...read(c, 'session', {}), ...d }); notify('session'); },
    async submit(c, rec) {
      const list = read(c, 'results', []);
      if (list.some(r => r.round === rec.round && r.cid === rec.cid && r.gen === rec.gen)) return 'denied';
      list.push({ ...rec, ts: Date.now() }); write(c, 'results', list); notify('results'); return 'ok';
    },
    async claim(c, rec) {
      const w = read(c, 'winners', {}), key = `${rec.gen}_r${rec.round}`;
      if (w[key]) return 'late';
      w[key] = { ...rec, ts: Date.now() }; write(c, 'winners', w); notify('winners'); return 'won';
    },
    async join(c, rec) {
      const p = read(c, 'players', {});
      p[rec.cid] = { cid: rec.cid, nick: rec.nick, roster: rec.roster || '', ts: (p[rec.cid] && p[rec.cid].ts) || Date.now() };
      write(c, 'players', p); notify('players');
    },
    watchPlayers: (c, cb) => watch('players', () => cb(Object.values(read(c, 'players', {})))),
    watchResults: (c, cb) => watch('results', () => cb(read(c, 'results', []))),
    watchWinners: (c, cb) => watch('winners', () => cb(Object.values(read(c, 'winners', {})))),
  };
}
