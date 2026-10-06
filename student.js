import { ROUNDS, mine, parseNonce, whyNot, fmtBTC, winnersMap } from './logic.js';
import { blockHTML } from './blockview.js';
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
let round = 0, phase = 'lobby', endsAt = 0, gen = '', winnersAll = [], mounted = 0;
const W = () => winnersMap(winnersAll, gen);
let nick = store.get('mine_nick');
let side = store.get('mine_side');
let tried = new Map(), last = null, msg = null;
const subKey = () => `mine_sub_${code}_${gen}`;
const loadSub = () => { try { return new Set(JSON.parse(store.get(subKey(), '[]'))); } catch { return new Set(); } };
let submitted = new Set();

const fmt = s => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
const remaining = () => Math.ceil((endsAt - Date.now()) / 1000);
const hasRound = () => round >= 1 && round <= 3;
const canMine = () => hasRound() && (!live || phase === 'live');

async function init() {
  backend = code ? await getBackend({ demo }) : null;
  live = !!backend;
  if (code && !backend) showBanner('This class link is not connected to a server yet, so you are in practice mode. You can still try the game, but you cannot submit.');
  if (!code) showBanner('Practice mode. Scan the QR code your teacher shows to join the live game.');
  if (!live) { round = 1; phase = 'live'; buildPracticeBar(); }
  if (nick) enterPlay(); else $('join').classList.remove('hidden');
  if (live) {
    backend.watchSession(code, onSession);
    backend.watchWinners(code, w => { winnersAll = w || []; render(); });
    announce();
  }
  setInterval(tick, 250);
}

function showBanner(t) { const b = $('banner'); b.textContent = t; b.classList.remove('hidden'); }

$('joinForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('nick').value.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!v) return;
  nick = v; store.set('mine_nick', nick); enterPlay();
});

function announce() { if (live && nick) backend.join(code, { cid, nick }); }

function enterPlay() {
  $('join').classList.add('hidden'); $('play').classList.remove('hidden');
  announce(); render();
}

function buildPracticeBar() {
  const bar = $('practiceBar'); bar.classList.remove('hidden'); bar.innerHTML = '';
  for (const id of [1, 2, 3]) {
    const b = document.createElement('button');
    b.className = 'btn ghost'; b.textContent = ROUNDS[id].name; b.dataset.r = id;
    b.onclick = () => { round = id; resetTries(); render(); };
    bar.append(b);
  }
}

function onSession(s, err) {
  if (err) { $('status').className = 'status closed'; $('status').textContent = 'Cannot reach the class server. Check your connection.'; return; }
  const r = s ? s.round : 0, p = s ? s.phase : 'lobby', e = s ? s.endsAt : 0, g = s ? (s.gen || '') : '';
  if (g !== gen) { gen = g; submitted = loadSub(); resetTries(); }   // the teacher reset the game
  if (r !== round) resetTries();
  round = r; phase = p; endsAt = e;
  render();
}

function resetTries() { tried.clear(); last = null; msg = null; }

function mount() {
  if (!hasRound()) { $('blockMount').innerHTML = ''; mounted = 0; return; }
  if (mounted === round) return;
  $('blockMount').innerHTML = blockHTML(round, 'student'); mounted = round;
  $('tryForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!canMine()) return;
    const n = parseNonce($('nonce').value);
    if (n === null) { msg = { t: 'Type a whole number, for example 7.', c: 'warn' }; last = null; render(); return; }
    last = mine(round, n); tried.set(n, last); msg = null; render();
    $('nonce').select();
  });
}

document.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => {
  side = b.dataset.side; store.set('mine_side', side); render();
}));

$('submitBtn').addEventListener('click', async () => {
  if (!last || !last.ok || !live || submitted.has(round) || phase !== 'live') return;
  const R = ROUNDS[round];
  $('submitBtn').disabled = true;
  let c; try { c = await backend.claim(code, { nick, round, nonce: last.nonce, cid, gen }); } catch { c = 'error'; }
  if (c !== 'won' && c !== 'late') {
    msg = { t: 'Could not submit. The round may have ended, or check your connection and tap the button again.', c: 'warn' };
    render(); return;
  }
  try { await backend.submit(code, { nick, round, nonce: last.nonce, hash: last.hash, tries: Math.max(1, tried.size), side: round === 2 ? (side || '') : '', cid, gen }); } catch {}
  submitted.add(round); store.set(subKey(), JSON.stringify([...submitted]));
  if (c === 'won') msg = { t: `🏆 You found the block first! You earn ${fmtBTC(R.reward)} BTC.`, c: 'good' };
  else msg = { t: 'Your nonce is valid, but another miner found it first. In real mining only the first miner is paid, so your work earns nothing.', c: 'warn' };
  render();
});

function tick() {
  if (!live || !hasRound() || phase !== 'live') return;
  const t = $('timer'); if (t) { const s = remaining(); t.textContent = s > 0 ? fmt(s) : 'Time is up'; t.classList.toggle('low', s <= 10); }
}

