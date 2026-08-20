import {
  loadCryptoLibs, generatePrivateKey, createKeypairFromHex,
  isValidKaspaAddress, shortAddr, hexToBytes, privKeyToHex, derivePublicKey, kaspaAddressFromPubkey, bytesToHex
} from './crypto.js';
import {
  NATIVE_KAS, VAULT_PRODUCTS, loadWatchlist, addToken, removeToken,
  loadVaults, saveVault, updateVault, formatAmount
} from './kcc20.js';
import { parseIntent, describeIntent, askFor, parseDurationField } from './intent.js';
import { payloadFromAddress } from './script.js';
import {
  sendKas, fetchAddressUtxos, fetchAddressBalance, loadKaspaSdk,
  buildTimelockCovenant, buildEscrowCovenant, buildMultisigCovenant, currentDaa,
  pingPublicNode, sweepVault, toRpcTransaction, p2shSpendScript, planKasPayment, storageMassOk
} from './tx.js';

function errText(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.message || e.toString?.() || String(e);
}

function productForIntent(intent) {
  if (intent.type === 'timelock') return VAULT_PRODUCTS.find(p => p.id === 'timelock');
  return VAULT_PRODUCTS.find(p => p.id === intent.type)
    || { id: intent.type, name: intent.type, type: intent.type };
}

const API_BASE = 'https://api.kaspa.org';
const BACKEND_URL = 'https://base44.app/api/apps/6a444b036408e68ec8d6f2a6/functions';
const STORE_KEY = 'kcc20_wallet_v1';
const LEGACY_KEY = 'scorpion_wallet';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let wallet = null;
let utxos = [];
let price = 0;
let balanceSompi = 0;
let currentTab = 'home';
let sheetConfirm = null;
let lastIntent = null;
let buildSeq = 0;
let liveTimer = null;
let liveFast = false;
let seenBalance = null;
let receiveWatch = false;
let lastDaa = 0;
let lastDaaAt = 0;
let lastAutoSweep = 0;
let autoSweepBusy = false;
const autoSweepTried = new Set();

function haptic() { try { navigator.vibrate?.(12); } catch {} }

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = String(msg ?? '');
  $('phone').appendChild(el);
  const ms = String(msg || '').length > 80 ? 8000 : 3200;
  setTimeout(() => el.remove(), ms);
}

function remainingLockSec(unlockDaa) {
  const u = Number(unlockDaa || 0);
  if (!u) return 0;
  if (!lastDaa) return null;
  const base = (u - lastDaa) / 10;
  const elapsed = lastDaaAt ? (Date.now() - lastDaaAt) / 1000 : 0;
  return Math.max(0, Math.ceil(base - elapsed));
}

