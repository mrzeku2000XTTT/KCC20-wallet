import {
  loadCryptoLibs, generatePrivateKey, createKeypairFromHex,
  isValidKaspaAddress, validateKaspaAddress, shortAddr, hexToBytes, privKeyToHex,
  derivePublicKey, kaspaAddressFromPubkey, bytesToHex, kasToSompi, sompiToKasString,
  validateAndCleanUtxo
} from './crypto.js?v=73';
import {
  NATIVE_KAS, VAULT_PRODUCTS, loadWatchlist, addToken, removeToken,
  loadVaults, saveVault, updateVault, formatAmount, formatTokenUnits, tokenColor,
  fetchKcc20Portfolio, fetchKrc20Portfolio, fetchKcc20PortfolioMany, fetchKrc20PortfolioMany,
  krc20Logo, toTokenRaw, setVaultOwner, kcc20Identicon, VAULT_GROUPS
} from './kcc20.js?v=73';
import { parseIntent, describeIntent, askFor, parseDurationField, interpretVaultChat, normalizeChat } from './intent.js?v=73';
import { payloadFromAddress } from './script.js?v=73';
import { explainTransaction, scorpionAnswer } from './scorpion.js?v=73';
import {
  sendKas, fetchAddressUtxos, fetchAddressBalance, loadKaspaSdk,
  buildTimelockCovenant, buildEscrowCovenant, buildMultisigCovenant, currentDaa,
  pingPublicNode, sweepVault, toRpcTransaction, p2shSpendScript, planKasPayment, storageMassOk,
  compoundUtxos, sendKrc20, sendKcc20, loadKrc20Pending, lockKcc20Timelock, sweepKcc20Capsule,
  fetchOwnedUtxos, buildSentinelChain, buildRecurringChain, buildHashlockCovenant,
  newHashlockSecret, checkinHop, currentHop, parseXmssKit, p2shFromRedeemHex, spendXmssVault
} from './tx.js?v=73';
import { kronMarkets, quoteKronTrade, executeKronTrade, formatKasSompi, lookupKronTick, tradeCostLines, attachKronLogos } from './kronTrade.js?v=73';
import {
  migrateReceiveBook, ownedAddresses, markAddressUsed, currentReceive,
  deriveReceiveBatch, unusedReceiveCount, ensurePrivacyBook
} from './receive.js?v=73';
import { knsResolve, knsPrimary, knsDomainsFor, knsOwnerMatches, knsAppUrl, looksLikeKasDomain, normalizeKasDomain } from './kns.js?v=73';

export const BUILD = '73';

function errText(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.message || e.toString?.() || String(e);
}

function productForIntent(intent) {
  if (intent.type === 'kcc20lock') return VAULT_PRODUCTS.find(p => p.id === 'kcc20freeze');
  if (intent.type === 'hashlock') return VAULT_PRODUCTS.find(p => p.id === 'hashlock');
  if (intent.type === 'xmss') return VAULT_PRODUCTS.find(p => p.id === 'xmss');
  if (intent.type === 'timelock') return VAULT_PRODUCTS.find(p => p.id === 'timelock');
  return VAULT_PRODUCTS.find(p => p.id === intent.type)
    || VAULT_PRODUCTS.find(p => p.type === intent.type)
    || { id: intent.type, name: intent.type, type: intent.type };
}

function isKcc20Vault(v) {
  return v?.type === 'kcc20lock' || v?.asset === 'kcc20';
}

function isVaultHistory(v) {
  if (!v) return false;
  if (v.status === 'swept') return true;
  const tok = isKcc20Vault(v) ? Number(v.tokenAmount || 0) : 0;
  if (v.status === 'unfunded' || v.status === 'funding' || v.status === 'locked') return false;
  return Number(v.fundedSompi || 0) <= 0 && tok <= 0;
}

function vaultTokenLabel(v) {
  if (!isKcc20Vault(v) || !v.tick) return '';
  return formatTokenUnits(v.tokenAmount || 0, v.decimals) + ' ' + v.tick;
}

function walletByAddress(addr) {
  if (!addr) return null;
  return loadWalletList().find(w => w.address === addr) || null;
}

function vaultCounterpartyKey(vault) {
  const addr = vault?.params?.counterparty || vault?.params?.buyerAddress || '';
  return walletByAddress(addr)?.privKey || '';
}

function isHopVault(v) {
  return v?.type === 'sentinel' || v?.type === 'recurring';
}

function canCheckinVault(v) {
  if (!isHopVault(v) || v.status === 'swept' || v.status === 'unfunded') return false;
  if (Number(v.fundedSompi || 0) <= 0) return false;
  const hops = v.hops || [];
  const i = Number(v.hopIndex || 0);
  return i < hops.length - 1 || (v.type === 'recurring' && i < hops.length);
}

function canSweepVault(v, daa) {
  if (!v?.address || v.status === 'swept' || v.status === 'unfunded') return false;
  const now = daa || lastDaa;
  if (isHopVault(v)) {
    const hop = currentHop(v) || v;
    if (now && hop.unlockDaa && Number(now) < Number(hop.unlockDaa)) return false;
    return Number(v.fundedSompi || 0) > 0;
  }
  if (v.type === 'hashlock') {
    if (v.params?.secretHex) return Number(v.fundedSompi || 0) > 0;
    if (v.unlockDaa && now && Number(now) < Number(v.unlockDaa)) return false;
    return Number(v.fundedSompi || 0) > 0;
  }
  if (v.type === 'xmss') return Number(v.fundedSompi || 0) > 0;
  if ((v.type === 'timelock' || isKcc20Vault(v) || v.unlockDaa) && v.unlockDaa) {
    if (now && Number(now) < Number(v.unlockDaa)) return false;
  }
  if (v.type === 'multisig') return !!vaultCounterpartyKey(v);
  if (v.type === 'escrow') return true;
  if (v.type === 'timelock' || isKcc20Vault(v)) return Number(v.fundedSompi || 0) > 0 || Number(v.tokenAmount || 0) > 0;
  return Number(v.fundedSompi || 0) > 0;
}

function mirrorVaultTo(addr, vault) {
  if (!addr || !vault?.address || addr === wallet?.address) return;
  if (!walletByAddress(addr)) return;
  const here = wallet.address;
  setVaultOwner(addr);
  if (!loadVaults().some(v => v.address === vault.address)) saveVault({ ...vault, walletAddress: addr });
  setVaultOwner(here);
}

const API_BASE = 'https://api.kaspa.org';
const BACKEND_URL = 'https://base44.app/api/apps/6a444b036408e68ec8d6f2a6/functions';
const STORE_KEY = 'kcc20_wallet_v1';
const LEGACY_KEY = 'scorpion_wallet';
const WALLETS_KEY = 'kcc20_wallets_v2';
const ACTIVE_KEY = 'kcc20_active_id';
const PIN_KEY = 'kcc20_pin_v1';
const SNAPS_KEY = 'kcc20_snaps_v1';
const ACT_KEY = 'kcc20_activity_v1';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const explorerTx = (id) => 'https://kaspa.stream/transactions/' + encodeURIComponent(id || '');
const explorerAddr = (addr) => 'https://kaspa.stream/addresses/' + encodeURIComponent(addr || '');

function txidBlock(id, label = 'TX') {
  if (!id) return '';
  return `
    <div class="kv">
      <span class="k">${esc(label)}</span>
      <span class="v txid-v">
        <code class="txid-text">${esc(id)}</code>
        <button type="button" class="copy-chip" data-copy="${esc(id)}">Copy</button>
      </span>
    </div>
    <p class="muted tx-links"><a href="${esc(explorerTx(id))}" target="_blank" rel="noopener">Open on kaspa.stream</a></p>`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    toast('Copied');
  } catch {
    toast('Could not copy');
  }
}

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
let kccHoldings = [];
let krcHoldings = [];
let tokenLoadErr = '';
let lastTokenFetch = 0;
let tokenBusy = false;
let tokenPending = false;
let tokenActBackfill = false;
let activityAll = false;
let seenTokens = false;
let tokenStream = null;
let tokenFastOff = 0;
let hushTokenToastsUntil = 0;
let walletSnap = {};
let lastAllSnap = 0;
let lastAllTokenSnap = 0;
let snapBusy = false;
let sessionUnlocked = false;
let pinBuffer = '';
let pinMode = 'unlock';
let pinPending = '';
let pinFails = 0;
let pinLockUntil = 0;
let pinWait = null;
let pinUnlockedFor = '';
let pendingNewKey = null;
let qrStream = null;
let qrRaf = 0;

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
  $('scroll')?.classList.toggle('home-noscroll', id === 'home' || id === 'vault');
  currentTab = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  const titles = { home: 'KCC20', tokens: 'Tokens', vault: 'Vault', activity: 'Activity', you: 'Profile' };
  if (id === 'home' && wallet) {
    $('nav-title').innerHTML = `<button type="button" class="nav-wallet" id="nav-wallet"><b>${esc(wallet.name || 'Wallet')}</b><span>▾</span></button>`;
    $('nav-wallet')?.addEventListener('click', openWalletSwitcher);
  } else {
    $('nav-title').textContent = titles[id] || 'KCC20';
  }
  $('nav-left').innerHTML = '';
  if (id === 'home') {
    $('nav-right').innerHTML = `
      ${loadPin() ? `<button class="icon-btn" id="btn-lock-now" aria-label="Lock" title="Lock">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
      </button>` : ''}
      <button class="icon-btn" id="btn-settings" aria-label="Settings">•••</button>
    `;
    $('btn-lock-now')?.addEventListener('click', lockNow);
    $('btn-settings')?.addEventListener('click', () => showPage('you'));
  } else {
    $('nav-right').innerHTML = '';
  }
  $('tabbar').classList.toggle('show', !!wallet && sessionOpen());
  if (id === 'vault') {
    try { renderVault(); } catch (e) { console.error(e); }
  }
  if (id === 'you') {
    try { renderProfile(); } catch (e) { console.error(e); }
    refreshAllWalletSnaps({ tokens: true }).catch(() => {});
  }
  if (id === 'tokens') {
    try { renderKronMarkets(); } catch (e) { console.error(e); }
  }
  if (id === 'activity') {
    try { renderActivity(window.__txs || []); } catch (e) { console.error(e); }
  }
}

function uid() {
  try { return crypto.randomUUID(); } catch { return String(Date.now()) + Math.random().toString(16).slice(2); }
}

function loadWalletList() {
  try {
    const raw = JSON.parse(localStorage.getItem(WALLETS_KEY) || '[]');
    if (Array.isArray(raw) && raw.length) return raw;
  } catch {}
  const one = loadStoredWalletRaw();
  if (one?.address && one?.privKey) {
    const w = {
      id: uid(),
      name: 'Wallet 1',
      address: one.address,
      privKey: one.privKey,
      pubKey: one.pubKey || '',
      createdAt: Date.now()
    };
    localStorage.setItem(WALLETS_KEY, JSON.stringify([w]));
    localStorage.setItem(ACTIVE_KEY, w.id);
    return [w];
  }
  return [];
}

function saveWalletList(list) {
  localStorage.setItem(WALLETS_KEY, JSON.stringify(list));
}

function loadStoredWalletRaw() {
  const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function loadStoredWallet() {
  const list = loadWalletList();
  if (!list.length) return null;
  const id = localStorage.getItem(ACTIVE_KEY);
  return list.find(w => w.id === id) || list[0];
}

function saveWallet() {
  if (!wallet) return;
  if (!wallet.id) wallet.id = uid();
  if (!wallet.name) wallet.name = 'Wallet ' + (loadWalletList().length || 1);
  localStorage.setItem(STORE_KEY, JSON.stringify({
    address: wallet.address, privKey: wallet.privKey, pubKey: wallet.pubKey
  }));
  localStorage.setItem(ACTIVE_KEY, wallet.id);
  const list = loadWalletList();
  const i = list.findIndex(w => w.id === wallet.id || w.address === wallet.address);
  migrateReceiveBook(wallet);
  const row = {
    id: wallet.id,
    name: wallet.name,
    address: wallet.address,
    privKey: wallet.privKey,
    pubKey: wallet.pubKey || '',
    createdAt: wallet.createdAt || Date.now(),
    pin: wallet.pin || list[i]?.pin || undefined,
    receiveAddrs: wallet.receiveAddrs || [],
    knsDomain: wallet.knsDomain || ''
  };
  if (i >= 0) list[i] = { ...list[i], ...row };
  else list.push(row);
  saveWalletList(list);
}

function slimTokens(list) {
  return (list || []).slice(0, 40).map(t => ({
    ticker: t.ticker,
    name: t.name || t.ticker,
    balance: String(t.balance || '0'),
    decimals: Number(t.decimals || 0),
    protocol: t.protocol,
    image: t.image || '',
    color: t.color || ''
  }));
}

function loadSnaps() {
  try {
    const raw = JSON.parse(localStorage.getItem(SNAPS_KEY) || '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) walletSnap = raw;
  } catch { walletSnap = {}; }
}

function persistSnaps() {
  try { localStorage.setItem(SNAPS_KEY, JSON.stringify(walletSnap)); } catch {}
}

function rememberActiveSnap() {
  if (!wallet?.address) return;
  walletSnap[wallet.address] = {
    sompi: balanceSompi,
    kcc: slimTokens(kccHoldings),
    krc: slimTokens(krcHoldings),
    txs: window.__txs || [],
    at: Date.now()
  };
  persistSnaps();
}

function hydrateFromSnap(addr) {
  const snap = walletSnap[addr];
  if (!snap) return;
  if (snap.sompi != null) {
    balanceSompi = Number(snap.sompi) || 0;
    seenBalance = balanceSompi;
  }
  if (Array.isArray(snap.kcc)) kccHoldings = snap.kcc;
  if (Array.isArray(snap.krc)) krcHoldings = snap.krc;
  if (Array.isArray(snap.txs)) window.__txs = snap.txs;
}

async function fetchWalletTxs(addr) {
  const res = await fetch(`${API_BASE}/addresses/${encodeURIComponent(addr)}/full-transactions?limit=20&resolve_previous_outpoints=light`);
  if (!res.ok) return [];
  const txs = await res.json();
  return Array.isArray(txs) ? txs : (txs.transactions || []);
}

function detectHoldingCredits(walletName, addr, prevList, nextList, protocol) {
  for (const t of nextList || []) {
    const prev = (prevList || []).find(x =>
      (t.tokenId && x.tokenId === t.tokenId) || (x.protocol === t.protocol && x.ticker === t.ticker)
    );
    let d = 0n;
    try {
      const nextAmt = BigInt(t.balance || '0');
      const prevAmt = BigInt(prev?.balance || '0');
      if (nextAmt > prevAmt) d = nextAmt - prevAmt;
    } catch { continue; }
    if (d <= 0n) continue;
    toast(`${walletName} received ${formatTokenUnits(d, t.decimals)} ${t.ticker}`);
    haptic();
    pushTokenActivity({
      dir: 'in',
      tick: t.ticker,
      protocol: protocol || t.protocol || 'kcc20',
      amount: d.toString(),
      decimals: t.decimals,
      label: 'Received'
    }, addr);
  }
}

function noteOwnedInbound(dest, ev) {
  const other = loadWalletList().find(w => w.address === dest);
  if (!other || other.address === wallet?.address) return;
  pushTokenActivity({ ...ev, dir: 'in', label: ev.label || 'Received' }, other.address);
}

async function refreshAllWalletSnaps({ tokens = false } = {}) {
  const list = loadWalletList();
  if (!list.length || snapBusy) return;
  snapBusy = true;
  lastAllSnap = Date.now();
  if (tokens) lastAllTokenSnap = Date.now();
  try {
    await Promise.all(list.map(async w => {
      const isActive = wallet && (w.id === wallet.id || w.address === wallet.address);
      if (isActive) {
        rememberActiveSnap();
        return;
      }
      try {
        const prev = walletSnap[w.address] || {};
        const sompi = await fetchAddressBalance(w.address);
        const grew = prev.sompi != null && Number(sompi) > Number(prev.sompi);
        const name = w.name || 'Wallet';
        if (grew) {
          const delta = Number(sompi) - Number(prev.sompi);
          toast(`${name} received ${formatAmount(delta)} KAS`);
          haptic();
          pushTokenActivity({
            dir: 'in', tick: 'KAS', protocol: 'kas',
            amount: String(delta), decimals: 8, label: 'Received'
          }, w.address);
        }
        const next = { ...prev, sompi, at: Date.now() };
        if (tokens || grew) {
          try { next.txs = await fetchWalletTxs(w.address); } catch {}
        }
        if (tokens) {
          const [kcc, krc] = await Promise.allSettled([
            fetchKcc20Portfolio(w.address, w.pubKey),
            fetchKrc20Portfolio(w.address)
          ]);
          const nextKcc = kcc.status === 'fulfilled' ? slimTokens(await attachKronLogos(kcc.value)) : (prev.kcc || []);
          const nextKrc = krc.status === 'fulfilled' ? slimTokens(krc.value) : (prev.krc || []);
          if (prev.kcc) detectHoldingCredits(name, w.address, prev.kcc, nextKcc, 'kcc20');
          if (prev.krc) detectHoldingCredits(name, w.address, prev.krc, nextKrc, 'krc20');
          if (kcc.status === 'fulfilled') next.kcc = nextKcc;
          if (krc.status === 'fulfilled') next.krc = nextKrc;
        }
        walletSnap[w.address] = next;
      } catch (e) {
        console.warn(e);
      }
    }));
    persistSnaps();
    if (currentTab === 'you') renderProfile();
    if (currentTab === 'home') renderHomeWallets();
    if (currentTab === 'activity' && activityAll) renderActivity(window.__txs || []);
  } finally {
    snapBusy = false;
  }
}

function migratePinOnto(w) {
  if (!w || w.pin?.hash) return w;
  try {
    const raw = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
    if (raw?.salt && raw?.hash) w.pin = raw;
  } catch {}
  return w;
}

function loadPin() {
  if (wallet?.pin?.salt && wallet?.pin?.hash) return wallet.pin;
  try {
    const raw = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
    if (raw?.salt && raw?.hash) return raw;
  } catch {}
  return null;
}

function sessionOpen() {
  return !!wallet && pinUnlockedFor === wallet.id;
}

function hidePinLock() {
  $('pin-lock')?.classList.add('hidden');
  $('pin-lock')?.setAttribute('aria-hidden', 'true');
  $('pin-lock')?.classList.remove('shake');
  pinBuffer = '';
  pinPending = '';
  paintPinDots();
  if (sessionOpen()) $('tabbar')?.classList.add('show');
}

function beginPinFlow(mode, purpose) {
  pinMode = mode || 'unlock';
  pinBuffer = '';
  if (mode !== 'confirm' && mode !== 'change-confirm') pinPending = '';
  const name = wallet?.name || 'this wallet';
  const titles = {
    unlock: ['Enter Passcode', 'Unlock ' + name],
    set: ['Set Passcode', 'Required for ' + name + ' · 4–8 digits'],
    confirm: ['Confirm Passcode', 'Enter the same PIN again'],
    'change-old': ['Enter Passcode', 'Current PIN for ' + name],
    'change-new': ['New Passcode', 'Choose 4–8 digits for ' + name],
    'change-confirm': ['Confirm Passcode', 'Enter the same PIN again'],
    gate: [purpose || 'Enter Passcode', 'Sign with ' + name]
  };
  const t = titles[pinMode] || titles.unlock;
  if ($('pin-title')) $('pin-title').textContent = t[0];
  if ($('pin-sub')) $('pin-sub').textContent = t[1];
  $('pin-err')?.classList.add('hidden');
  const canCancel = pinMode === 'gate' || pinMode === 'change-old' || pinMode === 'change-new' || pinMode === 'change-confirm';
  $('pin-cancel')?.classList.toggle('hidden', !canCancel);
  $('pin-lock')?.classList.remove('hidden', 'shake');
  $('pin-lock')?.setAttribute('aria-hidden', 'false');
  $('tabbar')?.classList.remove('show');
  paintPinDots();
}

function paintPinDots() {
  const rec = loadPin();
  const known = (pinMode === 'unlock' || pinMode === 'change-old' || pinMode === 'gate') ? (rec?.len || 6) : 0;
  const n = known || Math.min(8, Math.max(4, pinBuffer.length || 4));
  const box = $('pin-dots');
  if (!box) return;
  box.innerHTML = Array.from({ length: n }, (_, i) =>
    `<i class="${i < pinBuffer.length ? 'on' : ''}"></i>`
  ).join('');
}

function pinError(msg) {
  haptic();
  const err = $('pin-err');
  if (err) {
    err.textContent = msg;
    err.classList.remove('hidden');
  }
  const lock = $('pin-lock');
  lock?.classList.remove('shake');
  void lock?.offsetWidth;
  lock?.classList.add('shake');
  pinBuffer = '';
  paintPinDots();
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2PinHex(pin, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: 120000 },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function hashPin(pin, salt, rec) {
  if (rec?.kdf === 'pbkdf2-sha256') return pbkdf2PinHex(pin, salt);
  return sha256Hex(`${salt}:${pin}`);
}

async function savePin(pin) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = await pbkdf2PinHex(pin, salt);
  const rec = { salt, hash, len: pin.length, kdf: 'pbkdf2-sha256' };
  if (wallet) {
    wallet.pin = rec;
    saveWallet();
  }
  localStorage.removeItem(PIN_KEY);
}

async function pinMatches(pin) {
  const rec = loadPin();
  if (!rec) return false;
  return (await hashPin(pin, rec.salt, rec)) === rec.hash;
}

async function pinPress(key) {
  if ($('pin-lock')?.classList.contains('hidden')) return;
  if (Date.now() < pinLockUntil) {
    pinError(`Try again in ${Math.ceil((pinLockUntil - Date.now()) / 1000)}s`);
    return;
  }
  if (key === 'back') {
    pinBuffer = pinBuffer.slice(0, -1);
    paintPinDots();
    return;
  }
  if (key === 'ok') {
    await submitPin();
    return;
  }
  if (!/^\d$/.test(key) || pinBuffer.length >= 8) return;
  pinBuffer += key;
  paintPinDots();
  const rec = loadPin();
  if ((pinMode === 'unlock' || pinMode === 'change-old' || pinMode === 'gate') && rec?.len && pinBuffer.length >= rec.len) {
    await submitPin();
  }
}

async function submitPin() {
  const pin = pinBuffer;
  if (pinMode === 'set' || pinMode === 'change-new') {
    if (!/^\d{4,8}$/.test(pin)) { pinError('Use 4 to 8 digits'); return; }
    pinPending = pin;
    beginPinFlow(pinMode === 'set' ? 'confirm' : 'change-confirm');
    return;
  }
  if (pinMode === 'confirm' || pinMode === 'change-confirm') {
    if (pin !== pinPending) {
      pinError('PINs did not match');
      beginPinFlow(pinMode === 'confirm' ? 'set' : 'change-new');
      return;
    }
    await savePin(pin);
    sessionUnlocked = true;
    if (wallet?.id) pinUnlockedFor = wallet.id;
    hidePinLock();
    toast('PIN saved for ' + (wallet?.name || 'wallet'));
    if (pinWait) {
      const w = pinWait;
      pinWait = null;
      w.resolve(true);
    }
    if (pendingNewKey) {
      const pk = pendingNewKey;
      pendingNewKey = null;
      await unlockToHome();
      openSheet('Your new wallet', `
        <p class="muted" style="text-align:left;padding:0 0 12px;">This is the only copy of this wallet’s private key. It stays hidden until you reveal it. Store it offline.</p>
        <div class="field"><label>Private key</label>
          <div class="pk-mask" id="new-pk-view">••••••••••••••••••••••••••••••••</div>
        </div>
        <div class="btn-row" style="margin-bottom:8px;">
          <button class="btn btn-glass" id="reveal-new-pk" type="button">Reveal</button>
          <button class="btn btn-glass" id="copy-new-pk" type="button">Copy</button>
        </div>
      `, { confirm: 'I saved it', cancel: false });
      let shown = false;
      $('reveal-new-pk').onclick = () => {
        shown = !shown;
        const el = $('new-pk-view');
        if (!el) return;
        el.textContent = shown ? pk : '••••••••••••••••••••••••••••••••';
        el.classList.toggle('shown', shown);
        $('reveal-new-pk').textContent = shown ? 'Hide' : 'Reveal';
      };
      $('copy-new-pk').onclick = async () => {
        await navigator.clipboard.writeText(pk);
        toast('Key copied');
      };
      return;
    }
    if (wallet?.address) await unlockToHome();
    if (currentTab === 'you') renderProfile();
    return;
  }
  if (!/^\d{4,8}$/.test(pin)) { pinError('Enter your PIN'); return; }
  const ok = await pinMatches(pin);
  if (!ok) {
    pinFails += 1;
    if (pinFails >= 5) {
      pinLockUntil = Date.now() + 20000;
      pinFails = 0;
      pinError('Too many tries — wait 20 seconds');
      return;
    }
    pinError('Wrong PIN');
    return;
  }
  pinFails = 0;
  if (pinMode === 'change-old') {
    beginPinFlow('change-new');
    return;
  }
  if (pinMode === 'gate') {
    hidePinLock();
    if (wallet?.id) pinUnlockedFor = wallet.id;
    $('tabbar')?.classList.toggle('show', !!wallet);
    if (pinWait) {
      const w = pinWait;
      pinWait = null;
      w.resolve(true);
    }
    return;
  }
  await finishPinUnlock();
}

async function finishPinUnlock() {
  sessionUnlocked = true;
  if (wallet?.id) pinUnlockedFor = wallet.id;
  hidePinLock();
  if (wallet?.address) await unlockToHome();
}

function lockNow() {
  closeSheet();
  stopQrScan();
  hideTradeScreen();
  pinUnlockedFor = '';
  sessionUnlocked = false;
  $('tabbar')?.classList.remove('show');
  if (!loadPin()) beginPinFlow('set');
  else beginPinFlow('unlock');
}

function requirePin(purpose) {
  return new Promise((resolve, reject) => {
    if (!wallet) { reject(new Error('No wallet')); return; }
    pinWait = { resolve, reject };
    if (!loadPin()) beginPinFlow('set');
    else beginPinFlow('gate', purpose || 'Enter Passcode');
  });
}

function cancelPinGate() {
  if (pinMode === 'set' || pinMode === 'confirm' || pinMode === 'unlock') return;
  const w = pinWait;
  pinWait = null;
  hidePinLock();
  if (wallet?.id && pinUnlockedFor === wallet.id) $('tabbar')?.classList.add('show');
  w?.reject(new Error('cancelled'));
}

function onPinKeydown(e) {
  if ($('pin-lock')?.classList.contains('hidden')) return;
  if (e.key >= '0' && e.key <= '9') { e.preventDefault(); pinPress(e.key); }
  else if (e.key === 'Backspace') { e.preventDefault(); pinPress('back'); }
  else if (e.key === 'Enter') { e.preventDefault(); pinPress('ok'); }
}

function openPinSettings() {
  haptic();
  const rec = loadPin();
  const name = wallet?.name || 'this wallet';
  if (!rec) {
    beginPinFlow('set');
    return;
  }
  openSheet('PIN for ' + name, `
    <p class="muted" style="text-align:left;padding:0 0 10px;">Each wallet has its own iOS-style passcode. Sends and trades ask for it. It is not a recovery phrase.</p>
    <div class="btn-row" style="margin-bottom:10px;">
      <button class="btn btn-gold" id="pin-change" type="button">Change PIN</button>
      <button class="btn btn-glass" id="pin-lock-now" type="button">Lock now</button>
    </div>
  `, { confirm: 'Close', cancel: false });
  $('pin-change').onclick = () => { closeSheet(); beginPinFlow('change-old'); };
  $('pin-lock-now').onclick = () => { closeSheet(); lockNow(); };
}

function parseKaspaQr(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const packed = text.replace(/\s+/g, '');
  const m = packed.match(/(kaspa:[qp][a-z0-9]+)(?:\?([^]*))?/i);
  if (m) {
    const addr = m[1].toLowerCase();
    let amount = '';
    try {
      const qs = new URLSearchParams(m[2] || '');
      amount = qs.get('amount') || qs.get('value') || '';
    } catch {}
    if (isValidKaspaAddress(addr)) return { address: addr, amount };
  }
  const bare = packed.toLowerCase();
  if (isValidKaspaAddress(bare)) return { address: bare, amount: '' };
  return null;
}

function stopQrScan() {
  if (qrRaf) {
    cancelAnimationFrame(qrRaf);
    qrRaf = 0;
  }
  if (qrStream) {
    try { qrStream.getTracks().forEach(t => t.stop()); } catch {}
    qrStream = null;
  }
  const vid = $('qr-video');
  if (vid) vid.srcObject = null;
  $('qr-scan-box')?.classList.add('hidden');
}

async function startQrScan() {
  const box = $('qr-scan-box');
  const video = $('qr-video');
  if (!box || !video) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Camera is not available on this device');
    return;
  }
  stopQrScan();
  box.classList.remove('hidden');
  if ($('qr-scan-status')) $('qr-scan-status').textContent = 'Point at a Kaspa address QR';
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  });
  qrStream = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  let detector = null;
  if (typeof window.BarcodeDetector === 'function') {
    try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch {}
  }
  let jsQR = null;
  if (!detector) {
    try {
      const mod = await import('https://esm.sh/jsqr@1.4.0');
      jsQR = mod.default || mod.jsQR || mod;
    } catch {
      toast('QR library failed to load — try Chrome or a phone');
      return;
    }
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let last = 0;
  const tick = async () => {
    if (!qrStream) return;
    qrRaf = requestAnimationFrame(tick);
    if (Date.now() - last < 180) return;
    last = Date.now();
    try {
      let value = '';
      if (detector) {
        const codes = await detector.detect(video);
        value = codes?.[0]?.rawValue || '';
      } else if (typeof jsQR === 'function' && video.readyState >= 2) {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        if (!w || !h) return;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, img.width, img.height);
        value = code?.data || '';
      }
      if (!value) return;
      const parsed = parseKaspaQr(value);
      if (!parsed) {
        if ($('qr-scan-status')) $('qr-scan-status').textContent = 'Not a Kaspa address — try again';
        return;
      }
      if ($('send-dest')) $('send-dest').value = parsed.address;
      if (parsed.amount && $('send-amount') && !$('send-amount').value) $('send-amount').value = parsed.amount;
      toast('Address scanned');
      haptic();
      stopQrScan();
    } catch {}
  };
  qrRaf = requestAnimationFrame(tick);
}

