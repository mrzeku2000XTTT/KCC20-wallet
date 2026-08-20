import {
  loadCryptoLibs, generatePrivateKey, createKeypairFromHex,
  isValidKaspaAddress, shortAddr, hexToBytes, privKeyToHex, derivePublicKey, kaspaAddressFromPubkey, bytesToHex
} from './crypto.js';
import {
  NATIVE_KAS, VAULT_PRODUCTS, loadWatchlist, addToken, removeToken,
  loadVaults, saveVault, updateVault, formatAmount, formatTokenUnits, tokenColor,
  fetchKcc20Portfolio, fetchKrc20Portfolio, krc20Logo, toTokenRaw, setVaultOwner
} from './kcc20.js';
import { parseIntent, describeIntent, askFor, parseDurationField } from './intent.js';
import { payloadFromAddress } from './script.js';
import { explainTransaction, scorpionAnswer } from './scorpion.js';
import {
  sendKas, fetchAddressUtxos, fetchAddressBalance, loadKaspaSdk,
  buildTimelockCovenant, buildEscrowCovenant, buildMultisigCovenant, currentDaa,
  pingPublicNode, sweepVault, toRpcTransaction, p2shSpendScript, planKasPayment, storageMassOk,
  compoundUtxos, sendKrc20, sendKcc20, loadKrc20Pending, lockKcc20Timelock, sweepKcc20Capsule
} from './tx.js';
import { kronMarkets, quoteKronTrade, executeKronTrade, formatKasSompi, lookupKronTick, tradeCostLines } from './kronTrade.js';

function errText(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.message || e.toString?.() || String(e);
}

function productForIntent(intent) {
  if (intent.type === 'kcc20lock') return VAULT_PRODUCTS.find(p => p.id === 'kcc20freeze');
  if (intent.type === 'timelock') return VAULT_PRODUCTS.find(p => p.id === 'timelock');
  return VAULT_PRODUCTS.find(p => p.id === intent.type)
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

const API_BASE = 'https://api.kaspa.org';
const BACKEND_URL = 'https://base44.app/api/apps/6a444b036408e68ec8d6f2a6/functions';
const STORE_KEY = 'kcc20_wallet_v1';
const LEGACY_KEY = 'scorpion_wallet';
const WALLETS_KEY = 'kcc20_wallets_v2';
const ACTIVE_KEY = 'kcc20_active_id';
const PIN_KEY = 'kcc20_pin_v1';
const SNAPS_KEY = 'kcc20_snaps_v1';

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
  $('scroll')?.classList.toggle('home-noscroll', id === 'home');
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
  const row = {
    id: wallet.id,
    name: wallet.name,
    address: wallet.address,
    privKey: wallet.privKey,
    pubKey: wallet.pubKey || '',
    createdAt: wallet.createdAt || Date.now(),
    pin: wallet.pin || list[i]?.pin || undefined
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
        const sompi = await fetchAddressBalance(w.address);
        const prev = walletSnap[w.address] || {};
        walletSnap[w.address] = { ...prev, sompi, at: Date.now() };
        if (tokens) {
          const [kcc, krc] = await Promise.allSettled([
            fetchKcc20Portfolio(w.address, w.pubKey),
            fetchKrc20Portfolio(w.address)
          ]);
          if (kcc.status === 'fulfilled') walletSnap[w.address].kcc = slimTokens(kcc.value);
          if (krc.status === 'fulfilled') walletSnap[w.address].krc = slimTokens(krc.value);
        }
      } catch (e) {
        console.warn(e);
      }
    }));
    persistSnaps();
    if (currentTab === 'you') renderProfile();
    if (currentTab === 'home') renderHomeWallets();
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

async function hashPin(pin, salt) {
  return sha256Hex(`${salt}:${pin}`);
}

async function savePin(pin) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = await hashPin(pin, salt);
  const rec = { salt, hash, len: pin.length };
  if (wallet) {
    wallet.pin = rec;
    saveWallet();
  }
  localStorage.removeItem(PIN_KEY);
}

async function pinMatches(pin) {
  const rec = loadPin();
  if (!rec) return false;
  return (await hashPin(pin, rec.salt)) === rec.hash;
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
}

