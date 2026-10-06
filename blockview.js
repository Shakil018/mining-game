// Renders the example block shown to students and on the teacher screen.
import { ROUNDS, MULT, SUBSIDY, fmtBTC } from './logic.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function blockHTML(roundId, mode) {
  const R = ROUNDS[roundId], B = R.block, student = mode === 'student';
  const txs = B.txs.map(t =>
    `<div class="tx${t.edited ? ' edited' : ''}">${esc(t.from)} → ${esc(t.to)} <b>${t.btc} BTC</b>${t.edited ? ' <em>edited</em>' : ''}</div>`).join('');
  const nonceCell = student
    ? `<form id="tryForm" class="nform" autocomplete="off" novalidate>
         <input id="nonce" inputmode="numeric" pattern="[0-9]*" maxlength="7" placeholder="nonce" aria-label="Nonce">
         <button class="btn" id="tryBtn" type="submit">Mine</button>
       </form>`
    : `<span class="ph">students type their guess here</span>`;
  const rows = {
    prev: `<div class="brow"><span class="bl">Previous hash</span><span class="bv mono">${B.prev}</span></div>`,
    merkle: `<div class="brow"><span class="bl">Merkle root</span><span class="bv mono${R.id === 3 ? ' changed' : ''}">${B.merkle}</span></div>`,
    time: `<div class="brow"><span class="bl">Timestamp</span><span class="bv">${B.time}</span></div>`,
    txs: `<div class="brow"><span class="bl">Transactions</span><span class="bv"><b>${B.count}</b> transactions moving <b>${B.volume} BTC</b>${txs}<div class="more">+ ${B.more} more</div></span></div>`,
    data: `<div class="brow data"><span class="bl">Data hash</span><span class="bv"><span class="bigdata">${R.data}</span><small>${R.id === 3 ? 'was 68 before the edit' : 'the number in the hash formula'}</small></span></div>`,
    nonce: `<div class="brow nonce"><span class="bl">Nonce</span><span class="bv">${nonceCell}</span></div>`,
    hash: `<div class="brow hash"><span class="bl">Hash</span><span class="bv">
      <div class="formula">last two digits of ( ${MULT} × nonce + ${R.data} )</div>
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
