import { ROUNDS, ENABLED, mine, pad2, validNonces, fmtBTC, buildBoard, newGen, forGen, winnersMap } from './logic.js';
import { blockHTML, applySolved } from './blockview.js';
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
$('codeChip').textContent = code.toUpperCase();
$('url').textContent = joinURL.replace(/^https?:\/\//, '');
try { $('qr').innerHTML = qrSvg(joinURL); } catch (e) { $('qr').textContent = 'QR failed: use the link below.'; }
$('newCode').onclick = () => { const u = new URL(location.href); u.searchParams.delete('s'); location.href = u.toString(); };

let backend = null, session = null, resultsAll = [], winnersAll = [], players = [];
const firstGen = newGen(), firstRoster = newGen();           // used until the session has its own ids
const G = () => (session && session.gen) || firstGen;
const R = () => (session && session.roster) || firstRoster;   // who counts as "joined" (changes on Reset joined list)
let created = false, autoEnded = '';
const results = () => forGen(resultsAll, G());
const winners = () => winnersMap(winnersAll, G());
const S = patch => backend.setSession(code, { gen: G(), roster: R(), ...patch });
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const phase = () => (session && session.phase) || 'lobby';
const cur = () => (session && session.round) || 0;

async function init() {
  backend = await getBackend({ demo });
  $('mode').textContent = demo ? 'Demo mode (this browser only)' : (backend ? 'Live · Firebase' : 'Not connected');
  buildRounds();
  if (!backend) {
    const s = $('setup'); s.classList.remove('hidden');
    s.innerHTML = configured()
      ? 'Could not reach Firebase. Check your internet connection and the config in firebase-config.js, or open <a href="debug.html">debug.html</a>.'
      : 'Firebase is not set up yet (see README.md). You can still try everything right now in <a href="' + location.pathname + '?demo=1">demo mode</a>: open this page and the student link in two tabs of the same browser.';
    document.querySelectorAll('#ctrlCard .btn').forEach(b => b.disabled = true);
  } else {
    backend.watchSession(code, (s, err) => {
      session = s; renderAll();
      if (!s && !err && !created) { created = true; S({ round: 0, phase: 'lobby', endsAt: 0 }); }   // create the class so students can join right away
    });
    backend.watchResults(code, r => { resultsAll = r; renderBoard(); });
    backend.watchWinners(code, w => { winnersAll = w || []; renderAll(); });
    backend.watchPlayers(code, p => { players = p; renderPlayers(); });
  }
  if (demo) {
    $('demoBox').innerHTML = '<button class="btn ghost" id="simBtn" style="font-size:14px;padding:8px 12px">Add 10 pretend students</button>';
    $('simBtn').onclick = simulate;
  }
  renderAll(); renderPlayers();
  setInterval(tick, 250);
}

// ---------- controls: one row per round: [Round N] [Start] [End] ----------
const label = r => (r === 3 ? 'Bonus' : `Round ${r}`);
function buildRounds() {
  const box = $('rounds'); box.innerHTML = '';
  for (const r of ENABLED) {
    const row = document.createElement('div'); row.className = 'rrow'; row.dataset.r = r;
    row.innerHTML = `<button class="btn rsel">${label(r)}</button><button class="btn rstart">Start</button><button class="btn rend">End</button>`;
    row.querySelector('.rsel').onclick = () => S({ round: r, phase: 'ready', endsAt: 0 });
    row.querySelector('.rstart').onclick = () => S({ round: r, phase: 'live', endsAt: Date.now() + ROUNDS[r].secs * 1000 });
    row.querySelector('.rend').onclick = () => S({ round: r, phase: 'ended', endsAt: 0 });
    box.append(row);
  }
}
$('lobbyBtn').onclick = () => S({ round: 0, phase: 'lobby', endsAt: 0 });

// Reset: start a fresh game. Old results stay in the database but are ignored; students go back to the lobby.
$('resetBoard').onclick = () => {
  if (!backend) return;
  if (!confirm('Reset the leaderboard?\n\nAll Bitcoin earned and all results are cleared, and everyone goes back to the lobby. Students who joined stay in the lobby.')) return;
  backend.setSession(code, { gen: newGen(), round: 0, phase: 'lobby', endsAt: 0 });
};

$('resetPlayers').onclick = () => {
  if (!backend) return;
  if (!confirm('Reset the joined list?\n\nEveryone on the page is asked to join again, so only students who are really here appear.')) return;
  backend.setSession(code, { gen: G(), roster: newGen(), round: 0, phase: 'lobby', endsAt: 0 });
};

// ---------- lobby: who has joined ----------
function renderPlayers() {
  const box = $('players'); box.innerHTML = '';
  const list = players.filter(p => p.roster === R()).sort((a, b) => a.ts - b.ts);
  $('pcount').textContent = String(list.length);
  $('joined').textContent = `${list.length} joined`;
  if (!list.length) { const s = document.createElement('span'); s.className = 'ph'; s.textContent = 'Waiting for the first student to scan…'; box.append(s); return; }
  list.forEach(p => { const c = document.createElement('span'); c.className = 'pchip'; c.textContent = p.nick; box.append(c); });
}

function renderAll() { renderControls(); renderBlock(); renderBoard(); }

function renderControls() {
  const r = cur(), p = phase();
  $('qrCard').classList.toggle('hidden', p !== 'lobby');            // QR code only in the lobby
  $('blockCard').classList.toggle('hidden', p === 'lobby');
  document.querySelectorAll('.rrow').forEach(row => {
    const n = Number(row.dataset.r), isCur = n === r && p !== 'lobby', live = n === r && p === 'live';
    row.querySelector('.rsel').classList.toggle('on', isCur);
    row.querySelector('.rstart').disabled = !backend || live;
    row.querySelector('.rend').disabled = !backend || !live;
  });
  $('lobbyBtn').classList.toggle('hidden', p === 'lobby');
  tick();
}

const solved = () => phase() === 'ended' || (phase() === 'live' && session && session.endsAt > 0 && Date.now() >= session.endsAt);
let wasSolvedHost = false;
function tick() {
  const r = cur(), p = phase(), el = $('timer');
  if (r && p === 'live' && session.endsAt > 0 && Date.now() >= session.endsAt + 2000) {          // time is up: end the round for everyone
    const key = G() + ':' + r + ':' + session.endsAt;
    if (autoEnded !== key && backend) { autoEnded = key; S({ round: r, phase: 'ended', endsAt: 0 }); }
  }
  if (r && p !== 'lobby' && solved() !== wasSolvedHost) { wasSolvedHost = solved(); applySolved(r, wasSolvedHost, false); }
  let big = '–', lab = 'Lobby: students are joining';
  if (r && p === 'ready') { big = fmt(ROUNDS[r].secs); lab = `${label(r)} ready · press Start`; el.classList.remove('low'); }
  else if (r && p === 'live') { const s = Math.ceil((session.endsAt - Date.now()) / 1000); big = s > 0 ? fmt(s) : '0:00'; lab = `${label(r)} · ${ROUNDS[r].phase}` + (s <= 0 ? ' · time is up, press End' : ''); el.classList.toggle('low', s <= 10); }
  else if (r && p === 'ended') { big = '✓'; lab = `${label(r)} is over`; el.classList.remove('low'); }
  else el.classList.remove('low');
  el.innerHTML = `${big}<small>${lab}</small>`;
}

// ---------- the block (question) shown on the teacher screen ----------
let shownRound = -1, shownWinner = '';
function renderBlock() {
  const r = cur(), p = phase(), card = $('blockCard');
  if (!r || p === 'lobby') { card.innerHTML = ''; shownRound = -1; return; }
  const RR = ROUNDS[r], w = winners()[r];
  const sig = G() + ':' + r + ':' + (w ? w.cid : '');
  if (sig === shownRound) return; shownRound = sig;
  let banner = '';
  if (w) banner = `<div class="winner">🏆 <b>${esc(w.nick)}</b> mined this block first (nonce ${w.nonce}) and earns <b>${fmtBTC(RR.reward)} BTC</b>. Everyone else’s work is wasted, like in real mining.</div>`;
  card.innerHTML = `${banner}${blockHTML(r, 'teacher')}`;
  wasSolvedHost = solved(); applySolved(r, wasSolvedHost, false);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- leaderboard ----------
function renderBoard() {
  const W = winners(), RES = results();
  const board = buildBoard(RES, W);
  const r = cur() || 1;
  const rows = RES.filter(x => x.round === r).map(x => ({ ...x, ok: mine(r, x.nonce).ok && mine(r, x.nonce).hash === x.hash }));
  const good = rows.filter(x => x.ok);
  const sum = $('sum'); sum.innerHTML = '';
  const pill = (t, cls = '') => { const p = document.createElement('span'); p.className = 'pill ' + cls; p.textContent = t; sum.append(p); };
  pill(`${label(r)}: ${good.length} valid`, 'g');
  if (good.length) {
    const tally = {}; good.forEach(x => tally[x.nonce] = (tally[x.nonce] || 0) + 1);
    pill('Nonces found: ' + Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (×${c})`).join(', '));
    if (r === 2) { const ev = good.filter(x => x.nonce % 2 === 0).length; pill(`${ev} even, ${good.length - ev} odd`); }
  }
  const w = W[r];
  pill(w ? `Winner: ${w.nick} · +${fmtBTC(ROUNDS[r].reward)} BTC` : 'No winner yet', w ? 'y' : '');

  const t = $('table');
  if (!board.length) { t.innerHTML = '<div class="empty">No miners yet. Students appear here when they find a valid nonce.</div>'; }
  else {
    const tbl = document.createElement('table');
    tbl.innerHTML = '<thead><tr><th>#</th><th>Miner</th>' + ENABLED.map(n => `<th>${label(n)}</th>`).join('') + '<th class="num">₿ earned</th><th class="num">Tries</th></tr></thead>';
    const tb = document.createElement('tbody');
    board.forEach((p, i) => {
      const tr = document.createElement('tr'); if (i === 0 && p.btc > 0) tr.className = 'lead';
      const cell = n => {
        const c = p.rounds[n], td = document.createElement('td');
        if (!c) { td.className = 'none'; td.textContent = '–'; }
        else if (c.won) { td.className = 'won'; td.textContent = `⛏ nonce ${c.nonce} · +${fmtBTC(ROUNDS[n].reward)}`; }
        else { td.className = 'late'; td.textContent = `nonce ${c.nonce} (too late)`; }
        return td;
      };
      const num = (txt, cls = '') => { const td = document.createElement('td'); td.className = 'num ' + cls; td.textContent = txt; return td; };
      const rank = document.createElement('td'); rank.textContent = String(i + 1);
      const name = document.createElement('td'); name.textContent = p.nick;
      tr.append(rank, name, ...ENABLED.map(cell), num(fmtBTC(p.btc), 'btc'), num(String(p.tries)));
      tb.append(tr);
    });
    tbl.append(tb); t.innerHTML = ''; t.append(tbl);
  }
  const key = $('key'); key.innerHTML = '';
  for (const id of ENABLED) {
    const v = validNonces(id, 4).map(n => `${n} → ${pad2(mine(id, n).hash)}`).join(', ');
    const d = document.createElement('div'); d.textContent = `${label(id)} (data hash ${ROUNDS[id].data}): first valid nonces ${v}`; key.append(d);
  }
}
$('keyBtn').onclick = () => { const k = $('key'); const show = k.classList.toggle('hidden'); $('keyBtn').textContent = show ? 'Show answer key' : 'Hide answer key'; };

// ---------- demo: pretend students race for the live round ----------
async function simulate() {
  const r = cur();
  const names = ['Ava', 'Ben', 'Chloe', 'Dev', 'Elif', 'Farid', 'Gia', 'Hugo', 'Ines', 'Jon'];
  for (let i = 0; i < 10; i++) await backend.join(code, { cid: 'sim' + i, nick: names[i], roster: R() });
  if (!r || phase() !== 'live') return;                      // in the lobby: just fill the "joined" list
  const pick = { 1: [3, 12, 3, 3, 31, 3, 12, 3, 3, 40], 2: [12, 12, 112, 12, 12, 12, 12, 12, 12, 12], 3: [2, 11, 2, 2, 20, 2, 2, 2, 11, 2] }[r];
  for (let i = 0; i < 10; i++) {
    const m = mine(r, pick[i]); const cid = 'sim' + i, gen = G();
    await backend.claim(code, { nick: names[i], round: r, nonce: pick[i], cid, gen });
    await backend.submit(code, { nick: names[i], round: r, nonce: pick[i], hash: m.hash, tries: 1 + Math.floor(Math.random() * 12), side: r === 2 ? (pick[i] % 2 ? 'odd' : 'even') : '', cid, gen });
    await new Promise(res => setTimeout(res, 150));
  }
}

init();