function bindSendQr() {
  $('send-scan-qr')?.addEventListener('click', () => {
    startQrScan().catch(e => toast(errText(e)));
  });
  $('qr-scan-stop')?.addEventListener('click', stopQrScan);
}

function resetLiveState() {
  utxos = [];
  balanceSompi = 0;
  seenBalance = null;
  kccHoldings = [];
  krcHoldings = [];
  seenTokens = false;
  tokenLoadErr = '';
  window.__txs = [];
  autoSweepTried.clear();
  tokenActBackfill = false;
}

async function activateWallet(w, { toastMsg } = {}) {
  wallet = migrateReceiveBook(migratePinOnto(w));
  saveWallet();
  setVaultOwner(w.address);
  resetLiveState();
  hydrateFromSnap(w.address);
  if (toastMsg) toast(toastMsg);
  pinUnlockedFor = '';
  sessionUnlocked = false;
  $('tabbar')?.classList.remove('show');
  if (!loadPin()) {
    beginPinFlow('set');
    return;
  }
  beginPinFlow('unlock');
}

async function unlockToHome() {
  if (wallet?.address) setVaultOwner(wallet.address);
  $('page-lock').classList.remove('active');
  showPage('home');
  $('tabbar').classList.add('show');
  renderHome();
  startLiveSync();
  loadKaspaSdk().catch(() => {});
  const pend = wallet?.address ? loadKrc20Pending(wallet.address) : null;
  if (pend) toast('Unfinished KRC-20 reveal — open Send to finish it');
}

async function createWallet() {
  haptic();
  toast('Generating keys…');
  try {
    await loadCryptoLibs();
    const priv = await generatePrivateKey();
    const kp = await createKeypairFromHex(priv);
    const list = loadWalletList();
    const w = {
      ...kp,
      id: uid(),
      name: 'Wallet ' + (list.length + 1),
      createdAt: Date.now()
    };
    pendingNewKey = w.privKey;
    await activateWallet(w, { toastMsg: list.length ? 'New wallet added' : 'Wallet created' });
  } catch (e) {
    toast(e.message);
  }
}

async function importWallet() {
  haptic();
  const hex = $('import-key').value.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) { toast('Need a 64-character hex key'); return; }
  try {
    const kp = await createKeypairFromHex(hex);
    const list = loadWalletList();
    const existing = list.find(w => w.address === kp.address);
    if (existing) {
      await activateWallet({ ...existing, ...kp }, { toastMsg: 'Switched to imported wallet' });
      return;
    }
    const w = { ...kp, id: uid(), name: 'Wallet ' + (list.length + 1), createdAt: Date.now() };
    await activateWallet(w, { toastMsg: 'Wallet imported' });
  } catch (e) {
    toast(e.message);
  }
}

function logout() {
  stopLiveSync();
  const list = loadWalletList().filter(w => w.id !== wallet?.id && w.address !== wallet?.address);
  saveWalletList(list);
  if (list.length) {
    activateWallet(list[0], { toastMsg: 'Wallet removed' }).catch(e => toast(errText(e)));
    return;
  }
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(ACTIVE_KEY);
  wallet = null;
  location.reload();
}

function kas() { return balanceSompi / 1e8; }
function usd(n) { return (n * (price || 0)).toLocaleString(undefined, { style: 'currency', currency: 'USD' }); }

function paintIfChanged(el, html) {
  if (!el) return;
  if (el.dataset.paint === html) return;
  el.dataset.paint = html;
  el.innerHTML = html;
}

function renderHome() {
  if (!wallet) return;
  if ($('live-pill')) $('live-pill').textContent = 'Live · ' + BUILD;
  const balHtml = `${formatAmount(balanceSompi)}<small>KAS</small>`;
  if ($('card-bal') && $('card-bal').innerHTML !== balHtml) $('card-bal').innerHTML = balHtml;
  if ($('card-usd')) $('card-usd').textContent = price ? `≈ ${usd(kas())}` : 'Fetching price…';
  if ($('card-addr')) $('card-addr').textContent = wallet.knsDomain
    ? wallet.knsDomain + ' · ' + shortAddr(wallet.address, 12, 8)
    : shortAddr(wallet.address, 12, 8);
  if ($('card-wallet')) $('card-wallet').textContent = `${wallet.name || 'Wallet'} ▾`;
  const navW = $('nav-wallet')?.querySelector('b');
  if (navW) navW.textContent = wallet.name || 'Wallet';
  renderHomeWallets();
  renderHoldings();
}

function walletKasLabel(w, active) {
  const sompi = active ? balanceSompi : walletSnap[w.address]?.sompi;
  if (sompi == null) return '…';
  return formatAmount(sompi);
}

function renderHomeWallets() {
  const box = $('home-wallets');
  if (!box || !wallet) return;
  const list = loadWalletList();
  paintIfChanged(box, list.map(w => {
    const active = w.id === wallet.id;
    const kasTxt = walletKasLabel(w, active);
    const sendBtn = !active
      ? `<button class="w-send" type="button" data-send-to="${esc(w.id)}" aria-label="Send to ${esc(w.name || 'wallet')}">↗</button>`
      : '';
    return `
      <div class="w-chip${active ? ' on' : ''}">
        <button class="w-chip-main" type="button" data-switch-wallet="${esc(w.id)}">
          <span class="w-kas" aria-hidden="true"></span>
          <span>
            <b>${esc(w.name || 'Wallet')}</b>
            <em>${esc(kasTxt)} KAS</em>
          </span>
        </button>
        ${sendBtn}
      </div>`;
  }).join('') + `<button class="w-chip add" type="button" data-add-wallet="1" aria-label="Add wallet">＋</button>`);
}

function otherWallets() {
  return loadWalletList().filter(w => w.id !== wallet?.id);
}

function openSendToWallet(id) {
  const w = loadWalletList().find(x => x.id === id);
  if (!w) return;
  if (w.id === wallet?.id) { toast('That is this wallet'); return; }
  openSend({ destination: w.address, ownedName: w.name || 'Wallet' });
}

function openMoveToOwned() {
  const others = otherWallets();
  if (!others.length) {
    toast('Add another wallet first — then Move sends from here to it');
    return;
  }
  if (others.length === 1) {
    openSendToWallet(others[0].id);
    return;
  }
  haptic();
  const rows = others.map(w => {
    const sompi = walletSnap[w.address]?.sompi;
    const kasTxt = sompi == null ? '…' : formatAmount(sompi) + ' KAS';
    return `
      <button class="row token-row" type="button" data-send-to="${esc(w.id)}">
        <span class="w-kas" aria-hidden="true" style="width:28px;height:28px;"></span>
        <div style="flex:1;min-width:0">
          <div class="title">${esc(w.name || 'Wallet')}</div>
          <div class="sub">${esc(shortAddr(w.address, 12, 8))}</div>
        </div>
        <div class="amt"><b>${esc(kasTxt)}</b><em>Send here</em></div>
      </button>`;
  }).join('');
  openSheet('Move from ' + (wallet?.name || 'this wallet'), `
    <p class="muted" style="text-align:left;padding:0 0 10px;">Sends from the wallet you are in now to another of your wallets.</p>
    <div class="glass list">${rows}</div>
  `, { confirm: 'Cancel', cancel: false, onConfirm: () => closeSheet() });
  $('sheet-body')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-send-to]');
    if (!btn?.dataset.sendTo) return;
    closeSheet();
    openSendToWallet(btn.dataset.sendTo);
  }, { once: true });
}

function switchToWallet(id) {
  const w = loadWalletList().find(x => x.id === id);
  if (!w || w.id === wallet?.id) return;
  activateWallet(w, { toastMsg: 'Sending from ' + (w.name || 'wallet') }).catch(err => toast(errText(err)));
}

function openWalletSwitcher() {
  haptic();
  const list = loadWalletList();
  const rows = list.map(w => {
    const active = w.id === wallet?.id;
    const snap = walletSnap[w.address] || {};
    const sompi = active ? balanceSompi : snap.sompi;
    const kcc = active ? kccHoldings : (snap.kcc || []);
    const krc = active ? krcHoldings : (snap.krc || []);
    const tokens = [...kcc, ...krc];
    const bits = tokens.slice(0, 2).map(t => `${formatTokenUnits(t.balance, t.decimals)} ${t.ticker}`);
    const more = tokens.length > 2 ? ` +${tokens.length - 2}` : '';
    const kasTxt = sompi == null ? '…' : `${formatAmount(sompi)} KAS`;
    const tokTxt = bits.length ? bits.join(' · ') + more : 'Native KAS';
    return `
      <button class="row wallet-row" type="button" data-switch-wallet="${esc(w.id)}">
        <div class="glyph" style="background:${active ? 'rgba(48,209,88,.16)' : 'rgba(255,255,255,.08)'};color:${active ? 'var(--green)' : 'var(--label-2)'}">${active ? '●' : '○'}</div>
        <div style="min-width:0;flex:1">
          <div class="title">${esc(w.name || 'Wallet')}</div>
          <div class="sub">${esc(shortAddr(w.address, 12, 8))}</div>
        </div>
        <div class="amt">
          <b>${esc(kasTxt)}</b>
          <em>${esc(tokTxt)}</em>
        </div>
        <span class="chev">${active ? 'Now' : 'Use'}</span>
      </button>`;
  }).join('');
  openSheet('Wallets', `
    <p class="muted" style="text-align:left;padding:0 0 10px;">Pick a wallet to send, receive, and vault from. Balances stay live.</p>
    <div class="glass list" id="switch-list">${rows || '<div class="empty">No wallets</div>'}</div>
    <div class="btn-row">
      <button class="btn btn-gold" id="switch-new" type="button">New wallet</button>
      <button class="btn btn-glass" id="switch-import" type="button">Import</button>
    </div>
  `, { confirm: 'Done', cancel: false });
  $('switch-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-switch-wallet]');
    if (!btn?.dataset.switchWallet) return;
    closeSheet();
    switchToWallet(btn.dataset.switchWallet);
  });
  $('switch-new').onclick = () => { closeSheet(); createWallet(); };
  $('switch-import').onclick = () => { closeSheet(); openImportAnother(); };
}

function tokenDot(t) {
  const color = t.color || tokenColor(t.ticker);
  const fb = esc(String(t.ticker || '?').slice(0, 3));
  if (t.native || t.ticker === 'KAS') {
    return `<div class="dot kas-dot" aria-hidden="true"></div>`;
  }
  const src = t.image
    || (t.protocol === 'krc20' ? krc20Logo(t.ticker) : kcc20Identicon(t.ticker));
  return `<div class="dot" style="background:${esc(color)}22;color:${esc(color)}"><img alt="" src="${esc(src)}" data-tick="${esc(t.ticker || '')}" data-proto="${esc(t.protocol || '')}" data-fb="${fb}" referrerpolicy="no-referrer" decoding="async"></div>`;
}

function tokenRow(t, extra = '') {
  const proto = t.protocol === 'krc20' ? 'KRC-20' : (t.native ? 'Native' : 'KCC20');
  const amt = t.native ? formatAmount(t.sompi) : formatTokenUnits(t.balance, t.decimals);
  const em = t.native ? (t.usd || '') : (Number(t.priceKas) && price ? usd(Number(t.balance) / (10 ** (t.decimals || 0)) * t.priceKas) : proto);
  const key = `${t.protocol || 'watch'}:${t.ticker}`;
  return `
    <button class="row token-row" data-token-key="${esc(key)}" ${extra}>
      ${tokenDot(t)}
      <div>
        <div class="title">${esc(t.name || t.ticker)}</div>
        <div class="sub">${esc(t.ticker)} · ${esc(proto)}</div>
      </div>
      <div class="amt">
        <b>${esc(amt)}</b>
        <em>${esc(em)}</em>
      </div>
    </button>`;
}

function renderHoldings() {
  const kasRow = tokenRow({ ...NATIVE_KAS, sompi: balanceSompi, usd: usd(kas()), protocol: 'native' }, 'data-ticker="KAS"');
  const kccRows = kccHoldings.map(t => tokenRow(t));
  const krcRows = krcHoldings.map(t => tokenRow(t));
  const locked = loadVaults().filter(v => v.address && Number(v.fundedSompi) > 0 && !isVaultHistory(v));
  const lockRows = locked.map(v => {
    const sec = remainingLockSec(v.unlockDaa);
    const lockedNow = sec == null || sec > 0;
    const tok = vaultTokenLabel(v);
    return `
    <button class="row token-row" data-lock-holding="${esc(v.address)}">
      <div class="dot" style="background:rgba(212,176,122,.18);color:var(--gold-2)">⏱</div>
      <div>
        <div class="title">${esc(v.name || 'Time Capsule')}</div>
        <div class="sub">${lockedNow ? 'Unlocks in <span data-unlock-daa="' + esc(v.unlockDaa) + '">' + esc(formatLockClock(sec)) + '</span>' : 'Unlocked — returning to wallet'}</div>
      </div>
      <div class="amt">
        <b>${tok ? esc(tok) : formatAmount(v.fundedSompi || 0)}</b>
        <em>${lockedNow ? 'Locked' : 'Unlocking'}</em>
      </div>
    </button>`;
  });
  const rows = [kasRow, ...kccRows, ...krcRows, ...lockRows];
  const key = `${balanceSompi}|${kccHoldings.map(t => `${t.ticker}:${t.balance}:${t.image || ''}`).join(',')}|${krcHoldings.map(t => `${t.ticker}:${t.balance}`).join(',')}|${locked.map(v => v.address + ':' + (v.fundedSompi || 0)).join(',')}`;
  const box = $('holdings');
  paintUtxoCount();
  if (box?.dataset.key === key) return;
  if (box) box.dataset.key = key;
  paintIfChanged(box, rows.join(''));
}

function asUtxoList(raw) {
  const list = Array.isArray(raw) ? raw
    : Array.isArray(raw?.utxos) ? raw.utxos
    : Array.isArray(raw?.result) ? raw.result
    : [];
  return list.map(u => {
    const c = validateAndCleanUtxo(u);
    if (!c) return null;
    return { outpoint: c.outpoint, amount: c.amount, scriptPublicKey: c.scriptPublicKey, blockDaaScore: c.blockDaaScore, isCoinbase: c.isCoinbase };
  }).filter(Boolean);
}

function paintUtxoCount() {
  const n = Array.isArray(utxos) ? utxos.length : 0;
  if ($('utxo-count')) $('utxo-count').textContent = n === 1 ? '1 UTXO' : `${n} UTXOs`;
  if ($('profile-utxos')) $('profile-utxos').textContent = n === 1 ? '1' : String(n);
}

