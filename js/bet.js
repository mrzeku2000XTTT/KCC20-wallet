/* 15-minute YES/NO bets. Oracle = KRON idx at window close.
   Stake is KAS locked in a P2SH escrow (agent settle OR user CLTV refund).
   Live ¢ is parimutuel from real stakes, seeded 50/50. This app never holds keys. */
import { kaspaCashaddrDecode, bytesToHex, sameAddrPayload, addrPayload, kaspaRestBase } from './crypto.js?v=100';

export const BET_AGENT_ADDR = 'kaspa:qrtfjhwty4jp0p5203luswhscl63t4lt0aptgz5dezwjkuk2kteyxu7q4sax6';
export const TTT_TICK = 'KKDAG';
export const HIRE_PER_HOUR = 100;
export const SUB_KKDAG = 1000;
export const WINDOW_MS = 15 * 60 * 1000;
export const REFUND_GRACE_MS = 15 * 60 * 1000;
export const POOL_SEED = 1;
export const MAX_HOURS = 8;
export const MAX_HOURS_SUB = 24;
export const BET_FEE_BPS = 200;
export const BET_FEE_MIN_KAS = 0.02;

export function betProtocolFee(stakeKas) {
  const stake = Math.max(0, Number(stakeKas) || 0);
  const pct = stake * BET_FEE_BPS / 10000;
  const fee = Math.max(BET_FEE_MIN_KAS, pct);
  return Math.round(fee * 1e8) / 1e8;
}

/** Public ticket id = truncated kaspa:p covenant address. Never a key. */
export function betIdFromAddr(addr) {
  const s = String(addr || '').trim().toLowerCase();
  const i = s.indexOf(':');
  const body = i >= 0 ? s.slice(i + 1) : s;
  if (body.length < 12) return '';
  return '#' + body.slice(0, 6) + body.slice(-4);
}

export function marketId(tick, start) {
  return String(tick || '').toUpperCase() + ':' + String(start || 0);
}

function withKaspaPrefix(body) {
  const b = String(body || '').trim().toLowerCase();
  if (!b) return '';
  if (b.includes(':')) return b;
  return 'kaspa:' + b;
}

/** Public memo on the fee tx. No keys, no redeem script. */
export function encodeBetNotice(row) {
  const tick = String(row.tick || '').toUpperCase().replace(/\|/g, '');
  const side = row.side === 'yes' ? 'Y' : 'N';
  const sompi = Math.round(Number(row.sizeKas || 0) * 1e8);
  return ['B1', tick, side, String(row.start || 0), String(sompi), addrPayload(row.vaultAddr), addrPayload(row.userAddr), String(row.unlockDaa || 0)].join('|');
}

export function decodeBetNotice(text) {
  const raw = String(text || '').trim();
  const i = raw.indexOf('B1|');
  const s = i >= 0 ? raw.slice(i) : raw;
  const p = s.split('|');
  if (p[0] !== 'B1' || p.length < 8) return null;
  const tick = String(p[1] || '').toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(tick)) return null;
  const start = Number(p[3] || 0);
  const vaultAddr = withKaspaPrefix(p[5]);
  const userAddr = withKaspaPrefix(p[6]);
  if (!vaultAddr.startsWith('kaspa:p') || !userAddr.startsWith('kaspa:q')) return null;
  return {
    tick,
    side: p[2] === 'Y' ? 'yes' : 'no',
    start,
    end: start + WINDOW_MS,
    sizeKas: Number(p[4] || 0) / 1e8,
    vaultAddr,
    userAddr,
    unlockDaa: Number(p[7] || 0),
    betId: betIdFromAddr(vaultAddr),
    public: true
  };
}

export function userPubFromAddr(addr) {
  const d = kaspaCashaddrDecode(addr);
  const bytes = d?.payloadBytes;
  if (!bytes || bytes.length < 32) return '';
  return bytesToHex(bytes.length === 32 ? bytes : bytes.slice(-32));
}

function payloadToText(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.includes('B1|')) return s;
  const hex = s.replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 8 || hex.length % 2) return s;
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const c = parseInt(hex.slice(i, i + 2), 16);
    if (c >= 32 && c < 127) out += String.fromCharCode(c);
  }
  return out;
}

