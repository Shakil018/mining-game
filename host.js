import { ROUNDS, mine, pad2, validNonces } from './logic.js';
import { getBackend, configured } from './backend.js';
import { qrSvg } from './qr.js';

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const demo = q.has('demo');
let code = (q.get('s') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
if (!code) {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  code = Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  const u = new URL(location.href); u.searchParams.set('s', code); history.replaceState(null, '', u);
}
const base = location.protocol === 'file:'
  ? location.href.replace(/host(\.html)?([?#].*)?$/, '')
  : location.origin + location.pathname.replace(/host(\.html)?$/, '');
const joinURL = `${base}?s=${code}${demo ? '&demo=1' : ''}`;

$('code').textContent = code.toUpperCase();
$('url').textContent = joinURL.replace(/^https?:\/\//, '');
try { $('qr').innerHTML = qrSvg(joinURL); } catch (e) { $('qr').textContent = 'QR failed: use the link below.'; }

let backend = null, session = null, results = [], viewRound = 1;
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

async function init() {
  backend = await getBackend({ demo });
  $('mode').textContent = demo ? 'Demo mode (this browser only)' : (backend ? 'Live · Firebase' : 'Not connected');
  if (!backend) {
    const s = $('setup'); s.classList.remove('hidden');
    s.innerHTML = configured()
      ? 'Could not reach Firebase. Check your internet connection and the config in firebase-config.js.'
      : 'Firebase is not set up yet (see README.md). You can still try everything right now in <a href="' + location.pathname + '?demo=1">demo mode</a>: open this page and the student link in two tabs of the same browser.';
    document.querySelectorAll('[data-act]').forEach(b => b.disabled = true);
  } else {
    backend.watchSession(code, s => { session = s; renderControls(); renderResults(); });
    backend.watchResults(code, r => { results = r; renderResults(); });
  }
  if (demo) {
    $('demoBox').innerHTML = '<button class="btn ghost" id="simBtn">Add 10 pretend students</button>';
    $('simBtn').onclick = simulate;
  }
  buildTabs(); renderControls(); renderResults();
  setInterval(tick, 250);
}

document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
  const r = Number(b.dataset.act);
  const secs = ROUNDS[r] ? ROUNDS[r].secs : 0;
  await backend.setSession(code, { round: r, endsAt: secs ? Date.now() + secs * 1000 : 0 });
  if (ROUNDS[r]) { viewRound = r; buildTabs(); }
}));

function buildTabs() {
  const t = $('tabs'); t.innerHTML = '';
  for (const id of [1, 2, 3]) {
    const b = document.createElement('button');
    b.className = 'btn ghost' + (id === viewRound ? ' on' : '');
    b.textContent = id === 3 ? 'Bonus results' : `Round ${id} results`;
    b.onclick = () => { viewRound = id; buildTabs(); renderResults(); };
    t.append(b);
  }
}

function renderControls() {
  const r = session ? session.round : 0;
  document.querySelectorAll('[data-act]').forEach(b => b.classList.toggle('live', Number(b.dataset.act) === r));
  tick();
}

function tick() {
  const r = session ? session.round : 0, el = $('timer');
  const lab = r === 0 ? 'Lobby: waiting to start' : r === 9 ? 'Mining closed' : `${ROUNDS[r].name} · ${ROUNDS[r].phase}`;
  let big = '–';
  if (ROUNDS[r]) { const s = Math.ceil((session.endsAt - Date.now()) / 1000); big = s > 0 ? fmt(s) : '0:00'; el.classList.toggle('low', s <= 10); }
  else el.classList.remove('low');
  el.innerHTML = `${big}<small>${lab}</small>`;
}

function renderResults() {
  const R = ROUNDS[viewRound];
  const rows = results.filter(r => r.round === viewRound).map(r => {
    const m = mine(viewRound, r.nonce);
    return { ...r, valid: m.ok && m.hash === r.hash, hashStr: pad2(m.hash) };
  });
  const good = rows.filter(r => r.valid).sort((a, b) => a.ts - b.ts);
  const bad = rows.filter(r => !r.valid).sort((a, b) => a.ts - b.ts);
  const ordered = [...good, ...bad];
  const first = good.length ? good[0].ts : 0;

  const sum = $('sum'); sum.innerHTML = '';
  const pill = (t, cls = '') => { const p = document.createElement('span'); p.className = 'pill ' + cls; p.textContent = t; sum.append(p); };
  pill(`${R.name} · hash ${R.target} (${R.range})`);
  pill(`${rows.length} submitted`);
  pill(`${good.length} valid`, 'g');
  if (good.length) {
    const tally = {}; good.forEach(r => tally[r.nonce] = (tally[r.nonce] || 0) + 1);
    pill('Nonces found: ' + Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (×${c})`).join(', '));
    if (viewRound === 2 || viewRound === 3) {
      const ev = good.filter(r => r.nonce % 2 === 0).length, od = good.length - ev;
      pill(`Winning nonces: ${ev} even, ${od} odd`);
    }
  }

  const t = $('table');
  if (!ordered.length) { t.innerHTML = '<div class="empty">No submissions yet. Students tap “Submit” when they find a valid nonce.</div>'; }
  else {
    const tbl = document.createElement('table');
    tbl.innerHTML = `<thead><tr><th>#</th><th>Name</th><th>Nonce</th><th>Hash</th><th>Tries</th>${viewRound === 2 ? '<th>Side</th>' : ''}<th>Time</th></tr></thead>`;
    const tb = document.createElement('tbody');
    ordered.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (r.valid && i === 0) tr.className = 'win'; else if (!r.valid) tr.className = 'bad';
      const cells = [r.valid ? String(i + 1) : '✗', r.nick, String(r.nonce), r.hashStr, String(r.tries)];
      if (viewRound === 2) cells.push(r.side || '–');
      cells.push(r.valid ? (i === 0 ? 'first!' : `+${Math.max(0, Math.round((r.ts - first) / 1000))} s`) : 'does not check out');
      cells.forEach((c, k) => { const td = document.createElement('td'); td.textContent = c; if (k === 2 || k === 3 || k === 4) td.className = 'num'; tr.append(td); });
      tb.append(tr);
    });
    tbl.append(tb); t.innerHTML = ''; t.append(tbl);
  }

  const key = $('key');
  key.innerHTML = '';
  for (const id of [1, 2, 3]) {
    const v = validNonces(id, 4).map(n => `${n} → ${pad2(mine(id, n).hash)}`).join(', ');
    const d = document.createElement('div'); d.textContent = `${ROUNDS[id].name} (data ${ROUNDS[id].data}): first valid nonces ${v}`; key.append(d);
  }
}
$('keyBtn').onclick = () => { const k = $('key'); const show = k.classList.toggle('hidden'); $('keyBtn').textContent = show ? 'Show answer key' : 'Hide answer key'; };

async function simulate() {
  const r = session && ROUNDS[session.round] ? session.round : viewRound;
  const names = ['Ava', 'Ben', 'Chloe', 'Dev', 'Elif', 'Farid', 'Gia', 'Hugo', 'Ines', 'Jon'];
  const pick = { 1: [3, 3, 3, 3, 12, 3, 31, 3, 3, 5], 2: [12, 12, 12, 12, 12, 12, 12, 12, 112, 12], 3: [2, 2, 2, 2, 11, 2, 2, 20, 2, 2] }[r];
  for (let i = 0; i < 10; i++) {
    const m = mine(r, pick[i]);
    await backend.submit(code, { nick: names[i], round: r, nonce: pick[i], hash: m.hash, tries: 1 + Math.floor(Math.random() * 12), side: r === 2 ? (pick[i] % 2 ? 'odd' : 'even') : '', cid: 'sim' + i });
    await new Promise(res => setTimeout(res, 120));
  }
}

init();
