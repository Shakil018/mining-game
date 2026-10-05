import { ROUNDS, MULT, mine, parseNonce, whyNot } from './logic.js';
import { getBackend } from './backend.js';

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const code = (q.get('s') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
const demo = q.has('demo');
const area = demo ? sessionStorage : localStorage;           // demo: one identity per tab
const store = {
  get: (k, d = '') => { try { return area.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { area.setItem(k, v); } catch {} },
};
const cid = store.get('mine_cid') || (() => {
  const v = ((self.crypto && crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 10);
  store.set('mine_cid', v); return v;
})();

let backend = null, live = false;
let round = 0, endsAt = 0, roundKey = '';
let nick = store.get('mine_nick');
let side = store.get('mine_side');
let tried = new Map(), last = null, msg = null;
const subKey = () => `mine_sub_${code}`;
let submitted = new Set(JSON.parse(store.get(subKey(), '[]')));

const fmt = s => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
const inRound = () => round >= 1 && round <= 3;
const remaining = () => Math.ceil((endsAt - Date.now()) / 1000);

async function init() {
  backend = code ? await getBackend({ demo }) : null;
  live = !!backend;
  if (code && !backend) showBanner('This class link is not connected to a server yet, so you are in practice mode. You can still try the game, but you cannot submit.');
  if (!code) showBanner('Practice mode. Scan the QR code your teacher shows to join the live game.');
  if (!live) { round = 1; buildPracticeBar(); }
  if (nick) enterPlay(); else $('join').classList.remove('hidden');
  if (live) backend.watchSession(code, onSession);
  setInterval(tick, 250);
}

function showBanner(t) { const b = $('banner'); b.textContent = t; b.classList.remove('hidden'); }

$('joinForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('nick').value.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!v) return;
  nick = v; store.set('mine_nick', nick); enterPlay();
});

function enterPlay() {
  $('join').classList.add('hidden'); $('play').classList.remove('hidden');
  $('who').innerHTML = '';
  const s = document.createElement('span'); s.textContent = nick;
  const b = document.createElement('button'); b.textContent = 'change'; b.onclick = () => { $('play').classList.add('hidden'); $('join').classList.remove('hidden'); $('nick').value = nick; $('who').innerHTML = ''; };
  $('who').append(s, b);
  render();
}

function buildPracticeBar() {
  const bar = $('practiceBar'); bar.classList.remove('hidden'); bar.innerHTML = '';
  for (const id of [1, 2, 3]) {
    const b = document.createElement('button');
    b.className = 'btn ghost'; b.textContent = ROUNDS[id].name === 'Bonus' ? 'Bonus' : `Round ${id}`;
    b.onclick = () => { round = id; endsAt = 0; reset(); };
    b.dataset.r = id; bar.append(b);
  }
}

function onSession(s, err) {
  if (err) { $('status').className = 'status closed'; $('status').textContent = 'Cannot reach the class server. Check your connection.'; return; }
  const r = s ? s.round : 0, e = s ? s.endsAt : 0;
  const key = `${r}:${e}`;
  if (key === roundKey) return;
  roundKey = key; round = r; endsAt = e; reset();
}

function reset() { tried.clear(); last = null; msg = null; $('nonce').value = ''; render(); }

$('tryForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!inRound()) return;
  const n = parseNonce($('nonce').value);
  if (n === null) { msg = { t: 'Type a whole number, for example 7.', c: 'warn' }; last = null; render(); return; }
  last = mine(round, n); tried.set(n, last); msg = null; render();
  $('nonce').select();
});

document.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => {
  side = b.dataset.side; store.set('mine_side', side); render();
}));

$('submitBtn').addEventListener('click', async () => {
  if (!last || !last.ok || !live || submitted.has(round)) return;
  $('submitBtn').disabled = true;
  const rec = { nick, round, nonce: last.nonce, hash: last.hash, tries: Math.max(1, tried.size), side: round === 2 ? (side || '') : '', cid };
  let r; try { r = await backend.submit(code, rec); } catch { r = 'error'; }
  if (r === 'ok' || r === 'denied') {
    submitted.add(round); store.set(subKey(), JSON.stringify([...submitted]));
    msg = r === 'ok' ? { t: `Submitted! Nonce ${rec.nonce} is on the big screen.`, c: 'good' } : { t: 'You already submitted for this round.', c: 'warn' };
  } else msg = { t: 'Could not submit. Check your connection and tap the button again.', c: 'warn' };
  render();
});