export async function fetchPublicBetTape() {
  const url = kaspaRestBase() + '/addresses/' + encodeURIComponent(BET_AGENT_ADDR)
    + '/full-transactions?limit=50&resolve_previous_outpoints=no';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Bet tape ' + res.status);
  const data = await res.json();
  const txs = Array.isArray(data) ? data : (data.transactions || []);
  const out = [];
  const seen = new Set();
  for (const tx of txs) {
    const inner = tx.transaction || tx;
    const text = payloadToText(inner.payload || tx.payload || '');
    const row = decodeBetNotice(text);
    if (!row || seen.has(row.vaultAddr)) continue;
    seen.add(row.vaultAddr);
    row.txId = inner.transaction_id || tx.transaction_id || inner.txId || tx.txId || '';
    out.push(row);
  }
  return out;
}

export function poolFromTape(notices, tick, start) {
  const t = String(tick || '').toUpperCase();
  const s = Number(start || 0);
  let yesKas = 0, noKas = 0, nYes = 0, nNo = 0;
  for (const n of notices || []) {
    if (n.tick !== t || Number(n.start) !== s) continue;
    const amt = Math.max(0, Number(n.sizeKas || 0));
    if (n.side === 'yes') { yesKas += amt; nYes += 1; }
    else { noKas += amt; nNo += 1; }
  }
  return { tick: t, start: s, yesKas, noKas, nYes, nNo };
}

export function mergeTapeAndLocal(tape, tick, start) {
  const local = loadBetBook().filter(r => r.tick === String(tick || '').toUpperCase() && Number(r.start) === Number(start));
  const map = new Map();
  for (const n of tape || []) {
    if (n.vaultAddr) map.set(String(n.vaultAddr).toLowerCase(), n);
  }
  for (const n of local) {
    const k = String(n.vaultAddr || '').toLowerCase();
    if (k && !map.has(k)) map.set(k, n);
  }
  return [...map.values()];
}

const HIRE_KEY = 'kcc20_bet_hire_v1';
const BOOK_KEY = 'kcc20_bet_book_v1';
const POOL_KEY = 'kcc20_bet_pool_v1';
const INBOX_KEY = 'kcc20_bet_inbox_v1';

export function loadBetHire() {
  try { return JSON.parse(localStorage.getItem(HIRE_KEY) || 'null') || null; } catch { return null; }
}

export function saveBetHire(job) {
  if (!job) localStorage.removeItem(HIRE_KEY);
  else localStorage.setItem(HIRE_KEY, JSON.stringify(job));
}

export function loadBetBook() {
  try { return JSON.parse(localStorage.getItem(BOOK_KEY) || '[]') || []; } catch { return []; }
}

export function saveBetBook(rows) {
  localStorage.setItem(BOOK_KEY, JSON.stringify((rows || []).slice(-80)));
}

function loadPools() {
  try { return JSON.parse(localStorage.getItem(POOL_KEY) || '{}') || {}; } catch { return {}; }
}

function savePools(map) {
  localStorage.setItem(POOL_KEY, JSON.stringify(map || {}));
}

export function poolId(tick, start) {
  return String(tick || '').toUpperCase() + ':' + String(start || 0);
}

export function loadPool(tick, start) {
  const id = poolId(tick, start);
  const row = loadPools()[id];
  return {
    id,
    tick: String(tick || '').toUpperCase(),
    start: Number(start || 0),
    yesKas: Number(row?.yesKas || 0),
    noKas: Number(row?.noKas || 0),
    openPx: Number(row?.openPx || 0),
    nYes: Number(row?.nYes || 0),
    nNo: Number(row?.nNo || 0)
  };
}

export function savePool(pool) {
  const map = loadPools();
  map[pool.id || poolId(pool.tick, pool.start)] = {
    yesKas: Number(pool.yesKas || 0),
    noKas: Number(pool.noKas || 0),
    openPx: Number(pool.openPx || 0),
    nYes: Number(pool.nYes || 0),
    nNo: Number(pool.nNo || 0)
  };
  savePools(map);
  return pool;
}

export function addPoolStake(tick, start, side, kas, openPx) {
  const pool = loadPool(tick, start);
  const amt = Math.max(0, Number(kas) || 0);
  if (amt > 0) {
    if (side === 'yes') { pool.yesKas += amt; pool.nYes += 1; }
    else { pool.noKas += amt; pool.nNo += 1; }
  }
  if (openPx && !pool.openPx) pool.openPx = Number(openPx);
  return savePool(pool);
}

export function yesCentsFromPool(pool) {
  const yes = POOL_SEED + Math.max(0, Number(pool?.yesKas || 0));
  const no = POOL_SEED + Math.max(0, Number(pool?.noKas || 0));
  const tot = yes + no;
  if (!(tot > 0)) return 50;
  const cents = Math.round(100 * yes / tot);
  return Math.max(1, Math.min(99, cents));
}

export function hasOpponent(pool) {
  return Number(pool?.yesKas || 0) > 0 && Number(pool?.noKas || 0) > 0;
}

