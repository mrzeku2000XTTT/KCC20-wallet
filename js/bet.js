/* 15-minute YES/NO trade bets. Oracle = KRON idx. Hire fee is a real KKDAG send.
   This wallet never holds bet funds. Winning is an AMM trade the user (or hired agent) signs. */
export const BET_AGENT_ADDR = 'kaspa:qrtfjhwty4jp0p5203luswhscl63t4lt0aptgz5dezwjkuk2kteyxu7q4sax6';
export const TTT_TICK = 'KKDAG';
export const HIRE_PER_HOUR = 100;
export const SUB_KKDAG = 1000;
export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_HOURS = 8;
export const MAX_HOURS_SUB = 24;

const HIRE_KEY = 'kcc20_bet_hire_v1';
const BOOK_KEY = 'kcc20_bet_book_v1';

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
  localStorage.setItem(BOOK_KEY, JSON.stringify((rows || []).slice(-40)));
}

export function windowBounds(now = Date.now()) {
  const start = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  return { start, end: start + WINDOW_MS, remainMs: start + WINDOW_MS - now };
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
    r.settled = true;
    r.won = (r.side === 'yes' && up) || (r.side === 'no' && !up);
    n += 1;
  }
  saveBetBook(list);
  return n;
}
