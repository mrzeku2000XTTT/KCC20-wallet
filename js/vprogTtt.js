/* Max's vprog-tictactoe DA lobby (biryukovmaxim/vprog-tictactoe).
   Reads the testing lane. Create/Join/Turn stay encoder-wasm carriers;
   this wallet shows live state and the PIN key's rollup id. */
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
  const uid = vprogUserId(wallet);
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

function boardHtml(board, pending) {
  const cells = Array.isArray(board) ? board : [];
  const bits = [];
  for (let i = 0; i < 9; i++) {
    const ghost = pending && pending.cell === i ? ' ttt-cell-wait' : '';
    bits.push(`<button type="button" class="ttt-cell${ghost}" data-vprog-cell="${i}" disabled>${mark(cells[i])}</button>`);
  }
  return `<div class="ttt-board">${bits.join('')}</div>`;
}

function gameRow(g, uid) {
  const mine = uid && (g.players?.[0] === uid || g.players?.[1] === uid);
  const a = shortHex(g.players?.[0]);
  const b = g.players?.[1] ? shortHex(g.players?.[1]) : 'open seat';
  return `<article class="vprog-game${mine ? ' mine' : ''}" data-vprog-game="${esc(g.id)}">
    <div class="vprog-game-h">
      <b>${esc(g.state_name || 'Game')}</b>
      <span>${esc(kas(g.stake))} · ${Number(g.rounds_total || 1)} round${Number(g.rounds_total) === 1 ? '' : 's'}</span>
    </div>
    ${boardHtml(g.board)}
    <p class="vprog-seats">${esc(a)} vs ${esc(b)}${mine ? ' · you' : ''}</p>
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
  const netNote = /testnet/i.test(tn)
    ? 'This wallet is on TN10 — same net as the public testing lane.'
    : 'This wallet is on mainnet. The public testing lane is TN10 (kaspatest). Switch Network in You to sit on the same chain.';
  const bal = acc.exists && acc.balance != null ? kas(acc.balance) : 'no L2 account yet';
  const open = data.games?.open || [];
  const playing = data.games?.playing || [];
  const finished = data.games?.finished || [];
  const mine = [...open, ...playing, ...finished].filter(g => uid && (g.players?.[0] === uid || g.players?.[1] === uid));
  const html = `
    <p class="build-lede">Kaspa vProgs tic-tac-toe testing lane. Two players lock a stake, play, a RISC0 guest settles the pot. Repo: <a href="${GUEST_REPO}" target="_blank" rel="noopener">biryukovmaxim/vprog-tictactoe</a>.</p>
    <p class="muted" style="text-align:left;padding:0 0 10px">${esc(netNote)} Create / join / turn are encoder-wasm carriers — Scorpion shows the live DA and your PIN key's rollup id. Keys stay here.</p>
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
    </div>
    <p class="muted" style="text-align:left;padding:8px 0 0">Deposit address (covenant P2SH): <code id="vprog-dep">${esc(st.deposit_address || '')}</code></p>
    <h3 class="vprog-h">Your games</h3>
    ${mine.length ? mine.map(g => gameRow(g, uid)).join('') : '<p class="empty">No match seated with this key yet.</p>'}
    <h3 class="vprog-h">Open</h3>
    ${open.length ? open.map(g => gameRow(g, uid)).join('') : '<p class="empty">No open games.</p>'}
    <h3 class="vprog-h">Playing</h3>
    ${playing.length ? playing.map(g => gameRow(g, uid)).join('') : '<p class="empty">No live boards.</p>'}
    <h3 class="vprog-h">Finished</h3>
    ${finished.length ? finished.slice(0, 8).map(g => gameRow(g, uid)).join('') : '<p class="empty">No settled matches in this window.</p>'}
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

export function bindVprogLobby(root, { wallet, toast, onRefresh }) {
  if (!root) return;
  root.querySelector('#vprog-refresh')?.addEventListener('click', () => onRefresh?.());
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

export function startVprogPoll(tick, ms = 8000) {
  stopVprogPoll();
  pollTimer = setInterval(() => { try { tick(); } catch {} }, ms);
}

export function stopVprogPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  lastPaint = '';
}
