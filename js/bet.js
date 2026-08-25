/* 15-minute YES/NO bets. Oracle = KRON idx at window close.
   Stake is KAS locked in a P2SH escrow (agent settle OR user CLTV refund).
   Live ¢ is parimutuel from real stakes, seeded 50/50. This app never holds keys. */
import { kaspaCashaddrDecode, bytesToHex, sameAddrPayload } from './crypto.js?v=100';

export const BET_AGENT_ADDR = 'kaspa:qrtfjhwty4jp0p5203luswhscl63t4lt0aptgz5dezwjkuk2kteyxu7q4sax6';
export const TTT_TICK = 'KKDAG';
export const HIRE_PER_HOUR = 100;
export const SUB_KKDAG = 1000;
export const WINDOW_MS = 15 * 60 * 1000;
export const REFUND_GRACE_MS = 15 * 60 * 1000;
export const POOL_SEED = 1;
export const MAX_HOURS = 8;
export const MAX_HOURS_SUB = 24;

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