function renderTokens() {
  const watched = loadWatchlist();
  $('token-native').innerHTML = tokenRow({ ...NATIVE_KAS, sompi: balanceSompi, usd: usd(kas()), protocol: 'native' }, 'data-ticker="KAS"');
  const kcc = $('token-list');
  if (kcc) {
    kcc.innerHTML = kccHoldings.length
      ? kccHoldings.map(t => tokenRow(t)).join('')
      : `<div class="empty">${tokenLoadErr || (lastTokenFetch ? 'No KCC20 on this address yet. Import the same key as KasWare to see KRON / KKDAG here automatically.' : 'Loading KCC20…')}</div>`;
  }
  const krc = $('token-krc20');
  if (krc) {
    krc.innerHTML = krcHoldings.length
      ? krcHoldings.map(t => tokenRow(t)).join('')
      : `<div class="empty">No KRC-20 (Kasplex / KasWare) tokens on this address.</div>`;
  }
  const watch = $('token-watch');
  if (watch) {
    watch.innerHTML = watched.length
      ? watched.map(t => `
      <div class="row token-row">
        ${tokenDot({ ...t, ticker: t.ticker })}
        <div style="flex:1;min-width:0">
          <div class="title">${esc(t.name)}</div>
          <div class="sub">${esc(t.covenantAddress ? shortAddr(t.covenantAddress) : 'Manual watch')}</div>
        </div>
        <button class="nav-btn ghost" data-remove="${esc(t.ticker)}">Remove</button>
      </div>`).join('')
      : `<div class="empty">Optional: watch a ticker that the indexer has not listed yet.</div>`;
  }
}

function vaultStatusLine(v) {
  const tok = vaultTokenLabel(v);
  const amt = tok || (v.fundedSompi ? formatAmount(v.fundedSompi) + ' KAS' : '0 KAS');
  if (isHopVault(v) && v.hops) {
    const i = Number(v.hopIndex || 0);
    const sec = remainingLockSec(v.unlockDaa);
    const clock = sec > 0
      ? ` · <span data-unlock-daa="${esc(v.unlockDaa)}">${esc(formatLockClock(sec))}</span>`
      : (v.unlockDaa ? ' · timeout' : '');
    return `Hop ${i + 1}/${v.hops.length}${clock} · ${amt}`;
  }
  if (!v.fundedSompi && !tok) return `${v.status || 'unfunded'} · ${amt}`;
  if (v.unlockDaa) {
    const sec = remainingLockSec(v.unlockDaa);
    if (sec == null) return `Locked · ${amt}`;
    if (sec > 0) return `Unlocks in <span data-unlock-daa="${esc(v.unlockDaa)}">${esc(formatLockClock(sec))}</span> · ${amt}`;
    return `Unlocked — returning · ${amt}`;
  }
  return `${v.status || 'funded'} · ${amt}`;
}

function setVaultTab(tab) {
  document.querySelectorAll('#vault-seg button').forEach(b => b.classList.toggle('on', b.dataset.vtab === tab));
  $('vault-create')?.classList.toggle('hidden', tab !== 'create');
  $('vault-mine-wrap')?.classList.toggle('hidden', tab !== 'mine');
}

let showVaultHistory = false;

function setVaultHistory(on) {
  showVaultHistory = !!on;
  document.querySelectorAll('#vault-hist-seg button').forEach(b => {
    b.classList.toggle('on', (b.dataset.vhist === 'history') === showVaultHistory);
  });
  renderVault();
}

function renderVault() {
  const all = loadVaults();
  const history = all.filter(isVaultHistory);
  const live = all.filter(v => !isVaultHistory(v));
  const mine = showVaultHistory ? history : live;
  $('vault-products').innerHTML = VAULT_GROUPS.map(g => {
    const items = VAULT_PRODUCTS.filter(p => p.group === g.id);
    return `
      <div class="vault-group">
        <div class="section-label">${esc(g.title)}</div>
        <p class="vault-hint">${esc(g.hint)}</p>
        <div class="vault-grid">
          ${items.map(p => `
            <button class="glass product" data-product="${esc(p.id)}" type="button">
              <div class="glyph">${esc(p.tag)}</div>
              <h4>${esc(p.name)}</h4>
              <span class="product-why">${esc(p.why || p.blurb)}</span>
            </button>`).join('')}
        </div>
      </div>`;
  }).join('');
  const empty = showVaultHistory
    ? 'Nothing finished yet. Swept capsules land here.'
    : 'No vaults yet. Tap Time Capsule to lock a little KAS for a few minutes — a safe first try.';
  $('vault-mine').innerHTML = mine.length
    ? mine.map(v => `
      <div class="row token-row vault-card${showVaultHistory ? ' history' : ''}">
        <div class="dot" style="background:rgba(212,176,122,.18);color:var(--gold-2)">${showVaultHistory ? '✓' : '⏱'}</div>
        <div style="min-width:0;flex:1">
          <div class="title">${esc(v.name || v.type)}</div>
          <div class="sub">${showVaultHistory ? 'Swept · ' + esc(v.tick || v.type || '') : vaultStatusLine(v)}</div>
        </div>
        <div class="vault-card-actions">
          <button class="nav-btn ghost" data-vault="${esc(v.address || '')}">Info</button>
          ${showVaultHistory ? '' : `<button class="nav-btn" data-sweep="${esc(v.address || '')}">Sweep</button>`}
        </div>
      </div>`).join('')
    : `<div class="empty vault-empty">${empty}</div>`;
  if ($('sweep-all')) $('sweep-all').onclick = (e) => {
    e.stopPropagation();
    sweepAllVaults().catch(err => toast(errText(err)));
  };
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

function actStoreKey(addr) {
  return ACT_KEY + ':' + (addr || wallet?.address || '');
}

function loadTokenActivity(addr) {
  try {
    const raw = JSON.parse(localStorage.getItem(actStoreKey(addr)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveTokenActivity(list, addr) {
  localStorage.setItem(actStoreKey(addr), JSON.stringify((list || []).slice(0, 80)));
}

function pushTokenActivity(ev, addr) {
  const use = addr || wallet?.address;
  if (!use || !ev) return null;
  const list = loadTokenActivity(use);
  const row = {
    id: ev.id || ('ta-' + Date.now().toString(36) + Math.random().toString(16).slice(2, 8)),
    time: Number(ev.time || Date.now()),
    dir: ev.dir === 'out' ? 'out' : 'in',
    tick: String(ev.tick || '').toUpperCase(),
    protocol: ev.protocol || 'kcc20',
    amount: String(ev.amount || '0'),
    decimals: Number(ev.decimals || 0),
    txId: ev.txId || '',
    label: ev.label || (ev.dir === 'out' ? 'Sent' : 'Received'),
    wallet: loadWalletList().find(w => w.address === use)?.name || ''
  };
  const dup = list.find(x =>
    x.tick === row.tick && x.dir === row.dir && x.amount === row.amount &&
    ((row.txId && x.txId === row.txId) || Math.abs((x.time || 0) - row.time) < 180000)
  );
  if (dup) {
    if (row.txId && !dup.txId) {
      dup.txId = row.txId;
      if (ev.time) dup.time = Number(ev.time);
      saveTokenActivity(list, use);
    }
    if (currentTab === 'activity') renderActivity(window.__txs || []);
    return dup;
  }
  list.unshift(row);
  saveTokenActivity(list, use);
  if (currentTab === 'activity') renderActivity(window.__txs || []);
  return row;
}

async function attachKcc20ReceiveTxid(ev) {
  if (!ev || ev.txId || ev.protocol === 'krc20' || !wallet?.address) return;
  try {
    const res = await fetch(
      'https://idx.kron.technology/v1/kcc20/token/' +
      encodeURIComponent(ev.tick) + '/address/' +
      encodeURIComponent(wallet.address) + '/utxos',
      { cache: 'no-store' }
    );
    if (!res.ok) return;
    const data = await res.json();
    const cells = Array.isArray(data?.result) ? data.result : [];
    const ids = [...new Set(cells.map(c => c.outpoint?.transactionId).filter(Boolean))].slice(0, 5);
    let best = null;
    for (const id of ids) {
      const tx = await fetchKaspaTx(id).catch(() => null);
      if (!tx) continue;
      const t = Number(tx.block_time || tx.blockTime || 0);
      if (!best || t > best.t) best = { id, t };
    }
    if (!best) return;
    const list = loadTokenActivity();
    const row = list.find(x => x.id === ev.id);
    if (!row) return;
    row.txId = best.id;
    if (best.t) row.time = best.t;
    saveTokenActivity(list);
    if (currentTab === 'activity') renderActivity(window.__txs || []);
  } catch {}
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

function activityVal(a) {
  if (a.protocol === 'kas' || a.tick === 'KAS') {
    return (a.dir === 'in' ? '+' : '−') + formatAmount(a.amount);
  }
  return (a.dir === 'in' ? '+' : '−') + formatTokenUnits(a.amount, a.decimals) + ' ' + a.tick;
}

function rowsForWallet(addr, txs, walletName) {
  const tokenActs = loadTokenActivity(addr);
  const chain = Array.isArray(txs) ? txs : [];
  const chainIds = new Set(chain.map(t => t.transaction_id || t.transactionId).filter(Boolean));
  const rows = [];
  const tag = walletName && activityAll ? walletName + ' · ' : '';
  for (const tx of chain) {
    const id = tx.transaction_id || tx.transactionId || '';
    const tok = tokenActs.find(a => a.txId && a.txId === id);
    const row = summarizeTx(tx, addr);
    if (tok) {
      row.label = (tok.dir === 'in' ? 'Received ' : 'Sent ') + tok.tick;
      row.tokenLabel = activityVal(tok);
    }
    const expl = explainTransaction(tx, { address: addr, vaults: loadVaults() });
    rows.push({
      kind: 'chain',
      id,
      time: Number(tx.block_time || tx.blockTime || 0),
      dir: row.dir,
      title: tag + row.label,
      sub: [tok ? (tok.protocol === 'krc20' ? 'KRC-20' : (tok.protocol === 'kas' ? 'KAS' : 'KCC20')) : expl.title, id ? id.slice(0, 10) + '…' : '', new Date(tx.block_time || Date.now()).toLocaleString()].filter(Boolean).join(' · '),
      val: row.tokenLabel || ((row.dir === 'in' ? '+' : '−') + formatAmount(row.amount || 0)),
      feeLine: row.fee > 0 ? `fee ${formatAmount(row.fee)} KAS` : (row.note || ''),
      tokId: tok?.id || ''
    });
  }
  for (const a of tokenActs) {
    if (a.txId && chainIds.has(a.txId)) continue;
    const proto = a.protocol === 'krc20' ? 'KRC-20' : (a.protocol === 'kas' || a.tick === 'KAS' ? 'KAS' : 'KCC20');
    rows.push({
      kind: 'token',
      id: a.txId || '',
      actId: a.id,
      time: Number(a.time || 0),
      dir: a.dir,
      title: tag + (a.label || (a.dir === 'in' ? 'Received' : 'Sent')) + ' ' + a.tick,
      sub: [proto, a.txId ? a.txId.slice(0, 10) + '…' : 'live credit', new Date(a.time || Date.now()).toLocaleString()].filter(Boolean).join(' · '),
      val: activityVal(a),
      feeLine: a.txId ? '' : 'Indexed to this wallet',
      tokId: a.id
    });
  }
  return rows;
}

function renderActivity(txs = []) {
  const box = $('activity-list');
  if (!box) return;
  const many = loadWalletList().length > 1;
  const scope = $('act-scope');
  if (scope) {
    scope.classList.toggle('hidden', !many);
    scope.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.actscope === 'all') === activityAll));
  }
  let rows = [];
  if (activityAll && many) {
    for (const w of loadWalletList()) {
      const isActive = wallet && w.address === wallet.address;
      const txsW = isActive ? (txs || window.__txs || []) : (walletSnap[w.address]?.txs || []);
      rows = rows.concat(rowsForWallet(w.address, txsW, w.name || 'Wallet'));
    }
  } else {
    rows = rowsForWallet(wallet?.address, txs, wallet?.name);
  }
  rows.sort((a, b) => (b.time || 0) - (a.time || 0));
  if (!rows.length) {
    box.innerHTML = `<div class="empty">No recent activity on ${activityAll ? 'these wallets' : 'this wallet'}. Incoming KAS and KCC20 show here automatically.</div>`;
    return;
  }
  box.innerHTML = rows.slice(0, 40).map(r => `
      <button class="tx" type="button" ${r.id ? `data-txid="${esc(r.id)}"` : ''} ${r.tokId ? `data-token-act="${esc(r.tokId)}"` : ''}>
        <div class="dir">${r.dir === 'in' ? '↓' : '↑'}</div>
        <div class="meta">
          <b>${esc(r.title)}</b>
          <span>${esc(r.sub)}</span>
        </div>
        <div class="val ${r.dir === 'in' ? 'in' : 'out'}">${esc(r.val)}${r.feeLine ? `<small>${esc(r.feeLine)}</small>` : ''}
          ${r.id ? `<button type="button" class="copy-chip" data-copy="${esc(r.id)}">Copy ID</button>` : ''}
        </div>
      </button>`).join('');
}

function renderProfile() {
  if (!wallet) return;
  const addr = wallet.address || '';
  if ($('profile-addr')) $('profile-addr').textContent = addr;
  if ($('profile-bal')) $('profile-bal').textContent = formatAmount(balanceSompi) + ' KAS';
  if ($('profile-script')) $('profile-script').textContent = String(addr).startsWith('kaspa:p') ? 'P2SH covenant' : 'P2PK Schnorr key';
  if ($('profile-name')) $('profile-name').textContent = wallet.name || 'Wallet';
  if ($('profile-utxos')) {
    const n = Array.isArray(utxos) ? utxos.length : 0;
    $('profile-utxos').textContent = n === 1 ? '1' : String(n);
  }
  const ex = $('profile-explorer');
  if (ex && addr) {
    ex.href = explorerAddr(addr);
    ex.textContent = 'Open on kaspa.stream';
  }
  if ($('profile-pin-sub')) {
    $('profile-pin-sub').textContent = loadPin()
      ? 'On for ' + (wallet.name || 'this wallet')
      : 'Required — set a PIN for ' + (wallet.name || 'this wallet');
  }
  const knsEl = $('profile-kns-sub');
  if (knsEl) knsEl.textContent = wallet.knsDomain || 'Link a .kas name you already own';
  if ($('profile-kns-name')) $('profile-kns-name').textContent = wallet.knsDomain || 'Not linked';
  refreshKnsQuiet();
  const box = $('wallet-list');
  if (box) {
    const list = loadWalletList();
    box.innerHTML = list.map(w => {
      const active = w.id === wallet.id;
      const snap = walletSnap[w.address] || {};
      const sompi = active ? balanceSompi : snap.sompi;
      const kcc = active ? kccHoldings : (snap.kcc || []);
      const krc = active ? krcHoldings : (snap.krc || []);
      const tokens = [...kcc, ...krc];
      const bits = tokens.slice(0, 2).map(t => `${formatTokenUnits(t.balance, t.decimals)} ${t.ticker}`);
      const more = tokens.length > 2 ? ` +${tokens.length - 2}` : '';
      const kasTxt = sompi == null ? '…' : `${formatAmount(sompi)} KAS`;
      const tokTxt = bits.length ? bits.join(' · ') + more : 'Native KAS';
      return `
      <button class="row wallet-row" type="button" data-switch-wallet="${esc(w.id)}">
        <div class="glyph" style="background:${active ? 'rgba(48,209,88,.16)' : 'rgba(255,255,255,.08)'};color:${active ? 'var(--green)' : 'var(--label-2)'}">${active ? '●' : '○'}</div>
        <div style="min-width:0;flex:1">
          <div class="title">${esc(w.name || 'Wallet')}</div>
          <div class="sub">${esc(shortAddr(w.address, 12, 8))}</div>
        </div>
        <div class="amt">
          <b>${esc(kasTxt)}</b>
          <em>${esc(tokTxt)}</em>
        </div>
        <span class="chev">${active ? 'Now' : 'Use'}</span>
      </button>`;
    }).join('') || `<div class="empty">No wallets</div>`;
  }
  const log = $('scorpion-log');
  if (log && !log.childElementCount) {
    log.innerHTML = `<div class="bubble ai">I am Scorpion. I translate any Kaspa tx into plain English — lock vs send vs sweep vs KRC-20. Paste a txid or ask <em>what was my last lock?</em></div>`;
  }
}

let knsBusy = false;
async function refreshKnsQuiet() {
  if (!wallet?.address || knsBusy) return;
  knsBusy = true;
  try {
    const primary = await knsPrimary(wallet.address);
    if (primary && !wallet.knsDomain) {
      wallet.knsDomain = primary;
      saveWallet();
      if ($('profile-kns-sub')) $('profile-kns-sub').textContent = primary;
      if ($('profile-kns-name')) $('profile-kns-name').textContent = primary;
      if ($('card-addr')) $('card-addr').textContent = primary + ' · ' + shortAddr(wallet.address, 12, 8);
    }
  } catch {}
  knsBusy = false;
}

function openKnsSheet() {
  haptic();
  const current = wallet?.knsDomain || '';
  openSheet('KNS domain', `
    <p class="muted" style="text-align:left;padding:0 0 12px;">This wallet is your KNS account. Names inscribed to this address show here. You can also type a .kas domain you already own — we check it on the KNS indexer.</p>
    <div class="kv"><span class="k">Linked</span><span class="v" id="kns-linked">${esc(current || 'None')}</span></div>
    <div class="field" style="margin-top:12px;"><label>Your .kas domain</label>
      <input id="kns-input" placeholder="alice.kas" spellcheck="false" autocomplete="off" value="${esc(current)}">
    </div>
    <div class="glass list" id="kns-owned" style="margin:8px 0 12px;"><div class="empty">Loading names on this address…</div></div>
    <p class="muted" style="text-align:left;padding:0;"><a href="${esc(knsAppUrl())}" target="_blank" rel="noopener" style="color:var(--gold-2)">Open KNS dashboard</a></p>
  `, {
    confirm: 'Use this domain',
    gold: true,
    cancelLabel: 'Close',
    onConfirm: () => linkKnsDomain(($('kns-input')?.value || '').trim())
  });
  loadKnsOwned();
}

async function loadKnsOwned() {
  const box = $('kns-owned');
  if (!box || !wallet?.address) return;
  try {
    const rows = await knsDomainsFor(wallet.address);
    if (!rows.length) {
      box.innerHTML = `<div class="empty">No .kas names on this address yet. Inscribe at app.knsdomains.org with this wallet, then tap Use this domain.</div>`;
      return;
    }
    box.innerHTML = rows.map(r => `
      <button class="row" type="button" data-kns="${esc(r.domain)}">
        <div class="glyph" style="background:rgba(212,176,122,.16);color:var(--gold-2)">.kas</div>
        <div style="flex:1;min-width:0">
          <div class="title">${esc(r.domain)}</div>
          <div class="sub">${r.verified ? 'Verified on KNS' : 'On this wallet'}</div>
        </div>
        <span class="chev">${wallet.knsDomain === r.domain ? 'On' : 'Use'}</span>
      </button>`).join('');
    box.onclick = async (e) => {
      const btn = e.target.closest('[data-kns]');
      if (!btn?.dataset.kns) return;
      if ($('kns-input')) $('kns-input').value = btn.dataset.kns;
      try { await linkKnsDomain(btn.dataset.kns); } catch (err) { toast(errText(err)); }
    };
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(errText(e))}</div>`;
  }
}

async function linkKnsDomain(raw) {
  if (!raw) throw new Error('Enter a .kas domain');
  toast('Checking KNS…');
  const rec = await knsResolve(raw);
  if (!knsOwnerMatches(rec.owner, wallet)) {
    throw new Error(rec.domain + ' is owned by a different address — connect the wallet that holds it');
  }
  wallet.knsDomain = rec.domain;
  saveWallet();
  closeSheet();
  renderProfile();
  if (currentTab === 'home') renderHome();
  toast(rec.domain + ' linked');
}

function openImportAnother() {
  haptic();
  openSheet('Import wallet', `
    <p class="muted" style="text-align:left;padding:0 0 10px;">Paste a 64-character hex private key. It is added next to your current wallets — nothing is overwritten.</p>
    <div class="field"><label>Private key</label><input id="more-key" placeholder="6d3af702…" spellcheck="false" autocomplete="off"></div>
  `, {
    confirm: 'Import', gold: true, onConfirm: async () => {
      const hex = $('more-key')?.value.trim().replace(/^0x/, '');
      if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('Need a 64-character hex key');
      const kp = await createKeypairFromHex(hex);
      const list = loadWalletList();
      const existing = list.find(w => w.address === kp.address);
      if (existing) {
        closeSheet();
        await activateWallet({ ...existing, ...kp }, { toastMsg: 'Already in the list — switched' });
        return;
      }
      const w = { ...kp, id: uid(), name: 'Wallet ' + (list.length + 1), createdAt: Date.now() };
      closeSheet();
      await activateWallet(w, { toastMsg: 'Wallet imported' });
    }
  });
}

function explHtml(expl) {
  const factors = (expl.factors || []).map(f =>
    `<div class="kv"><span class="k">${esc(f.k)}</span><span class="v">${esc(f.v)}</span></div>`
  ).join('');
  const bullets = (expl.bullets || []).map(b => `<li>${esc(b)}</li>`).join('');
  return `
    <span class="kind-pill">${esc(expl.title || expl.kind || 'Scorpion')}</span>
    <p style="text-align:left;font-size:15px;line-height:1.45;margin:0 0 8px;">${esc(expl.headline)}</p>
    ${bullets ? `<ul style="text-align:left;padding-left:18px;color:var(--label-2);font-size:13px;line-height:1.45;margin:0 0 8px;">${bullets}</ul>` : ''}
    <div class="scorpion-factors">${factors}</div>
    ${expl.next ? `<p class="muted" style="text-align:left;padding:10px 0 0;">${esc(expl.next)}</p>` : ''}
    ${expl.id ? txidBlock(expl.id) : ''}
  `;
}

async function openScorpionTx(id) {
  haptic();
  if (!id) return;
  let tx = (window.__txs || []).find(t => (t.transaction_id || t.transactionId) === id);
  if (!tx) {
    try { tx = await fetchKaspaTx(id); }
    catch {
      toast('Tx not loaded — refresh Activity');
      return;
    }
  }
  const expl = explainTransaction(tx, { address: wallet.address, vaults: loadVaults() });
  openSheet('Scorpion', explHtml(expl), { confirm: 'Done', cancel: false });
}

function openTokenActivity(id) {
  const ev = loadTokenActivity().find(x => x.id === id);
  if (!ev) return;
  if (ev.txId) {
    openScorpionTx(ev.txId);
    return;
  }
  haptic();
  openSheet((ev.label || 'Received') + ' ' + ev.tick, `
    <div class="kv"><span class="k">Asset</span><span class="v">${esc(ev.tick)} · ${esc(ev.protocol === 'krc20' ? 'KRC-20' : 'KCC20')}</span></div>
    <div class="kv"><span class="k">Amount</span><span class="v">${esc(formatTokenUnits(ev.amount, ev.decimals))} ${esc(ev.tick)}</span></div>
    <div class="kv"><span class="k">When</span><span class="v">${esc(new Date(ev.time || Date.now()).toLocaleString())}</span></div>
    <p class="muted" style="text-align:left;">KCC20 cells sit on a covenant P2SH, so Kaspa’s address history for your kaspa:q… key often misses them. This row is the indexer credit to this wallet.</p>
  `, { confirm: 'Done', cancel: false });
}

async function backfillRecentKcc20Activity() {
  if (!wallet?.address) return;
  const cutoff = Date.now() - 7 * 86400000;
  for (const t of (kccHoldings || []).slice(0, 8)) {
    const tick = String(t.ticker || '').toUpperCase();
    if (!tick) continue;
    const acts = loadTokenActivity();
    try {
      const res = await fetch(
        'https://idx.kron.technology/v1/kcc20/token/' +
        encodeURIComponent(tick) + '/address/' +
        encodeURIComponent(wallet.address) + '/utxos',
        { cache: 'no-store' }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const cells = Array.isArray(data?.result) ? data.result : [];
      const ids = [...new Set(cells.map(c => c.outpoint?.transactionId).filter(Boolean))].slice(0, 4);
      let best = null;
      for (const id of ids) {
        const tx = await fetchKaspaTx(id).catch(() => null);
        if (!tx) continue;
        const tm = Number(tx.block_time || tx.blockTime || 0);
        if (tm < cutoff) continue;
        if (!best || tm > best.t) {
          const cell = cells.find(c => c.outpoint?.transactionId === id);
          best = { id, t: tm, amount: String(cell?.amount ?? '') };
        }
      }
      if (!best) continue;
      if (acts.some(a => a.txId === best.id)) continue;
      pushTokenActivity({
        dir: 'in',
        tick,
        protocol: 'kcc20',
        amount: best.amount || t.balance || '0',
        decimals: t.decimals,
        txId: best.id,
        time: best.t,
        label: 'Received'
      });
    } catch {}
  }
}

async function fetchKaspaTx(id) {
  const res = await fetch(`${API_BASE}/transactions/${id}?resolve_previous_outpoints=light`);
  if (!res.ok) throw new Error('Tx not found');
  return res.json();
}

function appendScorpion(role, html) {
  const log = $('scorpion-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = `bubble ${role === 'me' ? 'me' : 'ai'}`;
  el.innerHTML = html;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

async function sendScorpion() {
  const input = $('scorpion-input');
  const text = (input?.value || '').trim();
  if (!text) {
    const latest = (window.__txs || [])[0];
    if (latest) {
      const expl = explainTransaction(latest, { address: wallet.address, vaults: loadVaults() });
      appendScorpion('ai', explHtml(expl));
    } else toast('No txs yet — paste a txid');
    return;
  }
  if (input) input.value = '';
  appendScorpion('me', esc(text));
  const typing = appendScorpion('ai', '<span style="opacity:0.55">Reading the chain…</span>');
  try {
    let expl = await scorpionAnswer(text, {
      address: wallet?.address || '',
      txs: window.__txs || [],
      vaults: loadVaults(),
      fetchTx: fetchKaspaTx
    });
    try {
      const res = await fetch(`${BACKEND_URL}/kccApi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'explainTx', message: text, tx: expl, address: wallet?.address })
      });
      if (res.ok) {
        const remote = await res.json();
        if (remote && !remote.error && (remote.headline || remote.summary || remote.text)) {
          expl = {
            ...expl,
            headline: remote.headline || remote.summary || remote.text,
            next: remote.next || expl.next
          };
        }
      }
    } catch { /* local covenant++ is enough */ }
    typing.remove();
    appendScorpion('ai', explHtml(expl));
  } catch (e) {
    typing.remove();
    appendScorpion('ai', esc(errText(e)));
  }
}

