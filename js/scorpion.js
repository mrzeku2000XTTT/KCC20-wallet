/* Scorpion — local covenant++ translator. Turns Kaspa txs into plain English. */

const P2SH = /^kaspa:p/i;
const P2PK = /^kaspa:q/i;
const TXID_RE = /\b[0-9a-fA-F]{64}\b/;

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function inputAddr(i) {
  return i?.previous_outpoint_address
    || i?.previousOutpointAddress
    || i?.previous_outpoint_resolved?.script_public_key_address
    || '';
}

function inputAmt(i) {
  return n(
    i?.previous_outpoint_amount
    ?? i?.previousOutpointAmount
    ?? i?.previous_outpoint_resolved?.amount
  );
}

function outputAddr(o) {
  return o?.script_public_key_address || o?.scriptPublicKeyAddress || '';
}

function txIdOf(tx) {
  return tx?.transaction_id || tx?.transactionId || tx?.txid || '';
}

function hexToUtf8(hex) {
  const h = String(hex || '').replace(/^0x/i, '').replace(/\s/g, '');
  if (!h || h.length % 2) return '';
  try {
    const bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function parseKrc20(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    const p = String(obj.p || obj.protocol || '').toLowerCase();
    if (p === 'krc-20' || p === 'krc20') return obj;
    return null;
  } catch {
    return null;
  }
}

function findPayload(tx) {
  const raw = tx?.payload || tx?.payload_hex || tx?.verboseData?.payload || '';
  const text = hexToUtf8(raw) || String(raw || '');
  const krc = parseKrc20(text);
  if (krc) return { kind: 'krc20', text, json: krc };
  if (/kcc-?20/i.test(text)) return { kind: 'kcc20', text, json: parseKrc20(text) };
  if (text && /[a-zA-Z]{3,}/.test(text)) return { kind: 'data', text, json: null };
  return null;
}

function matchVault(addr, vaults) {
  if (!addr) return null;
  return (vaults || []).find(v => v.address === addr) || null;
}

function scriptClass(addr) {
  if (P2SH.test(addr)) return 'P2SH covenant (kaspa:p…)';
  if (P2PK.test(addr)) return 'P2PK key address (kaspa:q…)';
  return addr ? 'Unknown script' : '—';
}

function fmtKas(sompi) {
  const x = n(sompi) / 1e8;
  if (!x) return '0 KAS';
  const s = x.toFixed(8).replace(/\.?0+$/, '');
  return `${s} KAS`;
}

function fmtTime(ms) {
  if (!ms) return 'pending / unknown time';
  try { return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'); }
  catch { return String(ms); }
}

export function kindLabel(kind) {
  const map = {
    receive: 'Incoming KAS',
    send: 'Outgoing KAS',
    compound: 'UTXO compound',
    lock: 'Covenant lock',
    unlock: 'Covenant sweep',
    krc20: 'KRC-20 token tx',
    kcc20: 'KCC20 token tx',
    escrow: 'Escrow covenant',
    multisig: 'Multisig covenant',
    timelock: 'Time-capsule lock',
    self: 'Self-spend',
    unknown: 'Unclassified'
  };
  return map[kind] || kind;
}

/**
 * Covenant++ decode: direction, script class, vault product, fee, change, payload.
 */
export function explainTransaction(tx, ctx = {}) {
  const my = ctx.address || '';
  const vaults = ctx.vaults || [];
  const inputs = tx?.inputs || [];
  const outputs = tx?.outputs || [];
  const id = txIdOf(tx);
  const spent = inputs.filter(i => inputAddr(i) === my).reduce((a, i) => a + inputAmt(i), 0);
  const weSpent = inputs.some(i => inputAddr(i) === my);
  const received = outputs.filter(o => outputAddr(o) === my).reduce((a, o) => a + n(o.amount), 0);
  const toOthers = outputs.filter(o => outputAddr(o) && outputAddr(o) !== my);
  const sentToOthers = toOthers.reduce((a, o) => a + n(o.amount), 0);
  const change = weSpent ? received : 0;
  const fee = spent > 0 ? Math.max(0, spent - received - sentToOthers) : 0;
  const p2shOuts = toOthers.filter(o => P2SH.test(outputAddr(o)));
  const p2shIns = inputs.filter(i => P2SH.test(inputAddr(i)));
  const vaultOut = p2shOuts.map(o => matchVault(outputAddr(o), vaults)).find(Boolean);
  const vaultIn = p2shIns.map(i => matchVault(inputAddr(i), vaults)).find(Boolean);
  const payload = findPayload(tx);
  const inCount = inputs.length;
  const outCount = outputs.length;
  const allOutSelf = outputs.length > 0 && outputs.every(o => outputAddr(o) === my);
  const counterparties = [...new Set(toOthers.map(o => outputAddr(o)).filter(Boolean))];
  const fromAddrs = [...new Set(inputs.map(inputAddr).filter(Boolean))];

  let kind = 'unknown';
  if (payload?.kind === 'krc20') kind = 'krc20';
  else if (payload?.kind === 'kcc20') kind = 'kcc20';
  else if (p2shIns.length && received > 0) kind = 'unlock';
  else if (weSpent && p2shOuts.length) {
    const t = (vaultOut?.type || '').toLowerCase();
    if (t === 'escrow') kind = 'escrow';
    else if (t === 'multisig') kind = 'multisig';
    else if (t === 'timelock' || vaultOut) kind = 'timelock';
    else kind = 'lock';
  } else if (weSpent && allOutSelf && inCount > 1) kind = 'compound';
  else if (weSpent && counterparties.length === 0) kind = 'self';
  else if (weSpent) kind = 'send';
  else if (received > 0) kind = 'receive';

  const amount = kind === 'unlock' ? received
    : kind === 'receive' ? received
    : kind === 'compound' || kind === 'self' ? received
    : p2shOuts.length ? n(p2shOuts[0].amount)
    : (spent > 0 ? Math.max(0, spent - received) : sentToOthers);

  const product = vaultOut || vaultIn;
  const productName = product
    ? (product.name || product.type || 'vault')
    : (p2shOuts.length || p2shIns.length ? 'unknown P2SH covenant' : 'none');

  let headline = 'This is a Kaspa transaction.';
  if (kind === 'receive') headline = `Someone sent you ${fmtKas(amount)}. This is a normal incoming payment to your key — not a vault.`;
  else if (kind === 'send') headline = `You sent ${fmtKas(amount)} to another Kaspa address. Change came back to you; the network kept a small Toccata fee.`;
  else if (kind === 'compound') headline = `You merged ${inCount} coins into one UTXO. Balance stayed in this wallet minus the fee. Nothing left the account.`;
  else if (kind === 'self') headline = `You spent to yourself. This is a self-send / regroup, not a payment to someone else.`;
  else if (kind === 'timelock' || kind === 'lock') headline = `You locked ${fmtKas(amount)} into a P2SH covenant (time capsule). The coins sit at a kaspa:p… script until the timer, then this wallet can sweep them back.`;
  else if (kind === 'escrow') headline = `You funded an escrow covenant with ${fmtKas(amount)}. Release or refund needs the escrow script — not a plain send.`;
  else if (kind === 'multisig') headline = `You funded a 2-of-2 multisig covenant with ${fmtKas(amount)}. Both keys must sign to move it.`;
  else if (kind === 'unlock') headline = `A covenant just unlocked. ${fmtKas(amount)} returned to your wallet after the script succeeded (minus the sweep fee).`;
  else if (kind === 'krc20') {
    const op = payload.json?.op || 'transfer';
    const tick = payload.json?.tick || payload.json?.ticker || 'token';
    headline = `This is a Kasplex KRC-20 ${op} for ${String(tick).toUpperCase()}, not a plain KAS payment. The KAS amount is the carrier; the token lives in the payload.`;
  } else if (kind === 'kcc20') headline = `This looks like a KCC20 covenant-token move. The value is in the covenant cell, not just the KAS output.`;

  const next = kind === 'timelock' || kind === 'lock'
    ? 'Wait for the unlock DAA / timer, then Sweep. Do not send extra KAS into that p-address unless you mean to top up the capsule.'
    : kind === 'unlock'
      ? 'The capsule is empty after a successful sweep. Check Home — the KAS should be spendable again.'
      : kind === 'compound'
        ? 'Next send or lock will use the single UTXO and should be cheaper on storage mass.'
        : kind === 'krc20'
          ? 'Token balance is tracked by Kasplex / KasWare, not by the raw KAS number on this row.'
          : kind === 'send'
            ? 'If the destination was a kaspa:p… address you do not control, those coins are in a script you cannot sweep without the redeem path.'
            : kind === 'receive'
              ? 'The coins are already yours. No extra confirm step in this wallet.'
              : 'Open the explorer link if you want the raw hex.';

  const factors = [
    { k: 'Kind', v: kindLabel(kind) },
    { k: 'Plain meaning', v: headline },
    { k: 'Amount', v: fmtKas(amount) },
    { k: 'Network fee', v: fee ? fmtKas(fee) + ' (Toccata compute mass)' : 'Paid by someone else / none visible' },
    { k: 'Change back to you', v: change ? fmtKas(change) : 'None' },
    { k: 'From', v: fromAddrs.slice(0, 3).join('\n') || '—' },
    { k: 'To', v: (counterparties.length ? counterparties : (allOutSelf ? [my] : [])).slice(0, 3).join('\n') || '—' },
    { k: 'Your script', v: scriptClass(my) },
    { k: 'Covenant class', v: (p2shOuts.length || p2shIns.length) ? 'P2SH / covenant++' : 'No P2SH — plain key spend' },
    { k: 'Vault product', v: productName },
    { k: 'Inputs → outputs', v: `${inCount} in · ${outCount} out` },
    { k: 'Time', v: fmtTime(tx?.block_time || tx?.blockTime) },
    { k: 'Txid', v: id || '—' }
  ];
  if (product?.unlockDaa) factors.splice(10, 0, { k: 'Unlock DAA', v: String(product.unlockDaa) });
  if (payload?.json) {
    const j = payload.json;
    factors.push({ k: 'Token protocol', v: String(j.p || payload.kind) });
    if (j.op) factors.push({ k: 'Token op', v: String(j.op) });
    if (j.tick || j.ticker) factors.push({ k: 'Ticker', v: String(j.tick || j.ticker).toUpperCase() });
    if (j.amt) factors.push({ k: 'Token amount', v: String(j.amt) });
  }

  const bullets = [
    kind === 'lock' || kind === 'timelock' || kind === 'escrow' || kind === 'multisig'
      ? 'This is covenant++, not a normal payment — the destination is a script hash.'
      : 'This is a standard key-path Kaspa transaction.',
    fee ? `Fee ${fmtKas(fee)} is burned to the network, not sent to the other party.` : 'No fee was paid from this wallet on this tx.',
    change ? `${fmtKas(change)} came back as change to keep leftover UTXOs from being absorbed into a vault.` : 'No change output to you.',
    inCount > 3 ? `Used ${inCount} inputs — compounding later will shrink this.` : `${inCount} input(s), ${outCount} output(s).`
  ];

  return {
    kind,
    title: kindLabel(kind),
    headline,
    next,
    amount,
    fee,
    id,
    factors,
    bullets,
    payload
  };
}

export function explainMany(txs, ctx, limit = 5) {
  return (txs || []).slice(0, limit).map(tx => explainTransaction(tx, ctx));
}

function findTx(txs, id) {
  const want = String(id || '').toLowerCase();
  return (txs || []).find(t => txIdOf(t).toLowerCase() === want) || null;
}

export async function scorpionAnswer(query, ctx = {}) {
  const q = String(query || '').trim();
  const txs = ctx.txs || [];
  const address = ctx.address || '';
  const vaults = ctx.vaults || [];
  const fetchTx = ctx.fetchTx;

  if (!q || /^(help|hi|hello|what can you|who are you)/i.test(q)) {
    return {
      kind: 'help',
      title: 'Scorpion',
      headline: 'I read Kaspa transactions in plain English — sends, receives, time capsules, sweeps, compounds, KRC-20 and KCC20.',
      next: 'Paste a 64-character txid, a kaspa.stream link, or ask “what was my last lock?”',
      factors: [
        { k: 'Wallet', v: address || 'none yet' },
        { k: 'Vaults I know', v: String(vaults.length) },
        { k: 'Recent txs loaded', v: String(txs.length) }
      ],
      bullets: [
        'Lock / time capsule = coins parked in a kaspa:p… P2SH script until DAA.',
        'Sweep / unlock = the redeem path that returns those coins to your kaspa:q… key.',
        'Compound = many UTXOs merged to one; your balance does not leave.',
        'KRC-20 = token payload on Kasplex. KCC20 = covenant token cells (KRON, KKDAG…).'
      ]
    };
  }

  if (/my address|who am i|profile|show address/i.test(q)) {
    return {
      kind: 'profile',
      title: 'Your Kaspa',
      headline: address
        ? `This device holds a Schnorr key. Incoming KAS must be sent to the address below.`
        : 'No wallet on this device yet. Create or import one first.',
      next: 'Use Receive to show a QR. Never paste the private key into a website.',
      factors: [
        { k: 'Address', v: address || '—' },
        { k: 'Script', v: scriptClass(address) }
      ],
      bullets: []
    };
  }

  const urlId = q.match(/transactions?\/([0-9a-fA-F]{64})/i);
  const hexId = q.match(TXID_RE);
  const id = (urlId && urlId[1]) || (hexId && hexId[0]) || '';
  if (id) {
    let tx = findTx(txs, id);
    if (!tx && fetchTx) {
      try { tx = await fetchTx(id); } catch { tx = null; }
    }
    if (!tx) {
      return {
        kind: 'unknown',
        title: 'Not in cache',
        headline: `I do not have ${id.slice(0, 12)}… loaded yet. Open Activity so Scorpion can pull your recent txs, or check the explorer.`,
        next: 'Pull-to-refresh Activity, then tap the row.',
        factors: [{ k: 'Txid', v: id }],
        bullets: []
      };
    }
    return explainTransaction(tx, { address, vaults });
  }

  const wantLock = /\b(lock|vault|capsule|covenant|p2sh)\b/i.test(q);
  const wantSweep = /\b(sweep|unlock|redeem)\b/i.test(q);
  const wantSend = /\b(send|sent|pay|paid)\b/i.test(q);
  const wantRecv = /\b(receiv|got|incoming)\b/i.test(q);
  const filtered = txs.filter(tx => {
    const e = explainTransaction(tx, { address, vaults });
    if (wantLock) return ['lock', 'timelock', 'escrow', 'multisig'].includes(e.kind);
    if (wantSweep) return e.kind === 'unlock';
    if (wantSend) return e.kind === 'send';
    if (wantRecv) return e.kind === 'receive';
    return true;
  });
  const pick = filtered[0] || txs[0];
  if (!pick) {
    return {
      kind: 'help',
      title: 'No transactions yet',
      headline: 'This address has no txs loaded. Receive KAS or open Activity after a refresh.',
      next: 'Once a tx lands, tap it — Scorpion will translate every factor.',
      factors: [{ k: 'Address', v: address || '—' }],
      bullets: []
    };
  }
  const expl = explainTransaction(pick, { address, vaults });
  if (wantLock || wantSweep || wantSend || wantRecv) {
    expl.headline = `Latest match — ${expl.headline}`;
  } else {
    expl.headline = `Your most recent tx: ${expl.headline}`;
  }
  return expl;
}