function tick() {
  if (!live || !inRound()) return;
  const t = $('timer'); if (t) { const s = remaining(); t.textContent = s > 0 ? fmt(s) : 'Time is up'; t.classList.toggle('low', s <= 10); }
  const lock = remaining() < -10;
  $('submitBtn').disabled = lock || submitted.has(round);
}

function render() {
  const playing = !$('play').classList.contains('hidden');
  if (!playing) return;
  const R = ROUNDS[round];
  const st = $('status');
  if (!live) {
    st.className = 'status'; st.textContent = `Practice · ${R.name} · ${R.phase}`;
    document.querySelectorAll('#practiceBar button').forEach(b => b.classList.toggle('on', Number(b.dataset.r) === round));
  } else if (round === 0) { st.className = 'status wait'; st.textContent = 'Waiting for your teacher to start the next round…'; }
  else if (round === 9) { st.className = 'status closed'; st.textContent = 'Mining is closed. Thanks for playing!'; }
  else { st.className = 'status'; st.innerHTML = `<span>${R.name} · ${R.phase}</span><span id="timer" class="timer"></span>`; tick(); }

  const rule = $('rule');
  if (R && (inRound())) {
    rule.classList.remove('hidden');
    const ex = 5, exRaw = MULT * ex + R.data;
    rule.innerHTML = `<div class="big">Block data = ${R.data}</div>
      <div class="formula">Hash = last two digits of ( ${MULT} × nonce + ${R.data} )</div>
      <div class="target">A valid hash ${R.target}  (${R.range})</div>
      <div class="ex">Example, nonce ${ex}: ${MULT} × ${ex} + ${R.data} = ${exRaw}, so the hash is ${String(exRaw % 100).padStart(2, '0')}.</div>`;
  } else rule.classList.add('hidden');

  $('sideBox').classList.toggle('hidden', !(round === 2));
  document.querySelectorAll('[data-side]').forEach(b => b.classList.toggle('on', b.dataset.side === side));

  const active = inRound();
  $('nonce').disabled = !active; $('tryBtn').disabled = !active;
  $('tryForm').classList.toggle('hidden', !active);
  $('triesCard').classList.toggle('hidden', !active);

  const res = $('result'); res.className = ''; res.innerHTML = '';
  if (last && active) {
    res.className = 'result ' + (last.ok ? 'ok' : 'bad');
    res.innerHTML = `<div class="work">${last.working}</div>
      <div class="step">Keep only the last two digits → hash <b>${last.hashStr}</b></div>
      <div class="verdict">${last.ok ? '✓ Valid! The hash ' + R.target + '.' : '✗ Not valid. ' + whyNot(round, last)}</div>`;
  }

  const sb = $('submitBtn');
  const canSubmit = live && active && last && last.ok;
  sb.classList.toggle('hidden', !canSubmit);
  if (canSubmit) { sb.textContent = submitted.has(round) ? 'Already submitted ✓' : `Submit nonce ${last.nonce}`; sb.disabled = submitted.has(round); }

  let note = msg;
  if (!note && active && round === 2 && side && last) {
    const even = last.nonce % 2 === 0;
    if ((side === 'even') !== even) note = { t: `Heads up: your side tries ${side} nonces. Pass this one to your partner.`, c: 'warn' };
  }
  if (!note && !live && last && last.ok) note = { t: 'Nice! In the live game you would tap Submit here.', c: 'good' };
  const nEl = $('note'); nEl.className = 'note ' + (note ? note.c : ''); nEl.textContent = note ? note.t : '';

  $('count').textContent = tried.size ? `(${tried.size})` : '';
  const ch = $('tries'); ch.innerHTML = '';
  [...tried.values()].slice(-14).forEach(x => {
    const c = document.createElement('span'); c.className = 'chip' + (x.ok ? ' ok' : '');
    c.textContent = `${x.nonce} → ${x.hashStr} ${x.ok ? '✓' : '✗'}`; ch.append(c);
  });
  if (!tried.size) { const c = document.createElement('span'); c.style.color = '#6c757d'; c.textContent = 'Nothing yet. Try your first nonce!'; ch.append(c); }
}

init();