function setLiveFast(on) {
  const next = !!on;
  if (next === liveFast && liveTimer) return;
  liveFast = next;
  if (!liveTimer) {
    startLiveSync();
    return;
  }
  clearInterval(liveTimer);
  liveTimer = setInterval(() => tickLive(false), liveFast ? 1500 : 3000);
}

function applyLocalTokenDelta(ticker, protocol, deltaRaw) {
  const tick = String(ticker || '').toUpperCase();
  const list = protocol === 'krc20' ? krcHoldings : kccHoldings;
  const t = list.find(x => String(x.ticker || '').toUpperCase() === tick);
  if (!t) return;
  try {
    const next = BigInt(t.balance || '0') + BigInt(deltaRaw);
    t.balance = (next < 0n ? 0n : next).toString();
  } catch { return; }
  rememberActiveSnap();
  renderHome();
  if (currentTab === 'tokens') renderTokens();
  if (currentTab === 'you') renderProfile();
}

function mergeFreshHoldings(local, remote) {
  const rem = Array.isArray(remote) ? remote : [];
  if (Date.now() > hushTokenToastsUntil) return rem;
  const map = new Map(rem.map(t => [String(t.ticker || '').toUpperCase(), t]));
  for (const t of local || []) {
    const key = String(t.ticker || '').toUpperCase();
    if (!key) continue;
    const r = map.get(key);
    try {
      if (!r || BigInt(t.balance || '0') > BigInt(r.balance || '0')) {
        map.set(key, r ? { ...r, ...t, image: t.image || r.image } : t);
      }
    } catch {
      if (!r) map.set(key, t);
    }
  }
  return [...map.values()];
}

function afterTx() {
  hushTokenToastsUntil = Date.now() + 25000;
  setLiveFast(true);
  clearTimeout(tokenFastOff);
  tokenFastOff = setTimeout(() => setLiveFast(false), 45000);
  tickLive(true);
  kickTokenRefresh();
  refreshAllWalletSnaps({ tokens: true }).catch(() => {});
}

function startLiveSync() {
  stopLiveSync();
  tickLive(true);
  liveTimer = setInterval(() => tickLive(false), liveFast ? 1500 : 3000);
}

function stopLiveSync() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  stopKccWatch();
}

function startKccWatch() {}

function stopKccWatch() {
  try { tokenStream?.close(); } catch {}
  tokenStream = null;
}

function kickTokenRefresh() {
  if (tokenBusy) { tokenPending = true; return; }
  tokenBusy = true;
  lastTokenFetch = Date.now();
  refreshTokenHoldings().finally(() => {
    tokenBusy = false;
    if (tokenPending) {
      tokenPending = false;
      kickTokenRefresh();
    }
  });
}

async function tickLive(full) {
  if (!wallet) return;
  const addr = wallet.address;
  try {
    migrateReceiveBook(wallet);
    const owned = ownedAddresses(wallet);
    const [bals, ownedBag] = await Promise.all([
      Promise.all(owned.map(o => fetchAddressBalance(o.address).catch(() => 0))),
      fetchOwnedUtxos(wallet).catch(() => null)
    ]);
    if (!wallet || wallet.address !== addr) return;
    let nextBal = bals.reduce((a, n) => a + Number(n || 0), 0);
    owned.forEach((o, i) => {
      if (o.role !== 'home' && Number(bals[i] || 0) > 0) markAddressUsed(wallet, o.address, true);
    });
    if (Array.isArray(ownedBag)) {
      utxos = ownedBag;
      const uSum = ownedBag.reduce((a, e) => {
        try { return a + Number(e.amount || 0n); } catch { return a; }
      }, 0);
      if (uSum > nextBal) nextBal = uSum;
    }
    paintUtxoCount();
    saveWallet();
    const balChanged = seenBalance != null && nextBal !== seenBalance;
    if (seenBalance != null && nextBal > seenBalance) {
      const delta = nextBal - seenBalance;
      toast(`Received ${formatAmount(delta)} KAS`);
      haptic();
      $('card-bal')?.classList.add('flash-up');
      setTimeout(() => $('card-bal')?.classList.remove('flash-up'), 1200);
      pushTokenActivity({
        dir: 'in', tick: 'KAS', protocol: 'kas',
        amount: String(delta), decimals: 8, label: 'Received'
      });
      setLiveFast(true);
      fetchWalletTxs(addr).then(txs => {
        if (!wallet || wallet.address !== addr) return;
        window.__txs = txs;
        rememberActiveSnap();
        if (currentTab === 'activity') renderActivity(txs);
      }).catch(() => {});
      if (receiveWatch) {
        const el = $('recv-status');
        if (el) el.textContent = `Received ${formatAmount(delta)} KAS`;
      }
    }
    seenBalance = nextBal;
    balanceSompi = nextBal;
    rememberActiveSnap();
    if (full || balChanged || liveFast) {
      if (currentTab === 'home' || currentTab === 'tokens') renderHome();
      if (currentTab === 'tokens') renderTokens();
      if (currentTab === 'you') renderProfile();
      if (currentTab === 'activity') renderActivity(window.__txs || []);
    }
    const recvBal = $('recv-balance');
    if (recvBal) recvBal.textContent = `${formatAmount(balanceSompi)} KAS total`;
    if (full) {
      try {
        const [pRes, tRes] = await Promise.all([
          fetch(`${API_BASE}/info/price?stringOnly=false`),
          fetch(`${API_BASE}/addresses/${addr}/full-transactions?limit=20&resolve_previous_outpoints=light`)
        ]);
        if (!wallet || wallet.address !== addr) return;
        if (pRes.ok) {
          const data = await pRes.json();
          price = Number(data.price ?? data ?? 0);
          if ($('card-usd')) $('card-usd').textContent = price ? `≈ ${usd(kas())}` : 'Fetching price…';
        }
        if (tRes.ok) {
          const txs = await tRes.json();
          window.__txs = Array.isArray(txs) ? txs : (txs.transactions || []);
          rememberActiveSnap();
          if (currentTab === 'activity') renderActivity(window.__txs);
        }
        if (currentTab === 'you') renderProfile();
      } catch {}
      refreshVaultBalances();
    }
    const now = Date.now();
    if (full || balChanged || liveFast || now - lastTokenFetch > 8000) kickTokenRefresh();
    if (full || now - lastAutoSweep > 8000) {
      lastAutoSweep = now;
      maybeAutoUnlock();
    }
    if (full || now - lastAllSnap > 5000) {
      refreshAllWalletSnaps({ tokens: now - lastAllTokenSnap > 12000 }).catch(() => {});
    }
  } catch (e) {
    console.warn(e);
  }
}

async function refreshAll() {
  await tickLive(true);
  refreshAllWalletSnaps({ tokens: true }).catch(() => {});
}

async function refreshTokenHoldings() {
  if (!wallet?.address) return;
  const addr = wallet.address;
  const before = [...kccHoldings, ...krcHoldings];
  try {
    const owned = ownedAddresses(wallet);
    const [kcc, krc] = await Promise.allSettled([
      owned.length > 1 ? fetchKcc20PortfolioMany(owned) : fetchKcc20Portfolio(addr, wallet.pubKey),
      owned.length > 1 ? fetchKrc20PortfolioMany(owned) : fetchKrc20Portfolio(addr)
    ]);
    if (!wallet || wallet.address !== addr) return;
    if (kcc.status === 'fulfilled') {
      const withLogos = await attachKronLogos(kcc.value);
      kccHoldings = mergeFreshHoldings(kccHoldings, withLogos);
    }
    if (krc.status === 'fulfilled') krcHoldings = mergeFreshHoldings(krcHoldings, krc.value);
    tokenLoadErr = kcc.status === 'rejected' ? 'KCC20 indexer unreachable — retrying…' : '';
  } catch (e) {
    tokenLoadErr = errText(e);
  }
  if (seenTokens && Date.now() > hushTokenToastsUntil) {
    const after = [...kccHoldings, ...krcHoldings];
    for (const t of after) {
      const prev = before.find(x => (t.tokenId && x.tokenId === t.tokenId) || (x.protocol === t.protocol && x.ticker === t.ticker));
      const nextAmt = Number(t.balance || 0);
      const prevAmt = prev ? Number(prev.balance || 0) : 0;
      if (nextAmt > prevAmt) {
        const d = nextAmt - prevAmt;
        toast(`Received ${formatTokenUnits(d, t.decimals)} ${t.ticker}`);
        haptic();
        const ev = pushTokenActivity({
          dir: 'in',
          tick: t.ticker,
          protocol: t.protocol || 'kcc20',
          amount: String(d),
          decimals: t.decimals,
          label: 'Received'
        });
        attachKcc20ReceiveTxid(ev);
        const recv = currentReceive(wallet, { tick: t.ticker });
        if (recv) markAddressUsed(wallet, recv.address, true);
        saveWallet();
        setLiveFast(true);
        clearTimeout(tokenFastOff);
        tokenFastOff = setTimeout(() => setLiveFast(false), 25000);
      }
    }
  }
  seenTokens = true;
  rememberActiveSnap();
  if (currentTab === 'home') renderHome();
  if (currentTab === 'tokens') renderTokens();
  if (currentTab === 'you') renderProfile();
  if (currentTab === 'activity') renderActivity(window.__txs || []);
  if (!tokenActBackfill) {
    tokenActBackfill = true;
    backfillRecentKcc20Activity().catch(() => {});
  }
}

function findToken(key) {
  const all = [...kccHoldings, ...krcHoldings];
  return all.find(t => `${t.protocol}:${t.ticker}` === key);
}

function holdingForTick(tick) {
  const t = String(tick || '').toUpperCase();
  if (!t) return null;
  if (t === 'KAS') return { native: true, protocol: 'kas', ticker: 'KAS', decimals: 8, balance: String(balanceSompi) };
  return (kccHoldings || []).find(x => String(x.ticker || '').toUpperCase() === t)
    || (krcHoldings || []).find(x => String(x.ticker || '').toUpperCase() === t)
    || null;
}

function tkAct(id, label, svg, extra = '') {
  return `<button class="tk-act${extra}" id="${id}" type="button">
    <span class="tk-act-orb">${svg}</span>
    <span>${label}</span>
  </button>`;
}

const ICO_RECV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';
const ICO_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const ICO_BUY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 5v14M5 12h14"/></svg>';
const ICO_SELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 12h14"/></svg>';
const ICO_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';

function openKasSheet() {
  haptic();
  openSheet('Kaspa', `
    <div class="tk-hero">
      <div class="tk-hero-logo kas" aria-hidden="true"></div>
      <div class="tk-amt">${esc(formatAmount(balanceSompi))}<small>KAS</small></div>
      <div class="tk-meta">${price ? '≈ ' + usd(kas()) : 'Native KAS'}</div>
    </div>
    <div class="tk-actions tk-2">
      ${tkAct('tk-recv', 'Receive', ICO_RECV)}
      ${tkAct('tk-send', 'Send', ICO_SEND)}
    </div>
  `, { confirm: false, cancelLabel: 'Close' });
  $('tk-recv')?.addEventListener('click', () => { closeSheet(); openReceive(); });
  $('tk-send')?.addEventListener('click', () => { closeSheet(); openSend({ assetKey: 'kas' }); });
}

function openTokenSheet(token) {
  if (!token) { showPage('tokens'); return; }
  haptic();
  const proto = token.protocol === 'krc20' ? 'KRC-20' : 'KCC20';
  const amt = formatTokenUnits(token.balance, token.decimals);
  const link = token.protocol === 'krc20'
    ? explorerAddr(wallet?.address || '')
    : (token.tokenId ? `https://kascov.io/#/mainnet/token/${encodeURIComponent(token.tokenId)}` : 'https://kascov.io/#/tokens');
  const logoSrc = token.image || (token.native ? 'assets/kas.svg' : (token.protocol === 'krc20' ? krc20Logo(token.ticker) : kcc20Identicon(token.ticker)));
  const assetKey = `${token.protocol}:${token.ticker}`;
  const kcc = token.protocol === 'kcc20';
  const acts = [
    tkAct('tk-recv', 'Receive', ICO_RECV),
    tkAct('tk-send', 'Send', ICO_SEND),
    ...(kcc ? [
      tkAct('tk-buy', 'Buy', ICO_BUY, ' tk-buy'),
      tkAct('tk-sell', 'Sell', ICO_SELL, ' tk-sell')
    ] : [])
  ].join('');
  openSheet(token.ticker, `
    <div class="tk-hero">
      <img class="tk-hero-logo" src="${esc(logoSrc)}" alt="" data-tick="${esc(token.ticker || '')}" data-proto="${esc(token.protocol || '')}" data-fb="${esc((token.ticker || '?').slice(0, 3))}" referrerpolicy="no-referrer" decoding="async">
      <div class="tk-amt">${esc(amt)}<small>${esc(token.ticker)}</small></div>
      <div class="tk-meta">${esc(token.name || token.ticker)} · ${esc(proto)}${token.cells ? ' · ' + esc(token.cells) + ' cells' : ''}</div>
    </div>
    <div class="tk-actions${kcc ? '' : ' tk-2'}">${acts}</div>
    ${kcc ? `<button class="btn btn-glass tk-more" id="tk-freeze" type="button">${ICO_LOCK} Freeze</button>` : ''}
    <p class="muted" style="padding-top:12px;"><a href="${esc(link)}" target="_blank" rel="noopener" style="color:var(--gold-2)">Open explorer</a></p>
  `, { confirm: false, cancelLabel: 'Close' });
  $('tk-recv')?.addEventListener('click', () => { closeSheet(); openReceive({ token }); });
  $('tk-send')?.addEventListener('click', () => { closeSheet(); openSend({ token, assetKey }); });
  $('tk-buy')?.addEventListener('click', () => { closeSheet(); openTrade({ tick: token.ticker, side: 'buy' }); });
  $('tk-sell')?.addEventListener('click', () => { closeSheet(); openTrade({ tick: token.ticker, side: 'sell' }); });
  $('tk-freeze')?.addEventListener('click', () => { closeSheet(); openProduct('kcc20freeze', { tick: token.ticker }); });
}