function render() {
  if ($('play').classList.contains('hidden')) return;
  const R = ROUNDS[round];
  const st = $('status');

  // header: who + earned BTC
  const winners = W();
  const mine$ = Object.entries(winners).filter(([, w]) => w.cid === cid).reduce((s, [r]) => s + ROUNDS[r].reward, 0);
  $('who').innerHTML = '';
  const nm = document.createElement('span'); nm.textContent = nick + ' ';
  const bal = document.createElement('span'); bal.className = 'balance'; bal.textContent = `₿ ${fmtBTC(mine$)}`;
  const ch = document.createElement('button'); ch.textContent = 'change';
  ch.onclick = () => { $('play').classList.add('hidden'); $('join').classList.remove('hidden'); $('nick').value = nick; };
  $('who').append(nm, bal, ch);

  // status line
  if (!live) {
    st.className = 'status'; st.textContent = `Practice · ${R.name} · ${R.phase}`;
    document.querySelectorAll('#practiceBar button').forEach(b => b.classList.toggle('on', Number(b.dataset.r) === round));
  } else if (!hasRound()) { st.className = 'status wait'; st.textContent = 'Waiting for your teacher to choose a round…'; }
  else if (phase === 'ready') { st.className = 'status wait'; st.textContent = `${R.name} · ${R.phase}: get ready, waiting for Start…`; }
  else if (phase === 'ended') { st.className = 'status closed'; st.textContent = `${R.name} is over.`; }
  else { st.className = 'status'; st.innerHTML = `<span>${R.name} · ${R.phase}</span><span id="timer" class="timer"></span>`; tick(); }

  $('lobbyMsg').classList.toggle('hidden', !(live && !hasRound()));
  $('taskBox').classList.toggle('hidden', !hasRound());
  if (hasRound()) $('taskBox').textContent = R.task;
  mount();

  // winner banner (only one miner is paid)
  const w = winners[round], wb = $('winnerBox');
  if (live && hasRound() && w) {
    wb.classList.remove('hidden');
    wb.innerHTML = '';
    const you = w.cid === cid;
    wb.append(document.createTextNode(`🏆 ${you ? 'You' : w.nick} mined this block first with nonce ${w.nonce} and earned `));
    const b = document.createElement('b'); b.textContent = `${fmtBTC(R.reward)} BTC`; wb.append(b);
    wb.append(document.createTextNode(you ? '.' : '. Everyone else’s work is wasted, like in real mining.'));
  } else wb.classList.add('hidden');

  $('sideBox').classList.toggle('hidden', !(round === 2 && hasRound()));
  document.querySelectorAll('[data-side]').forEach(b => b.classList.toggle('on', b.dataset.side === side));

  // block fields
  if (hasRound()) {
    const active = canMine();
    $('nonce').disabled = !active; $('tryBtn').disabled = !active;
    const hv = $('hashVal'), hw = $('hashWork');
    if (last) { hv.textContent = last.hashStr; hv.className = 'hashval ' + (last.ok ? 'ok' : 'bad'); hw.textContent = last.working + '  →  keep the last two digits'; }
    else { hv.textContent = '–'; hv.className = 'hashval'; hw.textContent = ''; }
  }

  const res = $('result'); res.className = ''; res.textContent = '';
  if (last && hasRound()) {
    res.className = 'verdict ' + (last.ok ? 'ok' : 'bad');
    res.textContent = last.ok ? `✓ Valid! The hash ${R.target}.` : '✗ Not valid. ' + whyNot(round, last);
  }

  const sb = $('submitBtn');
  const canSubmit = live && hasRound() && last && last.ok && phase === 'live';
  sb.classList.toggle('hidden', !canSubmit);
  if (canSubmit) { sb.textContent = submitted.has(round) ? 'Already submitted ✓' : `Submit nonce ${last.nonce}`; sb.disabled = submitted.has(round); }

  let note = msg;
  if (!note && canMine() && round === 2 && side && last) {
    const even = last.nonce % 2 === 0;
    if ((side === 'even') !== even) note = { t: `Heads up: your side tries ${side} nonces. Pass this one to your partner.`, c: 'warn' };
  }
  if (!note && !live && last && last.ok) note = { t: 'Nice! In the live game you would tap Submit here.', c: 'good' };
  const nEl = $('note'); nEl.className = 'note ' + (note ? note.c : ''); nEl.textContent = note ? note.t : '';

  $('triesCard').classList.toggle('hidden', !hasRound());
  $('count').textContent = tried.size ? `(${tried.size})` : '';
  const chips = $('tries'); chips.innerHTML = '';
  [...tried.values()].slice(-14).forEach(x => {
    const c = document.createElement('span'); c.className = 'chip' + (x.ok ? ' ok' : '');
    c.textContent = `${x.nonce} → ${x.hashStr} ${x.ok ? '✓' : '✗'}`; chips.append(c);
  });
  if (!tried.size) { const c = document.createElement('span'); c.style.color = '#6c757d'; c.textContent = 'Nothing yet. Try your first nonce!'; chips.append(c); }
}

init();
