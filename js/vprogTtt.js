/* Max's vprog-tictactoe DA lobby + TN10 encoder carriers (same as izio). */
import { vprogCreate, vprogJoin, vprogTurn, vprogRollupId, vprogHexKey } from './vprogLane.js?v=1';
import { isTestnet } from './crypto.js?v=100';

const DA_KEY = 'kcc20_vprog_da_v1';
const PUBLIC_DA = 'https://vprogs-tt.izio.fr';
const PROXY = '/vprog-tt';
const GUEST_REPO = 'https://github.com/biryukovmaxim/vprog-tictactoe';

let pollTimer = null;
let lastPaint = '';

export function vprogDaBase() {
  try {
    const raw = String(localStorage.getItem(DA_KEY) || '').trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(raw)) return raw;
  } catch {}
  return '';
}

export function setVprogDaBase(url) {
  const s = String(url || '').trim().replace(/\/+$/, '');
  if (s) localStorage.setItem(DA_KEY, s);
  else localStorage.removeItem(DA_KEY);
}

export function vprogUserId(wallet) {
  let h = String(wallet?.pubKey || '').replace(/^0x/i, '').toLowerCase();
  if (h.length === 66 && (h.startsWith('02') || h.startsWith('03'))) h = h.slice(2);
  return /^[0-9a-f]{64}$/.test(h) ? h : '';
}

function bases() {
  const custom = vprogDaBase();
  const out = [];
  if (custom) out.push(custom);
  out.push(PROXY, PUBLIC_DA);
  return [...new Set(out)];
}

async function getJson(path) {
  let last = 'vProg DA unreachable';
  for (const base of bases()) {
    try {
      const res = await fetch(base + path, { cache: 'no-store' });
      if (!res.ok) {
        last = 'DA HTTP ' + res.status;
        continue;
      }
      return await res.json();
    } catch (e) {
      last = e && e.message ? e.message : String(e);
    }
  }
  throw new Error(last);
}

function gamesOf(body) {
  if (Array.isArray(body?.games)) return body.games;
  if (Array.isArray(body)) return body;
  return [];
}

export async function loadVprogLobby(wallet) {
  const [state, config, open, playing, finished] = await Promise.all([
    getJson('/api/state'),
    getJson('/api/config'),
    getJson('/api/games?status=open&limit=24').then(gamesOf).catch(() => []),
    getJson('/api/games?status=playing&limit=24').then(gamesOf).catch(() => []),
    getJson('/api/games?status=finished&limit=12').then(gamesOf).catch(() => [])
  ]);
  let uid = '';
  try { uid = await vprogRollupId(wallet); } catch {}
  if (!uid) uid = vprogUserId(wallet);
  let account = { exists: false };
  if (uid) {
    try { account = await getJson('/api/accounts/' + uid); } catch { account = { exists: false }; }
  }
  let exits = [];
  try {
    const body = await getJson('/api/exits');
    exits = Array.isArray(body?.roots) ? body.roots : (Array.isArray(body) ? body : []);
  } catch { exits = []; }
  return { state, config, games: { open, playing, finished }, account, uid, exits };
}

function kas(sompi) {
  const n = Number(sompi || 0) / 1e8;
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(n >= 10 ? 2 : 4) + ' KAS';
}

function shortHex(h) {
  const s = String(h || '');
  if (s.length < 14) return s || '—';
  return s.slice(0, 8) + '…' + s.slice(-6);
}

function mark(n) {
  if (Number(n) === 1) return 'X';
  if (Number(n) === 2) return 'O';
  return '';
}

function daIsMyTurn(g, uid) {
  if (Number(g.state) !== 1 || !uid) return false;
  const seat = g.players?.[0] === uid ? 0 : (g.players?.[1] === uid ? 1 : -1);
  if (seat < 0) return false;
  const round = Number(g.round_wins?.[0] || 0) + Number(g.round_wins?.[1] || 0) + Number(g.draws || 0);
  return seatToMove(Number(g.creator_mark || 1), round, g.board || []) === seat;
}