async function renderKronMarkets() {
  const box = $('kron-markets');
  if (!box) return;
  if (!box.dataset.loaded) box.innerHTML = `<div class="empty">Loading KRON markets…</div>`;
  try {
    const rows = (await kronMarkets()).slice(0, 12);
    box.dataset.loaded = '1';
    box.innerHTML = rows.map(m => {
      const chg = Number(m.change24h || 0);
      const chgCls = chg > 0 ? 'up' : (chg < 0 ? 'down' : '');
      const chgTxt = (chg > 0 ? '+' : '') + (chg * 100).toFixed(1) + '%';
      const px = m.price ? Number(m.price).toPrecision(4) + ' KAS' : (m.graduated ? 'Pool' : 'Curve');
      return `
        <button class="row token-row" type="button" data-trade-tick="${esc(m.tick)}">
          <div class="dot" style="background:rgba(212,176,122,.16);color:var(--gold-2)">${m.logo ? `<img alt="" src="${esc(m.logo)}" data-tick="${esc(m.tick)}" data-proto="kcc20" data-fb="${esc(m.tick.slice(0, 3))}" referrerpolicy="no-referrer" decoding="async">` : `<img alt="" src="${esc(kcc20Identicon(m.tick))}" data-tick="${esc(m.tick)}" data-proto="kcc20">`}</div>
          <div>
            <div class="title">${esc(m.tick)}</div>
            <div class="sub">${esc(m.graduated ? 'Pool' : 'Curve')} · ${esc(m.name)}</div>
          </div>
          <div class="amt">
            <b>${esc(px)}</b>
            <em class="mkt-chg ${chgCls}">${esc(chgTxt)}</em>
          </div>
        </button>`;
    }).join('') || `<div class="empty">KRON markets unavailable.</div>`;
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(errText(e))}</div>`;
  }
}

function hideTradeScreen() {
  $('trade-screen')?.classList.add('hidden');
  $('trade-screen')?.setAttribute('aria-hidden', 'true');
}

function openTrade(prefill = {}) {
  haptic();
  const screen = $('trade-screen');
  if (!screen) return;
  screen.classList.remove('hidden');
  screen.setAttribute('aria-hidden', 'false');
  const tick0 = String(prefill.tick || 'KRON').toUpperCase();
  const side0 = prefill.side === 'sell' ? 'sell' : 'buy';
  if ($('trade-ticker')) $('trade-ticker').value = tick0;
  if ($('trade-amount')) $('trade-amount').value = prefill.amount || '';
  $('trade-side')?.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.side === side0));
  if ($('trade-go')) {
    $('trade-go').disabled = false;
    $('trade-go').onclick = () => reviewTrade();
  }
  syncTradeLabel();
  lookupTradeTicker();
  loadKaspaSdk().catch(() => {});
  pingPublicNode().catch(() => {});
}

async function lookupTradeTicker() {
  const tick = ($('trade-ticker')?.value || '').trim().toUpperCase();
  const meta = $('trade-meta');
  if (!tick) { meta?.classList.add('hidden'); return; }
  if ($('trade-ticker')) $('trade-ticker').value = tick;
  if (meta) {
    meta.classList.remove('hidden');
    meta.innerHTML = `<div class="title">Looking up ${esc(tick)}…</div>`;
  }
  try {
    const info = await lookupKronTick(tick);
    if (meta) {
      const chg = Number(info.change24h || 0);
      const px = info.price ? Number(info.price).toPrecision(4) + ' KAS' : '—';
      meta.innerHTML = `
        <div class="title">${esc(info.tick)} · ${esc(info.name)}</div>
        <div class="sub">${esc(info.graduated ? 'Locked AMM pool' : 'Bonding curve')} · ${esc(px)}${chg ? ' · ' + ((chg > 0 ? '+' : '') + (chg * 100).toFixed(1) + '%') : ''}</div>`;
    }
    syncTradeLabel();
    quoteTradePreview();
  } catch (e) {
    if (meta) meta.innerHTML = `<div class="title">${esc(tick)}</div><div class="sub" style="color:var(--red)">${esc(errText(e))}</div>`;
  }
}

function syncTradeLabel() {
  const side = $('trade-side')?.querySelector('.on')?.dataset.side || 'buy';
  const tick = ($('trade-ticker')?.value || 'TOKEN').toUpperCase();
  const lab = $('trade-amt-label');
  if (lab) lab.textContent = side === 'sell' ? `Amount (${tick})` : 'Pay (KAS)';
  if ($('trade-go')) $('trade-go').textContent = side === 'sell' ? 'Review sell' : 'Review buy';
  const avail = $('trade-avail');
  const inp = $('trade-amount');
  if (side === 'sell') {
    const t = holdingForTick(tick);
    const max = t ? maxFillForAsset(t) : '0';
    if (avail) {
      avail.textContent = t
        ? `Available ${formatTokenUnits(t.balance, t.decimals)} ${tick} — Max sells all of it.`
        : `No ${tick} in this wallet to sell.`;
    }
    if (inp && !inp.value) inp.placeholder = max === '0' ? '0' : max;
  } else {
    const kasAsset = { native: true, protocol: 'kas', ticker: 'KAS', decimals: 8, balance: String(balanceSompi) };
    const max = maxFillForAsset(kasAsset);
    if (avail) avail.textContent = `Available ${formatAmount(balanceSompi)} KAS — Max leaves ~1.5 KAS for the cell and fees.`;
    if (inp && !inp.value) inp.placeholder = max;
  }
}

async function quoteTradePreview() {
  const box = $('trade-quote');
  const amount = $('trade-amount')?.value.trim();
  const tick = ($('trade-ticker')?.value || 'KRON').toUpperCase();
  const side = $('trade-side')?.querySelector('.on')?.dataset.side || 'buy';
  if (!box || !amount) return;
  box.innerHTML = `<p class="muted" style="text-align:left;padding:0;">Quoting…</p>`;
  try {
    const q = await quoteKronTrade({ tick, side, amount });
    if (q.side === 'buy') {
      box.innerHTML = `
        <div class="kv"><span class="k">Into market</span><span class="v">${esc(formatKasSompi(q.kasIn))} KAS</span></div>
        <div class="kv"><span class="k">You get</span><span class="v">${esc(formatTokenUnits(q.tokenOut, q.decimals))} ${esc(q.tick)}</span></div>
        <div class="kv"><span class="k">Protocol fees</span><span class="v">${esc(formatKasSompi(q.fee))} KAS</span></div>
        <div class="kv"><span class="k">Token cell (yours)</span><span class="v">0.50 KAS</span></div>
        <div class="kv"><span class="k">Network (est.)</span><span class="v">~0.40 KAS</span></div>
        <div class="kv"><span class="k">Native KAS leaving</span><span class="v">~${esc(formatKasSompi(q.nativeLeave))} KAS</span></div>
        <p class="muted" style="text-align:left;padding:8px 0 0;">${esc(tradeCostLines(q))} Tokens arrive in this wallet.</p>`;
    } else {
      box.innerHTML = `
        <div class="kv"><span class="k">You sell</span><span class="v">${esc(formatTokenUnits(q.tokenIn, q.decimals))} ${esc(q.tick)}</span></div>
        <div class="kv"><span class="k">You receive</span><span class="v">${esc(formatKasSompi(q.net))} KAS</span></div>
        <div class="kv"><span class="k">Protocol fees</span><span class="v">${esc(formatKasSompi(q.fee))} KAS</span></div>
        <p class="muted" style="text-align:left;padding:8px 0 0;">Network fee is extra. Small sells can fail if padded fees exceed proceeds.</p>`;
    }
  } catch (e) {
    box.innerHTML = `<p class="muted" style="text-align:left;padding:0;color:var(--red);">${esc(errText(e))}</p>`;
  }
}

async function reviewTrade() {
  const go = $('trade-go');
  const amount = $('trade-amount')?.value.trim();
  const tick = ($('trade-ticker')?.value || 'KRON').toUpperCase();
  const side = $('trade-side')?.querySelector('.on')?.dataset.side || 'buy';
  if (!amount) { toast('Enter an amount'); return; }
  if (go) go.disabled = true;
  let q;
  try { q = await quoteKronTrade({ tick, side, amount }); }
  catch (e) { if (go) go.disabled = false; toast(errText(e)); return; }
  if (go) go.disabled = false;
  const buyBits = q.side === 'buy' ? `
    <div class="kv"><span class="k">Into ${esc(q.tick)}</span><span class="v">${esc(formatKasSompi(q.kasIn))} KAS</span></div>
    <div class="kv"><span class="k">You receive</span><span class="v">${esc(formatTokenUnits(q.tokenOut, q.decimals))} ${esc(q.tick)}</span></div>
    <div class="kv"><span class="k">Protocol fees</span><span class="v">${esc(formatKasSompi(q.fee))} KAS</span></div>
    <div class="kv"><span class="k">Cell stays yours</span><span class="v">0.50 KAS</span></div>
    <div class="kv"><span class="k">Network (est.)</span><span class="v">~0.40 KAS</span></div>
    <div class="kv"><span class="k">Native KAS leaving</span><span class="v">~${esc(formatKasSompi(q.nativeLeave))} KAS</span></div>
    <p class="muted" style="text-align:left;padding-top:8px;">${esc(tradeCostLines(q))} Protocol fees go to KRON and the token creator on-chain (the covenant requires it). The 0.5 KAS cell and the tokens land in this wallet. This app tags the trade so integrator volume can be paid.</p>`
    : `<div class="kv"><span class="k">Sell</span><span class="v">${esc(formatTokenUnits(q.tokenIn, q.decimals))} ${esc(q.tick)}</span></div>
       <div class="kv"><span class="k">You receive</span><span class="v">${esc(formatKasSompi(q.net))} KAS</span></div>
       <div class="kv"><span class="k">Protocol fees</span><span class="v">${esc(formatKasSompi(q.fee))} KAS</span></div>`;
  openSheet('Review ' + q.tick + ' ' + q.side, buyBits, {
    confirm: 'Pay with PIN',
    gold: true,
    onConfirm: async () => {
      try {
        await requirePin(q.side === 'buy' ? 'Confirm buy ' + tick : 'Confirm sell ' + tick);
        await runTrade({ tick, side, amount, quote: q });
      } catch (e) {
        if (errText(e) === 'cancelled') return;
        toast(errText(e));
        setSheetStatus(errText(e), true);
      }
    }
  });
}

async function runTrade({ tick, side, amount, quote }) {
  toast('Building KRON swap…');
  try {
    await loadKaspaSdk();
    const utxosNow = await fetchAddressUtxos(wallet.address);
    const result = await executeKronTrade({
      wallet,
      tick,
      side,
      amount,
      utxos: utxosNow,
      onStatus: (m) => { toast(m); setSheetStatus(m); }
    });
    hideTradeScreen();
    const q = result.quote || quote;
    if (q?.side === 'buy' && q.tokenOut != null) {
      const tickU = String(q.tick || tick).toUpperCase();
      const row = kccHoldings.find(t => String(t.ticker).toUpperCase() === tickU);
      if (row) row.balance = (BigInt(row.balance || '0') + BigInt(q.tokenOut)).toString();
      else {
        kccHoldings.unshift({
          ticker: tickU, name: tickU, protocol: 'kcc20',
          balance: String(q.tokenOut), decimals: q.decimals || 0
        });
      }
    }
    afterTx();
    if (q?.side === 'buy' && q.tokenOut != null) {
      pushTokenActivity({
        dir: 'in',
        tick: q.tick || tick,
        protocol: 'kcc20',
        amount: String(q.tokenOut),
        decimals: q.decimals || 0,
        txId: result.txId || '',
        label: 'Bought'
      });
    } else if (q?.side === 'sell') {
      pushTokenActivity({
        dir: 'out',
        tick: q.tick || tick,
        protocol: 'kcc20',
        amount: String(q.tokenIn || amount || ''),
        decimals: q.decimals || 0,
        txId: result.txId || '',
        label: 'Sold'
      });
    }
    renderHome();
    if (currentTab === 'tokens') renderTokens();
    openSheet('Swap sent', `
      <div class="kv"><span class="k">Market</span><span class="v">${esc(tick)}</span></div>
      <div class="kv"><span class="k">Side</span><span class="v">${esc(side)}</span></div>
      ${q?.side === 'buy' ? `<div class="kv"><span class="k">Received</span><span class="v">${esc(formatTokenUnits(q.tokenOut, q.decimals))} ${esc(q.tick)}</span></div>` : ''}
      <div class="kv"><span class="k">Network fee</span><span class="v">${esc(formatKasSompi(result.fee))} KAS</span></div>
      ${txidBlock(result.txId)}
    `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
  } catch (e) {
    if (errText(e) === 'cancelled') return;
    toast(errText(e));
    setSheetStatus(errText(e), true);
  }
}

function openCompound() {
  haptic();
  const n = Array.isArray(utxos) ? utxos.length : 0;
  if (n < 2) { toast('Already one UTXO'); return; }
  const feeEst = 0.0045 + n * 0.00015;
  openSheet('Compound UTXOs', `
    <div class="kv"><span class="k">UTXOs now</span><span class="v">${n}</span></div>
    <div class="kv"><span class="k">Balance</span><span class="v">${formatAmount(balanceSompi)} KAS</span></div>
    <div class="kv"><span class="k">Network fee</span><span class="v">~${feeEst.toFixed(4)} KAS</span></div>
    <p class="muted" style="text-align:left;">Merges your coins into one UTXO. That makes the next lock/send cheaper and avoids storage-mass splits. Change stays in this wallet.</p>
  `, { confirm: 'Compound now', gold: true, onConfirm: () => runCompound() });
}

async function runCompound() {
  toast('Connecting to Kaspa…');
  try {
    await requirePin('Confirm compound');
    await loadKaspaSdk();
    await pingPublicNode();
    const available = await fetchAddressUtxos(wallet.address);
    setSheetStatus(`Merging ${available.length} UTXOs…`);
    const result = await compoundUtxos({ wallet, utxos: available });
    afterTx();
    openSheet('Compounded', `
      <div class="kv"><span class="k">Merged</span><span class="v">${esc(result.inputs)} → 1 UTXO</span></div>
      <div class="kv"><span class="k">Held</span><span class="v">${esc(formatKas(result.amountKas))} KAS</span></div>
      <div class="kv"><span class="k">Network fee</span><span class="v">${Number(result.feeKas || 0).toFixed(6)} KAS</span></div>
      ${txidBlock(result.txId)}
    `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
  } catch (e) {
    toast(errText(e));
    setSheetStatus(errText(e), true);
  }
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
      const locked = v.unlockDaa && lastDaa && lastDaa < Number(v.unlockDaa);
      let status = v.status;
      if (v.status === 'swept') status = 'swept';
      else if (isKcc20Vault(v) && Number(v.tokenAmount || 0) > 0) status = locked ? 'locked' : 'funded';
      else if (bal > 0) status = locked ? 'locked' : (v.status === 'funding' ? 'funding' : 'funded');
      else if (v.status !== 'unfunded' && v.status !== 'funding') status = 'unfunded';
      updateVault(v.address, { fundedSompi: bal, status });
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
    const mine = loadVaults().filter(v => v.address && (Number(v.unlockDaa) > 0 || isHopVault(v)));
    for (const v of mine) {
      const unlock = Number((currentHop(v) || v).unlockDaa || v.unlockDaa || 0);
      if (unlock && daa < unlock) continue;
      if (v.type === 'xmss') continue;
      if (isHopVault(v) && v.params?.beneficiary && v.params.beneficiary !== wallet.address) continue;
      if (autoSweepTried.has(v.address)) continue;
      let utxosV = [];
      try { utxosV = await fetchAddressUtxos(v.address); } catch { continue; }
      if (!utxosV.length) continue;
      autoSweepTried.add(v.address);
      toast(isKcc20Vault(v) ? ('Time lock ended — returning ' + (v.tick || 'KCC20') + '…') : 'Time lock ended — returning KAS…');
      try {
        const result = isKcc20Vault(v)
          ? await sweepKcc20Capsule({ wallet, vault: v, utxos: utxosV })
          : await sweepVault({ wallet, vault: v, utxos: utxosV });
        updateVault(v.address, { status: 'swept', unlockTxId: result.txId, fundedSompi: 0, tokenAmount: isKcc20Vault(v) ? '0' : v.tokenAmount });
        if (isKcc20Vault(v) && result.tokenAmount) {
          applyLocalTokenDelta(v.tick, 'kcc20', result.tokenAmount);
          toast(`Returned ${formatTokenUnits(result.tokenAmount, v.decimals)} ${v.tick} from freeze`);
        } else {
          toast(`Returned ${result.amountKas} KAS from time capsule`);
        }
        afterTx();
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
  const showOk = opts.confirm !== false;
  $('sheet-actions').innerHTML = `
    <p class="muted" id="sheet-status" style="text-align:left;padding:0 0 10px;min-height:1.2em;"></p>
    ${opts.cancel === false ? '' : `<button class="btn btn-glass" id="sheet-cancel">${esc(opts.cancelLabel || 'Cancel')}</button>`}
    ${showOk ? `<button class="btn ${opts.danger ? 'btn-danger' : (opts.gold ? 'btn-gold' : 'btn-blue')}" id="sheet-ok">${esc(opts.confirm || 'Confirm')}</button>` : ''}
  `;
  $('sheet-actions').style.display = opts.cancel === false && !showOk ? 'block' : 'flex';
  $('sheet-actions').style.flexWrap = 'wrap';
  $('sheet-overlay').classList.add('open');
  $('sheet-cancel')?.addEventListener('click', closeSheet);
  $('sheet-ok')?.addEventListener('click', async () => {
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
  stopQrScan();
  $('sheet-overlay').classList.remove('open');
  sheetConfirm = null;
  if (receiveWatch) { receiveWatch = false; setLiveFast(false); }
}

function sendAssets() {
  const kas = { key: 'kas', protocol: 'kas', ticker: 'KAS', name: 'Kaspa', decimals: 8, balance: String(balanceSompi), native: true };
  const kcc = (kccHoldings || []).map(t => ({ ...t, key: `kcc20:${t.ticker}` }));
  const krc = (krcHoldings || []).map(t => ({ ...t, key: `krc20:${t.ticker}` }));
  return [kas, ...kcc, ...krc];
}

function findSendAsset(key) {
  return sendAssets().find(a => a.key === key) || sendAssets()[0];
}

function assetAvail(a) {
  if (!a) return '0';
  if (a.native || a.protocol === 'kas') return formatAmount(a.balance);
  return formatTokenUnits(a.balance, a.decimals);
}

function humanFromRaw(raw, decimals) {
  const d = Math.max(0, Number(decimals) || 0);
  let n;
  try { n = BigInt(raw || '0'); } catch { return '0'; }
  if (n <= 0n) return '0';
  if (d === 0) return n.toString();
  const div = 10n ** BigInt(d);
  const whole = n / div;
  const frac = (n % div).toString().padStart(d, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

function maxFillForAsset(a) {
  if (!a) return '0';
  if (a.native || a.protocol === 'kas') {
    const feePad = 800_000n;
    let sompi = 0n;
    try { sompi = BigInt(a.balance || '0'); } catch { sompi = 0n; }
    const spend = sompi > feePad ? sompi - feePad : 0n;
    return humanFromRaw(spend.toString(), 8);
  }
  return humanFromRaw(a.balance, a.decimals);
}

function fillSendMax() {
  const a = findSendAsset($('send-asset')?.value || 'kas');
  const v = maxFillForAsset(a);
  if ($('send-amount')) $('send-amount').value = v;
  haptic();
  if (v === '0') toast('No ' + (a?.ticker || 'asset') + ' to send');
}

function fillTradeMax() {
  const side = $('trade-side')?.querySelector('.on')?.dataset.side || 'buy';
  const tick = ($('trade-ticker')?.value || '').toUpperCase();
  let v = '0';
  if (side === 'sell') {
    const t = holdingForTick(tick);
    v = t && !t.native ? maxFillForAsset(t) : '0';
    if (v === '0') toast('No ' + (tick || 'token') + ' to sell in this wallet');
  } else {
    const feePad = 150_000_000n;
    let sompi = 0n;
    try { sompi = BigInt(balanceSompi || 0); } catch { sompi = 0n; }
    const spend = sompi > feePad ? sompi - feePad : 0n;
    v = humanFromRaw(spend.toString(), 8);
    if (v === '0') toast('Need more than 1.5 KAS to buy');
  }
  if ($('trade-amount')) $('trade-amount').value = v;
  haptic();
  syncTradeLabel();
  quoteTradePreview();
}

function sendHintFor(a) {
  if (!a || a.native || a.protocol === 'kas') {
    return `Available ${assetAvail(a)} KAS. Max leaves ~0.008 KAS for the network fee.`;
  }
  const proto = a.protocol === 'krc20' ? 'KRC-20' : 'KCC20';
  if (a.protocol === 'krc20') {
    return `${a.ticker} · ${proto}. Available ${assetAvail(a)}. Kasplex commit-reveal parks ~0.1 KAS, then returns it minus the fee.`;
  }
  return `${a.ticker} · ${proto}. Available ${assetAvail(a)}. Sends any amount you hold — cells combine automatically. Keep a bit of native KAS here so the new cell passes storage mass.`;
}

function paintSendAsset(a) {
  if (!a) return;
  const hidden = $('send-asset');
  if (hidden) hidden.value = a.key;
  const tick = $('send-asset-tick');
  const proto = $('send-asset-proto');
  const bal = $('send-asset-bal');
  const hint = $('send-hint');
  const avail = $('send-avail');
  if (tick) tick.textContent = a.ticker || 'KAS';
  if (proto) proto.textContent = a.native || a.protocol === 'kas' ? 'Native KAS' : (a.protocol === 'krc20' ? 'KRC-20' : 'KCC20');
  if (bal) bal.textContent = assetAvail(a);
  if (hint) hint.textContent = sendHintFor(a);
  if (avail) avail.innerHTML = `Available <b>${esc(assetAvail(a))} ${esc(a.ticker || 'KAS')}</b> — tap Max to send all of it.`;
  document.querySelectorAll('#send-asset-list [data-asset-key]').forEach(el => {
    el.classList.toggle('on', el.dataset.assetKey === a.key);
  });
}

function bindSendAssetPicker() {
  const btn = $('send-asset-btn');
  const list = $('send-asset-list');
  if (!btn || !list) return;
  btn.onclick = (e) => {
    e.preventDefault();
    list.classList.toggle('hidden');
    btn.classList.toggle('open', !list.classList.contains('hidden'));
  };
  list.onclick = (e) => {
    const row = e.target.closest('[data-asset-key]');
    if (!row) return;
    const a = findSendAsset(row.dataset.assetKey);
    paintSendAsset(a);
    if ($('send-amount')) $('send-amount').value = '';
    list.classList.add('hidden');
    btn.classList.remove('open');
  };
}

function openSend(prefill) {
  haptic();
  const dest0 = prefill?.destination || '';
  const owned = dest0 ? loadWalletList().find(w => w.address === dest0) : null;
  const amt0 = prefill?.amountKas || prefill?.amount || '';
  const prefKey = prefill?.assetKey || (prefill?.token
    ? `${prefill.token.protocol}:${prefill.token.ticker}`
    : 'kas');
  const assets = sendAssets();
  const chosen = findSendAsset(prefKey);
  const rows = assets.map(a => {
    const proto = a.native || a.protocol === 'kas' ? 'Native' : (a.protocol === 'krc20' ? 'KRC-20' : 'KCC20');
    const on = a.key === chosen.key ? ' on' : '';
    return `
      <button class="asset-opt${on}" type="button" data-asset-key="${esc(a.key)}">
        <span class="asset-opt-tick">${esc(a.ticker)}</span>
        <span class="asset-opt-proto">${esc(proto)}</span>
        <span class="asset-opt-bal">${esc(assetAvail(a))}</span>
      </button>`;
  }).join('');
  openSheet(owned ? ('Send to ' + (owned.name || 'wallet')) : 'Send', `
    <div class="field"><label>Asset</label>
      <input type="hidden" id="send-asset" value="${esc(chosen.key)}">
      <button class="asset-pick" id="send-asset-btn" type="button">
        <span>
          <b id="send-asset-tick">${esc(chosen.ticker)}</b>
          <small id="send-asset-proto">${esc(chosen.native || chosen.protocol === 'kas' ? 'Native KAS' : (chosen.protocol === 'krc20' ? 'KRC-20' : 'KCC20'))}</small>
        </span>
        <span class="asset-pick-bal" id="send-asset-bal">${esc(assetAvail(chosen))}</span>
        <span class="chev">›</span>
      </button>
      <div class="asset-pick-list hidden" id="send-asset-list">${rows}</div>
    </div>
    <div class="field"><label>To</label>
      <div class="dest-row">
        <input id="send-dest" placeholder="kaspa:q… or name.kas" value="${esc(dest0)}" spellcheck="false" autocomplete="off">
        <button class="scan-btn" id="send-scan-qr" type="button" aria-label="Scan QR">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v7h-7"/></svg>
        </button>
      </div>
    </div>
    <div class="qr-scan hidden" id="qr-scan-box">
      <video id="qr-video" playsinline muted autoplay></video>
      <p class="muted" id="qr-scan-status">Point at a Kaspa QR — works for KAS, KRC-20, and KCC20</p>
      <button type="button" class="btn btn-glass" id="qr-scan-stop">Close camera</button>
    </div>
    <div class="field"><label>Amount</label>
      <div class="dest-row">
        <input id="send-amount" type="text" inputmode="decimal" placeholder="0" value="${esc(amt0)}">
        <button class="max-btn" id="send-max" type="button">Max</button>
      </div>
    </div>
    <p class="avail-line" id="send-avail">Available <b>${esc(assetAvail(chosen))} ${esc(chosen.ticker)}</b> — tap Max to send all of it.</p>
    <p class="muted send-hint" id="send-hint">${esc(sendHintFor(chosen))}</p>
  `, { confirm: 'Review', gold: true, onConfirm: () => prepareSend() });
  bindSendAssetPicker();
  bindSendQr();
  $('send-max')?.addEventListener('click', fillSendMax);
}

function readSendForm() {
  const dest = $('send-dest')?.value.trim();
  const amount = $('send-amount')?.value.trim();
  const key = $('send-asset')?.value || 'kas';
  return { dest, amount, asset: findSendAsset(key) };
}

async function prepareSend(prefill) {
  const form = prefill?.destination
    ? { dest: prefill.destination, amount: String(prefill.amountKas || prefill.amount || ''), asset: findSendAsset(prefill.assetKey || 'kas') }
    : readSendForm();
  let dest = form.dest;
  let destDomain = '';
  const asset = form.asset;
  if (looksLikeKasDomain(dest) || (dest && !dest.startsWith('kaspa:') && !dest.includes(':') && !/\s/.test(dest))) {
    toast('Resolving ' + dest + '…');
    try {
      const rec = await knsResolve(dest);
      destDomain = rec.domain;
      dest = rec.owner;
    } catch (e) {
      toast(errText(e));
      return;
    }
  }
  const destOk = validateKaspaAddress(dest, 'mainnet');
  if (!destOk.isValid) { toast(destOk.error || 'Invalid Kaspa address — use kaspa:q… or a .kas domain'); return; }
  if (!form.amount) { toast('Enter an amount'); return; }
  if (asset.native || asset.protocol === 'kas') {
    let sompi;
    try { sompi = kasToSompi(form.amount); } catch { toast('Enter an amount'); return; }
    if (sompi <= 0n) { toast('Enter an amount'); return; }
    const amount = sompiToKasString(sompi);
    const feeEst = 0.0045;
    openSheet('Review send', `
      <div class="kv"><span class="k">Asset</span><span class="v">KAS</span></div>
      ${destDomain ? `<div class="kv"><span class="k">KNS</span><span class="v">${esc(destDomain)}</span></div>` : ''}
      <div class="kv"><span class="k">To</span><span class="v">${esc(shortAddr(dest, 14, 8))}</span></div>
      <div class="kv"><span class="k">Amount</span><span class="v">${esc(formatKas(amount))} KAS</span></div>
      <div class="kv"><span class="k">Network fee</span><span class="v">~${feeEst.toFixed(4)} KAS</span></div>
      <div class="kv"><span class="k">Leaves wallet</span><span class="v">~${formatKas(amount + feeEst, 4)} KAS</span></div>
      <p class="muted" style="text-align:left;padding-top:8px;">${destDomain ? '⚠️ Check the resolved address before sending. Transfers cannot be reversed. ' : ''}Change stays in this wallet.</p>
    `, { confirm: 'Send now', gold: true, onConfirm: () => broadcastSend(dest, amount) });
    return;
  }
  let raw;
  try { raw = toTokenRaw(form.amount, asset.decimals); }
  catch (e) { toast(errText(e)); return; }
  if (BigInt(raw) > BigInt(asset.balance || '0')) { toast('More than you hold'); return; }
  const proto = asset.protocol === 'krc20' ? 'KRC-20' : 'KCC20';
  const extra = asset.protocol === 'krc20'
    ? 'Kasplex commit-reveal: ~0.1 KAS is parked in a P2SH then returned minus Toccata fees. Recipient can be any kaspa: wallet.'
    : 'KCC20 send (KRON / KasWare): spends as many cells as needed (up to 4) to a kaspa:q key. A small KAS UTXO from this wallet authorizes it.';
  const knsWarn = destDomain ? '⚠️ Check the resolved address before sending. Transfers cannot be reversed. ' : '';
  openSheet('Review send', `
    <div class="kv"><span class="k">Asset</span><span class="v">${esc(asset.ticker)} · ${esc(proto)}</span></div>
    ${destDomain ? `<div class="kv"><span class="k">KNS</span><span class="v">${esc(destDomain)}</span></div>` : ''}
    <div class="kv"><span class="k">To</span><span class="v">${esc(shortAddr(dest, 14, 8))}</span></div>
    <div class="kv"><span class="k">Amount</span><span class="v">${esc(form.amount)} ${esc(asset.ticker)}</span></div>
    <div class="kv"><span class="k">Raw units</span><span class="v">${esc(raw)}</span></div>
    <p class="muted" style="text-align:left;padding-top:8px;">${esc(knsWarn + extra)}</p>
  `, { confirm: 'Send now', gold: true, onConfirm: () => broadcastTokenSend(dest, asset, form.amount, raw) });
}

async function broadcastSend(dest, amount) {
  toast('Connecting to Kaspa…');
  try {
    await requirePin('Confirm send');
    await loadKaspaSdk();
    toast('Connecting to public Kaspa node…');
    await pingPublicNode();
    toast('Signing & broadcasting…');
    const availableUtxos = wallet.receiveAddrs?.length > 1
      ? await fetchOwnedUtxos(wallet)
      : await fetchAddressUtxos(wallet.address);
    if (!availableUtxos.length) { toast('No UTXOs yet — receive KAS first'); return; }
    const result = await sendKas({ wallet, dest, amountKas: amount, utxos: availableUtxos });
    pushTokenActivity({
      dir: 'out', tick: 'KAS', protocol: 'kas',
      amount: String(Math.round(Number(result.amountKas || amount) * 1e8)),
      decimals: 8, txId: result.txId || '', label: 'Sent'
    });
    noteOwnedInbound(dest, {
      tick: 'KAS', protocol: 'kas',
      amount: String(Math.round(Number(result.amountKas || amount) * 1e8)),
      decimals: 8, txId: result.txId || '', label: 'Received'
    });
    afterTx();
    closeSheet();
    toast('Sent');
    openSheet('Sent', `
      <div class="kv"><span class="k">Amount</span><span class="v">${esc(formatKas(result.amountKas || amount))} KAS</span></div>
      <div class="kv"><span class="k">Network fee</span><span class="v">${Number(result.feeKas || 0).toFixed(6)} KAS</span></div>
      ${txidBlock(result.txId)}
    `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
  } catch (e) {
    if (errText(e) === 'cancelled') return;
    toast(e.message || 'Broadcast failed');
  }
}

async function broadcastTokenSend(dest, asset, human, raw) {
  toast('Connecting to Kaspa…');
  try {
    await requirePin('Confirm send');
    await loadKaspaSdk();
    await pingPublicNode();
    const availableUtxos = wallet.receiveAddrs?.length > 1
      ? await fetchOwnedUtxos(wallet)
      : await fetchAddressUtxos(wallet.address);
    if (!availableUtxos.length) { toast('Need a little KAS in this wallet for fees'); return; }
    const onStatus = (m) => { toast(m); setSheetStatus(m); };
    let result;
    if (asset.protocol === 'krc20') {
      result = await sendKrc20({ wallet, dest, tick: asset.ticker, amtRaw: raw, utxos: availableUtxos, onStatus });
    } else {
      result = await sendKcc20({ wallet, dest, token: asset, amountHuman: human, utxos: availableUtxos, onStatus });
    }
    applyLocalTokenDelta(asset.ticker, asset.protocol, '-' + String(raw));
    pushTokenActivity({
      dir: 'out',
      tick: asset.ticker,
      protocol: asset.protocol,
      amount: String(raw),
      decimals: asset.decimals,
      txId: result.revealId || result.txId || '',
      label: 'Sent'
    });
    noteOwnedInbound(dest, {
      tick: asset.ticker,
      protocol: asset.protocol,
      amount: String(raw),
      decimals: asset.decimals,
      txId: result.revealId || result.txId || '',
      label: 'Received'
    });
    afterTx();
    const id = result.revealId || result.txId;
    openSheet('Sent ' + asset.ticker, `
      <div class="kv"><span class="k">Asset</span><span class="v">${esc(asset.ticker)}</span></div>
      <div class="kv"><span class="k">Amount</span><span class="v">${esc(human)} ${esc(asset.ticker)}</span></div>
      <div class="kv"><span class="k">To</span><span class="v">${esc(shortAddr(dest, 14, 8))}</span></div>
      ${result.commitTxId ? txidBlock(result.commitTxId, 'Commit') : ''}
      ${txidBlock(id, 'Reveal / TX')}
    `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
  } catch (e) {
    if (errText(e) === 'cancelled') return;
    let msg = errText(e);
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      msg = 'Network blip reaching Kaspa or KRON. Keep this sheet open and tap Send now again.';
    }
    toast(msg);
    setSheetStatus(msg, true);
  }
}

async function paintReceiveQr(addr) {
  try {
    const QR = await import('https://esm.sh/qrcode@1.5.4');
    const canvas = document.createElement('canvas');
    await QR.toCanvas(canvas, addr, { width: 188, margin: 0, color: { dark: '#111111', light: '#ffffff' } });
    if ($('qr-box')) { $('qr-box').innerHTML = ''; $('qr-box').appendChild(canvas); }
  } catch {
    if ($('qr-box')) {
      $('qr-box').innerHTML = `<img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=188x188&data=${encodeURIComponent(addr)}">`;
    }
  }
}

