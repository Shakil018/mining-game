// Pure game logic (no DOM). Same rule as slides 19-20:
//   hash = last two digits of ( 11 x nonce + data hash )
export const MULT = 11;
export const ENABLED = [1, 2];          // the Bonus round (3) is built but hidden; add 3 here to bring it back
export const SUBSIDY = 3.125; // current Bitcoin block subsidy in BTC (halves again around 2028)

const tx = (from, to, btc, edited = false) => ({ from, to, btc, edited });

export const ROUNDS = {
  1: {
    id: 1, name: 'Round 1', phase: 'Think alone', data: 68, secs: 45,
    target: 'starts with 0', range: '00 – 09', test: h => h < 10,
    task: 'Find a nonce so that the hash starts with 0 (anything from 00 to 09).',
    block: { no: '957,413', prev: '0000b7f2…9d44', merkle: '7b2c4d9e…88fa', time: '2026-10-05 19:20 UTC',
      count: '2,341', volume: '6,812.45', more: '2,337', fees: 0.152,
      txs: [tx('Alice', 'Bob', '3.00'), tx('Carol', 'Dave', '1.50'), tx('Eve', 'Frank', '0.80'), tx('Gina', 'Hugo', '0.25')] },
  },
  2: {
    id: 2, name: 'Round 2', phase: 'Pair up', data: 68, secs: 60,
    target: 'is exactly 00', range: '00', test: h => h === 0,
    task: 'Same hash rule, harder target: the hash must be exactly 00. Pair up: one partner tries odd nonces, the other tries even nonces.',
    block: { no: '957,414', prev: '0000e4a1…7b30', merkle: 'a41f9c20…06de', time: '2026-10-05 19:31 UTC',
      count: '2,618', volume: '5,931.77', more: '2,614', fees: 0.138,
      txs: [tx('Ivy', 'Jack', '2.10'), tx('Kai', 'Lena', '0.60'), tx('Mo', 'Nina', '12.00'), tx('Omar', 'Pia', '0.05')] },
  },
  3: {
    id: 3, name: 'Bonus', phase: 'After the tamper', data: 80, secs: 45,
    target: 'starts with 0', range: '00 – 09', test: h => h < 10,
    task: 'A transaction was edited (Alice → Bob went from 3 BTC to 10 BTC), so the data hash changed from 68 to 80 and your old nonce no longer works. Re-mine: find a nonce whose hash starts with 0.',
    block: { no: '957,413', prev: '0000b7f2…9d44', merkle: 'c19e07a4…3d52', time: '2026-10-05 19:20 UTC',
      count: '2,341', volume: '6,819.45', more: '2,337', fees: 0.152,
      txs: [tx('Alice', 'Bob', '10.00', true), tx('Carol', 'Dave', '1.50'), tx('Eve', 'Frank', '0.80'), tx('Gina', 'Hugo', '0.25')] },
  },
};
for (const r of Object.values(ROUNDS)) r.reward = Math.round((SUBSIDY + r.block.fees) * 1000) / 1000;

export const pad2 = h => String(h).padStart(2, '0');
export const fmtBTC = n => (Math.round(n * 1000) / 1000).toFixed(3);

/** Accepts whole numbers of up to 7 digits; returns a Number or null. */
export function parseNonce(v) {
  const s = String(v).trim();
  return /^\d{1,7}$/.test(s) ? Number(s) : null;
}

export function mine(roundId, nonce) {
  const r = ROUNDS[roundId];
  const raw = MULT * nonce + r.data;
  const hash = raw % 100;
  return { nonce, raw, hash, hashStr: pad2(hash), ok: r.test(hash), working: `${MULT} × ${nonce} + ${r.data} = ${raw}` };
}

export function whyNot(roundId, res) {
  return roundId === 2
    ? `The hash ${res.hashStr} is not 00.`
    : `The hash ${res.hashStr} starts with ${res.hashStr[0]}, not 0.`;
}

/** First few valid nonces for a round (teacher answer key). */
export function validNonces(roundId, count = 4) {
  const out = [];
  for (let n = 1; out.length < count && n < 100000; n++) if (mine(roundId, n).ok) out.push(n);
  return out;
}

/**
 * Leaderboard. Only ONE miner earns each block's reward (the first valid claim, stored in `winners`),
 * like real mining. Everyone else who found a valid nonce is "late": valid, but unpaid.
 * results: [{cid,nick,round,nonce,hash,tries,ts}], winners: {1:{cid,nick,nonce,ts},...}
 */
export function buildBoard(results, winners) {
  const players = new Map();
  const P = (cid, nick) => {
    if (!players.has(cid)) players.set(cid, { cid, nick: nick || '?', rounds: {}, btc: 0, tries: 0, solves: 0, first: Infinity });
    const p = players.get(cid); if (nick) p.nick = nick; return p;
  };
  for (const r of results) {
    const m = mine(r.round, r.nonce);
    if (!m.ok || m.hash !== r.hash) continue;                 // forged or invalid: ignore
    const p = P(r.cid, r.nick);
    if (p.rounds[r.round]) continue;
    p.rounds[r.round] = { nonce: r.nonce, won: false, ts: r.ts };
    p.tries += r.tries || 0; p.solves++; p.first = Math.min(p.first, r.ts);
  }
  for (const [rd, w] of Object.entries(winners || {})) {
    const round = Number(rd);
    if (!ROUNDS[round] || !mine(round, w.nonce).ok) continue;
    const p = P(w.cid, w.nick);
    if (!p.rounds[round]) { p.rounds[round] = { nonce: w.nonce, won: true, ts: w.ts }; p.solves++; p.first = Math.min(p.first, w.ts); }
    p.rounds[round].won = true;
    p.btc = Math.round((p.btc + ROUNDS[round].reward) * 1000) / 1000;
  }
  return [...players.values()].sort((a, b) => b.btc - a.btc || b.solves - a.solves || a.first - b.first || a.nick.localeCompare(b.nick));
}

/** A "game" (generation) lets the teacher reset the leaderboard without deleting anything. */
export const newGen = () => Math.random().toString(36).slice(2, 8);
export const forGen = (list, gen) => (list || []).filter(x => x.gen === gen);
export const winnersMap = (list, gen) => { const m = {}; (list || []).forEach(w => { if (w.gen === gen) m[w.round] = w; }); return m; };

/** The answer key for a round: the smallest valid nonce, with the full equation. */
export function solutionOf(roundId) {
  const n = validNonces(roundId, 1)[0];
  return { ...mine(roundId, n), equation: `last two digits of ( ${MULT} × ${n} + ${ROUNDS[roundId].data} )` };
}