async function activateWallet(w, { toastMsg } = {}) {
  wallet = migratePinOnto(w);
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

function renderHome() {
  if (!wallet) return;
  $('card-bal').innerHTML = `${formatAmount(balanceSompi)}<small>KAS</small>`;
  $('card-usd').textContent = price ? `≈ ${usd(kas())}` : 'Fetching price…';
  $('card-addr').textContent = shortAddr(wallet.address, 12, 8);
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
  box.innerHTML = list.map(w => {
    const active = w.id === wallet.id;
    return `
      <button class="w-chip${active ? ' on' : ''}" type="button" data-switch-wallet="${esc(w.id)}">
        <b>${esc(w.name || 'Wallet')}</b>
        <em>${esc(walletKasLabel(w, active))} KAS</em>
      </button>`;
  }).join('') + `<button class="w-chip add" type="button" data-add-wallet="1" aria-label="Add wallet">＋</button>`;
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
  const src = t.image || (t.native || t.ticker === 'KAS' ? 'assets/kas.svg' : (t.protocol === 'krc20' ? krc20Logo(t.ticker) : ''));
  const img = src
    ? `<img alt="" src="${esc(src)}" data-tick="${esc(t.ticker || '')}" data-fb="${fb}">`
    : fb;
  return `<div class="dot" style="background:${esc(color)}22;color:${esc(color)}">${img}</div>`;
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
  const rows = [...kccRows, ...krcRows, ...lockRows];
  $('holdings').innerHTML = rows.join('') || `<div class="empty">No tokens yet — TRADE KCC20 to buy.</div>`;
  const n = Array.isArray(utxos) ? utxos.length : 0;
  if ($('utxo-count')) $('utxo-count').textContent = n === 1 ? '1 UTXO' : `${n} UTXOs`;
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
  $('vault-products').innerHTML = VAULT_PRODUCTS.map(p => `
    <button class="glass product" data-product="${esc(p.id)}" title="${esc(p.blurb)}">
      <div class="glyph">${esc(p.tag)}</div>
      <h4>${esc(p.name)}</h4>
    </button>
  `).join('');
  const empty = showVaultHistory
    ? 'No swept vaults yet. Finished capsules land here.'
    : 'No active vaults. Create a time capsule, or open History for swept ones.';
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
  const box = $('activity-list');
  if (!box) return;
  if (!txs.length) {
    box.innerHTML = `<div class="empty">No recent transactions on this address. Scorpion can still decode a pasted txid on the You tab.</div>`;
    return;
  }
  box.innerHTML = txs.slice(0, 25).map(tx => {
    const id = tx.transaction_id || tx.transactionId || '';
    const row = summarizeTx(tx, wallet.address);
    const expl = explainTransaction(tx, { address: wallet.address, vaults: loadVaults() });
    const feeLine = row.fee > 0
      ? `<small>fee ${formatAmount(row.fee)} KAS</small>`
      : (row.note ? `<small>${esc(row.note)}</small>` : '');
    const sub = [expl.title, id.slice(0, 10) + '…', new Date(tx.block_time || Date.now()).toLocaleString()]
      .filter(Boolean).join(' · ');
    return `
      <button class="tx" type="button" data-txid="${esc(id)}">
        <div class="dir">${row.dir === 'in' ? '↓' : '↑'}</div>
        <div class="meta">
          <b>${esc(row.label)}</b>
          <span>${esc(sub)}</span>
        </div>
        <div class="val ${row.dir === 'in' ? 'in' : 'out'}">${row.dir === 'in' ? '+' : '−'}${formatAmount(row.amount || 0)}${feeLine}
          ${id ? `<button type="button" class="copy-chip" data-copy="${esc(id)}">Copy ID</button>` : ''}
        </div>
      </button>`;
  }).join('');
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

function openScorpionTx(id) {
  haptic();
  const tx = (window.__txs || []).find(t => (t.transaction_id || t.transactionId) === id);
  if (!tx) {
    toast('Tx not loaded — refresh Activity');
    return;
  }
  const expl = explainTransaction(tx, { address: wallet.address, vaults: loadVaults() });
  openSheet('Scorpion', explHtml(expl), { confirm: 'Done', cancel: false });
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
      if (!r || BigInt(t.balance || '0') > BigInt(r.balance || '0')) map.set(key, r ? { ...r, ...t } : t);
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
    const [bRes, uRes] = await Promise.all([
      fetch(`${API_BASE}/addresses/${addr}/balance`),
      fetch(`${API_BASE}/addresses/${addr}/utxos`)
    ]);
    if (!wallet || wallet.address !== addr) return;
    let nextBal = balanceSompi;
    if (bRes.ok) {
      const data = await bRes.json();
      nextBal = Number(data.balance ?? data ?? 0);
    }
    if (uRes.ok) utxos = await uRes.json() || [];
    const balChanged = seenBalance != null && nextBal !== seenBalance;
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
    rememberActiveSnap();
    if (full || balChanged || liveFast) {
      if (currentTab === 'home' || currentTab === 'tokens') renderHome();
      if (currentTab === 'tokens') renderTokens();
      if (currentTab === 'you') renderProfile();
    }
    const recvBal = $('recv-balance');
    if (recvBal) recvBal.textContent = `${formatAmount(balanceSompi)} KAS`;
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
          if (currentTab === 'home') renderHome();
        }
        if (tRes.ok) {
          const txs = await tRes.json();
          window.__txs = Array.isArray(txs) ? txs : (txs.transactions || []);
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
    if (full || now - lastAllSnap > 10000) {
      refreshAllWalletSnaps({ tokens: now - lastAllTokenSnap > 22000 }).catch(() => {});
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
    const [kcc, krc] = await Promise.allSettled([
      fetchKcc20Portfolio(addr, wallet.pubKey),
      fetchKrc20Portfolio(addr)
    ]);
    if (!wallet || wallet.address !== addr) return;
    if (kcc.status === 'fulfilled') kccHoldings = mergeFreshHoldings(kccHoldings, kcc.value);
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
}

function findToken(key) {
  const all = [...kccHoldings, ...krcHoldings];
  return all.find(t => `${t.protocol}:${t.ticker}` === key);
}

function openTokenSheet(token) {
  if (!token) { showPage('tokens'); return; }
  haptic();
  const proto = token.protocol === 'krc20' ? 'KRC-20' : 'KCC20';
  const amt = formatTokenUnits(token.balance, token.decimals);
  const link = token.protocol === 'krc20'
    ? explorerAddr(wallet?.address || '')
    : (token.tokenId ? `https://kascov.io/#/mainnet/token/${encodeURIComponent(token.tokenId)}` : 'https://kascov.io/#/tokens');
  const logoSrc = token.image || (token.native ? 'assets/kas.svg' : (token.protocol === 'krc20' ? krc20Logo(token.ticker) : ''));
  openSheet(token.ticker, `
    ${logoSrc ? `<div style="display:flex;justify-content:center;padding:8px 0 14px;"><img src="${esc(logoSrc)}" alt="" data-tick="${esc(token.ticker || '')}" data-fb="${esc((token.ticker || '?').slice(0, 3))}" style="width:56px;height:56px;border-radius:16px;object-fit:cover;"></div>` : ''}
    <div class="kv"><span class="k">Balance</span><span class="v">${esc(amt)} ${esc(token.ticker)}</span></div>
    <div class="kv"><span class="k">Name</span><span class="v">${esc(token.name)}</span></div>
    <div class="kv"><span class="k">Standard</span><span class="v">${esc(proto)}${token.standard ? ' · ' + esc(token.standard) : ''}</span></div>
    ${token.cells ? `<div class="kv"><span class="k">Cells</span><span class="v">${esc(token.cells)}</span></div>` : ''}
    ${token.tokenId && token.protocol === 'kcc20' ? `<div class="kv"><span class="k">Token ID</span><span class="v">${esc(token.tokenId)}</span></div>` : ''}
    <p class="muted" style="text-align:left;padding-top:8px;">Live from kascov.io (KRON / KCC20, CORS open). Same holdings KasWare shows for this address.</p>
    ${token.protocol === 'kcc20' ? `<div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-gold" id="tk-buy" type="button">Buy</button>
      <button class="btn btn-glass" id="tk-sell" type="button">Sell</button>
      <button class="btn btn-glass" id="tk-freeze" type="button">Freeze</button>
    </div>` : ''}
    <p class="muted"><a href="${esc(link)}" target="_blank" rel="noopener" style="color:var(--gold-2)">Open explorer</a></p>
  `, {
    confirm: 'Send ' + token.ticker,
    gold: true,
    cancelLabel: 'Close',
    onConfirm: () => openSend({ token, assetKey: `${token.protocol}:${token.ticker}` })
  });
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
          <div class="dot" style="background:rgba(212,176,122,.16);color:var(--gold-2)">${m.logo ? `<img alt="" src="${esc(m.logo)}" data-tick="${esc(m.tick)}" data-fb="${esc(m.tick.slice(0, 3))}">` : esc(m.tick.slice(0, 3))}</div>
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

function sendHintFor(a) {
  if (!a || a.native || a.protocol === 'kas') {
    return `Available ${assetAvail(a)} KAS. Paste a kaspa: address or scan QR. Fee ~0.004–0.007 KAS.`;
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
  if (tick) tick.textContent = a.ticker || 'KAS';
  if (proto) proto.textContent = a.native || a.protocol === 'kas' ? 'Native KAS' : (a.protocol === 'krc20' ? 'KRC-20' : 'KCC20');
  if (bal) bal.textContent = assetAvail(a);
  if (hint) hint.textContent = sendHintFor(a);
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
    list.classList.add('hidden');
    btn.classList.remove('open');
  };
}

function openSend(prefill) {
  haptic();
  const dest0 = prefill?.destination || '';
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
  openSheet('Send', `
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
        <input id="send-dest" placeholder="kaspa:q… or kaspa:p…" value="${esc(dest0)}" spellcheck="false" autocomplete="off">
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
    <div class="field"><label>Amount</label><input id="send-amount" type="text" inputmode="decimal" placeholder="0.00" value="${esc(amt0)}"></div>
    <p class="muted send-hint" id="send-hint">${esc(sendHintFor(chosen))}</p>
  `, { confirm: 'Review', gold: true, onConfirm: () => prepareSend() });
  bindSendAssetPicker();
  bindSendQr();
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
  const dest = form.dest;
  const asset = form.asset;
  if (!isValidKaspaAddress(dest)) { toast('Invalid Kaspa address — use kaspa:q… or kaspa:p…'); return; }
  if (!form.amount) { toast('Enter an amount'); return; }
  if (asset.native || asset.protocol === 'kas') {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) { toast('Enter an amount'); return; }
    const feeEst = 0.0045;
    openSheet('Review send', `
      <div class="kv"><span class="k">Asset</span><span class="v">KAS</span></div>
      <div class="kv"><span class="k">To</span><span class="v">${esc(shortAddr(dest, 14, 8))}</span></div>
      <div class="kv"><span class="k">Amount</span><span class="v">${esc(formatKas(amount))} KAS</span></div>
      <div class="kv"><span class="k">Network fee</span><span class="v">~${feeEst.toFixed(4)} KAS</span></div>
      <div class="kv"><span class="k">Leaves wallet</span><span class="v">~${formatKas(amount + feeEst, 4)} KAS</span></div>
      <p class="muted" style="text-align:left;padding-top:8px;">Change stays in this wallet. Works for any kaspa:q or kaspa:p address.</p>
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
  openSheet('Review send', `
    <div class="kv"><span class="k">Asset</span><span class="v">${esc(asset.ticker)} · ${esc(proto)}</span></div>
    <div class="kv"><span class="k">To</span><span class="v">${esc(shortAddr(dest, 14, 8))}</span></div>
    <div class="kv"><span class="k">Amount</span><span class="v">${esc(form.amount)} ${esc(asset.ticker)}</span></div>
    <div class="kv"><span class="k">Raw units</span><span class="v">${esc(raw)}</span></div>
    <p class="muted" style="text-align:left;padding-top:8px;">${esc(extra)}</p>
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
    const availableUtxos = await fetchAddressUtxos(wallet.address);
    if (!availableUtxos.length) { toast('No UTXOs yet — receive KAS first'); return; }
    const result = await sendKas({ wallet, dest, amountKas: amount, utxos: availableUtxos });
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
    const availableUtxos = await fetchAddressUtxos(wallet.address);
    if (!availableUtxos.length) { toast('Need a little KAS in this wallet for fees'); return; }
    const onStatus = (m) => { toast(m); setSheetStatus(m); };
    let result;
    if (asset.protocol === 'krc20') {
      result = await sendKrc20({ wallet, dest, tick: asset.ticker, amtRaw: raw, utxos: availableUtxos, onStatus });
    } else {
      result = await sendKcc20({ wallet, dest, token: asset, amountHuman: human, utxos: availableUtxos, onStatus });
    }
    applyLocalTokenDelta(asset.ticker, asset.protocol, '-' + String(raw));
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
    toast(errText(e));
    setSheetStatus(errText(e), true);
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
  return params;
}

function openProduct(id, prefill) {
  const p = VAULT_PRODUCTS.find(x => x.id === id);
  if (!p) return;
  haptic();
  if (p.type === 'kcc20') { showPage('tokens'); return; }
  if (p.type === 'kcc20lock') {
    const ticks = (kccHoldings || []).map(t => t.ticker).filter(Boolean);
    const preTick = String(prefill?.tick || ticks[0] || '').toUpperCase();
    const tickField = ticks.length
      ? `<select id="ct-tick">${ticks.map(t => `<option value="${esc(t)}" ${t === preTick ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`
      : `<input id="ct-tick" placeholder="KKDAG" autocapitalize="characters" value="${esc(preTick)}">`;
    const fields = `
      <div class="field"><label>KCC20 ticker</label>${tickField}</div>
      <div class="field"><label>Amount (tokens)</label><input id="ct-token-amt" type="number" step="any" min="0" inputmode="decimal" placeholder="20"></div>
      <div class="field"><label>Duration</label><input id="ct-duration" placeholder="3 minutes or 30 days"></div>
    `;
    openSheet(p.name, `<p class="muted" style="text-align:left;padding:0 0 12px;">${esc(p.blurb)} Uses ~0.2 KAS witness dust plus the network fee. Tokens stay in a SCRIPT_HASH cell until Sweep.</p>${fields}`, {
      confirm: 'Freeze with PIN', gold: true, onConfirm: () => buildCovenant(p, readProductForm(p.type))
    });
    return;
  }
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
    <p class="muted" style="text-align:left;">Tokens move to SCRIPT_HASH ownership of a CLTV capsule — the same freeze as native KAS. ~0.2 KAS sits in the kaspa:p witness so the covenant can see it. When the timer ends this wallet sweeps both back.</p>
  `, { confirm: 'Freezing…', cancel: false });
  const busy = $('sheet-ok');
  if (busy) { busy.disabled = true; busy.dataset.busy = '1'; }
  try {
    await requirePin('Confirm ' + tick + ' freeze');
    setSheetStatus('Loading Kaspa engine…');
    await loadKaspaSdk();
    setSheetStatus('Fetching UTXOs…');
    const availableUtxos = await fetchAddressUtxos(wallet.address);
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
  const locked = sec == null || sec > 0;
  const tok = vaultTokenLabel(vault);
  const kcc = isKcc20Vault(vault);
  openSheet(vault.name || 'Time Capsule', `
    <div class="kv"><span class="k">Locked</span><span class="v">${tok ? esc(tok) : formatAmount(vault.fundedSompi || 0) + ' KAS'}</span></div>
    ${kcc ? `<div class="kv"><span class="k">Witness dust</span><span class="v">${formatAmount(vault.fundedSompi || 0)} KAS</span></div>` : ''}
    ${vault.fundFeeKas ? `<div class="kv"><span class="k">Lock fee paid</span><span class="v">${Number(vault.fundFeeKas).toFixed(6)} KAS</span></div>` : ''}
    <div class="kv"><span class="k">Time left</span><span class="v" id="lock-timer-live" data-unlock-daa="${esc(vault.unlockDaa || '')}" data-addr="${esc(vault.address || '')}">${esc(formatLockClock(sec))}</span></div>
    <div class="kv"><span class="k">Unlocks (UTC)</span><span class="v" id="lock-timer-utc">${esc(unlockAtUtc(sec))}</span></div>
    ${vault.unlockDaa ? `<div class="kv"><span class="k">Unlock DAA</span><span class="v">${esc(vault.unlockDaa)} (now ${esc(lastDaa || '—')})</span></div>` : ''}
    <div class="kv"><span class="k">Address</span><span class="v">${esc(vault.address)}</span></div>
    <p class="muted" style="text-align:left;">${locked
      ? (kcc
        ? 'Still frozen on-chain. KCC20 is SCRIPT_HASH-owned by this CLTV capsule. When the timer hits zero, Sweep returns the tokens plus leftover witness KAS.'
        : 'Still frozen on-chain. When this timer hits zero, this app Sweeps the KAS back to your kaspa:q… wallet automatically.')
      : 'Lock has expired. Sweep now, or wait — auto-return is on.'}</p>
    <button class="btn btn-gold" id="v-unlock" style="margin-top:14px;">Sweep to wallet</button>
    ${kcc ? '' : `<div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-glass" id="v-copy">Copy</button>
      <button class="btn btn-glass" id="v-fund">Fund more</button>
    </div>`}
    ${kcc ? `<div class="btn-row" style="margin-top:10px;"><button class="btn btn-glass" id="v-copy">Copy capsule</button></div>` : ''}
  `, { confirm: 'Close', cancel: false });
  $('v-copy').onclick = async () => { await navigator.clipboard.writeText(vault.address); toast('Copied'); };
  $('v-fund')?.addEventListener('click', () => fundVault(vault).catch(e => toast(errText(e))));
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
  const kcc = isKcc20Vault(vault);
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
  setSheetStatus(kcc ? 'Signing SCRIPT_HASH witness + CLTV…' : 'Signing P2SH redeem (CLTV + CHECKSIG)…');
  const result = kcc
    ? await sweepKcc20Capsule({ wallet, vault, utxos: utxosV, onStatus: (m) => setSheetStatus(m) })
    : await sweepVault({ wallet, vault, utxos: utxosV });
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
    if (v.unlockDaa && daa < v.unlockDaa) { skipped++; continue; }
    try {
      const utxosV = await fetchAddressUtxos(v.address);
      if (!utxosV.length) { skipped++; continue; }
      if (isKcc20Vault(v)) {
        const result = await sweepKcc20Capsule({ wallet, vault: v, utxos: utxosV });
        updateVault(v.address, { status: 'swept', fundedSompi: 0, tokenAmount: '0' });
        if (result.tokenAmount) applyLocalTokenDelta(v.tick, 'kcc20', result.tokenAmount);
      } else {
        await sweepVault({ wallet, vault: v, utxos: utxosV });
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
    appendChat('ai', 'I can lock KAS or freeze KCC20, escrow, multisig, or send. Example: <em>Lock .15 KAS for 3 minutes</em> or <em>Lock 20 KKDAG for 3 minutes</em>');
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
  $('trade-side')?.addEventListener('click', e => {
    const b = e.target.closest('[data-side]');
    if (!b) return;
    $('trade-side').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    syncTradeLabel();
    quoteTradePreview();
  });
  $('pin-cancel')?.addEventListener('click', cancelPinGate);
  $('kron-markets')?.addEventListener('click', e => {
    const row = e.target.closest('[data-trade-tick]');
    if (row?.dataset.tradeTick) openTrade({ tick: row.dataset.tradeTick, side: 'buy' });
  });
  click('btn-copy-addr', async () => { await navigator.clipboard.writeText(wallet.address); toast('Copied'); });
  click('card-wallet', openWalletSwitcher);
  $('home-wallets')?.addEventListener('click', e => {
    if (e.target.closest('[data-add-wallet]')) { openWalletSwitcher(); return; }
    const btn = e.target.closest('[data-switch-wallet]');
    if (btn?.dataset.switchWallet) switchToWallet(btn.dataset.switchWallet);
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
    const row = e.target.closest('[data-txid]');
    if (row?.dataset.txid) openScorpionTx(row.dataset.txid);
  });
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
    if (row.dataset.ticker === 'KAS') { openReceive(); return; }
    const token = findToken(row.dataset.tokenKey);
    if (token) openTokenSheet(token);
    else showPage('tokens');
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
    const step = Number(img.dataset.step || 0);
    const t = tick.toLowerCase();
    const next = [
      `https://krc20data.s3.amazonaws.com/verified/${t}.png`,
      `https://krc20data.s3.amazonaws.com/verified/${tick}-logo.png`
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
  window.__kcc = { parseIntent, isValidKaspaAddress, describeIntent, pingPublicNode, toRpcTransaction, p2shSpendScript, planKasPayment, storageMassOk };
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
  video?.play?.().catch(() => {});
  video?.addEventListener('playing', () => document.querySelector('.bg-poster')?.classList.add('hidden'));
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