async function fetchTxCount(addr) {
  try {
    const res = await fetch(`${API_BASE}/addresses/${encodeURIComponent(addr)}/transactions-count`);
    if (res.ok) {
      const j = await res.json();
      const n = Number(j.total ?? j.totalTransactions ?? j.tx_count ?? j.count ?? j.limit ?? 0);
      if (Number.isFinite(n)) return n;
    }
  } catch {}
  try {
    const res = await fetch(`${API_BASE}/addresses/${encodeURIComponent(addr)}/full-transactions?limit=1&resolve_previous_outpoints=no`);
    if (!res.ok) return 0;
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows : (rows.transactions || []);
    return list.length ? 1 : 0;
  } catch {
    return 0;
  }
}

function recvBook() {
  return ownedAddresses(wallet);
}

function defaultRecvIndex() {
  const book = recvBook();
  if (!book.length) return 0;
  for (let i = book.length - 1; i >= 0; i--) {
    if (!book[i].used && book[i].role !== 'home') return i;
  }
  return book.length - 1;
}

function recvDisplayedAddress(row) {
  const privacy = !!window.__recvPrivacy && !window.__recvTick;
  if (privacy && row?.privacyAddress) return row.privacyAddress;
  return row?.address || '';
}

function paintRecvMode() {
  const privacy = !!window.__recvPrivacy && !window.__recvTick;
  document.querySelectorAll('#recv-mode button').forEach(b => {
    b.classList.toggle('on', (b.dataset.mode === 'p') === privacy);
  });
  const hint = $('recv-privacy-hint');
  if (hint) {
    hint.textContent = privacy
      ? 'Privacy P2SH (kaspa:p) hides your Schnorr pubkey until you spend. KCC20 and KRC-20 cannot land here — use Public for tokens.'
      : 'Public (kaspa:q) is the default. Needed for KCC20 / KRC-20. Rotate unused keys with ‹ ›.';
  }
}

async function paintRecvSlot(idx) {
  const book = recvBook();
  if (!book.length) return;
  const i = Math.max(0, Math.min(idx, book.length - 1));
  window.__recvIdx = i;
  const row = book[i];
  const shown = recvDisplayedAddress(row);
  window.__recvAddr = shown;
  paintRecvMode();
  if ($('recv-addr')) $('recv-addr').textContent = shown;
  if ($('recv-label')) {
    const kind = (window.__recvPrivacy && !window.__recvTick && row.privacyAddress) ? ' · Privacy P2SH' : '';
    $('recv-label').textContent = (row.role === 'home' ? 'Home' : (row.label || 'Receive')) + kind;
  }
  if ($('recv-pager')) $('recv-pager').textContent = (i + 1) + ' / ' + book.length;
  if ($('recv-prev')) $('recv-prev').disabled = i <= 0;
  if ($('recv-next')) $('recv-next').disabled = i >= book.length - 1;
  if ($('recv-fresh')) {
    $('recv-fresh').className = 'recv-pill wait';
    $('recv-fresh').textContent = 'Checking…';
  }
  if ($('recv-status')) $('recv-status').textContent = 'Watching ' + shortAddr(shown, 8, 6) + '…';
  await paintReceiveQr(shown);
  try {
    const n = await fetchTxCount(shown);
    if (shown === row.address) {
      row.txCount = n;
      if (n > 0) markAddressUsed(wallet, row.address, true);
      else if (row.role !== 'home') row.used = false;
      saveWallet();
    }
    const fresh = n === 0;
    if ($('recv-fresh')) {
      $('recv-fresh').className = 'recv-pill ' + (fresh ? 'fresh' : 'used');
      $('recv-fresh').textContent = fresh ? 'Fresh' : ('Used · ' + n + (n === 1 ? ' tx' : ' txs'));
    }
  } catch {
    if ($('recv-fresh')) {
      $('recv-fresh').className = 'recv-pill ' + (row.used ? 'used' : 'fresh');
      $('recv-fresh').textContent = row.used ? 'Used' : 'Fresh';
    }
  }
}