function formatLockClock(sec) {
  if (sec == null) return '…';
  if (sec <= 0) return 'Unlocked';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function unlockAtUtc(sec) {
  if (sec == null || sec <= 0) return 'now';
  const d = new Date(Date.now() + sec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

function setClock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  if ($('clock')) $('clock').textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
  tickLockLabels();
}

function tickLockLabels() {
  document.querySelectorAll('[data-unlock-daa]').forEach(el => {
    el.textContent = formatLockClock(remainingLockSec(el.dataset.unlockDaa));
  });
  const live = $('lock-timer-live');
  if (!live) return;
  const sec = remainingLockSec(live.dataset.unlockDaa);
  live.textContent = formatLockClock(sec);
  const at = $('lock-timer-utc');
  if (at) at.textContent = unlockAtUtc(sec);
  if (sec === 0 && live.dataset.addr && live.dataset.fired !== '1') {
    live.dataset.fired = '1';
    maybeAutoUnlock();
  }
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
  currentTab = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  const titles = { home: 'KCC20', tokens: 'Tokens', vault: 'Vault', activity: 'Activity' };
  $('nav-title').textContent = titles[id] || 'KCC20';
  $('nav-left').innerHTML = '';
  $('nav-right').innerHTML = id === 'home'
    ? `<button class="icon-btn" id="btn-settings" aria-label="Settings">•••</button>`
    : '';
  if (id === 'home') $('btn-settings')?.addEventListener('click', openSettings);
  $('tabbar').classList.toggle('show', !!wallet);
  if (id === 'vault') {
    try { renderVault(); } catch (e) { console.error(e); }
  }
}

function saveWallet() {
  localStorage.setItem(STORE_KEY, JSON.stringify(wallet));
}

function loadStoredWallet() {
  const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function unlockToHome() {
  $('page-lock').classList.remove('active');
  showPage('home');
  $('tabbar').classList.add('show');
  renderHome();
  startLiveSync();
  loadKaspaSdk().catch(() => {});
}

async function createWallet() {
  haptic();
  toast('Generating keys…');
  try {
    await loadCryptoLibs();
    const priv = await generatePrivateKey();
    wallet = await createKeypairFromHex(priv);
    saveWallet();
    await unlockToHome();
    toast('Wallet created');
    openSheet('Your new wallet', `
      <p class="muted" style="text-align:left;padding:0 0 12px;">This is the only copy of your private key. Store it offline. We never send it to our servers except when you confirm a send (to build the transaction).</p>
      <div class="glass mono" style="padding:14px;word-break:break-all;color:var(--gold-2);font-size:13px;">${esc(wallet.privKey)}</div>
    `, { confirm: 'I saved it', cancel: false });
  } catch (e) {
    toast(e.message);
  }
}

async function importWallet() {
  haptic();
  const hex = $('import-key').value.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) { toast('Need a 64-character hex key'); return; }
  try {
    wallet = await createKeypairFromHex(hex);
    saveWallet();
    await unlockToHome();
    toast('Wallet imported');
  } catch (e) {
    toast(e.message);
  }
}

function logout() {
  stopLiveSync();
  localStorage.removeItem(STORE_KEY);
  wallet = null;
  location.reload();
}

function kas() { return balanceSompi / 1e8; }
function usd(n) { return (n * (price || 0)).toLocaleString(undefined, { style: 'currency', currency: 'USD' }); }

function renderHome() {
  $('card-bal').innerHTML = `${formatAmount(balanceSompi)}<small>KAS</small>`;
  $('card-usd').textContent = price ? `≈ ${usd(kas())}` : 'Fetching price…';
  $('card-addr').textContent = shortAddr(wallet.address, 12, 8);
  renderHoldings();
}

function renderHoldings() {
  const watched = loadWatchlist();
  const items = [
    { ...NATIVE_KAS, sompi: balanceSompi, usd: usd(kas()) },
    ...watched.map(t => ({ ...t, sompi: 0, usd: '—' }))
  ];
  const nativeRows = items.map(t => `
    <button class="row token-row" data-ticker="${esc(t.ticker)}">
      <div class="dot" style="background:${esc(t.color)}22;color:${esc(t.color)}">${esc(t.ticker.slice(0, 3))}</div>
      <div>
        <div class="title">${esc(t.name)}</div>
        <div class="sub">${esc(t.ticker)}${t.native ? ' · Native' : ' · KCC20'}</div>
      </div>
      <div class="amt">
        <b>${t.native ? formatAmount(t.sompi) : '—'}</b>
        <em>${t.native ? t.usd : 'Watching'}</em>
      </div>
    </button>
  `);
  const locked = loadVaults().filter(v => v.address && Number(v.fundedSompi) > 0);
  const lockRows = locked.map(v => {
    const sec = remainingLockSec(v.unlockDaa);
    const lockedNow = sec == null || sec > 0;
    return `
    <button class="row token-row" data-lock-holding="${esc(v.address)}">
      <div class="dot" style="background:rgba(212,176,122,.18);color:var(--gold-2)">⏱</div>
      <div>
        <div class="title">${esc(v.name || 'Time Capsule')}</div>
        <div class="sub">${lockedNow ? 'Unlocks in <span data-unlock-daa="' + esc(v.unlockDaa) + '">' + esc(formatLockClock(sec)) + '</span>' : 'Unlocked — returning to wallet'}</div>
      </div>
      <div class="amt">
        <b>${formatAmount(v.fundedSompi || 0)}</b>
        <em>${lockedNow ? 'Locked' : 'Unlocking'}</em>
      </div>
    </button>`;
  });
  $('holdings').innerHTML = [...nativeRows, ...lockRows].join('') || `<div class="empty">No holdings yet.</div>`;
}

function renderTokens() {
  const watched = loadWatchlist();
  $('token-native').innerHTML = `
    <div class="row token-row">
      <div class="dot" style="background:#49eacb22;color:#49eacb">KAS</div>
      <div><div class="title">Kaspa</div><div class="sub">Native L1</div></div>
      <div class="amt"><b>${formatAmount(balanceSompi)}</b><em>${price ? usd(kas()) : ''}</em></div>
    </div>`;
  $('token-list').innerHTML = watched.length
    ? watched.map(t => `
      <div class="row token-row">
        <div class="dot" style="background:${esc(t.color)}22;color:${esc(t.color)}">${esc(t.ticker.slice(0,3))}</div>
        <div style="flex:1;min-width:0">
          <div class="title">${esc(t.name)}</div>
          <div class="sub">${esc(t.covenantAddress ? shortAddr(t.covenantAddress) : 'No instance yet')}</div>
        </div>
        <button class="nav-btn ghost" data-remove="${esc(t.ticker)}">Remove</button>
      </div>`).join('')
    : `<div class="empty">Watch a KCC20 by ticker and covenant address. KCC20 balances appear once an indexer or instance address is added.</div>`;
}

function vaultStatusLine(v) {
  const amt = v.fundedSompi ? formatAmount(v.fundedSompi) + ' KAS' : '0 KAS';
  if (!v.fundedSompi) return `${v.status || 'unfunded'} · ${amt}`;
  if (v.unlockDaa) {
    const sec = remainingLockSec(v.unlockDaa);
    if (sec == null) return `Locked · ${amt}`;
    if (sec > 0) return `Unlocks in <span data-unlock-daa="${esc(v.unlockDaa)}">${esc(formatLockClock(sec))}</span> · ${amt}`;
    return `Unlocked — returning · ${amt}`;
  }
  return `${v.status || 'funded'} · ${amt}`;
}

function renderVault() {
  const mine = loadVaults();
  $('vault-products').innerHTML = VAULT_PRODUCTS.map(p => `
    <button class="glass product" data-product="${esc(p.id)}">
      <div class="glyph" style="width:42px;height:42px;border-radius:12px;background:var(--gold-dim);display:grid;place-items:center;color:var(--gold-2);font-weight:700;font-size:11px;">${esc(p.tag)}</div>
      <div style="flex:1">
        <h4>${esc(p.name)} ${p.status === 'mainnet' ? '<span class="badge live">Mainnet</span>' : '<span class="badge local">Standard</span>'}</h4>
        <p>${esc(p.blurb)}</p>
      </div>
    </button>
  `).join('');
  $('vault-mine').innerHTML = mine.length
    ? mine.map(v => `
      <div class="glass" style="padding:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
          <div style="min-width:0;">
            <div class="title">${esc(v.name || v.type)}</div>
            <div class="sub" style="margin-top:4px;">${esc(vaultStatusLine(v))}</div>
            <div class="mono" style="font-size:11px;color:var(--label-2);margin-top:6px;word-break:break-all;">${esc(v.address || '')}</div>
          </div>
        </div>
        <div class="btn-row" style="margin-top:12px;">
          <button class="btn btn-glass" data-vault="${esc(v.address || '')}">Details</button>
          <button class="btn btn-gold" data-sweep="${esc(v.address || '')}">Sweep</button>
        </div>
      </div>`).join('') + `<button class="btn btn-gold" id="sweep-all" style="margin-bottom:16px;">Sweep all unlocked vaults</button>`
    : `<div class="empty">Vaults you create land here. After you fund one, Sweep appears on the card.</div>`;
  $('sweep-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    sweepAllVaults().catch(err => toast(errText(err)));
  });
}

function sompiOf(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatKas(n, digits = 8) {
  const x = Number(n);
  if (!Number.isFinite(x) || x === 0) return '0';
  const s = x.toFixed(digits);
  return s.replace(/\.?0+$/, '') || '0';
}

function inputAddr(i) {
  return i.previous_outpoint_address
    || i.previousOutpointAddress
    || i.previous_outpoint_resolved?.script_public_key_address
    || '';
}

function inputAmt(i) {
  return sompiOf(
    i.previous_outpoint_amount
    ?? i.previousOutpointAmount
    ?? i.previous_outpoint_resolved?.amount
  );
}

function outputAddr(o) {
  return o.script_public_key_address || o.scriptPublicKeyAddress || '';
}

function summarizeTx(tx, myAddr) {
  const inputs = tx.inputs || [];
  const outputs = tx.outputs || [];
  const spent = inputs.filter(i => inputAddr(i) === myAddr).reduce((a, i) => a + inputAmt(i), 0);
  const weSpent = inputs.some(i => inputAddr(i) === myAddr);
  const received = outputs.filter(o => outputAddr(o) === myAddr).reduce((a, o) => a + sompiOf(o.amount), 0);
  const toOthers = outputs.filter(o => outputAddr(o) && outputAddr(o) !== myAddr);
  const sentToOthers = toOthers.reduce((a, o) => a + sompiOf(o.amount), 0);
  const p2shOut = toOthers.find(o => String(outputAddr(o)).startsWith('kaspa:p'));
  const p2shIn = inputs.some(i => String(inputAddr(i)).startsWith('kaspa:p'));
  const fee = spent > 0 ? Math.max(0, spent - received - sentToOthers) : 0;
  const vaultIn = inputs.filter(i => String(inputAddr(i)).startsWith('kaspa:p')).reduce((a, i) => a + inputAmt(i), 0);
  const sweepFee = p2shIn && vaultIn > received ? vaultIn - received : 0;
  if (p2shIn && received > 0) {
    return { label: 'Unlocked', dir: 'in', amount: received, fee: sweepFee, note: 'back to wallet' };
  }
  if (weSpent && p2shOut) {
    return { label: 'Locked', dir: 'out', amount: sompiOf(p2shOut.amount), fee, note: 'into capsule' };
  }
  if (weSpent) {
    const amount = spent > 0 ? Math.max(0, spent - received) : sentToOthers;
    return { label: 'Sent', dir: 'out', amount, fee, note: fee ? `fee ${formatAmount(fee)}` : '' };
  }
  return { label: 'Received', dir: 'in', amount: received, fee: 0, note: '' };
}

function renderActivity(txs = []) {
  if (!txs.length) {
    $('activity-list').innerHTML = `<div class="empty">No recent transactions on this address.</div>`;
    return;
  }
  $('activity-list').innerHTML = txs.slice(0, 25).map(tx => {
    const id = tx.transaction_id || tx.transactionId || '';
    const row = summarizeTx(tx, wallet.address);
    const feeLine = row.fee > 0
      ? `<small>fee ${formatAmount(row.fee)} KAS</small>`
      : (row.note ? `<small>${esc(row.note)}</small>` : '');
    const sub = [id.slice(0, 12) + '…', new Date(tx.block_time || Date.now()).toLocaleString(), row.note && row.fee > 0 ? row.note : '']
      .filter(Boolean).join(' · ');
    return `
      <a class="tx" href="https://kas.fyi/transaction/${esc(id)}" target="_blank" rel="noopener">
        <div class="dir">${row.dir === 'in' ? '↓' : '↑'}</div>
        <div class="meta">
          <b>${esc(row.label)}</b>
          <span>${esc(sub)}</span>
        </div>
        <div class="val ${row.dir === 'in' ? 'in' : 'out'}">${row.dir === 'in' ? '+' : '−'}${formatAmount(row.amount || 0)}${feeLine}</div>
      </a>`;
  }).join('');
}

function setLiveFast(on) {
  liveFast = !!on;
  startLiveSync();
}

function startLiveSync() {
  stopLiveSync();
  tickLive(true);
  liveTimer = setInterval(() => tickLive(false), liveFast ? 800 : 2000);
}

function stopLiveSync() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}

async function tickLive(full) {
  if (!wallet) return;
  try {
    const [bRes, uRes] = await Promise.all([
      fetch(`${API_BASE}/addresses/${wallet.address}/balance`),
      fetch(`${API_BASE}/addresses/${wallet.address}/utxos`)
    ]);
    let nextBal = balanceSompi;
    if (bRes.ok) {
      const data = await bRes.json();
      nextBal = Number(data.balance ?? data ?? 0);
    }
    if (uRes.ok) utxos = await uRes.json() || [];
    if (seenBalance != null && nextBal > seenBalance) {
      const delta = nextBal - seenBalance;
      toast(`Received ${formatAmount(delta)} KAS`);
      haptic();
      $('card-bal')?.classList.add('flash-up');
      setTimeout(() => $('card-bal')?.classList.remove('flash-up'), 1200);
      if (receiveWatch) {
        const el = $('recv-status');
        if (el) el.textContent = `Received ${formatAmount(delta)} KAS`;
      }
    }
    seenBalance = nextBal;
    balanceSompi = nextBal;
    if (currentTab === 'home' || currentTab === 'tokens') renderHome();
    if (currentTab === 'tokens') renderTokens();
    const recvBal = $('recv-balance');
    if (recvBal) recvBal.textContent = `${formatAmount(balanceSompi)} KAS`;
    if (full) {
      try {
        const [pRes, tRes] = await Promise.all([
          fetch(`${API_BASE}/info/price?stringOnly=false`),
          fetch(`${API_BASE}/addresses/${wallet.address}/full-transactions?limit=20&resolve_previous_outpoints=light`)
        ]);
        if (pRes.ok) {
          const data = await pRes.json();
          price = Number(data.price ?? data ?? 0);
          if (currentTab === 'home') renderHome();
        }
        if (tRes.ok) {
          const txs = await tRes.json();
          window.__txs = Array.isArray(txs) ? txs : (txs.transactions || []);
          if (currentTab === 'activity') renderActivity(window.__txs);
        }
      } catch {}
      refreshVaultBalances();
    }
    const now = Date.now();
    if (full || now - lastAutoSweep > 8000) {
      lastAutoSweep = now;
      maybeAutoUnlock();
    }
  } catch (e) {
    console.warn(e);
  }
}

async function refreshAll() {
  await tickLive(true);
}

async function refreshVaultBalances() {
  try {
    lastDaa = await currentDaa();
    lastDaaAt = Date.now();
  } catch {}
  const mine = loadVaults();
  for (const v of mine) {
    if (!v.address || !v.address.startsWith('kaspa:')) continue;
    try {
      const bal = await fetchAddressBalance(v.address);
      updateVault(v.address, { fundedSompi: bal, status: bal > 0 ? (v.unlockDaa && lastDaa < Number(v.unlockDaa) ? 'locked' : 'funded') : (v.status === 'swept' ? 'swept' : 'unfunded') });
    } catch {}
  }
  if (currentTab === 'vault') renderVault();
  if (currentTab === 'home') renderHome();
}

async function maybeAutoUnlock() {
  if (!wallet || autoSweepBusy) return;
  autoSweepBusy = true;
  try {
    const daa = await currentDaa();
    lastDaa = daa;
    lastDaaAt = Date.now();
    const mine = loadVaults().filter(v => v.address && Number(v.unlockDaa) > 0);
    for (const v of mine) {
      if (daa < Number(v.unlockDaa)) continue;
      if (autoSweepTried.has(v.address)) continue;
      let utxosV = [];
      try { utxosV = await fetchAddressUtxos(v.address); } catch { continue; }
      if (!utxosV.length) continue;
      autoSweepTried.add(v.address);
      toast('Time lock ended — returning KAS…');
      try {
        const result = await sweepVault({ wallet, vault: v, utxos: utxosV });
        updateVault(v.address, { status: 'swept', unlockTxId: result.txId, fundedSompi: 0 });
        toast(`Returned ${result.amountKas} KAS from time capsule`);
        setLiveFast(true);
        setTimeout(() => setLiveFast(false), 25000);
        if (currentTab === 'vault') renderVault();
      } catch (e) {
        autoSweepTried.delete(v.address);
        console.warn('auto-unlock', e);
      }
    }
  } catch (e) {
    console.warn(e);
  } finally {
    autoSweepBusy = false;
  }
}

function setSheetStatus(msg, isErr) {
  const el = $('sheet-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isErr ? 'var(--red)' : 'var(--label-2)';
}

function openSheet(title, body, opts = {}) {
  $('sheet-title').textContent = title;
  $('sheet-body').innerHTML = body;
  $('sheet-actions').innerHTML = `
    <p class="muted" id="sheet-status" style="text-align:left;padding:0 0 10px;min-height:1.2em;"></p>
    ${opts.cancel === false ? '' : `<button class="btn btn-glass" id="sheet-cancel">${esc(opts.cancelLabel || 'Cancel')}</button>`}
    <button class="btn ${opts.danger ? 'btn-danger' : (opts.gold ? 'btn-gold' : 'btn-blue')}" id="sheet-ok">${esc(opts.confirm || 'Confirm')}</button>
  `;
  $('sheet-actions').style.display = opts.cancel === false ? 'block' : 'flex';
  $('sheet-actions').style.flexWrap = 'wrap';
  $('sheet-overlay').classList.add('open');
  $('sheet-cancel')?.addEventListener('click', closeSheet);
  $('sheet-ok').addEventListener('click', async () => {
    const btn = $('sheet-ok');
    if (!btn || btn.dataset.busy === '1') return;
    if (typeof opts.onConfirm !== 'function') { closeSheet(); return; }
    btn.dataset.busy = '1';
    btn.disabled = true;
    try {
      await opts.onConfirm();
    } catch (e) {
      const msg = errText(e);
      setSheetStatus(msg, true);
      toast(msg);
      btn.disabled = false;
      delete btn.dataset.busy;
    }
  });
  sheetConfirm = opts.onConfirm || null;
}

function closeSheet() {
  $('sheet-overlay').classList.remove('open');
  sheetConfirm = null;
  if (receiveWatch) { receiveWatch = false; setLiveFast(false); }
}

function openSend(prefill) {
  haptic();
  const dest0 = prefill?.destination || '';
  const amt0 = prefill?.amountKas || '';
  openSheet('Send KAS', `
    <div class="field"><label>To</label><input id="send-dest" placeholder="kaspa:q…" value="${esc(dest0)}" spellcheck="false" autocomplete="off"></div>
    <div class="field"><label>Amount</label><input id="send-amount" type="number" inputmode="decimal" min="0" step="0.0001" placeholder="0.00" value="${esc(amt0)}"></div>
    <p class="muted" style="text-align:left;padding:0 0 8px;">Available ${formatAmount(balanceSompi)} KAS. Network fee is usually 0.004–0.007 KAS (Toccata compute mass), shown before you confirm.</p>
  `, { confirm: 'Review', gold: true, onConfirm: () => prepareSend() });
}

async function prepareSend(prefill) {
  const dest = (prefill && prefill.destination) || $('send-dest')?.value.trim();
  const amount = Number((prefill && prefill.amountKas) || $('send-amount')?.value);
  if (!isValidKaspaAddress(dest)) { toast('Invalid Kaspa address'); return; }
  if (!amount || amount <= 0) { toast('Enter an amount'); return; }
  const feeEst = 0.0045;
  openSheet('Review send', `
    <div class="kv"><span class="k">To</span><span class="v">${esc(shortAddr(dest, 14, 8))}</span></div>
    <div class="kv"><span class="k">Amount</span><span class="v">${esc(formatKas(amount))} KAS</span></div>
    <div class="kv"><span class="k">Network fee</span><span class="v">~${feeEst.toFixed(4)} KAS</span></div>
    <div class="kv"><span class="k">Leaves wallet</span><span class="v">~${formatKas(amount + feeEst, 4)} KAS</span></div>
    <p class="muted" style="text-align:left;padding-top:8px;">The node sets the real fee from compute mass (usually 0.004–0.007 KAS). Change stays in this wallet.</p>
  `, { confirm: 'Send now', gold: true, onConfirm: () => broadcastSend(dest, amount) });
}

async function broadcastSend(dest, amount) {
  toast('Connecting to Kaspa…');
  try {
    await loadKaspaSdk();
    toast('Connecting to public Kaspa node…');
    await pingPublicNode();
    toast('Signing & broadcasting…');
    const availableUtxos = await fetchAddressUtxos(wallet.address);
    if (!availableUtxos.length) { toast('No UTXOs yet — receive KAS first'); return; }
    const result = await sendKas({ wallet, dest, amountKas: amount, utxos: availableUtxos });
    setLiveFast(true);
    setTimeout(() => setLiveFast(false), 25000);
    closeSheet();
    toast('Sent');
    openSheet('Sent', `
      <div class="kv"><span class="k">Amount</span><span class="v">${esc(formatKas(result.amountKas || amount))} KAS</span></div>
      <div class="kv"><span class="k">Network fee</span><span class="v">${Number(result.feeKas || 0).toFixed(6)} KAS</span></div>
      <div class="kv"><span class="k">TX</span><span class="v">${esc(result.txId)}</span></div>
      <p class="muted"><a href="https://kas.fyi/transaction/${esc(result.txId)}" target="_blank" rel="noopener" style="color:var(--gold-2)">View on explorer</a></p>
    `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
  } catch (e) {
    toast(e.message || 'Broadcast failed');
  }
}

async function openReceive() {
  haptic();
  receiveWatch = true;
  setLiveFast(true);
  const addr = wallet.address;
  openSheet('Receive', `
    <div class="qr-wrap" id="qr-box"></div>
    <p class="mono" style="text-align:center;font-size:12px;color:var(--label-2);word-break:break-all;padding:0 8px 12px;">${esc(addr)}</p>
    <p class="muted" id="recv-balance">${formatAmount(balanceSompi)} KAS</p>
    <p class="muted" id="recv-status">Watching the chain for incoming KAS…</p>
    <button class="btn btn-gold" id="copy-addr">Copy address</button>
  `, { confirm: 'Done', cancel: false, onConfirm: () => { receiveWatch = false; setLiveFast(false); closeSheet(); } });
  try {
    const QR = await import('https://esm.sh/qrcode@1.5.4');
    const canvas = document.createElement('canvas');
    await QR.toCanvas(canvas, addr, { width: 188, margin: 0, color: { dark: '#111111', light: '#ffffff' } });
    $('qr-box').innerHTML = '';
    $('qr-box').appendChild(canvas);
  } catch {
    $('qr-box').innerHTML = `<img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=188x188&data=${encodeURIComponent(addr)}">`;
  }
  $('copy-addr').onclick = async () => {
    await navigator.clipboard.writeText(addr);
    toast('Address copied');
  };
}

function openSettings() {
  haptic();
  openSheet('Keys', `
    <p class="muted" style="text-align:left;padding:0 0 10px;">Non-custodial. Keys live in this browser. Anyone with the hex key controls the funds.</p>
    <div class="field"><label>Address</label><input readonly value="${esc(wallet.address)}"></div>
    <div class="field"><label>Private key</label><input id="pk-view" type="password" readonly value="${esc(wallet.privKey)}"></div>
    <div class="btn-row" style="margin-bottom:12px;">
      <button class="btn btn-glass" id="reveal-pk">Reveal</button>
      <button class="btn btn-glass" id="copy-pk">Copy</button>
    </div>
    <button class="btn btn-danger" id="wipe">Remove wallet from this device</button>
  `, { confirm: 'Close', cancel: false });
  $('reveal-pk').onclick = () => {
    const i = $('pk-view');
    i.type = i.type === 'password' ? 'text' : 'password';
  };
  $('copy-pk').onclick = async () => { await navigator.clipboard.writeText(wallet.privKey); toast('Key copied'); };
  $('wipe').onclick = logout;
}

function openAddToken() {
  haptic();
  openSheet('Watch KCC20', `
    <div class="field"><label>Ticker</label><input id="tk-ticker" placeholder="GOLD" maxlength="12"></div>
    <div class="field"><label>Name</label><input id="tk-name" placeholder="Gold Token"></div>
    <div class="field"><label>Decimals</label><input id="tk-dec" type="number" value="8" min="0" max="18"></div>
    <div class="field"><label>Covenant address</label><input id="tk-addr" placeholder="kaspa:p…" spellcheck="false"></div>
  `, {
    confirm: 'Add token', gold: true, onConfirm: () => {
      try {
        addToken({
          ticker: $('tk-ticker').value,
          name: $('tk-name').value,
          decimals: $('tk-dec').value,
          covenantAddress: $('tk-addr').value
        });
        closeSheet();
        renderTokens();
        renderHome();
        toast('Token watched');
      } catch (e) { toast(e.message); }
    }
  });
}

function readProductForm(type) {
  const params = {};
  const amt = parseFloat($('ct-amount')?.value);
  if (Number.isFinite(amt) && amt > 0) params.amountKas = amt;
  if (type === 'timelock') {
    const dur = parseDurationField($('ct-duration')?.value);
    if (dur) {
      params.lockDays = dur.days;
      params.lockMinutes = dur.minutes;
      params.durationLabel = dur.label;
    }
  }
  if (type === 'escrow') params.buyerAddress = $('ct-buyer')?.value.trim();
  if (type === 'multisig') params.counterparty = $('ct-counterparty')?.value.trim();
  return params;
}

function openProduct(id) {
  const p = VAULT_PRODUCTS.find(x => x.id === id);
  if (!p) return;
  haptic();
  if (p.type === 'kcc20') { showPage('tokens'); return; }
  let fields = `<div class="field"><label>Amount (KAS)</label><input id="ct-amount" type="number" step="0.0001" min="0" inputmode="decimal" placeholder="0.15"></div>`;
  if (p.type === 'timelock') {
    fields += `<div class="field"><label>Duration</label><input id="ct-duration" placeholder="3 minutes or 30 days"></div>`;
  } else if (p.type === 'escrow') {
    fields += `<div class="field"><label>Buyer address</label><input id="ct-buyer" placeholder="kaspa:q…" spellcheck="false"></div>`;
  } else if (p.type === 'multisig') {
    fields += `<div class="field"><label>Counterparty</label><input id="ct-counterparty" placeholder="kaspa:q…" spellcheck="false"></div>`;
  }
  openSheet(p.name, `<p class="muted" style="text-align:left;padding:0 0 12px;">${esc(p.blurb)}</p>${fields}`, {
    confirm: 'Build vault', gold: true, onConfirm: () => buildCovenant(p, readProductForm(p.type))
  });
}

function backendParams(type, params) {
  const out = { ...params };
  if (type === 'timelock') {
    const minutes = Number(params.lockMinutes) || Math.round((Number(params.lockDays) || 0) * 1440);
    out.lockMinutes = minutes;
    out.lockDays = params.lockDays != null ? params.lockDays : (minutes / 1440);
    out.duration = params.durationLabel || `${minutes} minutes`;
  }
  return out;
}

async function buildCovenant(p, explicit) {
  const params = explicit && Object.keys(explicit).length ? { ...explicit } : readProductForm(p.type);
  if (!params.amountKas || !Number.isFinite(Number(params.amountKas))) {
    toast('Enter an amount like 0.15');
    return;
  }
  if (p.type === 'timelock' && !params.lockDays && !params.lockMinutes) {
    toast('Enter a duration like 3 minutes');
    return;
  }
  if (p.type === 'escrow' && !params.buyerAddress) { toast('Need a buyer address'); return; }
  if (p.type === 'multisig' && !params.counterparty) { toast('Need a counterparty'); return; }

  toast('Building P2SH covenant…');
  const payload = backendParams(p.type, params);
  try {
    await loadKaspaSdk();
    let built;
    if (p.type === 'timelock') {
      built = await buildTimelockCovenant({ pubkeyHex: wallet.pubKey, minutes: payload.lockMinutes || (payload.lockDays * 1440) });
    } else if (p.type === 'escrow') {
      const buyer = payloadFromAddress(payload.buyerAddress);
      if (!buyer) throw new Error('Buyer must be a kaspa:q public-key address');
      built = await buildEscrowCovenant({ ownerPubHex: wallet.pubKey, buyerPubHex: bytesToHex(buyer) });
    } else if (p.type === 'multisig') {
      const other = payloadFromAddress(payload.counterparty);
      if (!other) throw new Error('Counterparty must be a kaspa:q public-key address');
      built = await buildMultisigCovenant({ ownerPubHex: wallet.pubKey, otherPubHex: bytesToHex(other) });
    } else {
      throw new Error('This product is not a fundable covenant yet');
    }
    if (!String(built.address).startsWith('kaspa:p')) {
      throw new Error('Expected a covenant P2SH (kaspa:p…) got ' + built.address);
    }
    const vault = {
      type: p.type,
      name: p.name || p.type,
      address: built.address,
      scriptHex: built.redeemHex,
      spkHex: built.spkHex,
      unlockDaa: built.unlockDaa || null,
      params: payload,
      status: 'unfunded',
      fundedSompi: 0
    };
    saveVault(vault);
    renderVault();
    openVaultReady(vault);
  } catch (e) { toast(errText(e)); }
}

function openVaultReady(vault) {
  const amt = Number(vault.params?.amountKas) || 0;
  const feeEst = 0.0045;
  openSheet('Covenant ready', `
    <div class="kv"><span class="k">Type</span><span class="v">${esc(vault.name || vault.type)}</span></div>
    <div class="kv"><span class="k">Lock amount</span><span class="v">${esc(amt)} KAS</span></div>
    <div class="kv"><span class="k">Network fee</span><span class="v">~${feeEst.toFixed(4)} KAS</span></div>
    <div class="kv"><span class="k">Leaves wallet</span><span class="v">~${(amt + feeEst).toFixed(4)} KAS</span></div>
    ${vault.params?.duration ? `<div class="kv"><span class="k">Lock</span><span class="v">${esc(vault.params.duration)}</span></div>` : ''}
    ${vault.unlockDaa ? `<div class="kv"><span class="k">Unlock DAA</span><span class="v">${esc(vault.unlockDaa)}</span></div>` : ''}
    <div class="kv"><span class="k">Covenant</span><span class="v">${esc(vault.address)}</span></div>
    <p class="muted" style="text-align:left;">Only <strong>${esc(amt)} KAS</strong> goes into the capsule. The fee is paid from your remaining KAS (change stays in this wallet). When the timer ends we Sweep the locked amount back, minus a small sweep fee (~0.004 KAS).</p>
  `, {
    confirm: 'Lock ' + amt + ' KAS',
    cancelLabel: 'Copy address',
    gold: true,
    onConfirm: () => fundVault(vault)
  });
  $('sheet-cancel')?.addEventListener('click', async (ev) => {
    ev.preventDefault();
    await navigator.clipboard.writeText(vault.address);
    toast('Covenant address copied');
    closeSheet();
  }, { once: true });
}

async function fundVault(vault) {
  const amt = Number(vault.params?.amountKas);
  if (!amt) throw new Error('Missing amount');
  if (!wallet?.address) throw new Error('No wallet');
  setSheetStatus('Loading Kaspa engine…');
  await loadKaspaSdk();
  setSheetStatus('Fetching UTXOs…');
  const availableUtxos = await fetchAddressUtxos(wallet.address);
  if (!availableUtxos.length) throw new Error('No UTXOs — receive KAS first');
  setSheetStatus('Connecting to public Kaspa node (ivy / resolver)…');
  const ping = await pingPublicNode();
  setSheetStatus('Connected ' + ping.networkId + ' @ ' + ping.url.replace('wss://','') + ' — signing…');
  const result = await sendKas({ wallet, dest: vault.address, amountKas: amt, utxos: availableUtxos, exact: true });
  const lockedSompi = Math.round((Number(result.amountKas) || amt) * 1e8);
  updateVault(vault.address, {
    status: 'funding',
    fundTxId: result.txId,
    covenantId: result.covenantId || null,
    fundedSompi: lockedSompi,
    fundFeeKas: result.feeKas || 0,
    params: { ...(vault.params || {}), amountKas: result.amountKas || amt }
  });
  setLiveFast(true);
  setTimeout(() => setLiveFast(false), 25000);
  const lockedKas = Number(result.amountKas || amt);
  const feeKas = Number(result.feeKas || 0);
  openSheet('Covenant funded', `
    <div class="kv"><span class="k">Locked in capsule</span><span class="v">${esc(formatKas(lockedKas))} KAS</span></div>
    <div class="kv"><span class="k">Network fee</span><span class="v">${feeKas.toFixed(6)} KAS</span></div>
    <div class="kv"><span class="k">Left this wallet</span><span class="v">${formatKas(lockedKas + feeKas)} KAS</span></div>
    <div class="kv"><span class="k">Covenant</span><span class="v">${esc(vault.address)}</span></div>
    ${result.covenantId ? `<div class="kv"><span class="k">Covenant ID</span><span class="v">${esc(result.covenantId)}</span></div>` : ''}
    <div class="kv"><span class="k">TX</span><span class="v">${esc(result.txId || '')}</span></div>
    <p class="muted" style="text-align:left;">Exactly ${esc(formatKas(lockedKas))} KAS is frozen in the capsule. The fee was paid from leftover UTXOs; change stays in this wallet. Sweep later returns the locked amount minus a small sweep fee (~0.004 KAS).</p>
    <p class="muted"><a href="https://kaspa.stream/transactions/${esc(result.txId)}" target="_blank" rel="noopener" style="color:var(--gold-2)">View on kaspa.stream</a></p>
  `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
}

function openLockTimer(vault) {
  if (!vault) return;
  haptic();
  const sec = remainingLockSec(vault.unlockDaa);
  const locked = sec == null || sec > 0;
  openSheet(vault.name || 'Time Capsule', `
    <div class="kv"><span class="k">Locked</span><span class="v">${formatAmount(vault.fundedSompi || 0)} KAS</span></div>
    ${vault.fundFeeKas ? `<div class="kv"><span class="k">Lock fee paid</span><span class="v">${Number(vault.fundFeeKas).toFixed(6)} KAS</span></div>` : ''}
    <div class="kv"><span class="k">Time left</span><span class="v" id="lock-timer-live" data-unlock-daa="${esc(vault.unlockDaa || '')}" data-addr="${esc(vault.address || '')}">${esc(formatLockClock(sec))}</span></div>
    <div class="kv"><span class="k">Unlocks (UTC)</span><span class="v" id="lock-timer-utc">${esc(unlockAtUtc(sec))}</span></div>
    ${vault.unlockDaa ? `<div class="kv"><span class="k">Unlock DAA</span><span class="v">${esc(vault.unlockDaa)} (now ${esc(lastDaa || '—')})</span></div>` : ''}
    <div class="kv"><span class="k">Address</span><span class="v">${esc(vault.address)}</span></div>
    <p class="muted" style="text-align:left;">${locked ? 'Still frozen on-chain. When this timer hits zero, this app Sweeps the KAS back to your kaspa:q… wallet automatically.' : 'Lock has expired. Sweep now, or wait — auto-return is on.'}</p>
    <button class="btn btn-gold" id="v-unlock" style="margin-top:14px;">Sweep to wallet</button>
    <div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-glass" id="v-copy">Copy</button>
      <button class="btn btn-glass" id="v-fund">Fund more</button>
    </div>
  `, { confirm: 'Close', cancel: false });
  $('v-copy').onclick = async () => { await navigator.clipboard.writeText(vault.address); toast('Copied'); };
  $('v-fund').onclick = () => fundVault(vault).catch(e => toast(errText(e)));
  $('v-unlock').onclick = () => unlockVault(vault).catch(e => { setSheetStatus(errText(e), true); toast(errText(e)); });
}

async function openVaultDetail(address) {
  const vault = loadVaults().find(v => v.address === address);
  if (!vault) return;
  if (!lastDaa) {
    try { lastDaa = await currentDaa(); lastDaaAt = Date.now(); } catch {}
  }
  openLockTimer(vault);
}

async function unlockVault(vault) {
  autoSweepTried.add(vault.address);
  openSheet('Sweep vault', `
    <p class="muted" style="text-align:left;">Returning KAS from this covenant to your wallet.</p>
    <div class="kv"><span class="k">From</span><span class="v">${esc(vault.address || '')}</span></div>
  `, { confirm: 'Sweeping…', cancel: false });
  const busy = $('sheet-ok');
  if (busy) { busy.disabled = true; busy.dataset.busy = '1'; }
  setSheetStatus('Looking up vault UTXOs…');
  const utxosV = await fetchAddressUtxos(vault.address);
  if (!utxosV.length) throw new Error('Nothing to sweep — this address has 0 UTXOs');
  setSheetStatus('Connecting to public node…');
  await pingPublicNode();
  setSheetStatus('Signing P2SH redeem (CLTV + CHECKSIG)…');
  const result = await sweepVault({ wallet, vault, utxos: utxosV });
  updateVault(vault.address, { status: 'swept', unlockTxId: result.txId, fundedSompi: 0 });
  setLiveFast(true);
  setTimeout(() => setLiveFast(false), 25000);
  openSheet('Swept', `
    <div class="kv"><span class="k">Returned</span><span class="v">${esc(formatKas(result.amountKas))} KAS</span></div>
    <div class="kv"><span class="k">Sweep fee</span><span class="v">${Number(result.feeKas || 0).toFixed(6)} KAS</span></div>
    <div class="kv"><span class="k">TX</span><span class="v">${esc(result.txId)}</span></div>
    <p class="muted" style="text-align:left;">The sweep fee is the Toccata compute fee (usually 0.004–0.007 KAS), not a cut of the lock. You should get lock amount minus this fee.</p>
    <p class="muted"><a href="https://kaspa.stream/transactions/${esc(result.txId)}" target="_blank" rel="noopener" style="color:var(--gold-2)">View on kaspa.stream</a></p>
  `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
}

async function sweepAllVaults() {
  const mine = loadVaults().filter(v => v.address);
  if (!mine.length) throw new Error('No saved vaults yet. Paste the kaspa:p… address below Sweep, or create the time capsule again on this device.');
  toast('Sweeping vaults…');
  const daa = await currentDaa();
  let ok = 0, skipped = 0;
  const errors = [];
  for (const v of mine) {
    if (v.unlockDaa && daa < v.unlockDaa) { skipped++; continue; }
    try {
      const utxosV = await fetchAddressUtxos(v.address);
      if (!utxosV.length) { skipped++; continue; }
      await sweepVault({ wallet, vault: v, utxos: utxosV });
      updateVault(v.address, { status: 'swept', fundedSompi: 0 });
      ok++;
    } catch (e) {
      errors.push(shortAddr(v.address) + ': ' + errText(e));
    }
  }
  renderVault();
  refreshAll();
  if (!ok && errors.length) throw new Error(errors[0]);
  toast(`Swept ${ok} vault(s)` + (skipped ? `, skipped ${skipped}` : '') + (errors.length ? `. ${errors[0]}` : ''));
}

function appendChat(role, html) {
  const log = $('chat-log');
  const el = document.createElement('div');
  el.className = `bubble ${role === 'me' ? 'me' : 'ai'}`;
  el.innerHTML = html;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function renderIntentCard(intent) {
  const id = ++buildSeq;
  lastIntent = intent;
  window.__pendingCovenant = intent;
  const summary = describeIntent(intent);
  if (!intent.complete) {
    appendChat('ai', `${esc(summary)}<div style="margin-top:8px;color:var(--label-2)">${esc(askFor(intent.missing))}</div>`);
    return;
  }
  if (intent.type === 'send') {
    appendChat('ai', `${esc(summary)}<button class="btn btn-gold" style="margin-top:10px;height:42px;" data-send-intent="${id}">Review send</button>`);
    window.__intents = window.__intents || {};
    window.__intents[id] = intent;
    return;
  }
  window.__intents = window.__intents || {};
  window.__intents[id] = intent;
  appendChat('ai', `
    ${esc(summary)}
    <button class="btn btn-gold" style="margin-top:10px;height:42px;" data-build-intent="${id}">Build &amp; review</button>
  `);
}

async function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  appendChat('me', esc(text));
  const typing = appendChat('ai', '<span style="opacity:0.55">Reading that…</span>');

  const local = parseIntent(text, lastIntent);
  if (!local.error) lastIntent = { ...local, params: { ...(lastIntent?.params || {}), ...local.params } };

  let remote = null;
  try {
    const normalized = text.replace(/(?:^|[^\d])(\.\d+)/g, (m, d) => m.replace(d, '0' + d));
    const res = await fetch(`${BACKEND_URL}/kccApi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'parseIntent', message: normalized })
    });
    remote = await res.json();
  } catch { /* local parser is enough */ }

  typing.remove();

  let intent = local.error ? null : local;
  if (remote && !remote.error && remote.type) {
    const merged = parseIntent(text, {
      type: remote.type,
      params: { ...(intent?.params || {}), ...(remote.params || {}) }
    });
    if (!merged.error) intent = merged;
  }

  if (!intent || intent.error) {
    appendChat('ai', 'I can lock, escrow, multisig, or send. Example: <em>Lock .15 KAS for 3 minutes</em>');
    return;
  }
  renderIntentCard(intent);
}

function bind() {
  $('btn-create').onclick = createWallet;
  $('btn-show-import').onclick = () => $('import-box').classList.toggle('hidden');
  $('btn-import').onclick = importWallet;
  $('btn-send').onclick = openSend;
  $('btn-receive').onclick = openReceive;
  $('btn-copy-addr').onclick = async () => { await navigator.clipboard.writeText(wallet.address); toast('Copied'); };
  $('btn-refresh').onclick = () => { haptic(); refreshAll(); toast('Refreshing'); };
  $('btn-vault-short').onclick = () => showPage('vault');
  $('btn-sweep-now')?.addEventListener('click', () => {
    sweepAllVaults().catch(err => toast(errText(err)));
  });
  $('btn-sweep-addr')?.addEventListener('click', () => {
    const addr = $('sweep-addr')?.value.trim();
    if (!addr) { toast('Paste a kaspa:p… address'); return; }
    const known = loadVaults().find(v => v.address === addr) || { address: addr, type: 'timelock', name: 'Vault' };
    unlockVault(known).catch(err => toast(errText(err)));
  });
  $('btn-add-token').onclick = openAddToken;
  $('chat-send').onclick = sendChat;
  $('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  $('chat-log').addEventListener('click', e => {
    const buildBtn = e.target.closest('[data-build-intent]');
    const sendBtn = e.target.closest('[data-send-intent]');
    const intent = window.__intents?.[buildBtn?.dataset.buildIntent || sendBtn?.dataset.sendIntent];
    if (!intent) return;
    haptic();
    if (sendBtn) {
      openSend({ destination: intent.params.destination, amountKas: intent.params.amountKas });
      return;
    }
    const p = productForIntent(intent);
    buildCovenant(p, intent.params);
  });
  $('sheet-overlay').addEventListener('click', e => { if (e.target === $('sheet-overlay')) closeSheet(); });
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    haptic();
    const tab = t.dataset.tab;
    showPage(tab);
    if (tab === 'tokens') renderTokens();
    if (tab === 'vault') renderVault();
    if (tab === 'activity') renderActivity(window.__txs || []);
    if (tab === 'home') refreshAll();
  });
  $('holdings').addEventListener('click', e => {
    const lock = e.target.closest('[data-lock-holding]');
    if (lock?.dataset.lockHolding) {
      const vault = loadVaults().find(v => v.address === lock.dataset.lockHolding);
      openLockTimer(vault);
      return;
    }
    const row = e.target.closest('[data-ticker]');
    if (row?.dataset.ticker === 'KAS') openReceive();
    else if (row) showPage('tokens');
  });
  $('token-list').addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { removeToken(rm.dataset.remove); renderTokens(); renderHome(); }
  });
  $('vault-products').addEventListener('click', e => {
    const btn = e.target.closest('[data-product]');
    if (btn) openProduct(btn.dataset.product);
  });
  $('vault-mine').addEventListener('click', e => {
    const sweepBtn = e.target.closest('[data-sweep]');
    if (sweepBtn?.dataset.sweep) {
      e.preventDefault();
      e.stopPropagation();
      const vault = loadVaults().find(v => v.address === sweepBtn.dataset.sweep);
      if (!vault) { toast('Vault not found'); return; }
      unlockVault(vault).catch(err => { toast(errText(err)); });
      return;
    }
    const row = e.target.closest('[data-vault]');
    if (row?.dataset.vault) openVaultDetail(row.dataset.vault);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wallet) tickLive(true);
  });
}

async function init() {
  window.__kcc = { parseIntent, isValidKaspaAddress, describeIntent, pingPublicNode, toRpcTransaction, p2shSpendScript, planKasPayment, storageMassOk };
  window.__kccLoad = loadKaspaSdk;
  setClock();
  setInterval(setClock, 1000);
  bind();
  const video = document.getElementById('bg-video');
  video?.play?.().catch(() => {});
  video?.addEventListener('playing', () => document.querySelector('.bg-poster')?.classList.add('hidden'));
  try { await loadCryptoLibs(); } catch { toast('Signing library delayed — check network'); }
  const saved = loadStoredWallet();
  if (saved?.address && saved?.privKey) {
    wallet = saved;
    if (!wallet.pubKey) {
      try {
        const pub = await derivePublicKey(hexToBytes(wallet.privKey));
        wallet.pubKey = privKeyToHex(pub);
        wallet.address = wallet.address || kaspaAddressFromPubkey(pub);
        saveWallet();
      } catch {}
    }
    await unlockToHome();
  } else {
    showPage('lock');
    $('tabbar').classList.remove('show');
    $('nav-title').textContent = 'KCC20';
  }
}

init();
