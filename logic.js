// Pure game logic (no DOM). Same rule as slides 19-20:
// hash = last two digits of ( 11 x nonce + block data )
export const MULT = 11;

export const ROUNDS = {
  1: { id: 1, name: 'Round 1', phase: 'Think alone', data: 68, secs: 75, target: 'starts with 0', range: '00 – 09', test: h => h < 10 },
  2: { id: 2, name: 'Round 2', phase: 'Pair up', data: 68, secs: 60, target: 'is exactly 00', range: '00', test: h => h === 0 },
  3: { id: 3, name: 'Bonus', phase: 'After the tamper', data: 80, secs: 45, target: 'starts with 0', range: '00 – 09', test: h => h < 10 },
};

export const pad2 = h => String(h).padStart(2, '0');

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