async function openReceive(prefill) {
  haptic();
  receiveWatch = true;
  setLiveFast(true);
  migrateReceiveBook(wallet);
  try { await ensurePrivacyBook(wallet); } catch {}
  saveWallet();
  const tick = String(prefill?.token?.ticker || prefill?.tick || '').toUpperCase();
  window.__recvTick = tick;
  window.__recvPrivacy = false;
  const title = tick ? 'Receive ' + tick : 'Receive KAS';
  const book = recvBook();
  const start = defaultRecvIndex();
  const row = book[start] || book[0];
  const modeHtml = tick ? '' : `
    <div class="recv-mode" id="recv-mode">
      <button type="button" class="on" data-mode="q">Public kaspa:q</button>
      <button type="button" data-mode="p">Privacy kaspa:p</button>
    </div>
    <p class="muted" id="recv-privacy-hint" style="text-align:left;padding:0 0 8px;font-size:12px;">Public (kaspa:q) is the default. Needed for KCC20 / KRC-20. Rotate unused keys with ‹ ›.</p>`;
  openSheet(title, `
    <p class="muted" style="text-align:left;padding:0 0 8px;">Scroll every derived receive key with <b>‹ ›</b>. Fresh means this address has 0 txs on Kaspa. When unused keys run out, derive 20 more.</p>
    ${modeHtml}
    <div class="recv-nav">
      <button class="recv-arrow" id="recv-prev" type="button" aria-label="Previous address">‹</button>
      <div class="recv-pager" id="recv-pager">${start + 1} / ${Math.max(book.length, 1)}</div>
      <button class="recv-arrow" id="recv-next" type="button" aria-label="Next address">›</button>
    </div>
    <div style="text-align:center;"><span class="recv-pill wait" id="recv-fresh">Checking…</span></div>
    <p class="muted" id="recv-label" style="padding:0 0 6px;font-size:12px;">${esc(row?.label || 'Home')}</p>
    <div class="qr-wrap" id="qr-box"></div>
    <p class="mono" id="recv-addr" style="text-align:center;font-size:12px;color:var(--label-2);word-break:break-all;padding:0 8px 8px;">${esc(row?.address || '')}</p>
    <p class="muted" id="recv-balance">${formatAmount(balanceSompi)} KAS total</p>
    <p class="muted" id="recv-status">Watching…</p>
    <div class="btn-row" style="margin:8px 0 8px;">
      <button class="btn btn-gold" id="copy-addr" type="button">Copy</button>
    </div>
    <button class="btn btn-glass" id="recv-derive" type="button">Derive 20 more</button>
    <p class="muted" id="recv-pool" style="padding:8px 0 0;font-size:12px;">${unusedReceiveCount(wallet)} unused in this book</p>
  `, { confirm: 'Done', cancel: false, onConfirm: () => { receiveWatch = false; setLiveFast(false); closeSheet(); } });
  $('copy-addr').onclick = async () => {
    await navigator.clipboard.writeText(window.__recvAddr || row?.address || '');
    toast('Address copied');
  };
  $('recv-prev').onclick = () => paintRecvSlot((window.__recvIdx || 0) - 1);
  $('recv-next').onclick = () => paintRecvSlot((window.__recvIdx || 0) + 1);
  $('recv-mode')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    window.__recvPrivacy = btn.dataset.mode === 'p';
    await paintRecvSlot(window.__recvIdx || 0);
  });
  $('recv-derive').onclick = async () => {
    const btn = $('recv-derive');
    if (btn) { btn.disabled = true; btn.textContent = 'Deriving…'; }
    toast('Deriving 20 receive addresses…');
    try {
      const added = await deriveReceiveBatch(wallet, 20, { tick, role: tick ? 'kcc20' : 'kas' });
      saveWallet();
      const bookNow = recvBook();
      const firstNew = bookNow.findIndex(a => a.address === added[0]?.address);
      if ($('recv-pool')) $('recv-pool').textContent = unusedReceiveCount(wallet) + ' unused in this book';
      await paintRecvSlot(firstNew >= 0 ? firstNew : bookNow.length - 1);
      toast('Added 20 addresses');
    } catch (e) {
      toast(errText(e));
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Derive 20 more'; }
  };
  await paintRecvSlot(start);
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
    <button class="btn btn-gold" id="settings-compound" style="margin-bottom:10px;">Compound UTXOs</button>
    <button class="btn btn-danger" id="wipe">Remove wallet from this device</button>
  `, { confirm: 'Close', cancel: false });
  $('reveal-pk').onclick = async () => {
    try { await requirePin('Reveal key'); } catch { return; }
    const i = $('pk-view');
    i.type = i.type === 'password' ? 'text' : 'password';
  };
  $('copy-pk').onclick = async () => {
    try { await requirePin('Copy key'); } catch { return; }
    await navigator.clipboard.writeText(wallet.privKey);
    toast('Key copied');
  };
  $('settings-compound').onclick = () => { closeSheet(); openCompound(); };
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
  if (type === 'timelock' || type === 'kcc20lock') {
    const dur = parseDurationField($('ct-duration')?.value);
    if (dur) {
      params.lockDays = dur.days;
      params.lockMinutes = dur.minutes;
      params.durationLabel = dur.label;
    }
  }
  if (type === 'kcc20lock') {
    params.tick = ($('ct-tick')?.value || '').trim().toUpperCase();
    const tok = parseFloat($('ct-token-amt')?.value);
    if (Number.isFinite(tok) && tok > 0) params.amountToken = tok;
  }
  if (type === 'escrow') params.buyerAddress = $('ct-buyer')?.value.trim();
  if (type === 'multisig') params.counterparty = $('ct-counterparty')?.value.trim();
  if (type === 'sentinel' || type === 'recurring' || type === 'hashlock') {
    const dur = parseDurationField($('ct-duration')?.value);
    if (dur) {
      params.lockDays = dur.days;
      params.lockMinutes = dur.minutes;
      params.durationLabel = dur.label;
    }
  }
  if (type === 'sentinel') {
    params.beneficiary = $('ct-beneficiary')?.value.trim() || '';
    params.hopCount = Number($('ct-hops')?.value || 6);
  }
  if (type === 'recurring') {
    params.payee = $('ct-payee')?.value.trim();
    const pay = parseFloat($('ct-pay')?.value);
    if (Number.isFinite(pay) && pay > 0) params.payKas = pay;
    params.periods = Number($('ct-periods')?.value || 4);
  }
  if (type === 'hashlock') {
    params.receiver = $('ct-receiver')?.value.trim() || '';
    params.secretHex = ($('ct-secret')?.value || '').trim();
  }
  if (type === 'xmss') {
    params.kit = $('ct-kit')?.value || '';
  }
  return params;
}

function openProduct(id, prefill) {
  const p = VAULT_PRODUCTS.find(x => x.id === id);
  if (!p) return;
  haptic();
  if (p.type === 'kcc20') { showPage('tokens'); return; }
  if (p.type === 'xmss') {
    const kasMax = maxFillForAsset({ native: true, protocol: 'kas', ticker: 'KAS', decimals: 8, balance: String(balanceSompi) });
    openSheet('XMSS vault', `
      <p class="muted" style="text-align:left;padding:0 0 10px;">This is the real post-quantum lock from <b>kaspa-xmss-covenants</b>. Make keys on a PC (offline is best). This phone only funds the address and later broadcasts a spend.</p>
      <ol class="vault-steps">
        <li>On a computer: <code>python3 keygen/xmss_keygen.py</code></li>
        <li>Paste the <b>public</b> <code>.json</code> below — never the private file.</li>
        <li>Lock KAS. To spend: <code>xmss_sign.py</code> then paste the witness here.</li>
      </ol>
      <div class="field"><label>Public kit JSON</label><textarea id="ct-kit" rows="7" placeholder='{"redeem_script_hex":"...","height":10}' spellcheck="false"></textarea></div>
      <div class="field"><label>Amount (KAS)</label>
        <div class="dest-row">
          <input id="ct-amount" type="text" inputmode="decimal" placeholder="${esc(kasMax)}" value="${esc(prefill?.amountKas || '')}">
          <button class="max-btn" id="ct-kas-max" type="button">Max</button>
        </div>
      </div>
      <p class="muted" style="text-align:left;">Keep ~0.32 KAS extra in this wallet for the later spend fee. The XMSS script is large — that is the proven mainnet cost.</p>
    `, { confirm: 'Build vault', gold: true, onConfirm: () => buildCovenant(p, readProductForm('xmss')) });
    $('ct-kas-max')?.addEventListener('click', () => {
      if ($('ct-amount')) $('ct-amount').value = kasMax;
      haptic();
    });
    return;
  }
  if (p.type === 'kcc20lock') {
    const ticks = (kccHoldings || []).map(t => t.ticker).filter(Boolean);
    const preTick = String(prefill?.tick || ticks[0] || '').toUpperCase();
    const held = holdingForTick(preTick);
    const maxTok = held && !held.native ? maxFillForAsset(held) : '0';
    const tickField = ticks.length
      ? `<select id="ct-tick">${ticks.map(t => `<option value="${esc(t)}" ${t === preTick ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`
      : `<input id="ct-tick" placeholder="KKDAG" autocapitalize="characters" value="${esc(preTick)}">`;
    const fields = `
      <div class="field"><label>KCC20 ticker</label>${tickField}</div>
      <div class="field"><label>Amount (tokens)</label>
        <div class="dest-row">
          <input id="ct-token-amt" type="text" inputmode="decimal" placeholder="${esc(maxTok)}" value="${esc(prefill?.amountToken || '')}">
          <button class="max-btn" id="ct-token-max" type="button">Max</button>
        </div>
      </div>
      <p class="avail-line" id="ct-token-avail">${held && !held.native ? `Available <b>${esc(formatTokenUnits(held.balance, held.decimals))} ${esc(preTick)}</b> — tap Max to freeze all of it.` : 'No KCC20 in this wallet.'}</p>
      <div class="field"><label>How long?</label>
        <div class="dur-chips" id="ct-dur-chips">
          <button type="button" data-dur="3 minutes">3 min</button>
          <button type="button" data-dur="1 hour">1 hour</button>
          <button type="button" data-dur="1 day">1 day</button>
          <button type="button" data-dur="7 days">1 week</button>
          <button type="button" data-dur="30 days">30 days</button>
        </div>
        <input id="ct-duration" placeholder="or type 3 minutes">
      </div>
    `;
    openSheet(p.name, `<p class="muted" style="text-align:left;padding:0 0 12px;">${esc(p.blurb)} Uses ~0.2 KAS witness dust plus the network fee. Tokens stay in a SCRIPT_HASH cell until Sweep.</p>${fields}`, {
      confirm: 'Freeze with PIN', gold: true, onConfirm: () => buildCovenant(p, readProductForm(p.type))
    });
    const syncFreezeAvail = () => {
      const tick = ($('ct-tick')?.value || '').toUpperCase();
      const t = holdingForTick(tick);
      const max = t && !t.native ? maxFillForAsset(t) : '0';
      const line = $('ct-token-avail');
      const inp = $('ct-token-amt');
      if (line) {
        line.innerHTML = t && !t.native
          ? `Available <b>${esc(formatTokenUnits(t.balance, t.decimals))} ${esc(tick)}</b> — tap Max to freeze all of it.`
          : `No ${esc(tick) || 'KCC20'} in this wallet.`;
      }
      if (inp) inp.placeholder = max;
    };
    $('ct-token-max')?.addEventListener('click', () => {
      const tick = ($('ct-tick')?.value || '').toUpperCase();
      const t = holdingForTick(tick);
      const v = t && !t.native ? maxFillForAsset(t) : '0';
      if ($('ct-token-amt')) $('ct-token-amt').value = v;
      if (v === '0') toast('No ' + (tick || 'token') + ' to freeze');
      haptic();
    });
    $('ct-tick')?.addEventListener('change', syncFreezeAvail);
    $('ct-dur-chips')?.addEventListener('click', e => {
      const b = e.target.closest('button[data-dur]');
      if (!b) return;
      $('ct-dur-chips').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if ($('ct-duration')) $('ct-duration').value = b.dataset.dur;
    });
    return;
  }
  const kasMax = maxFillForAsset({ native: true, protocol: 'kas', ticker: 'KAS', decimals: 8, balance: String(balanceSompi) });
  let fields = `<div class="field"><label>Amount (KAS)</label>
      <div class="dest-row">
        <input id="ct-amount" type="text" inputmode="decimal" placeholder="${esc(kasMax)}" value="${esc(prefill?.amountKas || '')}">
        <button class="max-btn" id="ct-kas-max" type="button">Max</button>
      </div>
    </div>
    <p class="avail-line">Available <b>${esc(formatAmount(balanceSompi))} KAS</b> — tap Max to lock all spendable KAS.</p>`;
  const durField = (label, ph) => `<div class="field"><label>${label}</label>
      <div class="dur-chips" id="ct-dur-chips">
        <button type="button" data-dur="3 minutes">3 min</button>
        <button type="button" data-dur="1 hour">1 hour</button>
        <button type="button" data-dur="1 day">1 day</button>
        <button type="button" data-dur="7 days">1 week</button>
        <button type="button" data-dur="30 days">30 days</button>
      </div>
      <input id="ct-duration" placeholder="${ph}">
    </div>`;
  if (p.type === 'timelock') {
    fields += durField('How long?', 'or type 3 minutes');
  } else if (p.type === 'sentinel') {
    fields += durField('Check-in window', '30 minutes or 7 days') + `
      <div class="field"><label>Who gets it if you miss a check-in?</label><input id="ct-beneficiary" placeholder="kaspa:q… (blank = you)" spellcheck="false"></div>
      <div class="field"><label>How many check-ins?</label><input id="ct-hops" type="number" min="2" max="8" value="6"></div>`;
  } else if (p.type === 'recurring') {
    fields += `<div class="field"><label>Pay each time (KAS)</label><input id="ct-pay" type="text" inputmode="decimal" placeholder="0.05"></div>
      <div class="field"><label>Pay to</label><input id="ct-payee" placeholder="kaspa:q…" spellcheck="false"></div>
      <div class="field"><label>How many payments?</label><input id="ct-periods" type="number" min="2" max="8" value="4"></div>
      ${durField('Time between payments', '7 days')}`;
  } else if (p.type === 'hashlock') {
    fields += durField('Refund after', '30 minutes or 7 days') + `
      <div class="field"><label>Who can claim with the secret?</label><input id="ct-receiver" placeholder="kaspa:q… (blank = you)" spellcheck="false"></div>
      <div class="field"><label>Secret (blank = we make one)</label><input id="ct-secret" placeholder="optional 32-byte hex" spellcheck="false"></div>`;
  } else if (p.type === 'escrow') {
    fields += `<div class="field"><label>Buyer address</label><input id="ct-buyer" placeholder="kaspa:q…" spellcheck="false"></div>`;
  } else if (p.type === 'multisig') {
    fields += `<div class="field"><label>Counterparty</label><input id="ct-counterparty" placeholder="kaspa:q…" spellcheck="false"></div>`;
  }
  openSheet(p.name, `<p class="muted" style="text-align:left;padding:0 0 12px;">${esc(p.blurb)}</p>${fields}`, {
    confirm: 'Build vault', gold: true, onConfirm: () => buildCovenant(p, readProductForm(p.type))
  });
  $('ct-kas-max')?.addEventListener('click', () => {
    if ($('ct-amount')) $('ct-amount').value = kasMax;
    if (kasMax === '0') toast('Need KAS in this wallet');
    haptic();
  });
  $('ct-dur-chips')?.addEventListener('click', e => {
    const b = e.target.closest('button[data-dur]');
    if (!b) return;
    $('ct-dur-chips').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if ($('ct-duration')) $('ct-duration').value = b.dataset.dur;
  });
}

async function executeKcc20Freeze(params) {
  const tick = String(params.tick || '').toUpperCase().trim();
  const amountToken = Number(params.amountToken);
  const minutes = Number(params.lockMinutes) || Math.round((Number(params.lockDays) || 0) * 1440);
  if (!tick) { toast('Enter a KCC20 ticker'); return; }
  if (!Number.isFinite(amountToken) || amountToken <= 0) { toast('Enter a token amount like 20'); return; }
  if (!minutes) { toast('Enter a duration like 3 minutes'); return; }
  const token = (kccHoldings || []).find(t => String(t.ticker || '').toUpperCase() === tick);
  openSheet('Freeze ' + tick, `
    <div class="kv"><span class="k">Lock</span><span class="v">${esc(amountToken)} ${esc(tick)}</span></div>
    <div class="kv"><span class="k">Duration</span><span class="v">${esc(params.durationLabel || (minutes + ' minutes'))}</span></div>
    <div class="kv"><span class="k">Witness dust</span><span class="v">0.2 KAS</span></div>
    <div class="kv"><span class="k">Network fee</span><span class="v">~0.005 KAS</span></div>
    <p class="muted" style="text-align:left;">Same two steps as Time Capsule: first ~0.2 KAS is locked in a CLTV kaspa:p (Vault path), then the tokens move into SCRIPT_HASH ownership of that capsule. When the timer ends, Sweep returns both.</p>
  `, { confirm: 'Freezing…', cancel: false });
  const busy = $('sheet-ok');
  if (busy) { busy.disabled = true; busy.dataset.busy = '1'; }
  try {
    await requirePin('Confirm ' + tick + ' freeze');
    setSheetStatus('Loading Kaspa engine…');
    await loadKaspaSdk();
    setSheetStatus('Fetching UTXOs…');
    const availableUtxos = wallet.receiveAddrs?.length > 1
      ? await fetchOwnedUtxos(wallet)
      : await fetchAddressUtxos(wallet.address);
    if (!availableUtxos.length) throw new Error('Need a little native KAS here for the 0.2 witness + fee');
    setSheetStatus('Connecting to public Kaspa node…');
    await pingPublicNode();
    const result = await lockKcc20Timelock({
      wallet,
      tick,
      amountHuman: String(amountToken),
      decimals: token?.decimals,
      minutes,
      utxos: availableUtxos,
      onStatus: (m) => setSheetStatus(m)
    });
    saveVault(result.vault);
    applyLocalTokenDelta(tick, 'kcc20', '-' + result.tokenAmount);
    afterTx();
    renderVault();
    openSheet(tick + ' frozen', `
      <div class="kv"><span class="k">Locked</span><span class="v">${esc(formatTokenUnits(result.tokenAmount, result.decimals))} ${esc(tick)}</span></div>
      <div class="kv"><span class="k">Witness in capsule</span><span class="v">${esc(result.witnessKas)} KAS</span></div>
      <div class="kv"><span class="k">Network fee</span><span class="v">${Number(result.feeKas || 0).toFixed(6)} KAS</span></div>
      <div class="kv"><span class="k">Unlock DAA</span><span class="v">${esc(result.vault.unlockDaa)}</span></div>
      <div class="kv"><span class="k">Capsule</span><span class="v">${esc(result.vault.address)}</span></div>
      ${txidBlock(result.txId)}
      <p class="muted" style="text-align:left;">${esc(tick)} cannot move until that DAA. Sweep returns the tokens to this wallet automatically.</p>
    `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
  } catch (e) {
    if (errText(e) === 'cancelled') { closeSheet(); return; }
    setSheetStatus(errText(e), true);
    toast(errText(e));
    const b = $('sheet-ok');
    if (b) {
      b.disabled = false;
      delete b.dataset.busy;
      b.textContent = 'Close';
      b.onclick = () => closeSheet();
    }
  }
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
  if (p.type === 'kcc20lock') {
    await executeKcc20Freeze(params);
    return;
  }
  if (!params.amountKas || !Number.isFinite(Number(params.amountKas))) {
    toast('Enter an amount like 0.15');
    return;
  }
  if ((p.type === 'timelock' || p.type === 'sentinel' || p.type === 'recurring' || p.type === 'hashlock')
      && !params.lockDays && !params.lockMinutes) {
    toast('Enter a duration like 3 minutes');
    return;
  }
  if (p.type === 'escrow' && !params.buyerAddress) { toast('Need a buyer address'); return; }
  if (p.type === 'multisig' && !params.counterparty) { toast('Need a counterparty'); return; }
  if (p.type === 'multisig' && params.counterparty === wallet.address) {
    toast('2-of-2 needs a different wallet, not this one');
    return;
  }
  if (p.type === 'multisig' && !walletByAddress(params.counterparty)) {
    toast('Import the counterparty wallet on You first — Sweep needs both keys on this device');
    return;
  }
  if (p.type === 'recurring' && !params.payee) { toast('Need a payee kaspa:q address'); return; }
  if (p.type === 'recurring' && !params.payKas) { toast('Enter how much KAS to pay each check-in'); return; }

  toast('Building P2SH covenant…');
  const payload = backendParams(p.type === 'sentinel' || p.type === 'recurring' || p.type === 'hashlock' ? 'timelock' : p.type, params);
  payload.beneficiary = params.beneficiary;
  payload.hopCount = params.hopCount;
  payload.payee = params.payee;
  payload.payKas = params.payKas;
  payload.periods = params.periods;
  payload.receiver = params.receiver;
  payload.secretHex = params.secretHex;
  try {
    await loadKaspaSdk();
    let built;
    const minutes = payload.lockMinutes || (payload.lockDays * 1440);
    const deposit = kasToSompi(params.amountKas);
    if (p.type === 'xmss') {
      const kit = parseXmssKit(params.kit);
      built = await p2shFromRedeemHex(kit.redeemHex);
      payload.kitHeight = kit.height;
      payload.masterRoot = kit.masterRoot;
      payload.scriptBytes = kit.scriptBytes;
    } else if (p.type === 'timelock') {
      built = await buildTimelockCovenant({ pubkeyHex: wallet.pubKey, minutes });
    } else if (p.type === 'sentinel') {
      const heir = payload.beneficiary || wallet.address;
      if (!isValidKaspaAddress(heir)) throw new Error('Beneficiary must be a kaspa: address');
      built = await buildSentinelChain({
        ownerPubHex: wallet.pubKey,
        beneficiaryAddr: heir,
        timeoutMinutes: minutes,
        hops: payload.hopCount || 6,
        depositSompi: deposit
      });
      payload.beneficiary = heir;
    } else if (p.type === 'recurring') {
      if (!isValidKaspaAddress(payload.payee)) throw new Error('Payee must be a kaspa: address');
      const pay = kasToSompi(payload.payKas);
      built = await buildRecurringChain({
        ownerPubHex: wallet.pubKey,
        ownerAddr: wallet.address,
        payeeAddr: payload.payee,
        paySompi: pay,
        periods: payload.periods || 4,
        timeoutMinutes: minutes,
        depositSompi: deposit
      });
    } else if (p.type === 'hashlock') {
      let secretHex = String(payload.secretHex || '').replace(/^0x/i, '');
      let secretHashHex;
      if (secretHex) {
        const raw = hexToBytes(secretHex);
        const buf = await crypto.subtle.digest('SHA-256', raw);
        secretHashHex = bytesToHex(new Uint8Array(buf));
      } else {
        const gen = await newHashlockSecret();
        secretHex = gen.secretHex;
        secretHashHex = gen.secretHashHex;
      }
      const recv = payload.receiver || wallet.address;
      if (!isValidKaspaAddress(recv)) throw new Error('Receiver must be a kaspa:q address');
      const recvPub = recv === wallet.address ? hexToBytes(wallet.pubKey) : payloadFromAddress(recv);
      if (!recvPub) throw new Error('Receiver must be a kaspa:q public-key address');
      built = await buildHashlockCovenant({
        senderPubHex: wallet.pubKey,
        receiverPubHex: bytesToHex(recvPub),
        secretHashHex,
        minutes
      });
      payload.secretHex = secretHex;
      payload.secretHashHex = secretHashHex;
      payload.receiver = recv;
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
      hops: built.hops || null,
      hopIndex: built.hopIndex || 0,
      paySompi: built.paySompi || null,
      payeeAddr: built.payeeAddr || payload.payee || '',
      params: payload,
      status: 'unfunded',
      fundedSompi: 0
    };
    saveVault(vault);
    if (p.type === 'escrow' && payload.buyerAddress) mirrorVaultTo(payload.buyerAddress, vault);
    if (p.type === 'multisig' && payload.counterparty) mirrorVaultTo(payload.counterparty, vault);
    if (p.type === 'sentinel' && payload.beneficiary && payload.beneficiary !== wallet.address) {
      mirrorVaultTo(payload.beneficiary, vault);
    }
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
    ${vault.hops ? `<div class="kv"><span class="k">Hops</span><span class="v">${esc(vault.hops.length)} check-ins</span></div>` : ''}
    ${vault.params?.secretHex ? `<div class="kv"><span class="k">Secret</span><span class="v" style="word-break:break-all">${esc(vault.params.secretHex)}</span></div>` : ''}
    <div class="kv"><span class="k">Covenant</span><span class="v">${esc(vault.address)}</span></div>
    <p class="muted" style="text-align:left;">${vault.params?.secretHex
      ? 'Copy the secret before you close this sheet. Claim with it, or refund after the timer.'
      : 'Only <strong>' + esc(amt) + ' KAS</strong> goes into the capsule. The fee is paid from leftover UTXOs. Change stays in this wallet.'}</p>
  `, {
    confirm: 'Lock ' + amt + ' KAS',
    cancelLabel: 'Copy address',
    gold: true,
    onConfirm: () => fundVault(vault).catch(e => { toast(errText(e)); setSheetStatus(errText(e), true); })
  });
  $('sheet-cancel')?.addEventListener('click', async (ev) => {
    ev.preventDefault();
    await navigator.clipboard.writeText(vault.address);
    toast('Covenant address copied');
    closeSheet();
  }, { once: true });
}

async function fundVault(vault) {
  const amt = vault.params?.amountKas;
  if (amt == null || amt === '') throw new Error('Missing amount');
  if (!wallet?.address) throw new Error('No wallet');
  try {
    await requirePin('Confirm vault fund');
  } catch (e) {
    if (errText(e) === 'cancelled') return;
    throw e;
  }
  setSheetStatus('Loading Kaspa engine…');
  await loadKaspaSdk();
  setSheetStatus('Fetching UTXOs…');
  const availableUtxos = wallet.receiveAddrs?.length > 1
    ? await fetchOwnedUtxos(wallet)
    : await fetchAddressUtxos(wallet.address);
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
  afterTx();
  const lockedKas = Number(result.amountKas || amt);
  const feeKas = Number(result.feeKas || 0);
  openSheet('Covenant funded', `
    <div class="kv"><span class="k">Locked in capsule</span><span class="v">${esc(formatKas(lockedKas))} KAS</span></div>
    <div class="kv"><span class="k">Network fee</span><span class="v">${feeKas.toFixed(6)} KAS</span></div>
    <div class="kv"><span class="k">Left this wallet</span><span class="v">${formatKas(lockedKas + feeKas)} KAS</span></div>
    <div class="kv"><span class="k">Covenant</span><span class="v">${esc(vault.address)}</span></div>
    ${result.covenantId ? `<div class="kv"><span class="k">Covenant ID</span><span class="v">${esc(result.covenantId)}</span></div>` : ''}
    ${txidBlock(result.txId)}
    <p class="muted" style="text-align:left;">Exactly ${esc(formatKas(lockedKas))} KAS is frozen in the capsule. The fee was paid from leftover UTXOs; change stays in this wallet. Sweep later returns the locked amount minus a small sweep fee (~0.004 KAS).</p>
  `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
}

function openLockTimer(vault) {
  if (!vault) return;
  haptic();
  const sec = remainingLockSec(vault.unlockDaa);
  const locked = (vault.unlockDaa && (sec == null || sec > 0));
  const tok = vaultTokenLabel(vault);
  const kcc = isKcc20Vault(vault);
  const isEscrow = vault.type === 'escrow';
  const isMsig = vault.type === 'multisig';
  const hop = isHopVault(vault);
  const isHash = vault.type === 'hashlock';
  const isXmss = vault.type === 'xmss';
  const iAmBuyer = isEscrow && wallet?.address === vault.params?.buyerAddress;
  const msigReady = isMsig && !!vaultCounterpartyKey(vault);
  const hopN = (vault.hops || []).length;
  const hopI = Number(vault.hopIndex || 0);
  let help = 'Sweep returns KAS to this wallet.';
  if (kcc && locked) help = 'Still frozen. When the timer hits zero, Sweep returns the tokens plus leftover witness KAS.';
  else if (kcc) help = 'Lock has expired. Sweep now, or wait — auto-return is on.';
  else if (hop && locked) help = 'Check-in now to move the coins to the next hop. If this window ends, the beneficiary can claim.';
  else if (hop) help = 'Check-in window ended. Sweep / timeout releases to the beneficiary.';
  else if (isXmss) help = 'Paste the witness JSON from xmss_sign.py (offline). Spend uses ~0.32 KAS from this wallet as the fee input.';
  else if (isHash && locked) help = 'Claim with the secret, or wait for the refund timer.';
  else if (isHash) help = 'Refund timer ended. Sweep returns KAS to the sender.';
  else if (vault.unlockDaa && locked) help = 'Still frozen on-chain. When this timer hits zero, Sweep returns the KAS automatically.';
  else if (vault.unlockDaa) help = 'Lock has expired. Sweep now, or wait — auto-return is on.';
  else if (isEscrow && iAmBuyer) help = 'You are the buyer. Release sends the KAS to this wallet.';
  else if (isEscrow) help = 'You are the seller. Refund returns the KAS to this wallet. Buyer can Release if their wallet is imported here.';
  else if (isMsig && !msigReady) help = '2-of-2: import the counterparty wallet on You, switch back here, then Sweep.';
  else if (isMsig) help = 'Both keys are on this device. Sweep signs 2-of-2 and returns KAS here.';
  const sweepLabel = isEscrow ? (iAmBuyer ? 'Release to me' : 'Refund to me')
    : (isXmss ? 'Spend with witness' : (hop ? 'Timeout release' : (isHash && locked ? 'Claim with secret' : 'Sweep to wallet')));
  openSheet(vault.name || 'Time Capsule', `
    <div class="kv"><span class="k">Locked</span><span class="v">${tok ? esc(tok) : formatAmount(vault.fundedSompi || 0) + ' KAS'}</span></div>
    ${kcc ? `<div class="kv"><span class="k">Witness dust</span><span class="v">${formatAmount(vault.fundedSompi || 0)} KAS</span></div>` : ''}
    ${vault.fundFeeKas ? `<div class="kv"><span class="k">Lock fee paid</span><span class="v">${Number(vault.fundFeeKas).toFixed(6)} KAS</span></div>` : ''}
    ${vault.unlockDaa ? `<div class="kv"><span class="k">Time left</span><span class="v" id="lock-timer-live" data-unlock-daa="${esc(vault.unlockDaa || '')}" data-addr="${esc(vault.address || '')}">${esc(formatLockClock(sec))}</span></div>
    <div class="kv"><span class="k">Unlocks (UTC)</span><span class="v" id="lock-timer-utc">${esc(unlockAtUtc(sec))}</span></div>
    <div class="kv"><span class="k">Unlock DAA</span><span class="v">${esc(vault.unlockDaa)} (now ${esc(lastDaa || '—')})</span></div>` : ''}
    ${isEscrow ? `<div class="kv"><span class="k">Buyer</span><span class="v">${esc(shortAddr(vault.params?.buyerAddress || '', 10, 6))}</span></div>` : ''}
    ${isMsig ? `<div class="kv"><span class="k">Counterparty</span><span class="v">${esc(shortAddr(vault.params?.counterparty || '', 10, 6))}</span></div>` : ''}
    ${hop ? `<div class="kv"><span class="k">Hop</span><span class="v">${hopI + 1} / ${hopN}</span></div>` : ''}
    ${vault.params?.beneficiary ? `<div class="kv"><span class="k">Beneficiary</span><span class="v">${esc(shortAddr(vault.params.beneficiary, 10, 6))}</span></div>` : ''}
    ${vault.payeeAddr ? `<div class="kv"><span class="k">Payee</span><span class="v">${esc(shortAddr(vault.payeeAddr, 10, 6))}</span></div>` : ''}
    ${isHash ? `<div class="field"><label>Secret</label><input id="v-secret" placeholder="32-byte hex" value="${esc(vault.params?.secretHex || '')}" spellcheck="false"></div>` : ''}
    ${isXmss ? `<div class="field"><label>Witness JSON</label><textarea id="v-witness" rows="6" placeholder='{"witness_hex":["…"]}' spellcheck="false"></textarea></div>` : ''}
    <div class="kv"><span class="k">Address</span><span class="v">${esc(vault.address)}</span></div>
    <p class="muted" style="text-align:left;">${esc(help)}</p>
    ${canCheckinVault(vault) ? `<button class="btn btn-gold" id="v-checkin" style="margin-top:14px;">Check in</button>` : ''}
    <button class="btn ${canCheckinVault(vault) ? 'btn-glass' : 'btn-gold'}" id="v-unlock" style="margin-top:10px;" ${isMsig && !msigReady ? 'disabled' : ''}>${esc(sweepLabel)}</button>
    ${kcc ? `<div class="btn-row" style="margin-top:10px;"><button class="btn btn-glass" id="v-copy">Copy capsule</button></div>` : `<div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-glass" id="v-copy">Copy</button>
      <button class="btn btn-glass" id="v-fund">Fund more</button>
    </div>`}
  `, { confirm: 'Close', cancel: false });
  $('v-copy').onclick = async () => { await navigator.clipboard.writeText(vault.address); toast('Copied'); };
  $('v-fund')?.addEventListener('click', () => fundVault(vault).catch(e => toast(errText(e))));
  $('v-unlock').onclick = () => unlockVault(vault, {
    escrowRelease: isEscrow && iAmBuyer,
    secretHex: $('v-secret')?.value.trim() || vault.params?.secretHex || '',
    witness: $('v-witness')?.value || ''
  }).catch(e => { setSheetStatus(errText(e), true); toast(errText(e)); });
  $('v-checkin')?.addEventListener('click', () => runCheckin(vault).catch(e => { setSheetStatus(errText(e), true); toast(errText(e)); }));
}

async function runCheckin(vault) {
  await requirePin('Confirm check-in');
  setSheetStatus('Looking up hop UTXOs…');
  const utxosV = await fetchAddressUtxos(vault.address);
  if (!utxosV.length) throw new Error('Nothing at this hop — fund it first');
  await pingPublicNode();
  setSheetStatus(vault.type === 'recurring' ? 'Paying + relocking next hop…' : 'Moving to next hop…');
  const result = await checkinHop({ wallet, vault, utxos: utxosV });
  const next = result.nextHop;
  if (next) {
    updateVault(vault.address, {
      address: next.address,
      scriptHex: next.redeemHex,
      spkHex: next.spkHex,
      unlockDaa: next.unlockDaa,
      hopIndex: result.hopIndex,
      hops: vault.hops,
      fundedSompi: Number(next.value || 0),
      status: 'locked',
      lastCheckinTxId: result.txId
    });
  } else {
    updateVault(vault.address, { status: 'swept', unlockTxId: result.txId, fundedSompi: 0 });
  }
  afterTx();
  renderVault();
  openSheet('Checked in', `
    <div class="kv"><span class="k">Hop</span><span class="v">${(vault.hopIndex || 0) + 1} → ${(result.hopIndex || 0) + 1}</span></div>
    ${next ? `<div class="kv"><span class="k">Next hop</span><span class="v">${esc(shortAddr(next.address, 10, 6))}</span></div>` : ''}
    <div class="kv"><span class="k">Fee</span><span class="v">${Number(result.feeKas || 0).toFixed(6)} KAS</span></div>
    ${txidBlock(result.txId)}
    <p class="muted" style="text-align:left;">${next ? 'The timer is now the next hop window. Check in again before it ends.' : 'Chain finished.'}</p>
  `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
}

async function openVaultDetail(address) {
  const vault = loadVaults().find(v => v.address === address);
  if (!vault) return;
  if (!lastDaa) {
    try { lastDaa = await currentDaa(); lastDaaAt = Date.now(); } catch {}
  }
  openLockTimer(vault);
}

async function unlockVault(vault, opts = {}) {
  autoSweepTried.add(vault.address);
  const kcc = isKcc20Vault(vault);
  const extraPrivKey = vault.type === 'multisig' ? vaultCounterpartyKey(vault) : '';
  if (vault.type === 'multisig' && !extraPrivKey) {
    toast('Import the counterparty wallet first');
    return;
  }
  if (vault.type === 'xmss' && !String(opts.witness || '').trim()) {
    toast('Paste the witness JSON from xmss_sign.py first');
    return;
  }
  openSheet(kcc ? 'Unfreeze KCC20' : 'Sweep vault', `
    <p class="muted" style="text-align:left;">${kcc ? 'Spending the CLTV witness and returning ' + esc(vault.tick || 'KCC20') + ' to this wallet.' : 'Returning KAS from this covenant to your wallet.'}</p>
    <div class="kv"><span class="k">From</span><span class="v">${esc(vault.address || '')}</span></div>
  `, { confirm: 'Sweeping…', cancel: false });
  const busy = $('sheet-ok');
  if (busy) { busy.disabled = true; busy.dataset.busy = '1'; }
  try {
    await requirePin(kcc ? 'Confirm unfreeze' : 'Confirm sweep');
  } catch (e) {
    if (errText(e) === 'cancelled') { closeSheet(); return; }
    throw e;
  }
  setSheetStatus('Looking up vault UTXOs…');
  const utxosV = await fetchAddressUtxos(vault.address);
  if (!utxosV.length && !kcc) throw new Error('Nothing to sweep — this address has 0 UTXOs');
  setSheetStatus('Connecting to public node…');
  await pingPublicNode();
  setSheetStatus(vault.type === 'xmss' ? 'Building XMSS witness spend…' : (kcc ? 'Signing SCRIPT_HASH witness + CLTV…' : 'Signing P2SH redeem…'));
  let result;
  if (kcc) {
    result = await sweepKcc20Capsule({ wallet, vault, utxos: utxosV, onStatus: (m) => setSheetStatus(m) });
  } else if (vault.type === 'xmss') {
    const feeUtxos = await fetchOwnedUtxos(wallet);
    result = await spendXmssVault({
      wallet, vault, utxos: utxosV, feeUtxos, witness: opts.witness, dest: wallet.address
    });
  } else {
    result = await sweepVault({
      wallet,
      vault,
      utxos: utxosV,
      extraPrivKey,
      escrowRelease: !!opts.escrowRelease,
      secretHex: opts.secretHex || vault.params?.secretHex || ''
    });
  }
  updateVault(vault.address, { status: 'swept', unlockTxId: result.txId, fundedSompi: 0, tokenAmount: kcc ? '0' : vault.tokenAmount });
  if (kcc && result.tokenAmount) applyLocalTokenDelta(vault.tick, 'kcc20', result.tokenAmount);
  afterTx();
  openSheet('Swept', `
    ${kcc && result.tokenAmount ? `<div class="kv"><span class="k">Returned</span><span class="v">${esc(formatTokenUnits(result.tokenAmount, vault.decimals))} ${esc(vault.tick)}</span></div>` : ''}
    <div class="kv"><span class="k">${kcc ? 'Witness leftover' : 'Returned'}</span><span class="v">${esc(formatKas(result.amountKas))} KAS</span></div>
    <div class="kv"><span class="k">Sweep fee</span><span class="v">${Number(result.feeKas || 0).toFixed(6)} KAS</span></div>
    ${txidBlock(result.txId)}
    <p class="muted" style="text-align:left;">${kcc
      ? 'Tokens are ADDRESS-owned again on this wallet. The sweep fee came from the 0.2 KAS witness dust.'
      : 'The sweep fee is the Toccata compute fee (usually 0.004–0.007 KAS), not a cut of the lock. You should get lock amount minus this fee.'}</p>
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
    if (!canSweepVault(v, daa)) { skipped++; continue; }
    try {
      const utxosV = await fetchAddressUtxos(v.address);
      if (!utxosV.length && !isKcc20Vault(v)) { skipped++; continue; }
      if (isKcc20Vault(v)) {
        const result = await sweepKcc20Capsule({ wallet, vault: v, utxos: utxosV });
        updateVault(v.address, { status: 'swept', fundedSompi: 0, tokenAmount: '0' });
        if (result.tokenAmount) applyLocalTokenDelta(v.tick, 'kcc20', result.tokenAmount);
      } else {
        const extraPrivKey = v.type === 'multisig' ? vaultCounterpartyKey(v) : '';
        const escrowRelease = v.type === 'escrow' && wallet?.address === v.params?.buyerAddress;
        await sweepVault({ wallet, vault: v, utxos: utxosV, extraPrivKey, escrowRelease });
        updateVault(v.address, { status: 'swept', fundedSompi: 0 });
      }
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

let chatTurns = [];

function resolveWalletAlias(text, intent) {
  if (!intent || intent.type !== 'send') return intent;
  if (intent.params?.destination) return intent;
  const m = String(text || '').match(/\bwallet\s*([12]|one|two)\b/i);
  if (!m) return intent;
  const n = /2|two/i.test(m[1]) ? 2 : 1;
  const list = loadWalletList();
  const w = list.find(x => String(x.name || '').toLowerCase() === 'wallet ' + n) || list[n - 1];
  if (w?.address && w.address !== wallet?.address) {
    intent.params = { ...(intent.params || {}), destination: w.address };
    intent.missing = (intent.missing || []).filter(x => !String(x).includes('destination'));
    intent.complete = !intent.missing.length;
  }
  return intent;
}

async function argentRemote(message) {
  const ticks = (kccHoldings || []).map(t => t.ticker).filter(Boolean);
  const payload = {
    action: 'chat',
    agent: 'argent',
    message,
    history: chatTurns.slice(-8),
    context: {
      products: VAULT_PRODUCTS.map(p => ({ id: p.id, name: p.name, type: p.type })),
      ticks,
      wallets: loadWalletList().map(w => ({ name: w.name, address: w.address }))
    }
  };
  const res = await fetch(`${BACKEND_URL}/kccApi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Argent HTTP ' + res.status);
  return res.json();
}

async function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  appendChat('me', esc(text));
  chatTurns.push({ role: 'user', content: text });
  const typing = appendChat('ai', '<span style="opacity:0.55">Argent is reading that…</span>');

  const localView = interpretVaultChat(text, lastIntent);
  let remote = null;
  try {
    remote = await argentRemote(normalizeChat(text));
  } catch {
    try {
      const res = await fetch(`${BACKEND_URL}/kccApi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parseIntent', message: normalizeChat(text) })
      });
      remote = await res.json();
    } catch { /* local Argent is enough */ }
  }

  typing.remove();

  if (localView.kind === 'talk' && !(remote && (remote.type || remote.params))) {
    appendChat('ai', esc(localView.text));
    chatTurns.push({ role: 'assistant', content: localView.text });
    return;
  }

  let intent = localView.kind === 'intent' && !localView.intent?.error ? localView.intent : null;
  if (remote && !remote.error && (remote.type || remote.params)) {
    const merged = parseIntent(normalizeChat(text), {
      type: remote.type || intent?.type,
      params: { ...(intent?.params || {}), ...(remote.params || {}) }
    });
    if (!merged.error) intent = merged;
  }
  if (intent) intent = resolveWalletAlias(text, intent);
  if (intent && !intent.error) lastIntent = { ...intent, params: { ...(lastIntent?.params || {}), ...intent.params } };

  if (remote?.reply || remote?.text) {
    const talk = String(remote.reply || remote.text);
    appendChat('ai', esc(talk));
    chatTurns.push({ role: 'assistant', content: talk });
  }

  if (!intent || intent.error) {
    if (!(remote?.reply || remote?.text)) {
      const fallback = localView.kind === 'talk'
        ? localView.text
        : 'Argent here. I can lock KAS, freeze KCC20, escrow, 2-of-2, or send to wallet 2. Example: <em>lock .15 kas for 3 minutes</em>';
      appendChat('ai', fallback);
      chatTurns.push({ role: 'assistant', content: fallback.replace(/<[^>]+>/g, '') });
    }
    return;
  }
  renderIntentCard(intent);
}

function click(id, fn) {
  const el = $(id);
  if (el) el.onclick = fn;
}

function bind() {
  window.__kccBound = true;
  click('btn-create', createWallet);
  click('btn-show-import', () => $('import-box')?.classList.toggle('hidden'));
  click('btn-import', importWallet);
  click('btn-send', openSend);
  click('btn-receive', openReceive);
  click('btn-trade', () => openTrade({ tick: 'KRON', side: 'buy' }));
  click('btn-trade-tokens', () => openTrade({ tick: 'KRON', side: 'buy' }));
  click('trade-close', hideTradeScreen);
  click('trade-lookup', lookupTradeTicker);
  click('trade-go', () => reviewTrade());
  $('trade-ticker')?.addEventListener('keydown', e => { if (e.key === 'Enter') lookupTradeTicker(); });
  $('trade-amount')?.addEventListener('input', () => {
    clearTimeout(openTrade._t);
    openTrade._t = setTimeout(quoteTradePreview, 280);
  });
  click('trade-max', fillTradeMax);
  $('trade-avail')?.addEventListener('click', fillTradeMax);
  $('trade-side')?.addEventListener('click', e => {
    const b = e.target.closest('[data-side]');
    if (!b) return;
    $('trade-side').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if ($('trade-amount')) $('trade-amount').value = '';
    syncTradeLabel();
    quoteTradePreview();
  });
  $('pin-cancel')?.addEventListener('click', cancelPinGate);
  $('kron-markets')?.addEventListener('click', e => {
    const row = e.target.closest('[data-trade-tick]');
    if (row?.dataset.tradeTick) openTrade({ tick: row.dataset.tradeTick, side: 'buy' });
  });
  click('btn-copy-addr', async () => { await navigator.clipboard.writeText(wallet.address); toast('Copied'); });
  click('btn-move-wallet', () => openMoveToOwned());
  click('card-wallet', openWalletSwitcher);
  $('home-wallets')?.addEventListener('click', e => {
    if (e.target.closest('[data-add-wallet]')) { openWalletSwitcher(); return; }
    const sendTo = e.target.closest('[data-send-to]');
    if (sendTo?.dataset.sendTo) {
      e.preventDefault();
      e.stopPropagation();
      openSendToWallet(sendTo.dataset.sendTo);
      return;
    }
    const btn = e.target.closest('[data-switch-wallet]');
    if (btn?.dataset.switchWallet) switchToWallet(btn.dataset.switchWallet);
  });
  $('act-scope')?.addEventListener('click', e => {
    const b = e.target.closest('[data-actscope]');
    if (!b?.dataset.actscope) return;
    activityAll = b.dataset.actscope === 'all';
    haptic();
    renderActivity(window.__txs || []);
  });
  click('btn-refresh', () => { haptic(); refreshAll(); toast('Refreshing'); });
  $('btn-compound')?.addEventListener('click', openCompound);
  click('btn-vault-short', () => showPage('vault'));
  $('btn-sweep-now')?.addEventListener('click', () => {
    sweepAllVaults().catch(err => toast(errText(err)));
  });
  $('btn-sweep-addr')?.addEventListener('click', () => {
    const addr = $('sweep-addr')?.value.trim();
    if (!addr) { toast('Paste a kaspa:p… address'); return; }
    const known = loadVaults().find(v => v.address === addr) || { address: addr, type: 'timelock', name: 'Vault' };
    unlockVault(known).catch(err => toast(errText(err)));
  });
  $('vault-seg')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-vtab]');
    if (btn?.dataset.vtab) { haptic(); setVaultTab(btn.dataset.vtab); }
  });
  $('vault-hist-seg')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-vhist]');
    if (!btn?.dataset.vhist) return;
    haptic();
    setVaultHistory(btn.dataset.vhist === 'history');
  });
  click('btn-add-token', openAddToken);
  click('chat-send', sendChat);
  $('chat-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  $('chat-input')?.addEventListener('focus', () => {
    setTimeout(() => { const log = $('chat-log'); if (log) log.scrollTop = log.scrollHeight; }, 350);
  });
  $('chat-log')?.addEventListener('click', e => {
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
  $('sheet-overlay')?.addEventListener('click', e => { if (e.target === $('sheet-overlay')) closeSheet(); });
  $('phone')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-copy]');
    if (!btn?.dataset.copy) return;
    e.preventDefault();
    e.stopPropagation();
    copyText(btn.dataset.copy);
  });
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    haptic();
    const tab = t.dataset.tab;
    showPage(tab);
    if (tab === 'tokens') { renderTokens(); renderKronMarkets(); }
    if (tab === 'vault') renderVault();
    if (tab === 'activity') renderActivity(window.__txs || []);
    if (tab === 'you') renderProfile();
    if (tab === 'home') refreshAll();
  });
  $('activity-list')?.addEventListener('click', e => {
    if (e.target.closest('[data-copy]')) return;
    const row = e.target.closest('[data-txid], [data-token-act]');
    if (row?.dataset.txid) {
      openScorpionTx(row.dataset.txid).catch(err => toast(errText(err)));
      return;
    }
    if (row?.dataset.tokenAct) openTokenActivity(row.dataset.tokenAct);
  });
  click('profile-kns', openKnsSheet);
  click('profile-copy', async () => {
    if (!wallet?.address) return;
    await navigator.clipboard.writeText(wallet.address);
    toast('Address copied');
  });
  click('profile-qr', () => openReceive());
  click('profile-compound', openCompound);
  click('profile-pin', openPinSettings);
  click('profile-keys', openSettings);
  click('profile-wipe', logout);
  $('pin-pad')?.addEventListener('click', e => {
    const b = e.target.closest('[data-pin]');
    if (b?.dataset.pin) pinPress(b.dataset.pin);
  });
  document.addEventListener('keydown', onPinKeydown);
  click('profile-new-wallet', () => createWallet());
  click('profile-import-wallet', openImportAnother);
  $('wallet-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-switch-wallet]');
    if (btn?.dataset.switchWallet) switchToWallet(btn.dataset.switchWallet);
  });
  click('scorpion-send', () => sendScorpion().catch(err => toast(errText(err))));
  $('scorpion-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendScorpion().catch(err => toast(errText(err)));
  });
  $('scorpion-hint')?.addEventListener('click', () => showPage('you'));
  $('holdings')?.addEventListener('click', e => {
    const lock = e.target.closest('[data-lock-holding]');
    if (lock?.dataset.lockHolding) {
      const vault = loadVaults().find(v => v.address === lock.dataset.lockHolding);
      openLockTimer(vault);
      return;
    }
    const row = e.target.closest('[data-token-key], [data-ticker]');
    if (!row) return;
    if (row.dataset.ticker === 'KAS') { openKasSheet(); return; }
    const token = findToken(row.dataset.tokenKey);
    if (token) openTokenSheet(token);
    else showPage('tokens');
  });
  $('token-native')?.addEventListener('click', e => {
    if (e.target.closest('[data-ticker="KAS"], [data-token-key]')) openKasSheet();
  });
  $('token-list')?.addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) return;
    const row = e.target.closest('[data-token-key]');
    const token = findToken(row?.dataset.tokenKey);
    if (token) openTokenSheet(token);
  });
  $('token-krc20')?.addEventListener('click', e => {
    const row = e.target.closest('[data-token-key]');
    const token = findToken(row?.dataset.tokenKey);
    if (token) openTokenSheet(token);
  });
  $('token-watch')?.addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { removeToken(rm.dataset.remove); renderTokens(); renderHome(); }
  });
  $('vault-products')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-product]');
    if (btn) openProduct(btn.dataset.product);
  });
  $('vault-mine')?.addEventListener('click', e => {
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
  document.addEventListener('error', (ev) => {
    const img = ev.target;
    if (!img || img.tagName !== 'IMG' || !img.dataset.tick) return;
    const tick = String(img.dataset.tick || '');
    const proto = String(img.dataset.proto || '');
    const step = Number(img.dataset.step || 0);
    const t = tick.toLowerCase();
    const next = proto === 'kcc20'
      ? [kcc20Identicon(tick)]
      : [
          `https://krc20data.s3.amazonaws.com/verified/${t}.png`,
          `https://krc20data.s3.amazonaws.com/verified/${tick}-logo.png`,
          kcc20Identicon(tick)
        ];
    if (step < next.length) {
      img.dataset.step = String(step + 1);
      img.src = next[step];
      return;
    }
    const parent = img.parentNode;
    const fb = img.dataset.fb || tick.slice(0, 3) || '?';
    img.remove();
    if (parent && !parent.textContent.trim()) parent.append(fb);
  }, true);
  window.__kcc = { parseIntent, isValidKaspaAddress, validateKaspaAddress, describeIntent, pingPublicNode, toRpcTransaction, p2shSpendScript, planKasPayment, storageMassOk, kasToSompi };
  window.__kccLoad = loadKaspaSdk;
  setClock();
  setInterval(setClock, 1000);
  loadSnaps();
  try { bind(); } catch (e) {
    console.error(e);
    window.__kccBound = false;
    toast('UI failed to bind — hard refresh. ' + errText(e));
  }
  const video = document.getElementById('bg-video');
  const mobileBg = window.matchMedia('(max-width: 520px), (pointer: coarse)').matches;
  if (mobileBg) {
    try { video?.pause(); } catch {}
    if (video) {
      video.querySelectorAll('source').forEach(s => s.remove());
      video.removeAttribute('src');
      try { video.load(); } catch {}
      video.remove();
    }
    document.querySelector('.bg-poster')?.classList.remove('hidden');
  } else {
    video?.play?.().catch(() => {});
    video?.addEventListener('playing', () => document.querySelector('.bg-poster')?.classList.add('hidden'));
  }
  const saved = loadStoredWallet();
  if (saved?.address && saved?.privKey) {
    wallet = migratePinOnto(saved);
    hydrateFromSnap(saved.address);
    if (!loadPin()) beginPinFlow('set');
    else beginPinFlow('unlock');
  }
  try { await loadCryptoLibs(); } catch { toast('Signing library delayed — check network'); }
  if (saved?.address && saved?.privKey) {
    wallet = migratePinOnto(saved);
    if (!wallet.pubKey) {
      try {
        const pub = await derivePublicKey(hexToBytes(wallet.privKey));
        wallet.pubKey = privKeyToHex(pub);
        wallet.address = wallet.address || kaspaAddressFromPubkey(pub);
        saveWallet();
      } catch {}
    }
    if (!sessionOpen()) {
      if (!loadPin()) beginPinFlow('set');
      else beginPinFlow('unlock');
      return;
    }
    await unlockToHome();
  } else {
    showPage('lock');
    $('tabbar').classList.remove('show');
    $('nav-title').textContent = 'KCC20';
  }
}

init();
