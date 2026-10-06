// Renders the example block shown to students and on the teacher screen.
import { ROUNDS, MULT, SUBSIDY, fmtBTC, solutionOf } from './logic.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function blockHTML(roundId, mode) {
  const R = ROUNDS[roundId], B = R.block, student = mode === 'student';
  const txs = B.txs.map(t =>
    `<div class="tx${t.edited ? ' edited' : ''}">${esc(t.from)} → ${esc(t.to)} <b>${t.btc} BTC</b>${t.edited ? ' <em>edited</em>' : ''}</div>`).join('');
  const task = `<div class="ntask">${esc(R.task)}</div>`;      // the instruction sits right under the nonce
  const nonceCell = student
    ? `<form id="tryForm" class="nform" autocomplete="off" novalidate>
         <input id="nonce" inputmode="numeric" pattern="[0-9]*" maxlength="7" placeholder="nonce" aria-label="Nonce">
         <button class="btn" id="tryBtn" type="submit">Mine</button>
       </form>${task}`
    : `<span class="ph" id="nonceBox">students type their guess here</span>${task}`;
  const rows = {
    prev: `<div class="brow"><span class="bl">Previous hash</span><span class="bv mono">${B.prev}</span></div>`,
    merkle: `<div class="brow"><span class="bl">Merkle root</span><span class="bv mono${R.id === 3 ? ' changed' : ''}">${B.merkle}</span></div>`,
    time: `<div class="brow"><span class="bl">Timestamp</span><span class="bv">${B.time}</span></div>`,
    txs: `<div class="brow"><span class="bl">Transactions</span><span class="bv"><b>${B.count}</b> transactions moving <b>${B.volume} BTC</b>${txs}<div class="more">+ ${B.more} more</div></span></div>`,
    data: `<div class="brow data"><span class="bl">Data hash</span><span class="bv"><span class="bigdata">${R.data}</span><small>${R.id === 3 ? 'was 68 before the edit' : 'the number in the hash formula'}</small></span></div>`,
    nonce: `<div class="brow nonce"><span class="bl">Nonce</span><span class="bv">${nonceCell}</span></div>`,
    hash: `<div class="brow hash"><span class="bl">Hash</span><span class="bv">
      <span id="solBadge" class="solbadge hidden">✓ Solution</span>
      <div id="formula" class="formula">last two digits of ( ${MULT} × nonce + ${R.data} )</div>
      <div id="hashVal" class="hashval">${student ? '–' : '?'}</div>
      <div id="hashWork" class="hashwork"></div>
    </span></div>`,
  };
  const head = `<div class="bhead"><span>Block #${B.no} <small>example</small></span><span class="btag">${esc(R.name)} · ${esc(R.phase)}</span></div>`;
  const reward = `<div class="breward">Reward: ${SUBSIDY} BTC subsidy + ${B.fees} BTC fees = <b>${fmtBTC(R.reward)} BTC</b>, paid <b>only to the first valid miner</b>.</div>`;
  const cls = `block ${R.id === 3 ? 'tampered' : ''}`;
  if (student) return `<div class="${cls}">${head}${rows.prev}${rows.merkle}${rows.time}${rows.txs}${rows.data}${rows.nonce}${rows.hash}${reward}</div>`;
  return `<div class="${cls}">${head}<div class="bgrid"><div>${rows.prev}${rows.merkle}${rows.time}${rows.txs}</div><div>${rows.data}${rows.nonce}${rows.hash}</div></div>${reward}</div>`;
}

/**
 * After a round ends (End pressed, or the timer reached 0) show the answer in the block:
 * the correct nonce goes into the Nonce field and the equation is filled in. Pass solved=false to restore.
 */
export function applySolved(roundId, solved, student) {
  const $ = id => document.getElementById(id);
  const R = ROUNDS[roundId], S = solutionOf(roundId);
  const f = $('formula'), hv = $('hashVal'), hw = $('hashWork'), badge = $('solBadge');
  const nEl = student ? $('nonce') : $('nonceBox');
  if (!f || !hv || !hw || !nEl) return;
  const was = nEl.dataset.solved === '1';
  if (solved) {
    f.textContent = `last two digits of ( ${MULT} × ${S.nonce} + ${R.data} )  =  last two digits of ${S.raw}  =  ${S.hashStr}`;
    f.classList.add('solved');
    if (student) nEl.value = String(S.nonce); else { nEl.textContent = String(S.nonce); nEl.classList.remove('ph'); nEl.classList.add('solnum'); }
    nEl.dataset.solved = '1';
    hv.textContent = S.hashStr; hv.className = 'hashval ok';
    hw.textContent = `Solution: nonce ${S.nonce} → ${S.working} → hash ${S.hashStr} ✓`;
    badge.classList.remove('hidden');
  } else {
    f.textContent = `last two digits of ( ${MULT} × nonce + ${R.data} )`; f.classList.remove('solved');
    badge.classList.add('hidden');
    if (was) {
      if (student) nEl.value = ''; else { nEl.textContent = 'students type their guess here'; nEl.classList.add('ph'); nEl.classList.remove('solnum'); }
      hv.textContent = student ? '–' : '?'; hv.className = 'hashval'; hw.textContent = '';
    }
    nEl.dataset.solved = '0';
  }
}