function boardHtml(board, { pending, playable, gameId } = {}) {
  const cells = Array.isArray(board) ? board : [];
  const bits = [];
  for (let i = 0; i < 9; i++) {
    const ghost = pending && pending.cell === i ? ' ttt-cell-wait' : '';
    const can = playable && !cells[i];
    const dis = can ? '' : ' disabled';
    const extra = can ? ` data-vprog-turn="${esc(gameId)}:${i}"` : '';
    bits.push(`<button type="button" class="ttt-cell${ghost}${can ? ' play' : ''}"${dis}${extra}>${mark(cells[i])}</button>`);
  }
  return `<div class="ttt-board">${bits.join('')}</div>`;
}

function gameRow(g, uid, live) {
  const mine = uid && (g.players?.[0] === uid || g.players?.[1] === uid);
  const a = shortHex(g.players?.[0]);
  const b = g.players?.[1] ? shortHex(g.players?.[1]) : 'open seat';
  const join = live && Number(g.state) === 0 && uid && g.players?.[0] !== uid
    ? `<button type="button" class="btn btn-gold" data-vprog-join="${esc(g.id)}">Join ${esc(kas(g.stake))}</button>`
    : '';
  const playable = live && daIsMyTurn(g, uid);
  return `<article class="vprog-game${mine ? ' mine' : ''}" data-vprog-game="${esc(g.id)}">
    <div class="vprog-game-h">
      <b>${esc(g.state_name || 'Game')}</b>
      <span>${esc(kas(g.stake))} · ${Number(g.rounds_total || 1)} round${Number(g.rounds_total) === 1 ? '' : 's'}</span>
    </div>
    ${boardHtml(g.board, { playable, gameId: g.id })}
    <p class="vprog-seats">${esc(a)} vs ${esc(b)}${mine ? ' · you' : ''}${playable ? ' · your turn' : ''}</p>
    ${join}
  </article>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function renderVprogLobby(root, data, { network } = {}) {
  if (!root) return;
  const st = data.state || {};
  const cfg = data.config || {};
  const uid = data.uid || '';
  const acc = data.account || {};
  const tn = String(network || '');
  const live = isTestnet() && !!vprogHexKey(data.wallet);
  const netNote = live
    ? 'TN10 live. Create / Join / tap your turn spends TN10 KAS the same way izio does — PIN signs the carrier, keys stay here.'
    : (/testnet/i.test(tn)
      ? 'TN10 is on, but this chip has no in-app PIN key. Import the hex or use a native wallet to spend.'
      : 'Switch You → Network to testnet-10, then Create / Join with PIN. Mainnet cannot play this lane.');
  const bal = acc.exists && acc.balance != null ? kas(acc.balance) : 'no L2 account yet';
  const open = data.games?.open || [];
  const playing = data.games?.playing || [];
  const finished = data.games?.finished || [];
  const mine = [...open, ...playing, ...finished].filter(g => uid && (g.players?.[0] === uid || g.players?.[1] === uid));
  const html = `
    <p class="muted" style="text-align:left;padding:0 0 10px">${esc(netNote)}</p>
    <div class="kv"><span class="k">Lane</span><span class="v">${esc(shortHex(st.lane_subnet))}</span></div>
    <div class="kv"><span class="k">Covenant</span><span class="v">${esc(shortHex(st.covenant_id))}</span></div>
    <div class="kv"><span class="k">L2 tip</span><span class="v">${esc(st.l2_tip ?? '—')}</span></div>
    <div class="kv"><span class="k">Initialized</span><span class="v">${cfg.initialized ? 'yes' : 'no'}</span></div>
    <div class="kv"><span class="k">Your id</span><span class="v">${uid ? esc(shortHex(uid)) : 'unlock a wallet'}</span></div>
    <div class="kv"><span class="k">L2 bag</span><span class="v">${esc(bal)}</span></div>
    <div class="vprog-acts">
      <button type="button" class="btn btn-glass" id="vprog-copy-id">Copy rollup id</button>
      <button type="button" class="btn btn-glass" id="vprog-copy-dep">Copy deposit addr</button>
      <button type="button" class="btn btn-gold" id="vprog-refresh">Refresh</button>
      ${live ? '<button type="button" class="btn btn-gold" id="vprog-create">Create 0.5 KAS · 3 rounds</button>' : ''}
    </div>
    <p class="muted" style="text-align:left;padding:8px 0 0">Deposit address (covenant P2SH): <code id="vprog-dep">${esc(st.deposit_address || '')}</code></p>
    <h3 class="vprog-h">Your games</h3>
    ${mine.length ? mine.map(g => gameRow(g, uid, live)).join('') : '<p class="empty">No match seated with this key yet.</p>'}
    <h3 class="vprog-h">Open</h3>
    ${open.length ? open.map(g => gameRow(g, uid, live)).join('') : '<p class="empty">No open games.</p>'}
    <h3 class="vprog-h">Playing</h3>
    ${playing.length ? playing.map(g => gameRow(g, uid, live)).join('') : '<p class="empty">No live boards.</p>'}
    <h3 class="vprog-h">Finished</h3>
    ${finished.length ? finished.slice(0, 8).map(g => gameRow(g, uid, live)).join('') : '<p class="empty">No settled matches in this window.</p>'}
    <label class="field" style="margin-top:14px"><span>DA URL (blank = public TN10 lane)</span>
      <input id="vprog-da" type="url" placeholder="${PUBLIC_DA}" value="${esc(vprogDaBase())}">
    </label>
    <button type="button" class="btn btn-glass" id="vprog-save-da">Save DA</button>
  `;
  if (html === lastPaint) return false;
  lastPaint = html;
  root.innerHTML = html;
  return true;
}

export function bindVprogLobby(root, { wallet, toast, onRefresh, onLive }) {
  if (!root) return;
  root.querySelector('#vprog-refresh')?.addEventListener('click', () => onRefresh?.());
  root.querySelector('#vprog-create')?.addEventListener('click', () => onLive?.({ kind: 'create' }));
  root.querySelectorAll('[data-vprog-join]').forEach(btn => {
    btn.addEventListener('click', () => onLive?.({ kind: 'join', gameId: btn.dataset.vprogJoin }));
  });
  root.querySelectorAll('[data-vprog-turn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [gameId, cell] = String(btn.dataset.vprogTurn || '').split(':');
      onLive?.({ kind: 'turn', gameId, cell: Number(cell) });
    });
  });
  root.querySelector('#vprog-copy-id')?.addEventListener('click', async () => {
    const id = vprogUserId(wallet);
    if (!id) { toast?.('Unlock a wallet'); return; }
    try { await navigator.clipboard.writeText(id); toast?.('Rollup id copied'); } catch { toast?.('Copy failed'); }
  });
  root.querySelector('#vprog-copy-dep')?.addEventListener('click', async () => {
    const addr = root.querySelector('#vprog-dep')?.textContent || '';
    if (!addr) { toast?.('No deposit address yet'); return; }
    try { await navigator.clipboard.writeText(addr); toast?.('Deposit address copied'); } catch { toast?.('Copy failed'); }
  });
  root.querySelector('#vprog-save-da')?.addEventListener('click', () => {
    setVprogDaBase(root.querySelector('#vprog-da')?.value || '');
    lastPaint = '';
    toast?.(vprogDaBase() ? 'DA saved' : 'Using public TN10 lane');
    onRefresh?.();
  });
}

/* Guest rules from biryukovmaxim/vprog-tictactoe guest/src/program/rules.rs
   (Cell 0 empty / 1 X / 2 O; State 1 Playing / 2 First / 3 Second / 4 Draw). */
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];
const STAKE = 50_000_000; // 0.5 KAS, same default as ttflow / CreatePanel

function plies(board) {
  let n = 0;
  for (const c of board) if (c) n++;
  return n;
}
function winner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return 0;
}
function boardFull(board) {
  return plies(board) === 9;
}
function otherMark(m) {
  return m === 1 ? 2 : 1;
}
function markForSeat(creatorMark, round, seat) {
  const creatorPlaysOwn = round % 2 === 0;
  if (seat === 0) return creatorPlaysOwn ? creatorMark : otherMark(creatorMark);
  if (seat === 1) return creatorPlaysOwn ? otherMark(creatorMark) : creatorMark;
  return 0;
}
function toMoveMark(board) {
  return plies(board) % 2 === 0 ? 1 : 2;
}
function seatToMove(creatorMark, round, board) {
  return markForSeat(creatorMark, round, 0) === toMoveMark(board) ? 0 : 1;
}
function matchOutcome(roundsTotal, roundWins, draws) {
  const w0 = roundWins[0];
  const w1 = roundWins[1];
  const completed = w0 + w1 + draws;
  const remaining = Math.max(0, roundsTotal - completed);
  if (w0 > w1 + remaining) return 2;
  if (w1 > w0 + remaining) return 3;
  if (remaining === 0) return w0 > w1 ? 2 : (w1 > w0 ? 3 : 4);
  return 0;
}
function roundIndex(g) {
  return g.round_wins[0] + g.round_wins[1] + g.draws;
}

function freshMatch(roundsTotal, creatorMark) {
  return {
    stake: STAKE,
    pot: STAKE * 2,
    rounds_total: roundsTotal,
    creator_mark: creatorMark,
    round_wins: [0, 0],
    draws: 0,
    board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    state: 1
  };
}

let match = freshMatch(3, 1);

function applyTurn(g, cell, seat) {
  if (g.state !== 1) return 'Match over';
  if (cell < 0 || cell > 8 || g.board[cell]) return 'Cell taken';
  const round = roundIndex(g);
  if (seatToMove(g.creator_mark, round, g.board) !== seat) return 'Not your turn';
  const next = g.board.slice();
  next[cell] = toMoveMark(g.board);
  g.board = next;
  const w = winner(g.board);
  if (w || boardFull(g.board)) {
    if (w === markForSeat(g.creator_mark, round, 0)) g.round_wins[0] += 1;
    else if (w === markForSeat(g.creator_mark, round, 1)) g.round_wins[1] += 1;
    else g.draws += 1;
    g.board = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const end = matchOutcome(g.rounds_total, g.round_wins, g.draws);
    if (end) g.state = end;
  }
  return '';
}

function scorpionTurn(g) {
  if (g.state !== 1) return;
  const round = roundIndex(g);
  if (seatToMove(g.creator_mark, round, g.board) !== 1) return;
  const markNow = toMoveMark(g.board);
  const empty = [];
  for (let i = 0; i < 9; i++) if (!g.board[i]) empty.push(i);
  const tryWin = (who) => {
    for (const i of empty) {
      const t = g.board.slice();
      t[i] = who;
      if (winner(t) === who) return i;
    }
    return -1;
  };
  let i = tryWin(markNow);
  if (i < 0) i = tryWin(otherMark(markNow));
  if (i < 0 && g.board[4] === 0) i = 4;
  if (i < 0) {
    const corners = [0, 2, 6, 8].filter(c => g.board[c] === 0);
    i = corners.length ? corners[Math.floor(Math.random() * corners.length)] : empty[0];
  }
  applyTurn(g, i, 1);
}

function playStatus(g) {
  const round = roundIndex(g);
  if (g.state === 2) return 'You win the pot';
  if (g.state === 3) return 'Scorpion wins the pot';
  if (g.state === 4) return 'Draw — stakes split back (' + kas(g.stake) + ' each)';
  const seat = seatToMove(g.creator_mark, round, g.board);
  const m = toMoveMark(g.board) === 1 ? 'X' : 'O';
  return seat === 0 ? 'Your turn (' + m + ')' : 'Scorpion (' + m + ')';
}

function paintPlay(root, toast) {
  if (!root) return;
  const g = match;
  const round = roundIndex(g);
  const bits = [];
  const myTurn = g.state === 1 && seatToMove(g.creator_mark, round, g.board) === 0;
  for (let i = 0; i < 9; i++) {
    const on = g.board[i] ? ' on' : '';
    const wait = myTurn && !g.board[i] ? '' : ' wait';
    bits.push(`<button type="button" class="ttt-cell play${on}${wait}" data-play-cell="${i}">${mark(g.board[i])}</button>`);
  }
  const over = g.state >= 2;
  root.innerHTML = `
    <ol class="vprog-how">
      <li>Rules drill on this phone (no KAS). Live TN10 is below: Create / Join / tap your turn spends testnet KAS with PIN, same encoder as izio.</li>
      <li>You are seat 0 here. Scorpion is seat 1. X opens every round; marks swap on odd rounds; early clinch; draw splits the displayed stake.</li>
    </ol>
    <div class="vprog-play-card">
      <div class="vprog-game-h"><b>Practice · TN10 rules</b><span>${esc(playStatus(g))}</span></div>
      <p class="vprog-seats">Round ${round + (over ? 0 : 1)} / ${g.rounds_total} · you ${g.round_wins[0]}–${g.round_wins[1]} scorpion · draws ${g.draws} · pot ${esc(kas(g.pot))}</p>
      <div class="ttt-board play">${bits.join('')}</div>
      <div class="vprog-acts">
        <label class="vprog-mini">Rounds
          <select id="vprog-rounds">
            <option value="1"${g.rounds_total === 1 ? ' selected' : ''}>1</option>
            <option value="3"${g.rounds_total === 3 ? ' selected' : ''}>3</option>
            <option value="5"${g.rounds_total === 5 ? ' selected' : ''}>5</option>
          </select>
        </label>
        <label class="vprog-mini">Your mark
          <select id="vprog-mark">
            <option value="1"${g.creator_mark === 1 ? ' selected' : ''}>X (open round 1)</option>
            <option value="2"${g.creator_mark === 2 ? ' selected' : ''}>O (joiner opens)</option>
          </select>
        </label>
        <button type="button" class="btn btn-glass" id="vprog-new">New match</button>
      </div>
    </div>
    <h3 class="vprog-h">Live TN10 lane</h3>
  `;
  root.querySelector('#vprog-new')?.addEventListener('click', () => {
    const rounds = Number(root.querySelector('#vprog-rounds')?.value || 3);
    const cm = Number(root.querySelector('#vprog-mark')?.value || 1);
    match = freshMatch(rounds === 1 || rounds === 5 ? rounds : 3, cm === 2 ? 2 : 1);
    scorpionTurn(match);
    paintPlay(root, toast);
  });
  root.querySelector('#vprog-rounds')?.addEventListener('change', () => {});
  root.querySelectorAll('[data-play-cell]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.playCell);
      const err = applyTurn(match, i, 0);
      if (err) { toast?.(err); return; }
      scorpionTurn(match);
      paintPlay(root, toast);
      if (match.state === 2) toast?.('You win the pot');
      else if (match.state === 3) toast?.('Scorpion wins the pot');
      else if (match.state === 4) toast?.('Draw — stakes split back');
    });
  });
}

export function renderVprogPlay(root) {
  paintPlay(root);
}

export function bindVprogPlay(root, { toast } = {}) {
  paintPlay(root, toast);
}

export function startVprogPoll(tick, ms = 8000) {
  stopVprogPoll();
  pollTimer = setInterval(() => { try { tick(); } catch {} }, ms);
}

export function stopVprogPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  lastPaint = '';
}