export function loadBetInbox() {
  try { return JSON.parse(localStorage.getItem(INBOX_KEY) || '[]') || []; } catch { return []; }
}

export function saveBetInbox(rows) {
  localStorage.setItem(INBOX_KEY, JSON.stringify((rows || []).slice(-80)));
}

export function pushBetNotice(ticket) {
  const list = loadBetInbox();
  list.push(ticket);
  saveBetInbox(list);
  return list;
}

export function windowBounds(now = Date.now()) {
  const start = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  return { start, end: start + WINDOW_MS, remainMs: start + WINDOW_MS - now };
}

export function refundAtMs(end) {
  return Number(end || 0) + REFUND_GRACE_MS;
}

export function refundMinutesFromNow(end, now = Date.now()) {
  const ms = refundAtMs(end) - now;
  return Math.max(20, Math.ceil(ms / 60000));
}

export function fmtRemain(ms) {
  const s = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

export function yesCentsFromCandles(candles) {
  const rows = (candles || []).filter(c => Number(c.c) > 0).slice(-8);
  if (rows.length < 2) return 50;
  const a = rows[0].c;
  const b = rows[rows.length - 1].c;
  const chg = (b - a) / a;
  let yes = 50 + chg * 400;
  if (yes < 18) yes = 18;
  if (yes > 82) yes = 82;
  return Math.round(yes);
}

export function kkdagsHeld(holdings) {
  const t = (holdings || []).find(x => String(x.ticker || '').toUpperCase() === TTT_TICK);
  if (!t) return 0;
  const d = Math.max(0, Number(t.decimals || 0));
  return Number(t.balance || 0) / (10 ** d);
}

export function isKcc20Pass(holdings) {
  return kkdagsHeld(holdings) >= SUB_KKDAG;
}

export function hireCost(hours, subscribed) {
  const h = Math.max(1, Math.round(Number(hours) || 1));
  const free = subscribed ? 1 : 0;
  return Math.max(0, (h - free) * HIRE_PER_HOUR);
}

export function maxHireHours(subscribed) {
  return subscribed ? MAX_HOURS_SUB : MAX_HOURS;
}

export function recordBet(row) {
  const list = loadBetBook();
  list.push(row);
  saveBetBook(list);
  pushBetNotice(row);
  return list;
}

export function patchBet(txId, patch) {
  const list = loadBetBook();
  for (const r of list) {
    if (r.txId === txId || r.vaultAddr === patch.vaultAddr) Object.assign(r, patch);
  }
  saveBetBook(list);
  const inbox = loadBetInbox();
  for (const r of inbox) {
    if (r.txId === txId || r.vaultAddr === patch.vaultAddr) Object.assign(r, patch);
  }
  saveBetInbox(inbox);
  return list;
}

export function settleOpenBets(tick, closePx, now = Date.now()) {
  const t = String(tick || '').toUpperCase();
  const list = loadBetBook();
  let n = 0;
  for (const r of list) {
    if (r.tick !== t || r.settled) continue;
    if (Number(r.end) > now) continue;
    const open = Number(r.openPx || 0);
    const close = Number(closePx || 0);
    const up = close > open;
    r.closePx = close;
    r.outcome = up ? 'yes' : 'no';
    r.won = (r.side === 'yes' && up) || (r.side === 'no' && !up);
    if (!r.paidTxId) r.pending = true;
    n += 1;
  }
  saveBetBook(list);
  return n;
}

export function betsForWindow(tick, start) {
  const t = String(tick || '').toUpperCase();
  const s = Number(start || 0);
  return loadBetBook().filter(r => r.tick === t && Number(r.start) === s);
}

export function dueBetGroups(now = Date.now()) {
  const map = new Map();
  for (const r of loadBetBook()) {
    if (r.paid || r.paidTxId) continue;
    if (Number(r.end) > now) continue;
    const id = poolId(r.tick, r.start);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(r);
  }
  return [...map.values()];
}

export function agentPubHex() {
  const d = kaspaCashaddrDecode(BET_AGENT_ADDR);
  const bytes = d?.payloadBytes;
  if (!bytes || bytes.length < 32) throw new Error('Escrow agent address is not a Schnorr kaspa:q key');
  return bytesToHex(bytes.length === 32 ? bytes : bytes.slice(-32));
}

export function isEscrowAgent(addr) {
  return sameAddrPayload(addr, BET_AGENT_ADDR);
}

export function winSideFromPrices(openPx, closePx) {
  return Number(closePx) > Number(openPx) ? 'yes' : 'no';
}
