import {
  loadCryptoLibs, generatePrivateKey, createKeypairFromHex,
  isValidKaspaAddress, validateKaspaAddress, shortAddr, hexToBytes, privKeyToHex,
  derivePublicKey, kaspaAddressFromPubkey, bytesToHex, kasToSompi, sompiToKasString,
  validateAndCleanUtxo, networkId, isTestnet, setNetworkId, applyWalletNetwork, kaspaRestBase, pubkeyToAddress,
  addrPayload, sameAddrPayload
} from './crypto.js?v=100';
import {
  NATIVE_KAS, VAULT_PRODUCTS, loadWatchlist, addToken, removeToken,
  loadVaults, saveVault, updateVault, deleteVault, purgeVaultsWhere, formatAmount, formatTokenUnits, tokenColor,
  fetchKcc20Portfolio, fetchKrc20Portfolio, fetchKcc20PortfolioMany, fetchKrc20PortfolioMany,
  fetchKronAddrTrades, fetchKronTokenUtxos, fetchKronAddrHoldings, KRON_IDX,
  krc20Logo, toTokenRaw, setVaultOwner, kcc20Identicon, VAULT_GROUPS, LIFE_KINDS, lifeKindMeta
} from './kcc20.js?v=123';
import { parseIntent, describeIntent, askFor, parseDurationField, interpretVaultChat, normalizeChat, normalizeVaultType } from './intent.js?v=123';
import { parse as parseSilArtifact, redeemHex as silRedeemHex } from './silverscript.js?v=184';
import { payloadFromAddress } from './script.js?v=90';
import { explainTransaction, scorpionAnswer } from './scorpion.js?v=114';
import {
  sendKas, fetchAddressUtxos, fetchAddressBalance, loadKaspaSdk,
  buildTimelockCovenant, buildOwnerEnvelope, buildEscrowCovenant, buildBetEscrowCovenant, buildMultisigCovenant, currentDaa,
  pingPublicNode, sweepVault, toRpcTransaction, p2shSpendScript, planKasPayment, storageMassOk,
  compoundUtxos, sendKrc20, sendKcc20, loadKrc20Pending, lockKcc20Timelock, sweepKcc20Capsule,
  fetchOwnedUtxos, collectSpendableUtxos, buildSentinelChain, buildRecurringChain, buildHashlockCovenant,
  newHashlockSecret, checkinHop, currentHop, parseXmssKit, p2shFromRedeemHex, spendXmssVault,
  disconnectRpc, buildDcaDrips, sendKasMany, releaseDcaDrip, cancelDcaDrip, isMassError
} from './tx.js?v=185';
import { bootDappConnect, pingTttDappFrame, TTT_TREASURY } from './dappConnect.js?v=171';
import { changenowEstimate, changenowCreate, changenowWidgetUrl, cnFrom } from './changenow.js?v=180';
import { schedulePersistIframeVault, bootIframeVaultWatch } from './iframeVault.js?v=120';
import { kronMarkets, quoteKronTrade, executeKronTrade, formatKasSompi, lookupKronTick, liveQuote, tradeCostLines, attachKronLogos, kronCandles, kronLogoFor, quoteKcc20Bridge, executeKcc20Bridge, formatTokenRaw } from './kronTrade.js?v=147';
import {
  BET_AGENT_ADDR, TTT_TICK, WINDOW_MS, windowBounds, fmtRemain,
  kkdagsHeld, isKcc20Pass, hireCost, maxHireHours,
  loadBetHire, saveBetHire as writeBetHireRaw, recordBet, settleOpenBets, loadBetBook,
  loadPool, addPoolStake, yesCentsFromPool, hasOpponent, agentPubHex, isEscrowAgent,
  refundMinutesFromNow, refundAtMs, dueBetGroups, patchBet, winSideFromPrices,
  betProtocolFee, BET_FEE_BPS, betIdFromAddr, betIdFromTxid, encodeBetNotice, fetchPublicBetTape,
  poolFromTape, mergeTapeAndLocal, userPubFromAddr, marketId,
  betDecimals, betMinStake, betStakeStep, humanTokenBalance, snapBetStake
} from './bet.js?v=135';
import {
  migrateReceiveBook, ownedAddresses, markAddressUsed, currentReceive,
  deriveReceiveBatch, unusedReceiveCount, ensurePrivacyBook
} from './receive.js?v=90';
import { knsResolve, knsPrimary, knsDomainsFor, knsOwnerMatches, knsAppUrl, looksLikeKasDomain, normalizeKasDomain } from './kns.js?v=89';
import { runPhoneStudio, runServerStudio } from './studio.js?v=89';
import {
  isKaswareInstalled, isDesktopBrowser, kaswareEnabled, kaswareSigning, kaswareConnectedAddress,
  connectKasware, disconnectKasware, bindKaswareEvents, loadKaswarePref, compoundWithKasware,
  ensureKaswareSigner, syncKaswareNetwork, walletIsKaswareChip, autoArmKaswareForWallet,
  fetchKaswareUtxos
} from './kasware.js?v=163';
import {
  cookMarkets, cookQuote, cookWrappers, pickWrappedMarketId, cookOrderbook, cookCandles,
  cookDeploy, cookBuildOrder, cookFillOrder, cookSweep, cookWrap, cookMint,
  extractSigning, signAndBroadcastPskt, cookTokenId, isTestnetAddr,
  loadAgentJob, saveAgentJob, sompiToKas, kasToSompiNum,
  rememberLaunch, loadLaunched, cookOwnerBalances, cookDeployed,
  cookTickOf, cookBookLevels
} from './atrade.js?v=102';
import { SCORPION_MEMORY } from './scorpionMemory.js?v=152';
import { DESK_PLAYBOOK, scalpGate, factCheck } from './deskPlaybook.js?v=187';

export const BUILD = '190';
const DESK_ID_KEY = 'kcc20_desk_id_v1';
const DESK_VAULT_KEY = 'kcc20_desk_vault_v1';

const TOKEN_FALLBACK_LOGO = 'assets/ttt.png';

function errText(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.message || e.toString?.() || String(e);
}

function productForIntent(intent) {
  const t = normalizeVaultType(intent?.type) || intent?.type;
  if (t && intent && intent.type !== t) intent.type = t;
  if (t === 'kcc20lock') return VAULT_PRODUCTS.find(p => p.id === 'kcc20freeze');
  if (t === 'hashlock') return VAULT_PRODUCTS.find(p => p.id === 'hashlock');
  if (t === 'xmss') return VAULT_PRODUCTS.find(p => p.id === 'xmss');
  if (t === 'life') return { id: 'life', name: 'Real life', type: 'life', tag: '⌂' };
  if (t === 'timelock') return VAULT_PRODUCTS.find(p => p.id === 'timelock');
  if (t === 'sentinel') return VAULT_PRODUCTS.find(p => p.id === 'sentinel' || p.type === 'sentinel');
  if (t === 'onramp') return VAULT_PRODUCTS.find(p => p.id === 'onramp' || p.type === 'onramp');
  return VAULT_PRODUCTS.find(p => p.id === t)
    || VAULT_PRODUCTS.find(p => p.type === t)
    || { id: t, name: t, type: t };
}

function isKcc20Vault(v) {
  return v?.type === 'kcc20lock' || v?.asset === 'kcc20' || !!(v?.type === 'life' && (v.tick || v.params?.tick) && v.params?.amountToken);
}

function isVaultHistory(v) {
  if (!v) return false;
  if (v.status === 'swept' || v.status === 'cancelled') return true;
  const tok = isKcc20Vault(v) ? Number(v.tokenAmount || 0) : 0;
  if (v.status === 'unfunded' || v.status === 'funding' || v.status === 'locked') return false;
  return Number(v.fundedSompi || 0) <= 0 && tok <= 0;
}

function vaultTokenLabel(v) {
  const tick = v?.tick || v?.params?.tick;
  if (!tick || tick === 'KAS') return '';
  if (!isKcc20Vault(v) && v?.type !== 'life') return '';
  const raw = v.tokenAmount || v.params?.amountToken;
  if (raw == null) return '';
  return formatTokenUnits(raw, v.decimals || v.params?.decimals || 0) + ' ' + String(tick).toUpperCase();
}

function vaultLockedSompi(v) {
  if (!v || v.status === 'swept') return 0;
  const have = Number(v.fundedSompi || 0);
  if (have > 0) return have;
  const committed = Number(v.lockedSompi || 0);
  if (committed > 0) return committed;
  const kas = Number(v.params?.amountKas);
  if ((v.status === 'funding' || v.status === 'locked' || v.status === 'funded' || v.fundTxId)
    && Number.isFinite(kas) && kas > 0) {
    return Math.round(kas * 1e8);
  }
  return 0;
}

function walletByAddress(addr) {
  if (!addr) return null;
  return loadWalletList().find(w => w.address === addr) || null;
}

function vaultCounterpartyKey(vault) {
  const addr = vault?.params?.counterparty || vault?.params?.buyerAddress || '';
  return walletByAddress(addr)?.privKey || '';
}

function isLifeVault(v) {
  return v?.type === 'life' || !!v?.lifeKind || !!v?.params?.lifeKind;
}

function isDdPayVault(v) {
  if (!v) return false;
  if (v.type === 'ddpay') return true;
  return /^DD pay-in/i.test(String(v.name || ''));
}

function purgeDdPayVaults() {
  return purgeVaultsWhere(isDdPayVault);
}

function isDcaVault(v) {
  return v?.type === 'dca' || /^DCA\s/i.test(String(v?.name || ''));
}

function isHopVault(v) {
  return v?.type === 'sentinel' || v?.type === 'recurring' || v?.type === 'dca';
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
  if (v.unlockAnytime || v.params?.unlockAnytime) return Number(v.fundedSompi || 0) > 0 || vaultLockedSompi(v) > 0;
  if (v.type === 'dca') return Number(v.fundedSompi || 0) > 0 || vaultLockedSompi(v) > 0;
  if (isHopVault(v)) {
    const hop = currentHop(v) || v;
    if (now && hop.unlockDaa && Number(now) < Number(hop.unlockDaa)) return false;
    return Number(v.fundedSompi || 0) > 0;
  }
  if (v.type === 'hashlock' || v.type === 'onramp') {
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

const API_BASE = () => kaspaRestBase();
const BACKEND_URL = 'https://base44.app/api/apps/6a444b036408e68ec8d6f2a6/functions';
const STORE_KEY = 'kcc20_wallet_v1';
const LEGACY_KEY = 'scorpion_wallet';
const WALLETS_KEY = 'kcc20_wallets_v2';
const ACTIVE_KEY = 'kcc20_active_id';
const PIN_KEY = 'kcc20_pin_v1';
const SNAPS_KEY = 'kcc20_snaps_v1';
const ACT_KEY = 'kcc20_activity_v1';
const CELL_KEY = 'kcc20_cells_v1';
const LOOK_KEY = 'kcc20_look_v1';
const BOOST_KEY = 'kcc20_boosts_v1';
const BOOST_KAS = 0.15;
const BOOST_MS = 24 * 60 * 60 * 1000;
const BOOST_PTS = 15;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function isRealTxId(id) {
  return /^[0-9a-f]{64}$/i.test(String(id || '').replace(/^0x/i, ''));
}
const explorerTx = (id) => {
  const h = String(id || '').replace(/^0x/i, '');
  if (!isRealTxId(h)) return '';
  return isTestnet()
    ? 'https://explorer-tn10.kaspa.org/txs/' + encodeURIComponent(h)
    : 'https://kaspa.stream/transactions/' + encodeURIComponent(h);
};
const explorerAddr = (addr) => isTestnet()
  ? 'https://explorer-tn10.kaspa.org/addresses/' + encodeURIComponent(addr || '')
  : 'https://kaspa.stream/addresses/' + encodeURIComponent(addr || '');

function txidBlock(id, label = 'TX') {
  if (!isRealTxId(id)) return '';
  return `
    <div class="kv kv-stack">
      <span class="k">${esc(label)}</span>
      <span class="v txid-v">
        <code class="txid-text">${esc(id)}</code>
        <button type="button" class="copy-chip" data-copy="${esc(id)}">Copy</button>
      </span>
    </div>
    <p class="muted tx-links"><a href="${esc(explorerTx(id))}" target="_blank" rel="noopener">Open explorer</a></p>`;
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
const autoSweepTriedAt = new Map();
const autoSweepFails = new Map();
const freezeTimers = new Map();
let kccHoldings = [];
let krcHoldings = [];
let kkdCellCache = [];
let kronPx = {};
let kronTradeBasis = {};
const BASIS_KEY = 'kcc20_basis_v1';
let tokenLoadErr = '';
let lastTokenFetch = 0;
let tokenBusy = false;
let tokenPending = false;
let tokenActBackfill = false;
let activityAll = false;
let seenTokens = false;
let tokenStream = null;
let kronKickAt = 0;
let tokenFastOff = 0;
let hushTokenToastsUntil = 0;
let hushUtxosUntil = 0;
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
let atPane = 'book';
let atSrc = 'kron';
let atCook = null;
let atDesk = null;
let lastCookToken = null;
let tokPane = 'kron';
let agentTimer = null;
let agentPreviewTimer = null;
let agentBusy = false;
let agentPreview = null;
let agentWake = null;
let agentTickDebounce = 0;
let betTimer = null;
let betHireTimer = null;
let betBusy = false;
let betAbort = false;
let betFocus = 'KKDAG';
const BET_ABORT_KEY = 'kcc20_bet_abort_v1';

function readBetAbort() {
  try { return localStorage.getItem(BET_ABORT_KEY) === '1'; } catch { return false; }
}
function setBetAbort(v) {
  betAbort = !!v;
  try { localStorage.setItem(BET_ABORT_KEY, v ? '1' : '0'); } catch {}
}
function saveBetHire(job) {
  if (!job) { writeBetHireRaw(null); return; }
  if (betAbort || readBetAbort()) job = { ...job, on: false };
  writeBetHireRaw(job);
}
function killBetHireLoop() {
  if (betHireTimer) { clearInterval(betHireTimer); betHireTimer = null; }
  betBusy = false;
}
let dcaTimer = null;
let dcaBusy = false;
let qrRaf = 0;
const DCA_KEY = 'kcc20_dca_v1';

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

function formatUtc(ms) {
  const d = new Date(Number(ms));
  if (!Number.isFinite(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

function remainingLockSec(unlockDaa, unlockAt) {
  const at = Number(unlockAt || 0);
  if (at > 0) return Math.max(0, Math.ceil((at - Date.now()) / 1000));
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
    el.textContent = formatLockClock(remainingLockSec(el.dataset.unlockDaa, el.dataset.unlockAt));
  });
  const live = $('lock-timer-live');
  if (live) {
    const sec = remainingLockSec(live.dataset.unlockDaa, live.dataset.unlockAt);
    live.textContent = formatLockClock(sec);
    const at = $('lock-timer-utc');
    if (at) {
      at.textContent = live.dataset.unlockAt
        ? formatUtc(live.dataset.unlockAt)
        : unlockAtUtc(sec);
    }
    if (sec === 0 && live.dataset.addr && live.dataset.fired !== '1') {
      live.dataset.fired = '1';
      maybeAutoUnlock();
    }
  }
  const due = loadVaults().some(v =>
    v.address && v.status !== 'swept' && Number(v.unlockAt || 0) > 0 && Date.now() >= Number(v.unlockAt)
  );
  if (due && Date.now() - lastAutoSweep > 4000) maybeAutoUnlock();
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
  $('scroll')?.classList.toggle('home-noscroll', id === 'home' || id === 'vault' || id === 'you');
  currentTab = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  const titles = { home: 'KCC20', tokens: 'A-Trade', vault: 'Vault', activity: 'Activity', you: 'Profile' };
  if (id === 'home' && wallet) {
    $('nav-title').innerHTML = `<button type="button" class="nav-wallet" id="nav-wallet"><b>${esc(wallet.name || 'Wallet')}</b><span>▾</span></button>`;
    $('nav-wallet')?.addEventListener('click', openWalletSwitcher);
  } else {
    $('nav-title').textContent = titles[id] || 'KCC20';
  }
  $('nav-left').innerHTML = '';
  if (id === 'you') {
    $('nav-right').innerHTML = `<button class="icon-btn ttt" id="nav-ttt" type="button" aria-label="TTT" title="TTT">
      <img src="assets/ttt.png" alt="TTT">
    </button>`;
    $('nav-ttt')?.addEventListener('click', openTtt);
  } else if (id === 'home') {
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
  if (id !== 'vault') setArgentOpen(false);
  if (id === 'vault') {
    try { renderVault(); } catch (e) { console.error(e); }
  }
  if (id === 'you') {
    try { renderProfile(); } catch (e) { console.error(e); }
    refreshAllWalletSnaps({ tokens: true }).catch(() => {});
  }
  if (id === 'tokens') {
    try { syncAtVenues(); setAtPane(atPane || 'book'); } catch (e) { console.error(e); }
  }
  if (id === 'activity') {
    try { renderActivity(window.__txs || []); } catch (e) { console.error(e); }
    refreshActivityNow();
  }
}

function uid() {
  try { return crypto.randomUUID(); } catch { return String(Date.now()) + Math.random().toString(16).slice(2); }
}

function walletIdentity(w) {
  const pk = String(w?.pubKey || '').replace(/^0x/i, '').toLowerCase();
  if (pk.length >= 64) return 'pk:' + pk.slice(-64);
  const p = addrPayload(w?.address);
  return p ? 'ad:' + p : 'id:' + String(w?.id || '');
}

function dedupeWalletList(list) {
  const seen = new Map();
  const out = [];
  for (const w of list || []) {
    if (!w) continue;
    const key = walletIdentity(w);
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, w);
      out.push(w);
      continue;
    }
    if (!prev.privKey && w.privKey) prev.privKey = w.privKey;
    if (!prev.pubKey && w.pubKey) prev.pubKey = w.pubKey;
    if (w.kasware) prev.kasware = true;
    if (w.receiveAddrs && !prev.receiveAddrs) prev.receiveAddrs = w.receiveAddrs;
    const wantTest = isTestnet();
    const a = String(w.address || '');
    if (wantTest && a.startsWith('kaspatest:')) prev.address = a;
    else if (!wantTest && a.startsWith('kaspa:') && !a.startsWith('kaspatest:')) prev.address = a;
    if (w.name && prev.name === 'KasWare' && w.name !== 'KasWare') prev.name = w.name;
    if (prev.name === w.name && w.kasware) prev.name = 'KasWare';
  }
  return out;
}

function loadWalletList() {
  try {
    const raw = JSON.parse(localStorage.getItem(WALLETS_KEY) || '[]');
    if (Array.isArray(raw) && raw.length) return dedupeWalletList(raw);
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
  const next = dedupeWalletList(list || []);
  localStorage.setItem(WALLETS_KEY, JSON.stringify(next));
  try { schedulePersistIframeVault(); } catch {}
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

function hexKey(v) {
  const s = String(v || '').replace(/^0x/i, '').trim();
  return /^[0-9a-fA-F]{64}$/.test(s) ? s.toLowerCase() : '';
}

function hydrateNativeKey(w) {
  if (!w) return w;
  let hex = hexKey(w.privKey);
  if (!hex) {
    for (const a of w.receiveAddrs || []) {
      hex = hexKey(a.privateKey || a.privKey);
      if (hex) break;
    }
  }
  if (!hex) {
    const hit = loadWalletList().find(x => hexKey(x.privKey) && (
      x.id === w.id
      || sameAddrPayload(x.address, w.address)
      || (w.pubKey && x.pubKey && String(w.pubKey).replace(/^0x/i, '').toLowerCase() === String(x.pubKey).replace(/^0x/i, '').toLowerCase())
    ));
    if (hit) hex = hexKey(hit.privKey);
  }
  if (!hex) {
    const raw = loadStoredWalletRaw();
    if (hexKey(raw?.privKey) && (!raw.address || sameAddrPayload(raw.address, w.address))) {
      hex = hexKey(raw.privKey);
    }
  }
  if (hex) w.privKey = hex;
  return w;
}

function saveWallet() {
  if (!wallet) return;
  if (!wallet.id) wallet.id = uid();
  if (!wallet.name) wallet.name = 'Wallet ' + (loadWalletList().length || 1);
  hydrateNativeKey(wallet);
  const list = loadWalletList();
  const i = list.findIndex(w => w.id === wallet.id || sameAddrPayload(w.address, wallet.address) || w.address === wallet.address);
  const prev = i >= 0 ? list[i] : null;
  const priv = hexKey(wallet.privKey) || hexKey(prev?.privKey) || '';
  if (priv) wallet.privKey = priv;
  const prevStore = loadStoredWalletRaw();
  const storePriv = priv || (sameAddrPayload(prevStore?.address, wallet.address) ? hexKey(prevStore?.privKey) : '') || '';
  localStorage.setItem(STORE_KEY, JSON.stringify({
    address: wallet.address, privKey: storePriv || wallet.privKey || '', pubKey: wallet.pubKey
  }));
  try { schedulePersistIframeVault(); } catch {}
  localStorage.setItem(ACTIVE_KEY, wallet.id);
  migrateReceiveBook(wallet);
  const row = {
    id: wallet.id,
    name: wallet.name,
    address: wallet.address,
    privKey: priv || wallet.privKey || prev?.privKey || '',
    pubKey: wallet.pubKey || prev?.pubKey || '',
    createdAt: wallet.createdAt || prev?.createdAt || Date.now(),
    pin: wallet.pin || prev?.pin || undefined,
    receiveAddrs: wallet.receiveAddrs || prev?.receiveAddrs || [],
    knsDomain: wallet.knsDomain || prev?.knsDomain || '',
    avatar: wallet.avatar || prev?.avatar || '',
    cover: wallet.cover || prev?.cover || '',
    kasware: !!wallet.kasware
  };
  if (i >= 0) list[i] = { ...prev, ...row, privKey: hexKey(row.privKey) || hexKey(prev.privKey) || '' };
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
  const res = await fetch(`${API_BASE()}/addresses/${encodeURIComponent(addr)}/full-transactions?limit=20&resolve_previous_outpoints=light`);
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

const UNLOCK_AT_KEY = 'kcc20_unlocked_v1';

function persistSession() {
  if (!wallet?.id) return;
  try { localStorage.setItem(UNLOCK_AT_KEY, JSON.stringify({ id: wallet.id, at: Date.now() })); } catch {}
}

function clearPersistedSession() {
  try { localStorage.removeItem(UNLOCK_AT_KEY); } catch {}
}

function restorePersistedSession() {
  try {
    const r = JSON.parse(localStorage.getItem(UNLOCK_AT_KEY) || 'null');
    if (!r?.id || !r.at) return false;
    if (Date.now() - Number(r.at) > 45 * 60 * 1000) return false;
    if (!wallet) return false;
    pinUnlockedFor = wallet.id;
    sessionUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

function isDappPopup() {
  try { return new URLSearchParams(location.search).get('dapp') === '1'; } catch { return false; }
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

function markBooted() {
  document.documentElement.classList.add('booted');
}

function beginPinFlow(mode, purpose) {
  markBooted();
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
  persistSession();
  hidePinLock();
  if (wallet?.address) await unlockToHome();
}

function lockNow() {
  closeSheet();
  stopQrScan();
  hideTradeScreen();
  stopAgentLoop();
  pinUnlockedFor = '';
  sessionUnlocked = false;
  clearPersistedSession();
  $('tabbar')?.classList.remove('show');
  if (!loadPin()) beginPinFlow('set');
  else beginPinFlow('unlock');
}

function requirePin(purpose) {
  return new Promise((resolve, reject) => {
    if (!wallet) { reject(new Error('No wallet')); return; }
    if (kaswareSigning(wallet)) { resolve(); return; }
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
  hydrateNativeKey(wallet);
  applyWalletNetwork(wallet);
  saveWallet();
  setVaultOwner(w.address);
  resetLiveState();
  hydrateFromSnap(w.address);
  if (toastMsg) toast(toastMsg);
  pinUnlockedFor = '';
  sessionUnlocked = false;
  $('tabbar')?.classList.remove('show');
  if (walletIsKaswareChip(wallet) && !isDappPopup()) {
    try { await autoArmKaswareForWallet(wallet); } catch {}
  }
  if (restorePersistedSession() || (wallet.kasware && (kaswareSigning(wallet) || isDappPopup()))) {
    pinUnlockedFor = wallet.id;
    sessionUnlocked = true;
    await unlockToHome();
    return;
  }
  if (!loadPin()) {
    beginPinFlow('set');
    return;
  }
  beginPinFlow('unlock');
}

const DAPP_BOUND_KEY = 'kcc20_dapp_bound_v1';
let dappBoundAddr = '';
try { dappBoundAddr = String(localStorage.getItem(DAPP_BOUND_KEY) || ''); } catch {}

function walletByAddr(addr) {
  if (!addr) return null;
  const list = loadWalletList();
  return list.find(w => sameAddrPayload(w.address, addr)) || null;
}

function walletForDapp() {
  if (wallet && dappBoundAddr && sameAddrPayload(wallet.address, dappBoundAddr)) return wallet;
  return walletByAddr(dappBoundAddr) || wallet;
}

function rememberDappAccount(addr) {
  dappBoundAddr = String(addr || '');
  try {
    if (dappBoundAddr) localStorage.setItem(DAPP_BOUND_KEY, dappBoundAddr);
    else localStorage.removeItem(DAPP_BOUND_KEY);
  } catch {}
}

async function ensureDappPayer() {
  try { dappBoundAddr = String(localStorage.getItem(DAPP_BOUND_KEY) || dappBoundAddr || ''); } catch {}
  const bound = walletByAddr(dappBoundAddr);
  if (bound && wallet?.id !== bound.id) {
    await switchDappWallet(bound.id);
  }
  return walletForDapp() || wallet;
}

function dappHoldingRow(tick) {
  const t = holdingForTick(tick);
  if (!t) return { ticker: String(tick || '').toUpperCase(), decimals: 0, balance: '0', protocol: 'kcc20' };
  return t;
}

function dappHoldingsList() {
  const kas = { ticker: 'KAS', name: 'Kaspa', decimals: 8, balance: String(balanceSompi), protocol: 'kas', native: true };
  return [kas, ...(kccHoldings || []), ...(krcHoldings || [])];
}

async function dappSendToken({ tick, amount, dest }) {
  const t = String(tick || 'KKDAG').toUpperCase();
  if (isTestnet()) throw new Error('TTT credits are mainnet KKDAG');
  const payer = walletForDapp() || wallet;
  if (!payer?.address) throw new Error('Unlock KCC20 Wallet first');
  if (kaswareSigning(payer) && !hexKey(payer.privKey)) {
    throw new Error('This chip is KasWare-only. Switch Home to a native wallet (Wallet 2) that holds ' + t + ', Connect again, then Sign.');
  }
  const destOk = validateKaspaAddress(dest, networkId());
  if (!destOk.isValid) throw new Error(destOk.error || 'Bad destination address');
  if (Number(destOk.versionByte) !== 0) throw new Error('Pay to a kaspa:q receive address, not a kaspa:p vault');
  if (sameAddrPayload(payer.address, dest)) throw new Error('That is this wallet’s own address');
  if (sameAddrPayload(dest, TTT_TREASURY) && sameAddrPayload(payer.address, TTT_TREASURY)) {
    throw new Error('This chip is ews (treasury). Fund must spend Wallet 1 (ax6). Switch the Home wallet chip to ax6, then Fund 10 KKDAG.');
  }
  const token = holdingForTick(t);
  if (!token || token.native) throw new Error('Buy ' + t + ' on Home → Tokens with this wallet, then fund TTT');
  const human = String(amount || '').trim();
  const raw = toTokenRaw(human, token.decimals);
  if (BigInt(raw) > BigInt(token.balance || '0')) throw new Error('More than this wallet holds');
  await loadKaspaSdk();
  await pingPublicNode();
  toast('Paying ' + human + ' ' + t + ' from ' + (payer.name || 'wallet') + ' · ' + shortAddr(payer.address, 8, 6));
  let availableUtxos = [];
  try {
    availableUtxos = payer.receiveAddrs?.length > 1
      ? await fetchOwnedUtxos(payer)
      : await fetchAddressUtxos(payer.address);
  } catch {}
  if (!availableUtxos.length) {
    try { availableUtxos = await fetchAddressUtxos(payer.address); } catch {}
  }
  if (!availableUtxos.length) throw new Error('Need a little KAS in this wallet for the send fee');
  const result = await sendKcc20({
    wallet: payer,
    dest,
    token,
    amountHuman: human,
    utxos: availableUtxos,
    onStatus: (m) => toast(m)
  });
  applyLocalTokenDelta(t, token.protocol || 'kcc20', '-' + String(raw));
  pushTokenActivity({
    dir: 'out',
    tick: t,
    protocol: token.protocol || 'kcc20',
    amount: String(raw),
    decimals: token.decimals,
    txId: result.txId || '',
    label: 'TTT credits',
    note: 'From ' + shortAddr(payer.address, 10, 6)
  }, payer.address);
  if (dest && sameAddrPayload(dest, TTT_TREASURY)) {
    pushTokenActivity({
      dir: 'in',
      tick: t,
      protocol: 'kcc20',
      amount: String(raw),
      decimals: token.decimals,
      txId: result.txId || '',
      label: 'DD pay-in',
      note: 'From ' + shortAddr(payer.address, 10, 6) + ' · KCC20 cell, not kaspa.org q-history'
    }, TTT_TREASURY);
  }
  afterTx();
  return {
    txId: result.txId,
    tick: t,
    amount: human,
    raw: String(raw),
    dest,
    from: payer.address,
    explorer: result.txId ? ('https://kas.fyi/transaction/' + result.txId) : ''
  };
}

function serializeKronQuote(q) {
  if (!q) return null;
  const dec = Number(q.decimals || 0);
  const buy = q.side === 'buy';
  return {
    tick: String(q.tick || '').toUpperCase(),
    side: q.side,
    graduated: !!q.graduated,
    decimals: dec,
    kasIn: q.kasIn != null ? String(q.kasIn) : '',
    kasOut: q.kasOut != null ? String(q.kasOut) : '',
    tokenOut: q.tokenOut != null ? String(q.tokenOut) : '',
    tokenIn: q.tokenIn != null ? String(q.tokenIn) : '',
    kasHuman: formatKasSompi(buy ? q.kasIn : q.kasOut),
    tokenHuman: formatTokenRaw(buy ? q.tokenOut : q.tokenIn, dec),
    price: q.price == null ? null : q.price
  };
}

async function dappQuoteKron({ tick, side, amount }) {
  const t = String(tick || 'KKDAG').toUpperCase();
  const s = String(side || 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy';
  const amt = String(amount || '').trim();
  if (isTestnet()) throw new Error('KRON trade is mainnet. Switch this wallet off TN10.');
  if (!/^[A-Z0-9]{2,12}$/.test(t) || t.includes('?')) throw new Error('Bad ticker');
  if (!(Number(amt) > 0)) throw new Error('Enter an amount greater than 0');
  const q = await quoteKronTrade({ tick: t, side: s, amount: amt });
  return serializeKronQuote(q);
}

async function dappEnsureKaswareSigner(payer) {
  hydrateNativeKey(payer);
  const kwChip = walletIsKaswareChip(payer) || (kaswareSigning(payer) && !hexKey(payer.privKey));
  const wantKw = kwChip || kaswareSigning(payer);
  if (!wantKw) {
    if (!hexKey(payer.privKey)) {
      throw new Error('No in-app key on this chip. Import the 64-hex, or use the KasWare chip with the extension on.');
    }
    return false;
  }
  if (!isKaswareInstalled()) {
    throw new Error('This chip is KasWare. Open KCC20 Wallet in Chrome or Edge with the KasWare extension, then Buy again. Phone browsers cannot pop KasWare — switch the sheet to a native PIN wallet on mobile.');
  }
  await autoArmKaswareForWallet(payer);
  await ensureKaswareSigner(payer);
  return true;
}

async function dappTradeKron({ tick, side, amount }) {
  const t = String(tick || 'KKDAG').toUpperCase();
  const s = String(side || 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy';
  const amt = String(amount || '').trim();
  if (isTestnet()) throw new Error('KRON trade is mainnet. Switch this wallet off TN10.');
  const payer = walletForDapp() || wallet;
  if (!payer?.address) throw new Error('Unlock KCC20 Wallet first');
  const useKw = await dappEnsureKaswareSigner(payer);
  toast((s === 'buy' ? 'Buying ' : 'Selling ') + t + ' from ' + (payer.name || 'wallet') + (useKw ? ' · KasWare signs' : ''));
  let availableUtxos = [];
  try { availableUtxos = await fetchAddressUtxos(payer.address); } catch {}
  if (!availableUtxos.length) throw new Error('Need KAS in this wallet for the trade');
  const result = await executeKronTrade({
    wallet: payer,
    tick: t,
    side: s,
    amount: amt,
    utxos: availableUtxos,
    forceKasware: useKw,
    onStatus: (m) => toast(m)
  });
  const q = result.quote;
  if (q?.side === 'buy' && q.tokenOut != null) {
    applyLocalTokenDelta(t, 'kcc20', '+' + String(q.tokenOut));
    pushTokenActivity({
      dir: 'in',
      tick: t,
      protocol: 'kcc20',
      amount: String(q.tokenOut),
      decimals: q.decimals,
      txId: result.txId || '',
      label: 'KRON buy',
      note: 'Tap2Tip / dApp'
    }, payer.address);
  }
  if (q?.side === 'sell' && q.tokenIn != null) {
    applyLocalTokenDelta(t, 'kcc20', '-' + String(q.tokenIn));
    pushTokenActivity({
      dir: 'out',
      tick: t,
      protocol: 'kcc20',
      amount: String(q.tokenIn),
      decimals: q.decimals,
      txId: result.txId || '',
      label: 'KRON sell',
      note: 'Tap2Tip / dApp'
    }, payer.address);
  }
  afterTx();
  return {
    txId: result.txId,
    tick: t,
    side: s,
    amount: amt,
    quote: serializeKronQuote(q),
    from: payer.address,
    explorer: result.txId ? ('https://kas.fyi/transaction/' + result.txId) : ''
  };
}

async function switchDappWallet(id) {
  const w = loadWalletList().find(x => x.id === id);
  if (!w) throw new Error('Add that wallet in KCC20 first (You → wallets)');
  if (wallet?.id === w.id) return wallet;
  wallet = migrateReceiveBook(migratePinOnto({ ...w }));
  hydrateNativeKey(wallet);
  applyWalletNetwork(wallet);
  saveWallet();
  setVaultOwner(w.address);
  hydrateFromSnap(w.address);
  rememberDappAccount(w.address);
  try { await refreshTokenHoldings(); } catch {}
  if (currentTab === 'home') renderHome();
  return wallet;
}

function describeVaultIntent(spec) {
  const specType = normalizeVaultType(spec?.type || spec?.vaultType || spec?.preset || spec?.product || '') || String(spec?.type || '').trim();
  const specParams = spec?.params && typeof spec.params === 'object' ? { ...spec.params } : {};
  if (!spec?.params && spec && typeof spec === 'object') {
    ['amountKas', 'lockMinutes', 'lockDays', 'beneficiary', 'buyerAddress', 'counterparty', 'payee', 'payKas', 'tick', 'amountToken', 'destination', 'receiver', 'kit', 'hopCount', 'periods'].forEach((k) => {
      if (spec[k] != null && specParams[k] == null) specParams[k] = spec[k];
    });
  }
  if (spec?.message) {
    const view = interpretVaultChat(spec.message, specType ? { type: specType, params: specParams } : null);
    if (view.kind === 'talk') {
      return { complete: false, ask: view.text, type: '', summary: view.text, intent: null };
    }
    let intent = view.intent;
    if (!intent || intent.error) {
      return { complete: false, ask: intent?.hint || 'Argent could not parse that', type: intent?.type || '', summary: '', intent: null };
    }
    const parsedType = normalizeVaultType(intent.type) || intent.type;
    const hardParsed = !!(parsedType && parsedType !== 'timelock' && parsedType !== 'life');
    if (hardParsed) intent.type = parsedType;
    else if (specType) intent.type = specType;
    else intent.type = parsedType;
    intent.type = normalizeVaultType(intent.type) || intent.type;
    if (Object.keys(specParams).length) intent.params = { ...(intent.params || {}), ...specParams };
    if (intent.type === 'sentinel' && !intent.params.beneficiary && (intent.params.destination || specParams.beneficiary || specParams.heir || specParams.to)) {
      intent.params.beneficiary = intent.params.destination || specParams.beneficiary || specParams.heir || specParams.to;
    }
    const merged = parseIntent(spec.message, { type: intent.type, params: intent.params });
    if (!merged.error) {
      intent = merged;
      const mt = normalizeVaultType(intent.type) || intent.type;
      if (hardParsed && mt !== parsedType && parsedType === 'sentinel') intent.type = 'sentinel';
      else intent.type = mt;
    }
    return {
      complete: !intent.missing?.length,
      ask: askFor(intent.missing),
      type: intent.type,
      summary: describeIntent(intent),
      intent
    };
  }
  if (!specType) {
    return { complete: false, ask: 'Need a vault type (timelock, sentinel / deadman, escrow, …) or a message Argent can parse.', type: '', summary: '', intent: null };
  }
  const intent = { type: specType, params: specParams, missing: [], complete: true, source: 'dapp' };
  if (specType === 'sentinel' && !specParams.beneficiary && !specParams.heir) {
    intent.missing = ['heir / beneficiary kaspa: address'];
    intent.complete = false;
  }
  if (specType === 'onramp' && !specParams.receiver && !specParams.destination) {
    intent.missing = ['buyer kaspa: address who can claim'];
    intent.complete = false;
  }
  return {
    complete: intent.complete,
    ask: askFor(intent.missing),
    type: intent.type,
    summary: describeIntent(intent),
    intent
  };
}

async function dappCompileVault(spec) {
  const preview = describeVaultIntent(spec);
  if (preview.type === 'send') {
    throw new Error('That is a plain send, not a vault. Call sendKas({ dest, amount }).');
  }
  if (!preview.complete || !preview.intent) {
    throw new Error(preview.ask || 'Argent needs more fields');
  }
  const p = productForIntent(preview.intent);
  const vault = await buildCovenant(p, preview.intent.params, { silent: true });
  if (!vault?.address) throw new Error('Argent did not compile a kaspa:p vault');
  const funded = await fundVault(vault, { skipPin: true, silent: true });
  return {
    type: vault.type,
    name: vault.name,
    address: vault.address,
    txId: funded?.txId || '',
    explorer: funded?.txId ? ('https://kas.fyi/transaction/' + funded.txId) : '',
    params: vault.params || preview.intent.params
  };
}

async function dappSendKas({ dest, amount, amountKas }) {
  const amt = amountKas || amount;
  if (!(Number(amt) > 0)) throw new Error('Enter an amount like 0.15');
  if (!wallet?.address) throw new Error('No wallet');
  hydrateNativeKey(wallet);
  const result = await sendKas({ wallet, dest, amountKas: amt });
  afterTx();
  return {
    txId: result.txId,
    dest,
    amountKas: Number(result.amountKas || amt),
    explorer: result.txId ? ('https://kas.fyi/transaction/' + result.txId) : ''
  };
}

function consumeArgentDeepLink() {
  try {
    const u = new URL(location.href);
    const msg = u.searchParams.get('argent') || '';
    const tab = u.searchParams.get('tab') || '';
    if (tab === 'vault' || msg) showPage('vault');
    if (msg) {
      setArgentOpen(true);
      if ($('chat-input')) $('chat-input').value = msg;
    }
  } catch {}
}

function dappHooks() {
  return {
    getWallet: () => wallet,
    listWallets: () => loadWalletList().map(w => ({
      id: w.id,
      name: w.name || 'Wallet',
      address: w.address,
      kasware: !!w.kasware
    })),
    switchDappWallet,
    rememberDappAccount,
    ensureDappPayer,
    payerLabel: () => {
      const w = walletForDapp() || wallet;
      return (w?.name || 'Wallet') + ' · ' + (w?.address || '');
    },
    isTreasuryPayer: () => !!(wallet?.address && sameAddrPayload(wallet.address, TTT_TREASURY)),
    sessionOpen,
    requirePin,
    toast,
    applyAppNetwork,
    hydrateNativeKey,
    ensureKasware: dappEnsureKaswareSigner,
    getHoldings: async () => {
      if (Date.now() - lastTokenFetch > 8000) {
        try { await refreshTokenHoldings(); } catch {}
      }
      return dappHoldingsList();
    },
    getTokenBalance: async (tick) => {
      try { await refreshTokenHoldings(); } catch {}
      return dappHoldingRow(tick);
    },
    sendToken: dappSendToken,
    quoteKron: dappQuoteKron,
    tradeKron: dappTradeKron,
    describeVaultIntent,
    compileVault: dappCompileVault,
    sendKas: dappSendKas,
    afterTx
  };
}

async function unlockToHome() {
  markBooted();
  if (wallet?.address) setVaultOwner(wallet.address);
  persistSession();
  purgeDdPayVaults();
  $('page-lock').classList.remove('active');
  showPage('home');
  $('tabbar').classList.add('show');
  renderHome();
  startLiveSync();
  loadKaspaSdk().catch(() => {});
  scheduleAllFreezeWatches();
  maybeAutoUnlock();
  resumeAgentIfAny();
  if (loadAgentJob()?.on) startAgentPreviewLoop();
  resumeBetHireIfAny();
  resumeDcaIfAny();
  try { bootDappConnect(dappHooks()); } catch {}
  try { consumeArgentDeepLink(); } catch {}
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

function paintLockNet() {
  const btn = $('lock-net');
  const sub = $('import-sub');
  const tn = isTestnet();
  if (btn) btn.textContent = tn ? 'Network: Testnet-10 (native kaspatest:)' : 'Network: Mainnet (native kaspa:)';
  if (sub) sub.textContent = tn
    ? 'Paste the 64-hex key — address becomes kaspatest: for Cook / Scorpion'
    : 'Paste a 64-character hex key';
}

async function importWallet() {
  haptic();
  const hex = $('import-key').value.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) { toast('Need a 64-character hex key'); return; }
  try {
    const kp = await createKeypairFromHex(hex);
    applyWalletNetwork(kp);
    const list = loadWalletList();
    const existing = list.find(w =>
      (w.pubKey && kp.pubKey && String(w.pubKey).replace(/^0x/i, '') === String(kp.pubKey).replace(/^0x/i, ''))
      || sameAddrPayload(w.address, kp.address)
      || w.address === kp.address
    );
    if (existing) {
      await activateWallet({ ...existing, ...kp, kasware: false }, { toastMsg: 'Native key on ' + (isTestnet() ? 'TN10' : 'mainnet') });
      return;
    }
    const w = {
      ...kp,
      id: uid(),
      name: isTestnet() ? 'TN10 native' : ('Wallet ' + (list.length + 1)),
      createdAt: Date.now(),
      kasware: false
    };
    await activateWallet(w, { toastMsg: isTestnet() ? 'Imported native TN10 wallet' : 'Wallet imported' });
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

async function refreshKasPrice() {
  const apply = (n) => {
    if (!(n > 0)) return false;
    price = n;
    if ($('card-usd')) $('card-usd').textContent = `≈ ${usd(kas())}`;
    return true;
  };
  try {
    const pRes = await fetch(`${API_BASE()}/info/price?stringOnly=false`, { cache: 'no-store' });
    if (pRes.ok) {
      const data = await pRes.json();
      if (apply(Number(data.price ?? data ?? 0))) return;
    }
  } catch {}
  try {
    const r = await fetch('https://api.coinpaprika.com/v1/tickers/kas-kaspa', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      if (apply(Number(j?.quotes?.USD?.price))) return;
    }
  } catch {}
}

function paintIfChanged(el, html) {
  if (!el) return;
  if (el.dataset.paint === html) return;
  el.dataset.paint = html;
  el.innerHTML = html;
}

function renderHome() {
  if (!wallet) return;
  if ($('live-pill')) {
    $('live-pill').textContent = (isTestnet() ? 'TN10 · ' : (kaswareEnabled() ? 'KasWare · ' : 'Live · ')) + BUILD;
  }
  const balHtml = `${formatAmount(balanceSompi)}<small>KAS</small>`;
  if ($('card-bal') && $('card-bal').innerHTML !== balHtml) $('card-bal').innerHTML = balHtml;
  if ($('card-usd')) $('card-usd').textContent = price ? `≈ ${usd(kas())}` : 'Fetching price…';
  if ($('card-addr')) {
    $('card-addr').textContent = wallet.knsDomain || walletPublicName(wallet);
  }
  if ($('card-wallet')) {
    $('card-wallet').innerHTML = `${walletTitleHtml(wallet)} ▾`;
  }
  const navW = $('nav-wallet')?.querySelector('b');
  if (navW) navW.innerHTML = walletTitleHtml(wallet);
  renderHomeWallets();
  renderHoldings();
  paintDcaHome();
  paintTreasuryHome();
}

function knsCheck(title = 'KNS verified') {
  return `<span class="kns-check" title="${esc(title)}" aria-label="Verified"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 6.2l2.4 2.4 5.2-5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
}

function isGenericWalletName(name) {
  return !name || /^wallet(\s+\d+)?$/i.test(String(name).trim());
}

function walletKns(w) {
  if (!w) return '';
  if (wallet && (w.id === wallet.id || w.address === wallet.address)) return String(wallet.knsDomain || w.knsDomain || '').trim();
  return String(w.knsDomain || '').trim();
}

function walletPublicName(w) {
  const kns = walletKns(w);
  if (kns) return kns;
  const name = String(w?.name || '').trim();
  if (name) return name;
  return 'Wallet';
}

function applyWalletName(raw) {
  if (!wallet) return;
  const name = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 32);
  if (!name) throw new Error('Enter a wallet name');
  wallet.name = name;
  saveWallet();
  renderHome();
  if (currentTab === 'you') renderProfile();
  toast('Named ' + name);
}

function walletTitleHtml(w) {
  const kns = walletKns(w);
  return `${esc(walletPublicName(w))}${kns ? knsCheck() : ''}`;
}

function walletKasLabel(w, active) {
  const sompi = active ? balanceSompi : walletSnap[w.address]?.sompi;
  if (sompi == null) return '…';
  return formatAmount(sompi);
}

function renderHomeWallets() {
  const box = $('home-wallets');
  if (!box || !wallet) return;
  const list = [...loadWalletList()].sort((a, b) => {
    const aa = (a.id === wallet.id || a.address === wallet.address) ? 0 : 1;
    const bb = (b.id === wallet.id || b.address === wallet.address) ? 0 : 1;
    return aa - bb;
  });
  paintIfChanged(box, dedupeWalletList(list).map(w => {
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
            <b>${walletTitleHtml(w)}</b>
            <em>${esc(kasTxt)} KAS</em>
          </span>
        </button>
        ${sendBtn}
      </div>`;
  }).join('') + `<button class="w-chip add" type="button" data-add-wallet="1" aria-label="Add wallet">＋</button>`);
  box.scrollLeft = 0;
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
          <div class="title">${walletTitleHtml(w)}</div>
          <div class="sub">${esc(walletKns(w) || shortAddr(w.address, 12, 8))}</div>
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

function tokenLogoSrc(t) {
  return t?.image || t?.logoUrl || t?.metadata?.logoUrl
    || (t?.protocol === 'krc20' ? krc20Logo(t.ticker) : '')
    || TOKEN_FALLBACK_LOGO;
}

function tokenDot(t) {
  const color = t.color || tokenColor(t.ticker);
  const fb = esc(String(t.ticker || '?').slice(0, 3));
  if (t.native || t.ticker === 'KAS') {
    return `<div class="dot kas-dot" aria-hidden="true"></div>`;
  }
  const src = tokenLogoSrc(t);
  const fallback = src === TOKEN_FALLBACK_LOGO ? 'ttt' : '';
  return `<div class="dot${fallback ? ' ttt-dot' : ''}"><img alt="" src="${esc(src)}" data-tick="${esc(t.ticker || '')}" data-proto="${esc(t.protocol || 'kcc20')}" data-fb="${fb}" referrerpolicy="no-referrer" decoding="async"></div>`;
}

function activityTickLogo(tick, protocol, image) {
  const t = String(tick || 'KAS').toUpperCase();
  const proto = protocol || (t === 'KAS' ? 'kas' : 'kcc20');
  if (t === 'KAS' || proto === 'kas') return tokenDot({ ticker: 'KAS', protocol: 'kas', native: true });
  const hold = (kccHoldings || []).find(h => String(h.ticker || '').toUpperCase() === t);
  return tokenDot({
    ticker: t,
    protocol: proto,
    image: image || hold?.image || kronLogoFor(t)
  });
}

function launchLogoData() {
  const src = $('at-logo-prev')?.src || '';
  if (!src || /ttt\.png/i.test(src)) return TOKEN_FALLBACK_LOGO;
  return src;
}

function launchXHandle() {
  return String($('at-x')?.dataset.linked || $('at-x')?.value || '').replace(/^@/, '').trim();
}

async function fillLaunchKns() {
  const sel = $('at-kns');
  if (!sel) return;
  let main = '';
  try { if (wallet?.pubKey) main = pubkeyToAddress(wallet.pubKey, 'mainnet'); } catch {}
  if (!main) {
    sel.innerHTML = '<option value="">None</option>';
    return;
  }
  try {
    const list = await knsDomainsFor(main);
    const primary = await knsPrimary(main);
    sel.innerHTML = '<option value="">None</option>' + list.map(d =>
      `<option value="${esc(d.domain)}"${d.domain === primary ? ' selected' : ''}>${esc(d.domain)}</option>`
    ).join('');
    if (primary && ![...sel.options].some(o => o.value === primary)) {
      sel.insertAdjacentHTML('beforeend', `<option value="${esc(primary)}" selected>${esc(primary)}</option>`);
    }
  } catch {
    sel.innerHTML = '<option value="">None</option>';
  }
}

async function connectLaunchX() {
  if (!wallet) { toast('Unlock a wallet'); return; }
  const handle = ($('at-x')?.value || '').replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) { toast('Enter a valid X handle'); return; }
  const tick = ($('at-ltick')?.value || 'TOKEN').trim().toUpperCase() || 'TOKEN';
  const proof = `I verify I launch ${tick} KCC20 from ${wallet.address}`;
  if ($('at-x')) $('at-x').dataset.linked = handle;
  window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(proof), '_blank', 'noopener');
  toast('@' + handle + ' attached. Post the tweet, then Launch.');
}

function pickLaunchLogo(file) {
  if (!file) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    const s = Math.max(256 / img.width, 256 / img.height);
    const w = img.width * s, h = img.height * s;
    g.fillStyle = '#f4f4f6';
    g.fillRect(0, 0, 256, 256);
    g.drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h);
    if ($('at-logo-prev')) $('at-logo-prev').src = c.toDataURL('image/jpeg', 0.86);
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

function loadBasis() {
  try { return JSON.parse(localStorage.getItem(BASIS_KEY) || '{}') || {}; } catch { return {}; }
}
function saveBasis(map) {
  localStorage.setItem(BASIS_KEY, JSON.stringify(map || {}));
}
function addBasis(tick, kas, tok, side) {
  const t = String(tick || '').toUpperCase();
  if (!t || !(Number(tok) > 0)) return;
  const map = loadBasis();
  const row = map[t] || { kasIn: 0, tokIn: 0, kasOut: 0, tokOut: 0, markKas: 0 };
  if (side === 'sell') {
    row.kasOut += Math.max(0, Number(kas) || 0);
    row.tokOut += Number(tok);
  } else {
    row.kasIn += Math.max(0, Number(kas) || 0);
    row.tokIn += Number(tok);
  }
  map[t] = row;
  saveBasis(map);
}
function noteKronFill(q) {
  if (!q?.tick || !q.side) return;
  const tick = String(q.tick).toUpperCase();
  const dec = Number(q.decimals || 0);
  if (q.side === 'buy') {
    addBasis(tick, Number(q.kasIn || 0) / 1e8, Number(q.tokenOut || 0) / (10 ** dec), 'buy');
  } else {
    addBasis(tick, Number(q.net || q.kasOut || 0) / 1e8, Number(q.tokenIn || 0) / (10 ** dec), 'sell');
  }
}

function noteATradeActivity(job, side, px, result) {
  const tick = String(job?.tick || result?.quote?.tick || '').toUpperCase();
  if (!tick) return;
  const q = result?.quote || {};
  const dec = Number(q.decimals ?? job?.preview?.decimals ?? 0);
  const buy = side === 'buy';
  const amt = buy ? (q.tokenOut ?? '') : (q.tokenIn ?? '');
  pushTokenActivity({
    dir: buy ? 'in' : 'out',
    tick,
    protocol: 'kcc20',
    amount: String(amt || ''),
    decimals: dec,
    txId: result?.txId || '',
    label: buy ? 'A-Trade buy' : 'A-Trade sell',
    kind: 'atrade',
    note: fmtPx(px) + ' KAS · Scorpion ' + tick,
    image: kronLogoFor(tick)
  });
}
function fmtPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0.00%';
  return (x > 0 ? '+' : '') + x.toFixed(2) + '%';
}

function rebuildKronTradeBasis(rows) {
  const map = {};
  const sorted = [...(rows || [])].sort((a, b) => Number(a.ts || a.time || 0) - Number(b.ts || b.time || 0));
  for (const t of sorted) {
    const tick = String(t.tick || t.ticker || '').toUpperCase();
    const side = String(t.side || '').toLowerCase();
    const vol = Number(t.volume ?? t.amount ?? t.tokenAmount ?? 0);
    const px = Number(t.price ?? t.priceKas ?? 0);
    if (!tick || !(vol > 0) || !(px > 0)) continue;
    const kas = vol * px;
    const row = map[tick] || { kasIn: 0, tokIn: 0, kasOut: 0, tokOut: 0 };
    if (side === 'sell') {
      row.kasOut += kas;
      row.tokOut += vol;
    } else if (side === 'buy') {
      row.kasIn += kas;
      row.tokIn += vol;
    }
    map[tick] = row;
  }
  kronTradeBasis = map;
}

async function hydrateKronPnl(addr) {
  if (!addr || isTestnet()) return;
  const addrs = (typeof ownedAddresses === 'function' ? ownedAddresses(wallet) : [addr]).filter(Boolean).slice(0, 6);
  const bags = await Promise.all(addrs.map(a => fetchKronAddrTrades(a, 200).catch(() => [])));
  rebuildKronTradeBasis(bags.flat());
}

function holdingCost(tick, have) {
  const traded = kronTradeBasis[tick];
  const local = loadBasis()[tick];
  const b = (traded?.tokIn > 0 ? traded : null) || (local?.tokIn > 0 ? local : null);
  if (!b || !(b.tokIn > 0) || !(have > 0)) return null;
  const netTok = b.tokIn - (b.tokOut || 0);
  const netKas = b.kasIn - (b.kasOut || 0);
  const avg = netTok > 0 && netKas > 0 ? netKas / netTok : (b.kasIn / b.tokIn);
  if (!(avg > 0)) return null;
  const cost = avg * have;
  return { cost, avg };
}

function holdingPnl(t) {
  if (t?.native) return null;
  const tick = String(t.ticker || '').toUpperCase();
  const dec = Number(t.decimals || 0);
  const have = Number(t.balance || 0) / (10 ** dec);
  const live = kronPx[tick] || {};
  const px = Number(live.price || t.priceKas || 0);
  const chg24 = Number.isFinite(Number(live.change24h)) ? Number(live.change24h) : 0;
  const value = have * (px > 0 ? px : 0);
  const c = holdingCost(tick, have);
  if (c && value > 0) {
    const pnl = value - c.cost;
    const pct = c.cost > 0 ? (pnl / c.cost) * 100 : 0;
    return { px, value, cost: c.cost, pnl, pct, mode: 'cost', chg24 };
  }
  return { px, value, cost: 0, pnl: 0, pct: chg24, mode: '24h', chg24 };
}

function tokenRow(t, extra = '') {
  const proto = t.protocol === 'krc20' ? 'KRC-20' : (t.native ? 'Native' : 'KCC20');
  const amt = t.native ? formatAmount(t.sompi) : formatTokenUnits(t.balance, t.decimals);
  const pnl = t.native ? null : holdingPnl(t);
  let amtMeta = `<em>${esc(t.native ? (t.usd || '') : proto)}</em>`;
  if (pnl && pnl.px > 0) {
    const bits = [];
    if (pnl.value > 0) bits.push(`<em class="pnl-val">${esc(formatKasSompi(Math.round(pnl.value * 1e8)) + ' KAS')}</em>`);
    bits.push(`<em class="pnl ${pnl.chg24 >= 0 ? 'up' : 'down'}">24h ${esc(fmtPct(pnl.chg24))}</em>`);
    if (pnl.mode === 'cost' && Number.isFinite(pnl.pct)) {
      bits.push(`<em class="pnl ${pnl.pct >= 0 ? 'up' : 'down'}">P&amp;L ${esc(fmtPct(pnl.pct))}</em>`);
    }
    amtMeta = bits.join('');
  } else if (Number(t.priceKas) && price) {
    amtMeta = `<em>${esc(usd(Number(t.balance) / (10 ** (t.decimals || 0)) * t.priceKas))}</em>`;
  }
  const key = `${t.protocol || 'watch'}:${t.ticker}`;
  const sub = t.native
    ? (esc(t.ticker) + ' · ' + esc(proto))
    : (esc(t.ticker) + ' · ' + (pnl?.px ? (pnl.px >= 0.0001 ? pnl.px.toPrecision(4) : pnl.px.toExponential(2)) + ' KAS' : proto));
  return `
    <button class="row token-row" data-token-key="${esc(key)}" ${extra}>
      ${tokenDot(t)}
      <div>
        <div class="title">${esc(t.name || t.ticker)}</div>
        <div class="sub">${sub}</div>
      </div>
      <div class="amt">
        <b>${esc(amt)}</b>
        ${amtMeta}
      </div>
    </button>`;
}

function renderHoldings() {
  const kasRow = tokenRow({ ...NATIVE_KAS, sompi: balanceSompi, usd: usd(kas()), protocol: 'native' }, 'data-ticker="KAS"');
  const kccRows = kccHoldings.map(t => tokenRow(t));
  const krcRows = krcHoldings.map(t => tokenRow(t));
  const ddRows = (isTttTreasuryWallet() ? kkdCellCache : []).map(c => `
    <button class="row token-row" type="button" data-dd-cell="${esc(c.txid)}:${esc(String(c.index))}">
      <div class="dot" style="background:rgba(122,162,247,.2);color:#7aa2f7">↓</div>
      <div>
        <div class="title">DD pay-in</div>
        <div class="sub">${esc(c.pAddr ? shortAddr(c.pAddr, 12, 8) : (c.txid ? c.txid.slice(0, 14) + '…' : 'KKDAG cell'))}</div>
      </div>
      <div class="amt">
        <b>${esc(Number(c.amt).toLocaleString())}</b>
        <em class="pnl up">incoming KKDAG</em>
      </div>
    </button>`);
  const locked = loadVaults().filter(v => v.address && vaultLockedSompi(v) > 0 && !isVaultHistory(v) && v.status !== 'cancelled' && !isDcaVault(v) && !isDdPayVault(v));
  const lockRows = locked.map(v => {
    const sec = remainingLockSec(v.unlockDaa, v.unlockAt);
    const lockedNow = sec == null || sec > 0;
    const tok = vaultTokenLabel(v);
    const when = v.unlockAt ? formatUtc(v.unlockAt) : '';
    return `
    <button class="row token-row" data-lock-holding="${esc(v.address)}">
      <div class="dot" style="background:rgba(212,176,122,.18);color:var(--gold-2)">⏱</div>
      <div>
        <div class="title">${esc(v.name || 'Time Capsule')}</div>
        <div class="sub">${lockedNow ? 'Unlocks <span data-unlock-daa="' + esc(v.unlockDaa || '') + '" data-unlock-at="' + esc(v.unlockAt || '') + '">' + esc(formatLockClock(sec)) + '</span>' + (when ? ' · ' + esc(when) : '') : 'Unlocked — returning to wallet'}</div>
      </div>
      <div class="amt">
        <b>${tok ? esc(tok) : formatAmount(vaultLockedSompi(v))}</b>
        <em>${lockedNow ? 'Locked' : 'Unlocking'}</em>
      </div>
    </button>`;
  });
  const rows = [kasRow, ...kccRows, ...ddRows, ...krcRows, ...lockRows];
  const pnlKey = kccHoldings.map(t => {
    const p = holdingPnl(t);
    return `${t.ticker}:${p?.value?.toFixed?.(4) || ''}:${p?.chg24?.toFixed?.(2) || ''}:${p?.pct?.toFixed?.(2) || ''}:${p?.mode || ''}`;
  }).join(',');
  const key = `${balanceSompi}|${kccHoldings.map(t => `${t.ticker}:${t.balance}:${t.image || ''}`).join(',')}|${krcHoldings.map(t => `${t.ticker}:${t.balance}`).join(',')}|${locked.map(v => v.address + ':' + (v.fundedSompi || 0)).join(',')}|${pnlKey}|${kkdCellCache.map(c => c.amt + ':' + c.txid).join(',')}`;
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
  if ($('token-native')) {
    $('token-native').innerHTML = tokenRow({ ...NATIVE_KAS, sompi: balanceSompi, usd: usd(kas()), protocol: 'native' }, 'data-ticker="KAS"');
  }
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
  const launched = $('token-launched');
  if (launched) {
    const mine = loadLaunched().filter(t => !t.network || t.network === networkId());
    const shown = mine.filter(t => validTick(t.tick));
    launched.innerHTML = shown.length
      ? shown.map(t => `
        <button class="row token-row" type="button" data-launched="${esc(t.tokenId || t.tick)}">
          ${tokenDot({ ticker: t.tick, protocol: 'kcc20', image: t.image })}
          <div>
            <div class="title">${esc(t.tick)}</div>
            <div class="sub">${esc(t.name || 'Launched here')} · ${esc(t.network === 'testnet-10' ? 'TN10' : 'mainnet')}</div>
          </div>
          <div class="amt"><b>${t.txId ? esc(String(t.txId).slice(0, 8)) : 'on-chain'}</b></div>
        </button>`).join('')
      : `<div class="empty">Tokens you launch from this app land here. TN10 Cook launches show after you sign.</div>`;
  }
  renderBoosts();
}

async function renderTokKcom() {
  const box = $('token-kcom');
  if (!box) return;
  box.innerHTML = `<div class="empty">Indexing Cook tokens…</div>`;
  const addr = wallet?.address || '';
  let held = [], deployed = [], mkts = [];
  try { held = await cookOwnerBalances(addr); } catch {}
  try { deployed = addr ? await cookDeployed(addr) : []; } catch {}
  try { mkts = await cookMarkets(24); } catch {}
  const launched = loadLaunched().filter(t => validTick(t.tick) && (!t.network || t.network === 'testnet-10'));
  const row = (tick, name, sub, extra = '', image = '') => {
    if (!validTick(tick)) return '';
    return `
    <button class="row token-row" type="button" data-cook-tick="${esc(String(tick).toUpperCase())}" ${extra}>
      ${tokenDot({ ticker: String(tick).toUpperCase(), protocol: 'kcc20', image })}
      <div>
        <div class="title">${esc(String(tick).toUpperCase())}</div>
        <div class="sub">${esc(name || 'K.COM')}</div>
      </div>
      <div class="amt"><b>${esc(sub || '')}</b></div>
    </button>`;
  };
  const chunks = [];
  if (launched.length) {
    chunks.push('<div class="section-label">Launched here</div>');
    chunks.push(launched.map(t => row(t.tick, t.name, t.network === 'testnet-10' ? 'TN10' : '', `data-cook-id="${esc(t.tokenId || '')}"`, t.image)).join(''));
  }
  if (held.length) {
    chunks.push('<div class="section-label">Your Cook balances</div>');
    chunks.push(held.map(r => {
      const tick = cookTickOf(r);
      const amt = r.totalAmount || r.nativeAmount || r.amount || r.balance || '0';
      return row(tick, r.name || r.metadata?.name, String(amt), `data-cook-id="${esc(r.tokenIdHex || r.tokenId || '')}"`);
    }).join(''));
  }
  if (deployed.length) {
    chunks.push('<div class="section-label">Deployed by you</div>');
    chunks.push(deployed.map(r => {
      const tick = cookTickOf(r);
      return row(tick, r.tokenName || r.metadata?.name, 'deployed', `data-cook-id="${esc(r.covenantId || r.tokenIdHex || '')}"`);
    }).join(''));
  }
  if (mkts.length) {
    chunks.push('<div class="section-label">K.COM TN10 book</div>');
    chunks.push(mkts.map(m => {
      const tick = cookTickOf(m);
      const ask = sompiToKas(m.bestAskUnitPriceSompi);
      const bid = sompiToKas(m.bestBidUnitPriceSompi);
      return row(tick, m.metadata?.name || 'K.COM', ask ? fmtPx(ask) + ' KAS' : (bid ? 'bid ' + fmtPx(bid) : 'book'), `data-cook-id="${esc(m.tokenIdHex || '')}" data-cook-ask="${ask || ''}" data-cook-bid="${bid || ''}"`, m.metadata?.logoUrl || '');
    }).join(''));
  }
  box.innerHTML = chunks.join('') || `<div class="empty">No K.COM tokens yet. Launch one, or wait for the TN10 book to index.</div>`;
  box.querySelectorAll('[data-cook-id], [data-cook-tick]').forEach(el => {
    el.addEventListener('click', () => {
      setAtPane('book');
      setAtSrc('cook');
      pickCookRow(el.dataset.cookId || '', el.dataset.cookTick, {
        name: el.querySelector('.sub')?.textContent || el.dataset.cookTick,
        ask: el.dataset.cookAsk,
        bid: el.dataset.cookBid
      });
    });
  });
}

function vaultStatusLine(v) {
  if (isDdPayVault(v)) return 'Incoming DD credit · ' + (vaultTokenLabel(v) || 'KKDAG');
  const tok = vaultTokenLabel(v);
  const locked = vaultLockedSompi(v);
  const amt = tok || (locked ? formatAmount(locked) + ' KAS' : '0 KAS');
  if (isHopVault(v) && v.hops) {
    const i = Number(v.hopIndex || 0);
    const sec = remainingLockSec(v.unlockDaa, v.unlockAt);
    const clock = sec > 0
      ? ` · <span data-unlock-daa="${esc(v.unlockDaa || '')}" data-unlock-at="${esc(v.unlockAt || '')}">${esc(formatLockClock(sec))}</span>`
      : (v.unlockDaa ? ' · timeout' : '');
    return `Hop ${i + 1}/${v.hops.length}${clock} · ${amt}`;
  }
  if (!locked && !tok) return `${v.status || 'unfunded'} · ${amt}`;
  if (isLifeVault(v) && (v.unlockAnytime || v.params?.unlockAnytime)) return `Unlock anytime · ${amt}`;
  if (v.unlockDaa || v.unlockAt) {
    const sec = remainingLockSec(v.unlockDaa, v.unlockAt);
    const when = v.unlockAt ? ' · ' + formatUtc(v.unlockAt) : '';
    if (sec == null) return `Locked · ${amt}`;
    if (sec > 0) return `Unlocks <span data-unlock-daa="${esc(v.unlockDaa || '')}" data-unlock-at="${esc(v.unlockAt || '')}">${esc(formatLockClock(sec))}</span>${esc(when)} · ${amt}`;
    return `Unlocked — returning · ${amt}`;
  }
  return `${v.status || 'funded'} · ${amt}`;
}

function setVaultTab(tab) {
  document.querySelectorAll('#vault-seg button').forEach(b => b.classList.toggle('on', b.dataset.vtab === tab));
  $('vault-create')?.classList.toggle('hidden', tab !== 'create');
  $('vault-mine-wrap')?.classList.toggle('hidden', tab !== 'mine');
  $('vault-life-wrap')?.classList.toggle('hidden', tab !== 'life');
  $('vault-bridge-wrap')?.classList.toggle('hidden', tab !== 'bridge');
  if (tab === 'life') {
    renderLifeVaults();
    if ($('chat-input')) $('chat-input').placeholder = 'Lock 1000 KAS for rent until Sep 1 9:00 UTC…';
  } else if (tab === 'bridge') {
    syncBridgeLabels();
    if ($('chat-input')) $('chat-input').placeholder = 'Bridge 20 KKDAG to KRON…';
  } else if ($('chat-input')) {
    $('chat-input').placeholder = 'Tell Argent what to lock…';
  }
}

function syncBridgeLabels() {
  const from = String($('br-from')?.value || 'KKDAG').trim().toUpperCase();
  const hold = holdingForTick(from);
  const dec = betDecimals(hold);
  if ($('br-amt-lab')) $('br-amt-lab').textContent = 'Amount (' + (from || 'TOKEN') + ')';
  const amt = $('br-amt');
  if (amt) {
    amt.min = String(betMinStake(dec));
    amt.step = String(betStakeStep(dec));
  }
}

let lastBridgeQuote = null;

async function quoteBridgeUi() {
  if (isTestnet()) { toast('Bridge is mainnet KRON only'); return; }
  const from = String($('br-from')?.value || '').trim().toUpperCase();
  const to = String($('br-to')?.value || '').trim().toUpperCase();
  const amt = $('br-amt')?.value;
  const el = $('br-quote');
  if (el) el.textContent = 'Quoting KRON…';
  try {
    const q = await quoteKcc20Bridge({ fromTick: from, toTick: to, amount: amt });
    lastBridgeQuote = q;
    const sellKas = formatKasSompi(q.kasGross);
    const hopKas = formatKasSompi(q.kasForBuy);
    const outTok = formatTokenRaw(q.buy.tokenOut, q.buy.decimals);
    const sellVenue = q.sell.graduated ? 'pool' : 'curve';
    const buyVenue = q.buy.graduated ? 'pool' : 'curve';
    if (el) {
      el.innerHTML = '<b>Not P2P</b> — you swap against KRON covenants, not a person.<br>'
        + '1. Sell <b>' + esc(amt) + ' ' + esc(from) + '</b> on the KRON <b>' + esc(sellVenue) + '</b> → about <b>' + esc(sellKas) + ' KAS</b>.<br>'
        + '2. Keep ~0.5 KAS for the second network fee, then buy <b>' + esc(to) + '</b> on the <b>' + esc(buyVenue) + '</b> with ~<b>' + esc(hopKas) + ' KAS</b> → about <b>' + esc(outTok) + ' ' + esc(to) + '</b>.<br>'
        + 'Live oracle: <b>' + esc(q.oracle) + '</b>. You sign both Kaspa txs. This wallet never takes custody.';
    }
  } catch (e) {
    lastBridgeQuote = null;
    if (el) el.textContent = errText(e);
    toast(errText(e));
  }
}

async function runBridge() {
  if (isTestnet()) { toast('Bridge is mainnet KRON only'); return; }
  if (!wallet) { toast('Unlock a wallet'); return; }
  const from = String($('br-from')?.value || '').trim().toUpperCase();
  const to = String($('br-to')?.value || '').trim().toUpperCase();
  const amt = $('br-amt')?.value;
  const hold = holdingForTick(from);
  if (!hold || hold.native) throw new Error('Need ' + from + ' in this wallet');
  try { await requirePin('Bridge ' + amt + ' ' + from + ' → ' + to); }
  catch (e) { if (errText(e) === 'cancelled') return; throw e; }
  if ($('br-st')) $('br-st').textContent = 'Bridging…';
  const res = await executeKcc20Bridge({
    wallet, fromTick: from, toTick: to, amount: amt,
    utxos: await fetchAddressUtxos(wallet.address).catch(() => []),
    forceKasware: kaswareEnabled(),
    onStatus: (m) => { toast(m); if ($('br-st')) $('br-st').textContent = m; }
  });
  afterTx();
  const sellId = res?.sell?.txId || '';
  const buyId = res?.buy?.txId || '';
  if ($('br-st')) {
    $('br-st').innerHTML = 'Done. Sell '
      + (isRealTxId(sellId) ? `<a href="${esc(explorerTx(sellId))}" target="_blank" rel="noopener">${esc(sellId.slice(0, 10))}…</a>` : '')
      + ' · Buy '
      + (isRealTxId(buyId) ? `<a href="${esc(explorerTx(buyId))}" target="_blank" rel="noopener">${esc(buyId.slice(0, 10))}…</a>` : '');
  }
  noteKronFill(res?.sell?.quote);
  noteKronFill(res?.buy?.quote);
  const got = res?.receivedHuman ? ' Received ' + res.receivedHuman + ' ' + to + '.' : '';
  toast(from + ' → ' + to + ' bridged.' + got);
  if (got && $('br-st')) $('br-st').innerHTML += got;
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
  purgeDdPayVaults();
  const all = loadVaults().filter(v => !isLifeVault(v) && !isDdPayVault(v));
  const history = all.filter(isVaultHistory);
  const live = all.filter(v => !isVaultHistory(v));
  const mine = showVaultHistory ? history : live;
  $('vault-products').innerHTML = VAULT_PRODUCTS.map(p => `
    <button class="glass product" data-product="${esc(p.id)}" type="button">
      <div class="glyph">${esc(p.tag)}</div>
      <h4>${esc(p.name)}</h4>
    </button>`).join('');
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
          ${showVaultHistory ? '' : (isDcaVault(v)
            ? `<button class="nav-btn" data-deldca="${esc(v.address || '')}">Delete</button>`
            : `<button class="nav-btn" data-sweep="${esc(v.address || '')}">Sweep</button>`)}
        </div>
      </div>`).join('')
    : `<div class="empty vault-empty">${empty}</div>`;
  if ($('sweep-all')) $('sweep-all').onclick = (e) => {
    e.stopPropagation();
    sweepAllVaults().catch(err => toast(errText(err)));
  };
  if (!$('vault-life-wrap')?.classList.contains('hidden')) renderLifeVaults();
}

let lifeFilter = 'all';
let showLifeHistory = false;

function renderLifeVaults() {
  const box = $('vault-life');
  const filters = $('life-filters');
  if (filters) {
    const chips = [{ id: 'all', label: 'All', tag: '◆' }, ...LIFE_KINDS];
    filters.innerHTML = chips.map(k =>
      `<button type="button" data-lifekind="${esc(k.id)}" class="${lifeFilter === k.id ? 'on' : ''}">${esc(k.tag || '')} ${esc(k.label)}</button>`
    ).join('');
  }
  document.querySelectorAll('#life-hist-seg button').forEach(b => {
    b.classList.toggle('on', (b.dataset.lifehist === 'history') === showLifeHistory);
  });
  if (!box) return;
  let list = loadVaults().filter(isLifeVault);
  list = showLifeHistory ? list.filter(isVaultHistory) : list.filter(v => !isVaultHistory(v));
  if (lifeFilter !== 'all') list = list.filter(v => (v.lifeKind || v.params?.lifeKind) === lifeFilter);
  if (!list.length) {
    box.innerHTML = `<div class="empty vault-empty">${showLifeHistory
      ? 'No finished real-life cases yet.'
      : 'No real-life locks yet. Tell Argent: “lock 1000 kas for rent until September 1 2026 9:00 UTC”.'}</div>`;
    return;
  }
  box.innerHTML = list.map(v => {
    const meta = lifeKindMeta(v.lifeKind || v.params?.lifeKind);
    const anytime = !!(v.unlockAnytime || v.params?.unlockAnytime);
    const amt = formatAmount(vaultLockedSompi(v)) + ' KAS';
    const due = v.unlockAt ? formatUtc(v.unlockAt) : (v.params?.dueLabel || '');
    const sub = anytime
      ? 'Unlock anytime with PIN'
      : (due ? ('Due ' + due) : vaultStatusLine(v));
    return `
      <div class="row token-row vault-card life-card${showLifeHistory ? ' history' : ''}">
        <div class="dot" style="background:rgba(212,176,122,.18);color:var(--gold-2)">${esc(meta.tag)}</div>
        <div style="min-width:0;flex:1">
          <div class="title">${esc(v.name || meta.label)}</div>
          <div class="sub">${esc(sub)}</div>
        </div>
        <div class="life-amt">
          <b>${esc(amt)}</b>
          <em>${anytime ? 'Control' : (showLifeHistory ? 'Paid' : 'Locked')}</em>
        </div>
        <div class="vault-card-actions">
          <button class="nav-btn ghost" data-vault="${esc(v.address || '')}">Info</button>
          ${showLifeHistory ? '' : `<button class="nav-btn" data-sweep="${esc(v.address || '')}">${anytime ? 'Unlock' : 'Sweep'}</button>`}
        </div>
      </div>`;
  }).join('');
}

function openLifeComposer(prefill = {}) {
  const kind = prefill.lifeKind || lifeFilter !== 'all' ? (prefill.lifeKind || lifeFilter) : 'rent';
  const meta = lifeKindMeta(kind);
  const kasMax = maxFillForAsset({ native: true, protocol: 'kas', ticker: 'KAS', decimals: 8, balance: String(balanceSompi) });
  openSheet(meta.label, `
    <p class="muted" style="text-align:left;padding:0 0 10px;">${esc(meta.hint)} Argent compiles a real P2SH covenant.</p>
    <div class="life-filters" id="life-kind-pick">
      ${LIFE_KINDS.map(k => `<button type="button" data-pickkind="${esc(k.id)}" class="${k.id === kind ? 'on' : ''}">${esc(k.tag)} ${esc(k.label)}</button>`).join('')}
    </div>
    <div class="field"><label>Amount (KAS)</label>
      <div class="dest-row">
        <input id="life-amt" type="text" inputmode="decimal" placeholder="${esc(kasMax)}" value="${esc(prefill.amountKas || '')}">
        <button class="max-btn" id="life-max" type="button">Max</button>
      </div>
    </div>
    <label class="row" style="padding:10px 0;gap:10px;">
      <input type="checkbox" id="life-anytime" ${prefill.unlockAnytime || kind === 'control' ? 'checked' : ''}>
      <span>Unlock anytime with PIN</span>
    </label>
    <div class="field" id="life-due-wrap">
      <label>Due date & time (local)</label>
      <input id="life-due" type="datetime-local" value="${esc(prefill.dueLocal || '')}">
    </div>
  `, {
    confirm: 'Build covenant',
    gold: true,
    onConfirm: () => {
      const pick = document.querySelector('#life-kind-pick button.on')?.dataset.pickkind || kind;
      const amt = Number($('life-amt')?.value);
      const anytime = !!$('life-anytime')?.checked;
      const local = $('life-due')?.value;
      const dueAt = local ? new Date(local).getTime() : 0;
      if (!(amt > 0)) throw new Error('Enter an amount');
      if (!anytime && !(dueAt > Date.now())) throw new Error('Pick a future due date, or check unlock anytime');
      const mins = anytime ? 0 : Math.max(1, Math.round((dueAt - Date.now()) / 60000));
      const dueLabel = anytime ? '' : formatUtc(dueAt);
      return buildCovenant({ id: 'life', type: 'life', name: lifeKindMeta(pick).label }, {
        amountKas: amt,
        lifeKind: pick,
        rentKind: pick === 'rent' ? 'house' : undefined,
        lifeLabel: lifeKindMeta(pick).label,
        unlockAnytime: anytime,
        dueAt: anytime ? 0 : dueAt,
        dueLabel,
        lockMinutes: mins,
        durationLabel: anytime ? 'unlock anytime' : ('until ' + dueLabel)
      });
    }
  });
  $('life-max')?.addEventListener('click', () => { if ($('life-amt')) $('life-amt').value = kasMax; haptic(); });
  const syncAnytime = () => {
    const on = !!$('life-anytime')?.checked;
    $('life-due-wrap')?.classList.toggle('hidden', on);
  };
  $('life-anytime')?.addEventListener('change', syncAnytime);
  syncAnytime();
  $('life-kind-pick')?.addEventListener('click', e => {
    const b = e.target.closest('[data-pickkind]');
    if (!b) return;
    $('life-kind-pick').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (b.dataset.pickkind === 'control' && $('life-anytime')) $('life-anytime').checked = true;
    syncAnytime();
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
    note: ev.note || '',
    until: ev.until || '',
    kind: ev.kind || '',
    image: ev.image || kronLogoFor(ev.tick) || '',
    wallet: loadWalletList().find(w => w.address === use)?.name || ''
  };
  const dup = list.find(x => {
    if (x.tick !== row.tick || x.dir !== row.dir) return false;
    if (row.txId && x.txId && x.txId === row.txId) return true;
    if ((x.label || '') !== (row.label || '')) return false;
    if (x.amount !== row.amount) return false;
    return Math.abs((x.time || 0) - row.time) < 180000;
  });
  if (dup) {
    let dirty = false;
    if (row.txId && !dup.txId) { dup.txId = row.txId; dirty = true; }
    if (row.note && !dup.note) { dup.note = row.note; dirty = true; }
    if (row.kind && !dup.kind) { dup.kind = row.kind; dirty = true; }
    if (row.image && !dup.image) { dup.image = row.image; dirty = true; }
    if (ev.time && Number(ev.time) > Number(dup.time || 0)) { dup.time = Number(ev.time); dirty = true; }
    if (dirty) saveTokenActivity(list, use);
    scheduleActivityPaint();
    return dup;
  }
  list.unshift(row);
  saveTokenActivity(list, use);
  scheduleActivityPaint();
  return row;
}

let activityPaint = 0;
function scheduleActivityPaint() {
  if (currentTab !== 'activity') return;
  if (activityPaint) return;
  activityPaint = requestAnimationFrame(() => {
    activityPaint = 0;
    renderActivity(window.__txs || []);
  });
}

function isVaultActivityLabel(label) {
  return /^(Vault created|Locked|Unlocked|Checked in|Frozen|Unfrozen)$/i.test(String(label || ''));
}

function noteVaultActivity({ vault, label, dir = 'out', amount, txId = '', tick, protocol, decimals, addr, note, until } = {}) {
  const kcc = !!(vault && (vault.tick || vault.tokenAmount) && (protocol === 'kcc20' || tick));
  const useTick = String(tick || (kcc ? vault.tick : 'KAS') || 'KAS').toUpperCase();
  const useProto = protocol || (useTick !== 'KAS' ? 'kcc20' : 'kas');
  let amt = amount;
  if (amt == null) {
    if (useProto !== 'kas') amt = vault?.tokenAmount || vault?.params?.amountToken || '0';
    else {
      const kas = Number(vault?.params?.amountKas);
      amt = Number.isFinite(kas) ? String(Math.round(kas * 1e8)) : String(vault?.fundedSompi || 0);
    }
  }
  const untilMs = Number(until || vault?.unlockAt || 0);
  const stamp = untilMs ? ('Returns ' + formatUtc(untilMs)) : '';
  return pushTokenActivity({
    dir,
    tick: useTick,
    protocol: useProto,
    amount: String(amt || '0'),
    decimals: Number(decimals != null ? decimals : (useProto === 'kas' ? 8 : (vault?.decimals || 0))),
    txId: txId || '',
    label: label || 'Locked',
    note: note || stamp,
    until: untilMs || ''
  }, addr);
}

function refreshActivityNow() {
  if (!wallet?.address) {
    if (currentTab === 'activity') renderActivity(window.__txs || []);
    return;
  }
  const addr = wallet.address;
  if (currentTab === 'activity') renderActivity(window.__txs || []);
  fetchWalletTxs(addr).then(txs => {
    if (!wallet || wallet.address !== addr) return;
    window.__txs = txs;
    rememberActiveSnap();
    if (currentTab === 'activity') renderActivity(txs);
  }).catch(() => {
    if (currentTab === 'activity') renderActivity(window.__txs || []);
  });
}

function loadKnownCells(addr) {
  try {
    const raw = JSON.parse(localStorage.getItem(CELL_KEY + ':' + (addr || wallet?.address || '')) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveKnownCells(map, addr) {
  const use = addr || wallet?.address;
  if (!use) return;
  localStorage.setItem(CELL_KEY + ':' + use, JSON.stringify(map || {}));
}

function cellOutId(c) {
  const id = c?.outpoint?.transactionId || c?.transactionId || '';
  if (!id) return '';
  const idx = c?.outpoint?.index ?? c?.index ?? 0;
  return id + ':' + idx;
}

async function ingestNewKcc20Cells({ ticks } = {}) {
  if (!wallet?.address) return;
  const addrs = [...new Set(
    (ownedAddresses(wallet) || []).map(o => o.address).filter(Boolean)
  )].slice(0, 4);
  if (!addrs.includes(wallet.address)) addrs.unshift(wallet.address);
  const fromHold = (kccHoldings || []).map(t => t.ticker).filter(Boolean);
  const tickList = [...new Set((ticks && ticks.length ? ticks : fromHold).map(t => String(t).toUpperCase()).filter(Boolean))].slice(0, 8);
  if (!tickList.length) return;
  const hush = Date.now() < hushTokenToastsUntil;

  await Promise.all(addrs.map(async addr => {
    const known = loadKnownCells(addr);
    let dirty = false;
    for (const T of tickList) {
      const cells = await fetchKronTokenUtxos(T, addr).catch(() => []);
      const ids = cells.map(cellOutId).filter(Boolean);
      const prev = Array.isArray(known[T]) ? known[T] : null;
      const prevSet = new Set(prev || []);
      const first = !prev;
      known[T] = ids;
      dirty = true;
      if (first || hush) continue;
      const fresh = cells.filter(c => {
        const id = cellOutId(c);
        return id && !prevSet.has(id);
      });
      if (!fresh.length) continue;
      const held = (kccHoldings || []).find(x => String(x.ticker || '').toUpperCase() === T);
      const dec = Number(held?.decimals || 0);
      for (const c of fresh) {
        const amt = String(c.amount ?? c.tokenAmount ?? '');
        if (!amt || amt === '0') continue;
        const txId = c.outpoint?.transactionId || c.transactionId || '';
        const ev = {
          dir: 'in',
          tick: T,
          protocol: 'kcc20',
          amount: amt,
          decimals: dec,
          txId,
          time: Date.now(),
          label: 'Received',
          note: 'Incoming transfer'
        };
        pushTokenActivity(ev, addr);
        if (addr !== wallet.address) pushTokenActivity(ev, wallet.address);
      }
    }
    if (dirty) saveKnownCells(known, addr);
  }));
}

async function ingestKcc20CellActivity(addr) {
  const use = addr || wallet?.address;
  if (!use || isTestnet()) return;
  let ticks = [...new Set((kccHoldings || []).map(t => String(t.ticker || '').toUpperCase()).filter(Boolean))].slice(0, 8);
  if (sameAddrPayload(use, TTT_TREASURY) && !ticks.includes('KKDAG')) ticks = ['KKDAG', ...ticks];
  for (const tick of ticks) {
    const cells = await fetchKronTokenUtxos(tick, use).catch(() => []);
    for (const c of cells || []) {
      const amt = String(c.amount || '0');
      const txId = c.outpoint?.transactionId || '';
      if (!(Number(amt) > 0) || !txId) continue;
      const dd = sameAddrPayload(use, TTT_TREASURY) && tick === 'KKDAG';
      pushTokenActivity({
        dir: 'in',
        tick,
        protocol: 'kcc20',
        amount: amt,
        decimals: Number(c.dec ?? 0),
        txId,
        label: dd ? 'DD pay-in' : 'Received',
        note: dd ? 'Covenant cell on ews — kaspa.org q-page will not list this' : 'KCC20 cell'
      }, use);
    }
  }
}

async function ingestKronActivity(addr) {
  const use = addr || wallet?.address;
  if (!use || isTestnet()) return;
  const rows = await fetchKronAddrTrades(use, 20);
  for (const t of rows) {
    const tick = String(t.tick || t.ticker || '').toUpperCase();
    if (!tick) continue;
    const side = String(t.side || '').toLowerCase();
    const dir = side === 'sell' ? 'out' : 'in';
    const held = (kccHoldings || []).find(x => String(x.ticker || '').toUpperCase() === tick);
    const dec = Number(held?.decimals ?? t.dec ?? t.decimals ?? 0);
    const vol = Number(t.volume ?? t.amount ?? t.tokenAmount ?? 0);
    if (!(vol > 0)) continue;
    const scale = 10 ** Math.min(12, Math.max(0, dec));
    const amount = String(Math.max(1, Math.round(vol * scale)));
    const ts = Number(t.ts || t.time || 0);
    const time = ts > 1e12 ? ts : (ts > 1e9 ? ts * 1000 : Date.now());
    pushTokenActivity({
      dir,
      tick,
      protocol: 'kcc20',
      amount,
      decimals: dec,
      txId: t.txid || t.txId || '',
      time,
      label: dir === 'out' ? 'Sold' : 'Bought'
    }, use);
  }
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
  const feeRaw = spent > 0 ? Math.max(0, spent - received - sentToOthers) : 0;
  const fee = feeRaw > 0 && feeRaw < 50_000_000_000 ? feeRaw : 0;
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

function overlayTokenOnChain(tok, chainRow) {
  if (!tok) return null;
  if (tok.protocol === 'kas' || tok.tick === 'KAS') return tok;
  if (isVaultActivityLabel(tok.label)) return tok;
  if (tok.dir === 'in') return null;
  if (chainRow?.dir === 'out') return tok;
  return tok;
}

function rowsForWallet(addr, txs, walletName) {
  const tokenActs = loadTokenActivity(addr);
  const chain = Array.isArray(txs) ? txs : [];
  const rows = [];
  const tag = walletName && activityAll ? walletName + ' · ' : '';
  const overlayed = new Set();
  for (const tx of chain) {
    const id = tx.transaction_id || tx.transactionId || '';
    const found = tokenActs.find(a => a.txId && a.txId === id);
    const row = summarizeTx(tx, addr);
    const tok = overlayTokenOnChain(found, row);
    if (found && !tok && found.dir === 'in' && found.tick !== 'KAS') continue;
    if (tok && found) overlayed.add(found.id);
    if (tok) {
      if (isVaultActivityLabel(tok.label)) {
        row.label = tok.tick && tok.tick !== 'KAS' ? `${tok.label} ${tok.tick}` : tok.label;
        if (tok.tick && tok.tick !== 'KAS') row.tokenLabel = activityVal(tok);
      } else if (tok.kind === 'atrade') {
        row.label = (tok.label || (tok.dir === 'in' ? 'A-Trade buy' : 'A-Trade sell')) + (tok.tick ? ' ' + tok.tick : '');
        row.tokenLabel = activityVal(tok);
      } else {
        row.label = (tok.dir === 'in' ? 'Received ' : 'Sent ') + tok.tick;
        row.tokenLabel = activityVal(tok);
      }
    }
    const expl = explainTransaction(tx, { address: addr, vaults: loadVaults() });
    const tickForLogo = tok?.tick || (row.tokenLabel ? '' : 'KAS');
    rows.push({
      kind: 'chain',
      id,
      time: Number(tx.block_time || tx.blockTime || 0),
      dir: row.dir,
      title: tag + row.label,
      badge: tok?.kind === 'atrade' ? 'A-Trade' : '',
      logo: activityTickLogo(tickForLogo || tok?.tick || 'KAS', tok?.protocol, tok?.image),
      sub: [tok ? (tok.protocol === 'krc20' ? 'KRC-20' : (tok.protocol === 'kas' ? 'KAS' : 'KCC20')) : expl.title, tok?.note || '', id ? id.slice(0, 10) + '…' : '', new Date(tx.block_time || Date.now()).toLocaleString()].filter(Boolean).join(' · '),
      val: row.tokenLabel || ((row.dir === 'in' ? '+' : '−') + formatAmount(row.amount || 0)),
      feeLine: (tok && tok.protocol !== 'kas' && tok.tick !== 'KAS')
        ? (tok.note || '')
        : (row.fee > 0 && row.fee < 50_000_000_000 ? `fee ${formatAmount(row.fee)} KAS` : (tok?.note || row.note || '')),
      tokId: tok?.id || ''
    });
  }
  for (const a of tokenActs) {
    if (overlayed.has(a.id)) continue;
    const proto = a.protocol === 'krc20' ? 'KRC-20' : (a.protocol === 'kas' || a.tick === 'KAS' ? 'KAS' : 'KCC20');
    const vaultish = isVaultActivityLabel(a.label);
    const lab = a.label || (a.dir === 'in' ? 'Received' : 'Sent');
    const titleCore = vaultish
      ? (a.tick && a.tick !== 'KAS' ? `${lab} ${a.tick}` : lab)
      : (lab + (a.tick ? ' ' + a.tick : ''));
    rows.push({
      kind: 'token',
      id: a.txId || '',
      actId: a.id,
      time: Number(a.time || 0),
      dir: a.dir,
      title: tag + titleCore,
      badge: a.kind === 'atrade' ? 'A-Trade' : '',
      logo: activityTickLogo(a.tick, a.protocol, a.image),
      sub: [proto, a.note || '', a.txId ? a.txId.slice(0, 10) + '…' : (vaultish ? 'this device' : 'live credit'), new Date(a.time || Date.now()).toLocaleString()].filter(Boolean).join(' · '),
      val: activityVal(a),
      feeLine: a.note || (a.txId ? '' : (vaultish ? 'Saved on this device' : 'Indexed to this wallet')),
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
        <div class="dir">${r.logo || (r.dir === 'in' ? '↓' : '↑')}</div>
        <div class="meta">
          <b>${esc(r.title)}${r.badge ? ` <span class="act-badge">${esc(r.badge)}</span>` : ''}</b>
          <span>${esc(r.sub)}</span>
        </div>
        <div class="val ${r.dir === 'in' ? 'in' : 'out'}">${esc(r.val)}${r.feeLine ? `<small>${esc(r.feeLine)}</small>` : ''}
          ${r.id ? `<button type="button" class="copy-chip" data-copy="${esc(r.id)}">Copy ID</button>` : ''}
        </div>
      </button>`).join('');
}

const BUILD_PHASES = [
  'SHA-256 of { aiOutput, model, time }. Same fingerprint the Node MVP returns from POST /api/v1/anchor-truth.',
  'Kaspa tx: 1 sompi dust + payload = the 64-char hash. Bitcoin called this OP_RETURN. Kaspa uses the tx payload field.',
  'Sign in this wallet (PIN) and submit over wRPC — same path as Send. MVP status: PENDING_BLOCKDAG_INCLUSION.',
  'Once accepted on L1 the hash is public proof. Kaspa Hub grant: AI integrity without a new chain or a custodian.'
];

function setBuildPhase(i) {
  const n = Math.max(0, Math.min(3, Number(i) || 0));
  document.querySelectorAll('#build-screen .build-phase').forEach(b => {
    b.classList.toggle('on', Number(b.dataset.phase) === n);
  });
  if ($('build-copy')) $('build-copy').textContent = BUILD_PHASES[n];
}

function showBuildApp(name) {
  const view = name || 'home';
  ['home', 'studio', 'truth'].forEach(v => {
    $('app-' + v)?.classList.toggle('hidden', v !== view);
  });
  $('build-back')?.classList.toggle('hidden', view === 'home');
  if ($('build-title')) {
    $('build-title').textContent = view === 'studio' ? 'Faceless Studio' : (view === 'truth' ? 'Proof of Fact' : 'Apps');
  }
  if (view === 'truth') setBuildPhase(0);
  if (view === 'studio') {
    $('studio-url')?.classList.toggle('hidden', $('studio-engine')?.value !== 'server');
  }
  if (view !== 'studio') {
    $('app-studio')?.classList.remove('playing', 'working');
    const v = $('studio-video');
    if (v) { v.pause(); }
  }
}

function openBuildRoadmap() {
  openTtt();
}

function openTtt() {
  haptic();
  const frame = $('ttt-frame');
  if (frame) {
    if (!frame.dataset.kcc20Bound) {
      frame.dataset.kcc20Bound = '1';
      frame.addEventListener('load', () => pingTttDappFrame(frame));
    }
    if (!frame.getAttribute('src')) frame.src = 'https://tttz.xyz/?kcc20_browser=1';
    else pingTttDappFrame(frame);
  }
  $('ttt-screen')?.classList.remove('hidden');
  $('ttt-screen')?.setAttribute('aria-hidden', 'false');
  $('tabbar')?.classList.remove('show');
}

function notifyTttTokenSent(payload) {
  const win = $('ttt-frame')?.contentWindow;
  if (!win) return;
  const msg = { ns: 'kcc20', type: 'event', event: 'tokenSent', payload };
  for (const o of ['https://tttz.xyz', 'https://www.tttz.xyz']) {
    try { win.postMessage(msg, o); } catch {}
  }
}

function openTttFund() {
  haptic();
  if (isTestnet()) { toast('TTT credits are mainnet KKDAG. Switch off TN10.'); return; }
  if (isTttTreasuryWallet()) {
    toast('Home chip is ews. Switch to Wallet 1 (ax6) — treasury never Funds.');
    return;
  }
  const have = kkdagsHeld(kccHoldings);
  if (!(have > 0)) {
    toast('Buy KKDAG on Home → Tokens first, then Fund TTT');
    return;
  }
  const dest = TTT_TREASURY;
  const max = Math.floor(have);
  const start = String(Math.min(10, max) || 1);
  openSheet('Fund TTT with KKDAG', `
    <p class="muted" style="text-align:left;padding:0 0 10px;"><b>PAYING FROM ${esc(wallet?.name || 'this wallet')}</b> — the Home chip. Treasury ews never signs this.</p>
    <div class="kv kv-stack"><span class="k">From</span><span class="v">${esc(wallet?.address || '')}</span></div>
    <div class="kv"><span class="k">This bag holds</span><span class="v">${esc(String(have))} KKDAG</span></div>
    <div class="kv kv-stack"><span class="k">To ews</span><span class="v">${esc(dest)}</span></div>
    <div class="field"><label>Amount (KKDAG)</label>
      <div class="dest-row">
        <input id="ttt-fund-amt" type="text" inputmode="decimal" value="${esc(start)}">
        <button class="max-btn" id="ttt-fund-max" type="button">Max</button>
      </div>
    </div>
  `, {
    confirm: 'Sign & send',
    gold: true,
    onConfirm: async () => {
      const amount = String($('ttt-fund-amt')?.value || '').trim();
      if (!(Number(amount) > 0)) throw new Error('Enter how many KKDAG');
      if (Number(amount) > have + 1e-9) throw new Error('More than you hold');
      setSheetStatus('Signing KKDAG send…');
      const result = await dappSendToken({ tick: 'KKDAG', amount, dest });
      notifyTttTokenSent(result);
      closeSheet();
      toast('Sent ' + amount + ' KKDAG to TTT');
      openSheet('KKDAG sent to TTT', `
        <div class="kv"><span class="k">Amount</span><span class="v">${esc(amount)} KKDAG</span></div>
        <div class="kv kv-stack"><span class="k">To</span><span class="v">${esc(dest)}</span></div>
        ${txidBlock(result.txId)}
        <p class="muted" style="text-align:left;padding-top:8px;">KKDAG is in the treasury cell (kaspa:p on explorers). Owner is ews <b>qq5yhvly…334ews</b>. This payer wallet cannot spend it. Open the treasury key in KCC20 (You → add wallet → paste that hex) and tap Sweep.</p>
      `, { confirm: 'Done', cancel: false, onConfirm: () => closeSheet() });
    }
  });
  $('ttt-fund-max')?.addEventListener('click', () => {
    if ($('ttt-fund-amt')) $('ttt-fund-amt').value = String(max);
  });
}

function isTttTreasuryWallet() {
  return !!(wallet?.address && sameAddrPayload(wallet.address, TTT_TREASURY));
}

function paintTreasuryHome() {
  const bar = $('btn-dd-treasury');
  if (!bar) return;
  const on = isTttTreasuryWallet();
  bar.classList.toggle('hidden', !on);
  if (!on) return;
  const n = Math.floor(kkdagsHeld(kccHoldings));
  const lab = $('dd-treasury-lab');
  if (lab) lab.textContent = 'DD treasury · ' + n.toLocaleString() + ' KKDAG';
  refreshDdInbox().catch(() => {});
}

async function refreshDdInbox() {
  if (!wallet?.address || !isTttTreasuryWallet()) {
    kkdCellCache = [];
    return;
  }
  kkdCellCache = await kkdagCellsFor(wallet.address);
  purgeDdPayVaults();
  if (currentTab === 'home') renderHoldings();
  if (currentTab === 'vault') renderVault();
}

async function treasuryKkdagOnChain() {
  try {
    const body = await fetch(KRON_IDX + '/token/KKDAG/address/' + encodeURIComponent(TTT_TREASURY), { cache: 'no-store' });
    const j = await body.json();
    return Number(j?.result?.balance ?? 0);
  } catch {
    return null;
  }
}

async function kkdagCellsFor(addr) {
  const rows = await fetchKronTokenUtxos('KKDAG', addr);
  const out = [];
  for (const c of rows || []) {
    const amt = String(c.amount || '0');
    if (!(Number(amt) > 0)) continue;
    const txid = c.outpoint?.transactionId || '';
    let pAddr = '';
    try {
      if (c.redeemScriptHex) {
        const built = await p2shFromRedeemHex(c.redeemScriptHex);
        pAddr = built?.address || String(built || '');
      }
    } catch {}
    out.push({ amt, txid, pAddr: pAddr || '', index: Number(c.outpoint?.index ?? 0) });
  }
  return out.sort((a, b) => Number(b.amt) - Number(a.amt));
}

async function openTreasurySweep() {
  haptic();
  const onChain = await treasuryKkdagOnChain();
  const mine = isTttTreasuryWallet();
  if (!mine) {
    openSheet('Sweep DD treasury (ews)', `
      <p class="muted" style="text-align:left;padding:0 0 10px;">You are on the payer wallet. Switch to <b>Wallet 3</b> (qq5yhvly…ews) — that key already holds the KKDAG. Home then shows Sweep.</p>
      <div class="kv kv-stack"><span class="k">Treasury (ews)</span><span class="v">${esc(TTT_TREASURY)}</span></div>
      <div class="kv"><span class="k">On-chain KKDAG</span><span class="v">${onChain == null ? '…' : esc(Number(onChain).toLocaleString())}</span></div>
      <div class="kv"><span class="k">This phone</span><span class="v">${esc(shortAddr(wallet?.address || '', 10, 6))}</span></div>
    `, {
      confirm: 'Copy ews address',
      gold: true,
      onConfirm: async () => {
        await navigator.clipboard.writeText(TTT_TREASURY);
        toast('Treasury address copied');
        closeSheet();
      }
    });
    return;
  }
  try { await refreshTokenHoldings(); } catch {}
  const have = kkdagsHeld(kccHoldings);
  const cells = await kkdagCellsFor(wallet.address).catch(() => []);
  if (!(have > 0) && !cells.length) {
    toast(onChain ? ('Idx shows ' + Number(onChain).toLocaleString() + ' KKDAG — tap Refresh, then Sweep.') : 'No KKDAG on this treasury key yet');
    return;
  }
  const cellRows = cells.length
    ? cells.map(c => `
        <div class="kv kv-stack">
          <span class="k">${esc(Number(c.amt).toLocaleString())} KKDAG · cell ${esc(String(c.index))}</span>
          <span class="v">${esc(c.pAddr || (c.txid ? c.txid.slice(0, 18) + '…' : ''))}</span>
        </div>`).join('')
    : '<p class="muted">Cells loading from KRON idx…</p>';
  const others = otherWallets();
  const dest0 = others.find(w => !sameAddrPayload(w.address, TTT_TREASURY))?.address || others[0]?.address || '';
  openSheet('Cash out ews KKDAG', `
    <p class="muted" style="text-align:left;padding:0 0 10px;">This is the <b>treasury</b> bag. Sweep moves KKDAG <em>off ews</em> to another wallet. Fund is the opposite (ax6 pays ews). Do not Max this unless you mean to empty ews.</p>
    <div class="kv"><span class="k">Ews holds</span><span class="v">${esc(Math.floor(have).toLocaleString())} KKDAG</span></div>
    ${cellRows}
    <div class="field"><label>Amount to move off ews</label>
      <input id="dd-sweep-amt" type="text" inputmode="decimal" value="">
    </div>
  `, {
    confirm: dest0 ? 'Review send to ' + (others.find(w => w.address === dest0)?.name || 'wallet') : 'Review send',
    gold: true,
    onConfirm: () => {
      const amt = String($('dd-sweep-amt')?.value || '').trim();
      if (!(Number(amt) > 0)) throw new Error('Enter how many KKDAG to move. Leave empty and cancel if you only meant to Fund.');
      closeSheet();
      openSend({
        assetKey: 'kcc20:KKDAG',
        destination: dest0,
        amount: amt
      });
    }
  });
}

function closeTtt() {
  $('ttt-screen')?.classList.add('hidden');
  $('ttt-screen')?.setAttribute('aria-hidden', 'true');
  if (wallet && sessionOpen()) $('tabbar')?.classList.add('show');
}

function closeBuildRoadmap() {
  try { window.speechSynthesis?.cancel(); } catch {}
  $('build-screen')?.classList.add('hidden');
  $('build-screen')?.setAttribute('aria-hidden', 'true');
  showBuildApp('home');
  if (wallet && sessionOpen()) $('tabbar')?.classList.add('show');
}

function fmtStudioTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function syncStudioPauseBtn() {
  const v = $('studio-video');
  const b = $('studio-pause');
  if (!v || !b) return;
  b.textContent = v.paused ? 'Play' : 'Pause';
}

function enterStudioPlayer(data) {
  const v = $('studio-video');
  const a = $('studio-dl');
  const seek = $('studio-seek');
  $('studio-player')?.classList.remove('hidden');
  $('app-studio')?.classList.remove('working');
  $('app-studio')?.classList.add('playing');
  if (v) {
    v.src = data.url;
    v.controls = false;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    const play = v.play();
    if (play && play.catch) play.catch(() => syncStudioPauseBtn());
  }
  if (a) {
    a.href = data.url;
    a.download = 'faceless.mp4';
    a.textContent = 'Save MP4';
  }
  if (seek) seek.value = 0;
  if ($('studio-status')) {
    $('studio-status').textContent = (data.title || 'Film') + ' · MP4 · tap Pause · voice is in the file';
  }
  syncStudioPauseBtn();
}

function toggleStudioPlay() {
  const v = $('studio-video');
  if (!v || !v.src) return;
  if (v.paused) v.play().catch(() => {});
  else v.pause();
  syncStudioPauseBtn();
}

function setStudioStep(name, cls) {
  document.querySelectorAll('#studio-steps li').forEach(li => {
    if (cls === 'reset') { li.classList.remove('on', 'done'); return; }
    if (li.dataset.st === name) {
      li.classList.remove('on', 'done');
      if (cls) li.classList.add(cls);
    }
  });
}

async function generateStudio() {
  const topic = ($('studio-topic')?.value || '').trim();
  if (topic.length < 4) { toast('Write a longer topic'); return; }
  const n = Math.max(4, Math.min(8, Number($('studio-scenes')?.value) || 5));
  const music = !!$('studio-music')?.checked;
  const engine = $('studio-engine')?.value || 'phone';
  const btn = $('studio-go');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  setStudioStep('', 'reset');
  setStudioStep('script', 'on');
  if ($('studio-status')) $('studio-status').textContent = 'Starting…';
  $('studio-stills').innerHTML = '';
  $('studio-player')?.classList.add('hidden');
  $('app-studio')?.classList.remove('playing');
  $('app-studio')?.classList.add('working');
  const vid0 = $('studio-video');
  if (vid0) { vid0.pause(); vid0.removeAttribute('src'); }
  const onProgress = (ev, data) => {
    if (ev === 'script' || ev === 'script_done') {
      setStudioStep('script', ev === 'script_done' ? 'done' : 'on');
      if (data?.title && $('studio-status')) $('studio-status').textContent = data.title;
      if (data?.scenes) {
        const box = $('studio-stills');
        if (box) {
          box.innerHTML = '';
          data.scenes.forEach(s => {
            if (s.canvas) box.appendChild(s.canvas);
          });
        }
      }
    }
    if (ev === 'voice') { setStudioStep('script', 'done'); setStudioStep('voice', 'on'); }
    if (ev === 'image' || ev === 'image_done') {
      setStudioStep('voice', 'done'); setStudioStep('image', 'on');
      if (data?.scenes) {
        const box = $('studio-stills');
        if (box && !box.childElementCount) {
          data.scenes.forEach(s => { if (s.canvas) box.appendChild(s.canvas); });
        }
      }
    }
    if (ev === 'film') { setStudioStep('image', 'done'); setStudioStep('film', 'on'); }
    if (typeof data === 'string' && $('studio-status')) $('studio-status').textContent = data;
    if (ev === 'done' && data?.url) {
      setStudioStep('film', 'done');
      enterStudioPlayer(data);
    }
  };
  try {
    if (engine === 'server') {
      const url = ($('studio-url')?.value || 'http://127.0.0.1:8000').trim();
      await runServerStudio({
        baseUrl: url,
        topic,
        voice: $('studio-voice')?.value || 'nova',
        nScenes: n,
        music,
        onProgress
      });
    } else {
      await runPhoneStudio({
        topic, nScenes: n, music,
        voice: $('studio-voice')?.value || 'nova',
        liveCanvas: $('studio-canvas'),
        onProgress
      });
    }
    toast('MP4 ready');
  } catch (e) {
    $('app-studio')?.classList.remove('working');
    if ($('studio-status')) $('studio-status').textContent = errText(e);
    toast(errText(e));
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Generate MP4'; }
}

async function stampTruth() {
  const aiOutput = ($('truth-in')?.value || '').trim();
  if (!aiOutput) { toast('Paste AI text first'); return; }
  const modelMetadata = { model: 'kcc20-wallet', build: BUILD };
  const dataString = JSON.stringify({ aiOutput, modelMetadata, timestamp: Date.now() });
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataString));
  const truthHash = bytesToHex(new Uint8Array(buf));
  window.__truthPayload = {
    kaspaTargetAddress: wallet?.address || '',
    microKasAmount: 1,
    opReturnData: truthHash,
    kaspaPayloadHex: truthHash,
    status: 'PENDING_BLOCKDAG_INCLUSION'
  };
  if ($('truth-hash')) $('truth-hash').textContent = truthHash;
  if ($('truth-status')) {
    $('truth-status').textContent = 'Fingerprint ready. Next: dust tx to your address with this hash in payload. Not broadcast yet.';
  }
  setBuildPhase(1);
  toast('Truth hash ready');
}

async function copyTruthHash() {
  const h = $('truth-hash')?.textContent || '';
  if (!h || h.includes('appears')) { toast('Stamp first'); return; }
  await copyText(h);
}

function youInitial(name) {
  return String(name || 'K').replace(/^Wallet\s*/i, '').slice(0, 1).toUpperCase() || 'K';
}

function paintYouLook() {
  const av = $('profile-avatar');
  if (av) {
    if (wallet?.avatar) {
      av.innerHTML = `<img alt="" src="${wallet.avatar}">`;
      av.classList.add('has-img');
    } else {
      av.textContent = youInitial(wallet?.name);
      av.classList.remove('has-img');
    }
  }
  const cover = $('you-cover');
  if (cover) {
    if (wallet?.cover) {
      cover.style.backgroundImage = `linear-gradient(180deg, rgba(8,8,10,0.12), rgba(8,8,10,0.42)), url("${wallet.cover}")`;
      cover.classList.add('has-img');
    } else {
      cover.style.backgroundImage = '';
      cover.classList.remove('has-img');
    }
  }
}

function renderProfile() {
  if (!wallet) return;
  const addr = wallet.address || '';
  if ($('profile-addr')) $('profile-addr').textContent = addr;
  if ($('profile-bal')) $('profile-bal').textContent = formatAmount(balanceSompi);
  if ($('profile-script')) $('profile-script').textContent = String(addr).startsWith('kaspa:p') ? 'P2SH' : 'P2PK';
  if ($('profile-name')) $('profile-name').innerHTML = walletTitleHtml(wallet);
  paintYouLook();
  if ($('profile-utxos')) {
    const n = Array.isArray(utxos) ? utxos.length : 0;
    $('profile-utxos').textContent = n === 1 ? '1' : String(n);
  }
  const ex = $('profile-explorer');
  if (ex && addr) {
    ex.href = explorerAddr(addr);
    ex.textContent = 'Explorer';
  }
  if ($('profile-kns-name')) {
    $('profile-kns-name').innerHTML = wallet.knsDomain
      ? `${esc(wallet.knsDomain)}${knsCheck()}`
      : 'Not linked';
  }
  refreshKnsQuiet();
  paintDesk();
  const box = $('wallet-list');
  if (box) {
    const list = loadWalletList();
    box.innerHTML = list.map(w => {
      const active = w.id === wallet.id;
      const snap = walletSnap[w.address] || {};
      const sompi = active ? balanceSompi : snap.sompi;
      const kasTxt = sompi == null ? '…' : `${formatAmount(sompi)} KAS`;
      const face = w.avatar
        ? `<img alt="" src="${w.avatar}">`
        : youInitial(w.name);
      return `
      <button class="row wallet-row" type="button" data-switch-wallet="${esc(w.id)}">
        <div class="you-wava ${active ? 'on' : ''}">${face}</div>
        <div style="min-width:0;flex:1">
          <div class="title">${walletTitleHtml(w)}</div>
          <div class="sub">${esc(walletKns(w) || shortAddr(w.address, 10, 6))}</div>
        </div>
        <div class="amt"><b>${esc(kasTxt)}</b></div>
        <span class="chev">${active ? 'Now' : 'Use'}</span>
      </button>`;
    }).join('') || `<div class="empty">No wallets</div>`;
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

function loadLook() {
  try { return JSON.parse(localStorage.getItem(LOOK_KEY) || '{}') || {}; } catch { return {}; }
}

function saveLook(look) {
  localStorage.setItem(LOOK_KEY, JSON.stringify(look || {}));
}

function applyWallpaper(dataUrl) {
  const poster = document.querySelector('.bg-poster');
  if (dataUrl) {
    if (poster) {
      poster.src = dataUrl;
      poster.classList.remove('hidden');
    }
    document.body.style.backgroundImage = `url("${dataUrl}")`;
    return;
  }
  document.body.style.backgroundImage = '';
  if (poster) {
    poster.src = 'assets/bg.jpg';
    poster.classList.remove('hidden');
  }
}

function applyLook() {
  applyWallpaper(loadLook().wallpaper || '');
}

function readImageFile(file, { maxW = 960, maxH = 540, quality = 0.78, square = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Choose an image'));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error('Image is too large (12 MB max)'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      if (square) {
        const s = Math.min(nw, nh);
        const size = Math.min(maxW || 256, s);
        c.width = size;
        c.height = size;
        ctx.drawImage(img, (nw - s) / 2, (nh - s) / 2, s, s, 0, 0, size, size);
      } else {
        const scale = Math.min(1, maxW / nw, maxH / nh);
        c.width = Math.max(1, Math.round(nw * scale));
        c.height = Math.max(1, Math.round(nh * scale));
        ctx.drawImage(img, 0, 0, c.width, c.height);
      }
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

function recompressDataUrl(dataUrl, quality = 0.55, maxW = 720, maxH = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / (img.width || 1), maxH / (img.height || 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Could not compress image'));
    img.src = dataUrl;
  });
}

async function persistYouImage(kind, dataUrl) {
  let url = dataUrl;
  const trySave = () => {
    if (kind === 'wallpaper') {
      const look = loadLook();
      look.wallpaper = url;
      saveLook(look);
      applyWallpaper(url);
      return;
    }
    if (!wallet) throw new Error('No wallet');
    wallet[kind] = url;
    saveWallet();
    paintYouLook();
  };
  try {
    trySave();
  } catch {
    url = await recompressDataUrl(dataUrl, 0.5, kind === 'avatar' ? 160 : 640, kind === 'avatar' ? 160 : 280);
    try {
      trySave();
    } catch {
      if (kind !== 'wallpaper' && wallet) wallet[kind] = '';
      throw new Error('Not enough space on this device for that image');
    }
  }
  if (kind !== 'wallpaper') renderProfile();
  toast(kind === 'avatar' ? 'Photo saved' : (kind === 'cover' ? 'Cover saved' : 'Wallpaper saved'));
}

async function pickYouImage(kind, file) {
  if (!file) return;
  const opts = kind === 'avatar'
    ? { maxW: 256, maxH: 256, quality: 0.8, square: true }
    : (kind === 'cover' ? { maxW: 900, maxH: 320, quality: 0.76 } : { maxW: 1280, maxH: 720, quality: 0.72 });
  const dataUrl = await readImageFile(file, opts);
  await persistYouImage(kind, dataUrl);
}

function openLookSheet() {
  haptic();
  const look = loadLook();
  openSheet('Look', `
    <p class="muted" style="text-align:left;padding:0 0 10px;">Name this wallet, then set photo, cover, and wallpaper. The name shows on Home instead of a long address.</p>
    <div class="field"><label>Wallet name</label>
      <input id="look-name" maxlength="32" placeholder="e.g. Treasury" value="${esc(wallet?.name || '')}" autocomplete="off">
    </div>
    <div class="kv"><span class="k">Photo</span><span class="v">${wallet?.avatar ? 'Custom' : 'Initial'}</span></div>
    <div class="kv"><span class="k">Cover</span><span class="v">${wallet?.cover ? 'Custom' : 'Default'}</span></div>
    <div class="kv"><span class="k">Wallpaper</span><span class="v">${look.wallpaper ? 'Custom' : 'KCC20 default'}</span></div>
    <div class="btn-row" style="margin:12px 0 8px;">
      <button class="btn btn-gold" id="look-photo" type="button">Photo</button>
      <button class="btn btn-glass" id="look-cover" type="button">Cover</button>
    </div>
    <button class="btn btn-glass" id="look-wall" type="button" style="margin-bottom:8px;">App wallpaper</button>
    <div class="btn-row">
      <button class="btn btn-glass" id="look-reset-photos" type="button">Reset photos</button>
      <button class="btn btn-glass" id="look-reset-wall" type="button">Reset wallpaper</button>
    </div>
  `, {
    confirm: 'Save name',
    gold: true,
    cancelLabel: 'Close',
    onConfirm: () => {
      applyWalletName($('look-name')?.value);
      closeSheet();
    }
  });
  $('look-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      try { applyWalletName($('look-name')?.value); closeSheet(); } catch (err) { toast(errText(err)); }
    }
  });
  $('look-photo').onclick = () => $('you-avatar-file')?.click();
  $('look-cover').onclick = () => $('you-cover-file')?.click();
  $('look-wall').onclick = () => $('you-wall-file')?.click();
  $('look-reset-photos').onclick = () => {
    if (!wallet) return;
    wallet.avatar = '';
    wallet.cover = '';
    saveWallet();
    paintYouLook();
    renderProfile();
    toast('Photos reset');
    closeSheet();
  };
  $('look-reset-wall').onclick = () => {
    const next = loadLook();
    next.wallpaper = '';
    saveLook(next);
    applyWallpaper('');
    toast('Wallpaper reset');
    closeSheet();
  };
}

function seedScorpionLog() {
  const log = $('scorpion-log');
  if (log && !log.childElementCount) {
    log.innerHTML = `<div class="bubble ai">I am Scorpion. I translate any Kaspa tx into plain English — lock vs send vs sweep vs KRC-20. Paste a txid or ask <em>what was my last lock?</em></div>`;
  }
}

function bindScorpionSheet() {
  $('scorpion-send')?.addEventListener('click', () => sendScorpion().catch(err => toast(errText(err))));
  $('scorpion-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendScorpion().catch(err => toast(errText(err)));
  });
  seedScorpionLog();
}

function openScorpionSheet() {
  haptic();
  openSheet('Scorpion', `
    <div class="chat scorpion-chat" id="scorpion-log"></div>
    <div class="chatbar" style="margin-top:10px;">
      <input id="scorpion-input" placeholder="Paste a txid or ask “last lock”" autocomplete="off">
      <button class="send-orb" id="scorpion-send" type="button">↑</button>
    </div>
  `, { confirm: 'Close', cancel: false });
  bindScorpionSheet();
}

function openBotSheet() {
  haptic();
  openSheet('Bot', `
    <div class="desk-box" style="padding:0;margin:0;">
      <p class="at-tiny">Covenant++ treasury (kaspa:p, you own it) plus a till key for KRON. Fund from any of your wallets. Sign before it trades. Thin books skipped. No guaranteed profit.</p>
      <p class="at-tiny" id="desk-wallet-line">No desk wallet yet.</p>
      <div class="at-row">
        <label class="field grow"><span>Research ticker</span>
          <input id="desk-tick" placeholder="KKDAG" value="KKDAG" spellcheck="false">
        </label>
      </div>
      <div class="btn-row" style="margin-top:8px;">
        <button class="btn btn-glass" id="desk-research" type="button">Research + fact-check</button>
        <button class="btn btn-glass" id="desk-new" type="button">New desk wallet</button>
      </div>
      <div class="btn-row" style="margin-top:8px;">
        <button class="btn btn-glass" id="desk-fund" type="button">Send it KAS</button>
        <button class="btn btn-glass" id="desk-keys" type="button">Show desk key</button>
      </div>
      <div class="at-row" style="margin-top:8px;">
        <label class="field small"><span>Size KAS</span>
          <input id="desk-size" type="number" min="0.05" step="0.05" value="0.15">
        </label>
        <label class="field small"><span>Max KAS</span>
          <input id="desk-max" type="number" min="0.15" step="0.15" value="1">
        </label>
      </div>
      <button class="btn btn-gold" id="desk-deploy" type="button" style="margin-top:8px;">Sign and deploy desk</button>
      <button class="btn btn-glass" id="desk-stop" type="button" style="margin-top:8px;">Stop desk</button>
      <p class="at-quote" id="desk-status">Idle.</p>
      <div class="desk-verdict" id="desk-verdict"></div>
      <ul class="desk-facts" id="desk-facts"></ul>
    </div>
  `, { confirm: 'Close', cancel: false });
  bindDeskSheet();
  paintDesk();
}

function bindDeskSheet() {
  click('desk-research', () => researchDeskTick().catch(err => toast(errText(err))));
  click('desk-new', () => createDeskWallet().catch(err => toast(errText(err))));
  click('desk-fund', fundDesk);
  click('desk-keys', () => showDeskKey().catch(err => toast(errText(err))));
  click('desk-deploy', () => deployDesk().catch(err => toast(errText(err))));
  click('desk-stop', stopDesk);
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
  const stack = /^(from|to|txid|address)$/i;
  const factors = (expl.factors || []).map(f => {
    const long = stack.test(f.k) || String(f.v || '').length > 36;
    const val = esc(f.v).replace(/\n/g, '<br>');
    return `<div class="kv${long ? ' kv-stack' : ''}"><span class="k">${esc(f.k)}</span><span class="v">${val}</span></div>`;
  }).join('');
  const bullets = (expl.bullets || []).map(b => `<li>${esc(b)}</li>`).join('');
  return `
    <div class="scorpion-card">
      <span class="kind-pill">${esc(expl.title || expl.kind || 'Scorpion')}</span>
      <p class="scorpion-lede">${esc(expl.headline)}</p>
      ${bullets ? `<ul class="scorpion-bullets">${bullets}</ul>` : ''}
      <div class="scorpion-factors">${factors}</div>
      ${expl.next ? `<p class="muted scorpion-next">${esc(expl.next)}</p>` : ''}
      ${expl.id ? txidBlock(expl.id) : ''}
    </div>
  `;
}

function tokenCtxForTx(id) {
  if (!id) return null;
  const want = String(id);
  const wallets = loadWalletList();
  const addrs = [...new Set([wallet?.address, ...wallets.map(w => w.address)].filter(Boolean))];
  for (const addr of addrs) {
    const ev = loadTokenActivity(addr).find(x => x.txId && x.txId === want);
    if (!ev || ev.protocol === 'kas' || ev.tick === 'KAS') continue;
    const w = wallets.find(x => x.address === addr);
    return {
      tick: ev.tick,
      amount: ev.amount,
      decimals: ev.decimals,
      dir: ev.dir,
      label: ev.label,
      display: formatTokenUnits(ev.amount, ev.decimals) + ' ' + ev.tick,
      walletName: w?.name || wallet?.name || 'this wallet'
    };
  }
  return null;
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
  const tok = tokenCtxForTx(id);
  const expl = explainTransaction(tx, {
    address: wallet?.address || '',
    vaults: loadVaults(),
    walletName: tok?.walletName || wallet?.name || 'this wallet',
    token: tok
  });
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
        KRON_IDX + '/token/' +
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
  const res = await fetch(`${API_BASE()}/transactions/${id}?resolve_previous_outpoints=light`);
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
  refreshActivityNow();
  tickLive(true);
  kickTokenRefresh();
  refreshAllWalletSnaps({ tokens: true }).catch(() => {});
}

function startLiveSync() {
  stopLiveSync();
  tickLive(true);
  liveTimer = setInterval(() => tickLive(false), liveFast ? 1500 : 3000);
  startKccWatch();
}

function stopLiveSync() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  stopKccWatch();
}

function startKccWatch() {
  if (tokenStream || isTestnet() || typeof EventSource === 'undefined') return;
  try {
    const es = new EventSource(KRON_IDX + '/stream');
    const kick = () => {
      const now = Date.now();
      if (now - kronKickAt < 400) return;
      kronKickAt = now;
      setLiveFast(true);
      kickTokenRefresh();
      if (currentTab === 'activity') refreshActivityNow();
    };
    es.addEventListener('update', kick);
    es.onmessage = kick;
    tokenStream = es;
  } catch {}
}

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
  if (full || !price) refreshKasPrice().catch(() => {});
  try {
    migrateReceiveBook(wallet);
    const owned = ownedAddresses(wallet);
    const [bals, ownedRaw] = await Promise.all([
      Promise.all(owned.map(o => fetchAddressBalance(o.address).catch(() => 0))),
      fetchOwnedUtxos(wallet).catch(() => null)
    ]);
    if (!wallet || wallet.address !== addr) return;
    let nextBal = bals.reduce((a, n) => a + Number(n || 0), 0);
    owned.forEach((o, i) => {
      if (o.role !== 'home' && Number(bals[i] || 0) > 0) markAddressUsed(wallet, o.address, true);
    });
    let ownedBag = ownedRaw;
    if (kaswareSigning(wallet) || walletIsKaswareChip(wallet)) {
      try {
        const kw = await fetchKaswareUtxos(wallet.address);
        const cleaned = (kw || []).map(u => validateAndCleanUtxo(u)).filter(Boolean);
        if (cleaned.length) ownedBag = cleaned;
      } catch {}
    }
    if (Array.isArray(ownedBag)) {
      const keepOptimistic = Date.now() < hushUtxosUntil
        && Array.isArray(utxos) && utxos.length === 1
        && ownedBag.length > 1;
      if (!keepOptimistic) utxos = ownedBag;
      const uSum = (keepOptimistic ? utxos : ownedBag).reduce((a, e) => {
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
          fetch(`${API_BASE()}/info/price?stringOnly=false`),
          fetch(`${API_BASE()}/addresses/${addr}/full-transactions?limit=20&resolve_previous_outpoints=light`)
        ]);
        if (!wallet || wallet.address !== addr) return;
        if (pRes.ok) {
          const data = await pRes.json();
          const n = Number(data.price ?? data ?? 0);
          if (n > 0) {
            price = n;
            if ($('card-usd')) $('card-usd').textContent = `≈ ${usd(kas())}`;
          }
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
    if (full || balChanged || liveFast || currentTab === 'activity' || now - lastTokenFetch > (currentTab === 'activity' ? 1500 : 8000)) kickTokenRefresh();
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
      try {
        const map = { ...kronPx };
        try {
          const mkts = await kronMarkets();
          for (const m of mkts || []) {
            const tick = String(m.tick || '').toUpperCase();
            if (!tick) continue;
            const q = liveQuote(m);
            map[tick] = { price: q.price, change24h: q.change24h };
          }
        } catch {}
        const ticks = [...new Set((kccHoldings || []).map(t => String(t.ticker || '').toUpperCase()).filter(Boolean))].slice(0, 16);
        await Promise.all(ticks.map(async tick => {
          try {
            const info = await lookupKronTick(tick);
            const prev = map[tick] || {};
            const q = liveQuote(info);
            map[tick] = {
              price: q.price || prev.price || 0,
              change24h: Number.isFinite(Number(info.change24h)) ? Number(info.change24h) : Number(prev.change24h || 0)
            };
          } catch {}
        }));
        kronPx = map;
        await hydrateKronPnl(addr).catch(() => {});
      } catch {}
    }
    if (krc.status === 'fulfilled') krcHoldings = mergeFreshHoldings(krcHoldings, krc.value);
    tokenLoadErr = kcc.status === 'rejected' ? 'KCC20 indexer unreachable — retrying…' : '';
  } catch (e) {
    tokenLoadErr = errText(e);
  }
  const credits = [];
  if (seenTokens || before.length > 0) {
    const hushToast = Date.now() < hushTokenToastsUntil;
    const after = [...kccHoldings, ...krcHoldings];
    for (const t of after) {
      const prev = before.find(x => (t.tokenId && x.tokenId === t.tokenId) || (x.protocol === t.protocol && x.ticker === t.ticker));
      let d = 0n;
      try {
        const nextAmt = BigInt(t.balance || '0');
        const prevAmt = BigInt(prev?.balance || '0');
        if (nextAmt > prevAmt) d = nextAmt - prevAmt;
      } catch { continue; }
      if (d <= 0n) continue;
      if (!hushToast) {
        toast(`Received ${formatTokenUnits(d, t.decimals)} ${t.ticker}`);
        haptic();
      }
      pushTokenActivity({
        dir: 'in',
        tick: t.ticker,
        protocol: t.protocol || 'kcc20',
        amount: d.toString(),
        decimals: t.decimals,
        label: 'Received',
        note: hushToast ? '' : 'Incoming transfer'
      });
      credits.push({ tick: t.ticker, amount: d.toString(), protocol: t.protocol });
      const recv = currentReceive(wallet, { tick: t.ticker });
      if (recv) markAddressUsed(wallet, recv.address, true);
      saveWallet();
      setLiveFast(true);
      clearTimeout(tokenFastOff);
      tokenFastOff = setTimeout(() => setLiveFast(false), 25000);
    }
  }
  seenTokens = true;
  rememberActiveSnap();
  ingestNewKcc20Cells().catch(() => {});
  ingestKronActivity(addr).catch(() => {});
  ingestKcc20CellActivity(addr).catch(() => {});
  refreshDdInbox().catch(() => {});
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
const ICO_DCA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>';

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
  const ddSweep = kcc && String(token.ticker).toUpperCase() === 'KKDAG' && isTttTreasuryWallet();
  const acts = [
    tkAct('tk-recv', 'Receive', ICO_RECV),
    tkAct('tk-send', 'Send', ICO_SEND),
    ...(ddSweep ? [tkAct('tk-dd-sweep', 'Sweep', ICO_SEND, ' tk-buy')] : []),
    ...(kcc ? [
      tkAct('tk-buy', 'Buy', ICO_BUY, ' tk-buy'),
      tkAct('tk-dca', 'DCA', ICO_DCA, ' tk-dca'),
      tkAct('tk-sell', 'Sell', ICO_SELL, ' tk-sell')
    ] : [])
  ].join('');
  openSheet(token.ticker, `
    <div class="tk-hero">
      <img class="tk-hero-logo" src="${esc(logoSrc)}" alt="" data-tick="${esc(token.ticker || '')}" data-proto="${esc(token.protocol || '')}" data-fb="${esc((token.ticker || '?').slice(0, 3))}" referrerpolicy="no-referrer" decoding="async">
      <div class="tk-amt">${esc(amt)}<small>${esc(token.ticker)}</small></div>
      <div class="tk-meta">${esc(token.name || token.ticker)} · ${esc(proto)}${token.cells ? ' · ' + esc(token.cells) + ' cells' : ''}</div>
    </div>
    <div class="tk-actions${kcc ? ' tk-5' : ' tk-2'}">${acts}</div>
    ${kcc ? `<button class="btn btn-glass tk-more" id="tk-freeze" type="button">${ICO_LOCK} Freeze</button>` : ''}
    <p class="muted" style="padding-top:12px;"><a href="${esc(link)}" target="_blank" rel="noopener" style="color:var(--gold-2)">Open explorer</a></p>
  `, { confirm: false, cancelLabel: 'Close' });
  $('tk-recv')?.addEventListener('click', () => { closeSheet(); openReceive({ token }); });
  $('tk-send')?.addEventListener('click', () => { closeSheet(); openSend({ token, assetKey }); });
  $('tk-dd-sweep')?.addEventListener('click', () => { closeSheet(); openTreasurySweep().catch(e => toast(errText(e))); });
  $('tk-buy')?.addEventListener('click', () => { closeSheet(); openTrade({ tick: token.ticker, side: 'buy' }); });
  $('tk-dca')?.addEventListener('click', () => { closeSheet(); openTrade({ tick: token.ticker, side: 'dca' }); });
  $('tk-sell')?.addEventListener('click', () => { closeSheet(); openTrade({ tick: token.ticker, side: 'sell' }); });
  $('tk-freeze')?.addEventListener('click', () => { closeSheet(); openProduct('kcc20freeze', { tick: token.ticker }); });
}

function validTick(t) {
  return /^[A-Z0-9]{2,12}$/.test(String(t || '').toUpperCase());
}

function fmtPx(n) {
  const x = Number(n || 0);
  if (!(x > 0)) return '—';
  if (x >= 1) return x.toPrecision(4);
  if (x >= 0.001) return x.toPrecision(3);
  return x.toExponential(2);
}

function fmtTok(n) {
  const x = Number(n || 0);
  if (!(x > 0)) return '—';
  if (x >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (x >= 1e3) return (x / 1e3).toFixed(1) + 'k';
  if (x >= 1) return x.toPrecision(4);
  return x.toPrecision(3);
}

function fmtChg(chg) {
  const n = Number(chg || 0);
  if (!n) return '0.0%';
  const pct = Math.abs(n) <= 2 ? n * 100 : n;
  return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
}

function venueLabel(v) {
  if (v === 'cook') return 'K.COM';
  if (v === 'scorpion') return 'Scorpion';
  return 'KRON';
}

function localTnLaunch(tick) {
  const t = String(tick || '').toUpperCase();
  return loadLaunched().find(x => String(x.tick || '').toUpperCase() === t && (!x.network || x.network === 'testnet-10')) || null;
}

function deskUsesCook() {
  if (atSrc === 'cook') return true;
  if (atSrc === 'scorpion' && isTestnet()) return true;
  return false;
}

async function offerTn10ForLaunch(mine) {
  const tick = String(mine.tick || '').toUpperCase();
  openSheet('Your ' + tick + ' is on TN10', `
    <p class="muted" style="text-align:left;">Launch created this token on <b>Cook Testnet-10</b>. The TEST/KRON ticker on mainnet is a different coin. Switch Network to Testnet-10 (kaspatest address) to mint/buy the one you launched.</p>
  `, {
    confirm: 'Switch to TN10',
    gold: true,
    onConfirm: async () => {
      await applyAppNetwork('testnet-10');
      closeSheet();
      openLaunchedToken(mine);
      toast('TN10 on. Buy mints ' + tick + ' from the public minter.');
    }
  });
}

async function renderKronMarkets() {
  const box = $('kron-markets');
  if (!box) return;
  if (!box.dataset.loaded) box.innerHTML = `<div class="empty">Loading KRON markets…</div>`;
  try {
    const rows = (await kronMarkets()).filter(m => validTick(m.tick)).slice(0, 24);
    box.dataset.loaded = '1';
    box.innerHTML = rows.map(m => {
      const chg = Number(m.change24h || 0);
      const chgCls = chg > 0 ? 'up' : (chg < 0 ? 'down' : '');
      const px = m.price ? fmtPx(m.price) + ' KAS' : (m.graduated ? 'Pool' : 'Curve');
      return `
        <button class="row token-row" type="button" data-trade-tick="${esc(m.tick)}">
          ${tokenDot({ ticker: m.tick, protocol: 'kcc20', image: m.logo })}
          <div>
            <div class="title">${esc(m.tick)}</div>
            <div class="sub">${esc(m.graduated ? 'Pool AMM' : 'Curve')} · ${esc(m.name)}</div>
          </div>
          <div class="amt">
            <b>${esc(px)}</b>
            <em class="mkt-chg ${chgCls}">${esc(fmtChg(chg))}</em>
          </div>
        </button>`;
    }).join('') || `<div class="empty">KRON markets unavailable.</div>`;
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(errText(e))}</div>`;
  }
}

function jumpToAtTrade(tick, side) {
  showPage('tokens');
  setAtPane('book');
  setAtSrc('kron');
  openAtDesk({ venue: 'kron', tick: String(tick || 'KKDAG').toUpperCase() });
  syncAtLabels(side);
}

function syncAtKwBtn() {
  const btn = $('at-kw-btn');
  if (!btn) return;
  const on = kaswareEnabled();
  btn.textContent = on ? 'KasWare' : 'Native';
  btn.classList.toggle('on', on);
}

function syncAtNote() {
  const el = $('at-note');
  if (!el) return;
  const kw = kaswareEnabled() ? 'KasWare signs.' : 'PIN signs.';
  if (atPane === 'launch') {
    el.textContent = isTestnet()
      ? 'Launch deploys a real KCC20 Token V1 on Cook TN10. Same key, kaspatest address. You sign. Cook never holds keys. Faucet: faucet-tn10.kaspanet.io. ' + kw
      : 'Mainnet launch lives on KRON’s bonding curve. Switch Network to Testnet-10 to launch via Cook, or open KRON Launch. COOK still trades live KRON. ' + kw;
  } else if (atPane === 'agent') {
    el.textContent = 'Scorpion: buy below / sell above on KRON while this tab stays unlocked. We never hold keys, so it stops if you lock or kill the app. ' + kw;
  } else if (atPane === 'tokens') {
    el.textContent = 'Holdings. KRON / K.COM / Scorpion live in COOK. ' + kw;
  } else if (atPane === 'bet') {
    el.textContent = 'Bet: stake the ticker you picked (KKDAG, then any KRON token). ¢ starts 50/50 and moves with YES vs NO size. ' + kw;
  } else {
    el.textContent = 'COOK: KRON AMM · K.COM order book · Scorpion launches. Tap a token for chart, book, and swap. ' + kw;
  }
}

function syncAtLabels(side) {
  const s = side || 'buy';
  const tick = ($('at-tick')?.value || 'TOKEN').toUpperCase();
  const lab = $('at-amt-lab');
  if (!lab) return;
  const kronAmm = atSrc === 'kron' || (atSrc === 'scorpion' && !isTestnet());
  if (kronAmm) lab.textContent = s === 'sell' ? `Amount (${tick})` : 'Pay (KAS)';
  else lab.textContent = s === 'sell' ? `Amount (${tick})` : 'Tokens';
}

function setAtPane(pane) {
  atPane = pane === 'tokens' ? 'tokens' : (pane === 'bet' ? 'bet' : (pane || 'book'));
  const book = atPane === 'book';
  const launch = atPane === 'launch';
  const agent = atPane === 'agent';
  const hold = atPane === 'tokens';
  const bet = atPane === 'bet';
  $('at-book')?.classList.toggle('hidden', !book);
  $('at-launch')?.classList.toggle('hidden', !launch);
  $('at-agent')?.classList.toggle('hidden', !agent);
  $('at-holdings')?.classList.toggle('hidden', !hold);
  $('at-bet')?.classList.toggle('hidden', !bet);
  document.querySelectorAll('#at-seg button').forEach(b => b.classList.toggle('on', b.dataset.at === atPane));
  $('at-tokens-btn')?.classList.toggle('on', hold);
  $('at-bet-btn')?.classList.toggle('on', bet);
  syncAtKwBtn();
  syncAtNote();
  if ($('at-lnote')) {
    $('at-lnote').textContent = isTestnet()
      ? 'TN10: Cook deploys a real KCC20 V1 on-chain. You sign. Get TKAS at faucet-tn10.kaspanet.io'
      : 'Mainnet: Open KRON Launch, or tap Launch to switch this wallet to Testnet-10 and deploy via Cook.';
  }
  if (launch) fillLaunchKns();
  syncAtVenues();
  if (book) {
    if (!setAtSrc._inited) {
      setAtSrc._inited = true;
      if (isTestnet() && atSrc === 'kron') atSrc = 'cook';
    }
    setAtSrc(atSrc);
  }
  if (hold) {
    if (isTestnet() && tokPane === 'kron') tokPane = 'scorpion';
    setTokPane(tokPane);
  }
  if (agent) {
    syncAgStratUi(loadAgentJob()?.strat || selectedAgentStrat());
    paintAgentStatus();
    startAgentPreviewLoop();
    fillAgentMarkets().catch(() => {});
    const t = ($('ag-tick')?.value || loadAgentJob()?.tick || 'KKDAG').trim().toUpperCase();
    if (t && !loadAgentJob()?.on) {
      const needPrefill = !($('ag-buy')?.value && $('ag-sell')?.value);
      applyAgentTick(t, { prefill: needPrefill }).catch(() => {});
    }
  } else if (!loadAgentJob()?.on) {
    stopAgentPreviewLoop();
  }
  if (bet) startBetUi();
  else stopBetClock();
}

function setTokPane(pane) {
  tokPane = pane === 'kcom' ? 'kcom' : (pane === 'scorpion' ? 'scorpion' : 'kron');
  document.querySelectorAll('#tok-seg button').forEach(b => b.classList.toggle('on', b.dataset.tok === tokPane));
  $('tok-kron')?.classList.toggle('hidden', tokPane !== 'kron');
  $('tok-kcom')?.classList.toggle('hidden', tokPane !== 'kcom');
  $('tok-scorpion')?.classList.toggle('hidden', tokPane !== 'scorpion');
  renderTokens();
  if (tokPane === 'kcom') renderTokKcom();
}

function atSlipPct() {
  const n = Number($('at-slip')?.value);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

function atLimitKas() {
  const n = Number($('at-limit')?.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function impliedKronPx(q) {
  if (!q) return 0;
  if (q.side === 'buy') {
    const tok = Number(q.tokenOut) / (10 ** Number(q.decimals || 0));
    const kas = Number(q.kasIn) / 1e8;
    return tok > 0 ? kas / tok : 0;
  }
  const tok = Number(q.tokenIn) / (10 ** Number(q.decimals || 0));
  const kas = Number(q.net || q.kasOut) / 1e8;
  return tok > 0 ? kas / tok : 0;
}

function assertLimitSlip(q, { limit, slip, side }) {
  const px = impliedKronPx(q);
  if (limit > 0 && px > 0) {
    if (side === 'buy' && px > limit * 1.0000001) {
      throw new Error('Quote ' + px.toPrecision(4) + ' KAS/token is above your limit ' + limit);
    }
    if (side === 'sell' && px < limit * 0.999999) {
      throw new Error('Quote ' + px.toPrecision(4) + ' KAS/token is below your limit ' + limit);
    }
  }
  return px;
}

function openLaunchedToken(t) {
  if (!t || !validTick(t.tick)) return;
  haptic();
  setAtPane('book');
  setAtSrc('scorpion');
  openAtDesk({
    venue: 'scorpion',
    tick: t.tick,
    tokenId: t.tokenId || '',
    name: t.name || t.tick,
    logo: t.image || '',
    meta: t
  });
}

async function renderCookMarkets() {
  const box = $('at-cook-mkts');
  if (!box) return;
  if (!box.dataset.loaded) box.innerHTML = `<div class="empty">Loading K.COM book…</div>`;
  try {
    const live = (await cookMarkets(40)).slice(0, 40);
    const mine = loadLaunched().filter(t => t.tokenId && validTick(t.tick) && (!t.network || t.network === 'testnet-10'));
    const seen = new Set(live.map(m => cookTickOf(m)).filter(validTick));
    const extra = mine.filter(t => !seen.has(String(t.tick).toUpperCase())).map(t => ({
      tokenIdHex: t.tokenId,
      metadata: { ticker: t.tick, name: t.name || t.tick, tokenIdHex: t.tokenId, logoUrl: t.image || '' }
    }));
    const rows = extra.concat(live).filter(m => validTick(cookTickOf(m)));
    box.dataset.loaded = '1';
    box.innerHTML = rows.map(m => {
      const tick = cookTickOf(m);
      const name = m.metadata?.name || tick;
      const ask = sompiToKas(m.bestAskUnitPriceSompi);
      const bid = sompiToKas(m.bestBidUnitPriceSompi);
      const id = m.tokenIdHex || m.metadata?.tokenIdHex || '';
      const mid = ask && bid ? (ask + bid) / 2 : (ask || bid);
      return `
        <button class="row token-row" type="button" data-cook-id="${esc(id)}" data-cook-tick="${esc(tick)}" data-cook-name="${esc(name)}" data-cook-logo="${esc(m.metadata?.logoUrl || '')}" data-cook-ask="${ask || ''}" data-cook-bid="${bid || ''}">
          ${tokenDot({ ticker: tick, protocol: 'kcc20', image: m.metadata?.logoUrl })}
          <div>
            <div class="title">${esc(tick)}</div>
            <div class="sub">K.COM TN10 · ${esc(name)}</div>
          </div>
          <div class="amt">
            <b>${mid ? fmtPx(mid) + ' KAS' : '—'}</b>
            <em class="mkt-chg">bid ${bid ? fmtPx(bid) : '—'} · ask ${ask ? fmtPx(ask) : '—'}</em>
          </div>
        </button>`;
    }).join('') || `<div class="empty">No K.COM markets yet. Launch on TN10, then wrap to the book.</div>`;
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(errText(e))}</div>`;
  }
}

async function renderScorpionMarkets() {
  const box = $('at-sco-mkts');
  if (!box) return;
  const mine = loadLaunched().filter(t => validTick(t.tick));
  const boosts = loadBoosts();
  const chunks = [];
  if (!isTestnet()) {
    box.innerHTML = box.innerHTML || `<div class="empty">Loading launched KCC20s…</div>`;
    let rows = [];
    try { rows = (await kronMarkets()).filter(m => validTick(m.tick) && !String(m.tick).includes('?')); } catch {}
    const q = String($('at-tick')?.value || '').trim().toUpperCase();
    const shown = q ? rows.filter(m => m.tick.includes(q) || String(m.name || '').toUpperCase().includes(q)) : rows;
    chunks.push('<div class="section-label">Launched on KRON · tap to buy</div>');
    chunks.push((shown.length ? shown : rows).slice(0, 80).map(m => {
      const px = m.price ? fmtPx(m.price) + ' KAS' : (m.graduated ? 'Pool' : 'Curve');
      return `
      <button class="row token-row" type="button" data-sco-tick="${esc(m.tick)}" data-sco-name="${esc(m.name || m.tick)}" data-sco-logo="${esc(m.logo || '')}" data-sco-kron="1" data-sco-grad="${m.graduated ? '1' : ''}" data-sco-px="${m.price || ''}">
        ${tokenDot({ ticker: m.tick, protocol: 'kcc20', image: m.logo })}
        <div>
          <div class="title">${esc(m.tick)}</div>
          <div class="sub">${esc(m.graduated ? 'Pool AMM' : 'Curve')} · ${esc(m.name)}</div>
        </div>
        <div class="amt"><b>${esc(px)}</b><em>Buy with KAS</em></div>
      </button>`;
    }).join('') || `<div class="empty">KRON tokenlist unavailable.</div>`);
  }
  if (mine.length) {
    let mkts = [];
    try { mkts = await cookMarkets(40); } catch {}
    const byId = new Map(mkts.map(m => [String(m.tokenIdHex || m.metadata?.tokenIdHex || ''), m]));
    const byTick = new Map(mkts.map(m => [cookTickOf(m), m]));
    chunks.push('<div class="section-label">Launched here</div>');
    chunks.push(mine.map(t => {
      const hit = (t.tokenId && byId.get(t.tokenId)) || byTick.get(String(t.tick).toUpperCase());
      const ask = hit ? sompiToKas(hit.bestAskUnitPriceSompi) : 0;
      const bid = hit ? sompiToKas(hit.bestBidUnitPriceSompi) : 0;
      const id = t.tokenId || hit?.tokenIdHex || '';
      const mid = ask && bid ? (ask + bid) / 2 : (ask || bid);
      const kron = !isTestnet() && !id;
      return `
      <button class="row token-row" type="button" data-sco-id="${esc(id)}" data-sco-tick="${esc(t.tick)}" data-sco-name="${esc(t.name || t.tick)}" data-sco-logo="${esc(t.image || '')}" data-cook-ask="${ask || ''}" data-cook-bid="${bid || ''}" ${kron ? 'data-sco-kron="1"' : ''}>
        ${tokenDot({ ticker: t.tick, protocol: 'kcc20', image: t.image })}
        <div>
          <div class="title">${esc(t.tick)}</div>
          <div class="sub">${esc(t.name || 'Scorpion')} · ${esc(t.network === 'testnet-10' ? 'TN10' : (t.network || 'on-chain'))}</div>
        </div>
        <div class="amt">
          <b>${mid ? fmtPx(mid) + ' KAS' : (id || kron ? 'Trade' : 'Launch')}</b>
          <em>${bid || ask ? ('bid ' + (bid ? fmtPx(bid) : '—') + ' · ask ' + (ask ? fmtPx(ask) : '—')) : (t.txId ? esc(String(t.txId).slice(0, 8)) : 'local')}</em>
        </div>
      </button>`;
    }).join(''));
  }
  if (boosts.length) {
    chunks.push('<div class="section-label">Boosted</div>');
    chunks.push(boosts.filter(b => validTick(b.tick)).map(b => `
      <button class="row token-row" type="button" data-sco-tick="${esc(b.tick)}" data-sco-name="${esc(b.tick)}" data-sco-kron="${isTestnet() ? '' : '1'}">
        ${tokenDot({ ticker: b.tick, protocol: 'kcc20' })}
        <div>
          <div class="title">${esc(b.tick)}</div>
          <div class="sub">Boost · ${esc(String(b.pts || ''))} pts</div>
        </div>
        <div class="amt"><b>Featured</b></div>
      </button>`).join(''));
  }
  box.innerHTML = chunks.join('') || `<div class="empty">${isTestnet() ? 'Launch a token on TN10, then it lands here for buy/sell.' : 'No launched KCC20s yet.'}</div>`;
}

function pickCookRow(id, tick, extra = {}) {
  const t = String(tick || '').toUpperCase();
  atCook = { tokenId: id, tick: t };
  openAtDesk({
    venue: extra.venue || 'cook',
    tick: t,
    tokenId: id || '',
    name: extra.name || t,
    logo: extra.logo || '',
    price: Number(extra.ask || extra.bid || extra.price || 0),
    ask: Number(extra.ask || 0),
    bid: Number(extra.bid || 0),
    meta: extra.meta || extra
  });
}

function closeAtDesk() {
  atDesk = null;
  $('at-desk')?.classList.add('hidden');
  $('at-mkt-wrap')?.classList.remove('hidden');
}

function openAtDesk(row) {
  if (!row) return;
  const tick = String(row.tick || '').toUpperCase();
  if (!validTick(tick)) { toast('This row has no ticker'); return; }
  atDesk = {
    venue: row.venue || atSrc || 'kron',
    tick,
    tokenId: row.tokenId || '',
    name: row.name || tick,
    logo: row.logo || row.image || '',
    price: Number(row.price || 0),
    change: Number(row.change || row.change24h || 0),
    graduated: !!row.graduated,
    volume: Number(row.volume || row.volume24h || 0),
    tvl: Number(row.tvl || 0),
    bid: Number(row.bid || 0),
    ask: Number(row.ask || 0),
    meta: row.meta || row
  };
  atSrc = atDesk.venue === 'cook' || atDesk.venue === 'scorpion' ? atDesk.venue : 'kron';
  if (atDesk.tokenId) atCook = { tokenId: atDesk.tokenId, tick };
  if ($('at-tick')) $('at-tick').value = tick;
  if ($('ag-tick')) $('ag-tick').value = tick;
  $('at-desk')?.classList.remove('hidden');
  $('at-mkt-wrap')?.classList.add('hidden');
  document.querySelectorAll('#at-src button').forEach(b => b.classList.toggle('on', b.dataset.src === atSrc));
  paintAtDesk();
  loadAtDeskData();
  syncAtLabels('buy');
  atQuotePreview();
}

function syncAtVenues() {
  const tn = isTestnet();
  document.querySelectorAll('#at-src [data-src="kron"], #tok-seg [data-tok="kron"]').forEach(b => {
    b?.classList.toggle('hidden', tn);
  });
  $('kron-markets')?.classList.toggle('hidden', tn || atSrc !== 'kron');
  if (tn && atSrc === 'kron') atSrc = 'cook';
  if (tn && tokPane === 'kron') tokPane = 'kcom';
}

function setAtSrc(src) {
  let next = src === 'cook' ? 'cook' : (src === 'scorpion' ? 'scorpion' : 'kron');
  if (isTestnet() && next === 'kron') next = 'cook';
  if (next !== atSrc) closeAtDesk();
  atSrc = next;
  syncAtVenues();
  document.querySelectorAll('#at-src button').forEach(b => b.classList.toggle('on', b.dataset.src === atSrc));
  $('kron-markets')?.classList.toggle('hidden', atSrc !== 'kron');
  $('at-cook-mkts')?.classList.toggle('hidden', atSrc !== 'cook');
  $('at-sco-mkts')?.classList.toggle('hidden', atSrc !== 'scorpion');
  syncAtLabels('buy');
  syncAtNote();
  if (!atDesk) {
    if (atSrc === 'cook') renderCookMarkets();
    else if (atSrc === 'scorpion') renderScorpionMarkets();
    else renderKronMarkets();
  }
  atQuotePreview();
}

function paintAtDesk() {
  const d = atDesk;
  const head = $('at-desk-head');
  if (!head || !d) return;
  const chg = Number(d.change || 0);
  const chgCls = chg > 0 ? 'up' : (chg < 0 ? 'down' : '');
  const mode = d.venue === 'kron' ? (d.graduated ? 'Pool AMM' : 'Curve AMM') : 'Order book';
  const px = d.price || d.ask || d.bid || 0;
  head.innerHTML = `
    ${tokenDot({ ticker: d.tick, protocol: 'kcc20', image: d.logo })}
    <div class="meta">
      <div class="title">${esc(d.tick)}</div>
      <div class="sub"><span class="at-venue">${esc(venueLabel(d.venue))}</span> ${esc(d.name || '')} · ${esc(mode)}</div>
    </div>
    <div class="px">${esc(fmtPx(px))}<em class="at-chg ${chgCls}">${esc(fmtChg(chg))} · KAS</em></div>`;
  paintAtStats(d);
}

function paintAtStats(d) {
  const box = $('at-stats');
  if (!box || !d) return;
  const kw = kaswareEnabled() ? 'KasWare' : 'Native';
  const mode = d.venue === 'kron' ? 'AMM' : 'BOOK';
  const cells = [
    ['Bid', fmtPx(d.bid)],
    ['Ask', fmtPx(d.ask || (d.venue === 'kron' ? d.price : 0))],
    [d.tvl ? 'TVL' : 'Volume', d.tvl ? fmtTok(d.tvl) : fmtTok(d.volume)],
    ['Sign', kw + ' · ' + mode]
  ];
  box.innerHTML = cells.map(([k, v]) => `<div class="at-stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('');
}

function paintAtObLevels(asks, bids, d, mode) {
  const box = $('at-ob');
  if (!box) return;
  const maxAmt = Math.max(1, ...asks.map(x => x.amt), ...bids.map(x => x.amt));
  const lvl = (row, cls) => {
    const w = Math.max(8, Math.round((row.amt / maxAmt) * 100));
    return `<button class="lvl ${cls}" type="button" data-px="${esc(String(row.px))}">
      <i style="width:${w}%"></i>
      <span>${fmtPx(row.px)}</span>
      <em>${fmtTok(row.amt)}</em>
    </button>`;
  };
  const mid = d?.ask && d?.bid ? (d.ask + d.bid) / 2 : (d?.price || 0);
  const spread = d?.ask && d?.bid ? d.ask - d.bid : 0;
  const sprPct = mid && spread ? (spread / mid * 100) : 0;
  box.innerHTML = `
    <div class="col ask">
      <b>Asks${mode === 'AMM' ? ' · AMM' : ''}</b>
      ${asks.length ? asks.map(r => lvl(r, 'ask')).join('') : '<div class="empty">No asks</div>'}
    </div>
    <div class="col bid">
      <b>Bids${mode === 'AMM' ? ' · AMM' : ''}</b>
      ${bids.length ? bids.map(r => lvl(r, 'bid')).join('') : '<div class="empty">No bids</div>'}
    </div>
    <div class="at-spread">${esc(mode)} · mid ${esc(fmtPx(mid))} · spread ${spread ? esc(fmtPx(spread)) : '—'}${sprPct ? ' (' + sprPct.toFixed(1) + '%)' : ''}</div>`;
}

function paintAtAna(d, book) {
  const box = $('at-ana-body');
  if (!box || !d) return;
  const venue = d.venue === 'cook' ? 'K.COM TN10 order book' : (d.venue === 'scorpion' ? 'Scorpion launch' : 'KRON mainnet AMM');
  const rows = [
    ['Venue', venue],
    ['Ticker', d.tick],
    ['Name', d.name || '—'],
    ['Price', fmtPx(d.price) + ' KAS'],
    d.bid ? ['Bid', fmtPx(d.bid) + ' KAS'] : null,
    d.ask ? ['Ask', fmtPx(d.ask) + ' KAS'] : null,
    d.volume ? ['Volume', fmtTok(d.volume)] : null,
    d.tvl ? ['TVL', fmtTok(d.tvl) + ' KAS'] : null,
    d.trades ? ['Trades', String(d.trades)] : null,
    d.openAsk != null ? ['Open asks', String(d.openAsk)] : null,
    d.openBid != null ? ['Open bids', String(d.openBid)] : null,
    d.venue === 'kron' ? ['Market', d.graduated ? 'Graduated pool' : 'Bonding curve'] : null,
    d.tokenId ? ['Token ID', String(d.tokenId).slice(0, 18) + '…'] : null,
    d.desc ? ['About', d.desc] : null,
    d.meta?.xHandle ? ['X', '@' + d.meta.xHandle] : null,
    d.meta?.kns ? ['KNS', d.meta.kns] : null,
    d.meta?.txId ? ['Launch tx', String(d.meta.txId).slice(0, 14) + '…'] : null,
    ['Signer', kaswareEnabled() ? 'KasWare' : 'Native PIN']
  ].filter(Boolean);
  box.innerHTML = rows.map(([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(String(v))}</span></div>`).join('')
    + (d.tokenId && isTestnet() ? `<button class="btn btn-glass" id="at-ana-mint" type="button" style="margin-top:8px">Mint 100 ${esc(d.tick)}</button>` : '')
    + `<button class="btn btn-gold" id="at-ana-agent" type="button" style="margin-top:8px">Arm agent on ${esc(d.tick)}</button>`;
  $('at-ana-mint')?.addEventListener('click', async () => {
    if (!wallet) { toast('Unlock a wallet'); return; }
    try {
      const build = await cookMint({ walletAddress: wallet.address, tokenId: d.tokenId, tokenAmount: '100' });
      await signCookBuild(build, 'Mint ' + d.tick);
    } catch (e) { toast(errText(e)); }
  });
  $('at-ana-agent')?.addEventListener('click', () => {
    if ($('ag-tick')) $('ag-tick').value = d.tick;
    if (d.price && $('ag-buy') && !$('ag-buy').value) $('ag-buy').value = String(Number(d.price * 0.97).toPrecision(4));
    if (d.price && $('ag-sell') && !$('ag-sell').value) $('ag-sell').value = String(Number(d.price * 1.03).toPrecision(4));
    setAtPane('agent');
  });
}

function drawAtChart(candles, canvasId = 'at-chart') {
  const c = $(canvasId);
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8,10,12,0.2)';
  ctx.fillRect(0, 0, w, h);
  if (!candles?.length) {
    ctx.fillStyle = 'rgba(235,235,245,0.45)';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('No trades yet — book and AMM still quote live', 16, h / 2);
    return;
  }
  const pad = 12;
  const min = Math.min(...candles.map(x => x.l));
  const max = Math.max(...candles.map(x => x.h));
  const span = max - min || max * 0.02 || 1e-9;
  const n = candles.length;
  const cw = (w - pad * 2) / n;
  const y = v => pad + (1 - (v - min) / span) * (h - pad * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const yy = pad + (h - pad * 2) * i / 4;
    ctx.beginPath();
    ctx.moveTo(pad, yy);
    ctx.lineTo(w - pad, yy);
    ctx.stroke();
  }
  candles.forEach((k, i) => {
    const x = pad + i * cw + cw / 2;
    const up = k.c >= k.o;
    ctx.strokeStyle = up ? '#49eacb' : '#ff6b6b';
    ctx.fillStyle = up ? '#49eacb' : '#ff6b6b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y(k.h));
    ctx.lineTo(x, y(k.l));
    ctx.stroke();
    const top = y(Math.max(k.o, k.c));
    const bot = y(Math.min(k.o, k.c));
    ctx.fillRect(x - Math.max(1.4, cw * 0.28), top, Math.max(2.6, cw * 0.56), Math.max(1, bot - top));
  });
  ctx.fillStyle = 'rgba(235,235,245,0.55)';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(fmtPx(max), pad, 10);
  ctx.fillText(fmtPx(min), pad, h - 4);
}

async function kronAmmLadder(tick) {
  const buySizes = ['0.15', '0.5', '1', '2', '5'];
  const sellSizes = ['10', '50', '100', '500', '1000'];
  const [buys, sells] = await Promise.all([
    Promise.all(buySizes.map(async amount => {
      try {
        const q = await quoteKronTrade({ tick, side: 'buy', amount });
        const px = impliedKronPx(q);
        const amt = Number(q.tokenOut) / (10 ** Number(q.decimals || 0));
        return px > 0 ? { px, amt, n: 1 } : null;
      } catch { return null; }
    })),
    Promise.all(sellSizes.map(async amount => {
      try {
        const q = await quoteKronTrade({ tick, side: 'sell', amount });
        const px = impliedKronPx(q);
        return px > 0 ? { px, amt: Number(amount), n: 1 } : null;
      } catch { return null; }
    }))
  ]);
  return { asks: buys.filter(Boolean), bids: sells.filter(Boolean) };
}

async function loadAtDeskData() {
  const d = atDesk;
  if (!d) return;
  loadAtDeskData._g = (loadAtDeskData._g || 0) + 1;
  const gen = loadAtDeskData._g;
  if ($('at-ob')) $('at-ob').innerHTML = `<div class="empty">Loading book…</div>`;
  try {
    if (deskUsesCook() && d.tokenId) {
      const [book, candles, mkts] = await Promise.all([
        cookOrderbook(d.tokenId).catch(() => null),
        cookCandles(d.tokenId, 48).catch(() => []),
        cookMarkets(40).catch(() => [])
      ]);
      if (atDesk !== d || loadAtDeskData._g !== gen) return;
      const hit = (mkts || []).find(m => (m.tokenIdHex || m.metadata?.tokenIdHex || '') === d.tokenId);
      if (hit) {
        d.ask = sompiToKas(hit.bestAskUnitPriceSompi);
        d.bid = sompiToKas(hit.bestBidUnitPriceSompi);
        d.name = hit.metadata?.name || d.name;
        d.logo = hit.metadata?.logoUrl || d.logo;
        d.volume = sompiToKas(hit.totalVolumeSompi);
        d.trades = hit.totalTrades;
        d.spread = sompiToKas(hit.spreadSompi);
        d.openAsk = hit.openAskCount;
        d.openBid = hit.openBidCount;
        d.desc = hit.metadata?.description || '';
        d.decimals = hit.metadata?.decimals || 8;
        d.price = d.ask || d.bid || d.price;
      }
      if (book) {
        const { asks, bids } = cookBookLevels(book, d.decimals || 8);
        if (!d.ask && asks[0]) d.ask = asks[0].px;
        if (!d.bid && bids[0]) d.bid = bids[0].px;
        d.price = d.ask || d.bid || d.price;
        paintAtDesk();
        paintAtObLevels(asks, bids, d, 'BOOK');
      } else {
        paintAtDesk();
        paintAtObLevels([], [], d, 'BOOK');
      }
      paintAtAna(d, book);
      drawAtChart(candles);
    } else {
      const [info, candles, mk] = await Promise.all([
        lookupKronTick(d.tick).catch(() => null),
        kronCandles(d.tick, 72).catch(() => []),
        kronMarkets().then(list => list.find(m => m.tick === d.tick) || null).catch(() => null)
      ]);
      if (atDesk !== d || loadAtDeskData._g !== gen) return;
      if (info) {
        d.price = info.price || d.price;
        d.change = info.change24h;
        d.volume = info.volume24h || d.volume;
        d.graduated = info.graduated;
        d.name = info.name || d.name;
      }
      if (mk) {
        d.logo = mk.logo || d.logo;
        d.tvl = mk.tvl;
        d.volume = mk.volume24h || d.volume;
        d.change = mk.change24h;
        d.price = mk.price || d.price;
        d.graduated = mk.graduated;
        d.name = mk.name || d.name;
      }
      d.ask = d.price;
      d.bid = d.price;
      paintAtDesk();
      const ladder = await kronAmmLadder(d.tick);
      if (atDesk !== d || loadAtDeskData._g !== gen) return;
      if (ladder.asks[0]) d.ask = ladder.asks[0].px;
      if (ladder.bids[0]) d.bid = ladder.bids[0].px;
      paintAtDesk();
      paintAtObLevels(ladder.asks, ladder.bids, d, 'AMM');
      paintAtAna(d, null);
      drawAtChart(candles);
    }
  } catch (e) {
    if ($('at-ob')) $('at-ob').innerHTML = `<div class="empty">${esc(errText(e))}</div>`;
    drawAtChart([]);
  }
  atQuotePreview();
}

async function atQuotePreview() {
  const box = $('at-quote');
  if (!box) return;
  const tick = ($('at-tick')?.value || '').trim().toUpperCase();
  const amount = ($('at-amt')?.value || '').trim();
  const limit = atLimitKas();
  const slip = atSlipPct();
  if (!tick) { box.textContent = 'Pick a market.'; return; }
  if (!amount) {
    box.textContent = deskUsesCook()
      ? (tick + ' · K.COM TN10 book. Amount is tokens. Limit rests an order; empty limit takes the book. Slip ' + slip + '%. ' + (kaswareEnabled() ? 'KasWare signs.' : 'Native PIN signs.'))
      : (tick + ' · KRON mainnet AMM. Buy amount is KAS. Limit is a max/min price. Slip ' + slip + '%. ' + (kaswareEnabled() ? 'KasWare signs.' : 'Native PIN signs.'));
    return;
  }
  box.textContent = 'Quoting…';
  try {
    if (deskUsesCook()) {
      let id = atCook?.tokenId || atDesk?.tokenId;
      if (!id && tick) {
        try {
          const rows = await cookMarkets(40);
          const hit = (rows || []).find(m => cookTickOf(m) === tick);
          id = hit?.tokenIdHex || loadLaunched().find(t => String(t.tick).toUpperCase() === tick)?.tokenId || '';
          if (id) atCook = { tokenId: id, tick };
        } catch {}
      }
      if (!id) {
        box.textContent = tick + ' is not on the TN10 book yet. Tap a listed Scorpion/K.COM token, or Launch it.';
        return;
      }
      const side = 'buy';
      const limSompi = limit > 0 ? String(kasToSompiNum(limit)) : undefined;
      const q = await cookQuote(id, { side, amount, mode: limit > 0 ? 'limit' : 'market', limitUnitPriceSompi: limSompi });
      if (!q?.valid) {
        box.textContent = (q?.errors || []).join(' ') || 'No fill at that size/price. Set a limit to rest an order.';
        return;
      }
      const px = sompiToKas(q.averageUnitPriceSompi || q.unitPriceSompi);
      box.textContent = `K.COM ${tick}: ~${fmtPx(px)} KAS/token · pay ${fmtPx(sompiToKas(q.buyerPaysSompi))} KAS · fee ${fmtPx(sompiToKas(q.protocolFeeSompi))} KAS · ${q.executionMode || 'fill'}`;
      return;
    }
    const q = await quoteKronTrade({ tick, side: 'buy', amount });
    const px = impliedKronPx(q);
    box.textContent = `${q.tick} ${q.graduated ? 'pool' : 'curve'}: you get ${formatTokenUnits(q.tokenOut, q.decimals)} ${q.tick} · ~${px ? px.toPrecision(4) : '—'} KAS/token · slip ${slip}%` + (limit ? ` · limit ${limit}` : '');
  } catch (e) {
    box.textContent = errText(e);
  }
}

async function confirmAtSign(title, body, run) {
  const kw = kaswareEnabled();
  openSheet(title, body, {
    confirm: kw ? 'Pay with KasWare' : 'Pay with PIN',
    gold: true,
    onConfirm: async () => {
      try {
        if (kw) {
          setSheetStatus('Opening KasWare…');
          await ensureKaswareSigner(wallet);
        } else {
          hydrateNativeKey(wallet);
          if (!hexKey(wallet?.privKey)) {
            throw new Error('No in-app key on this wallet. Import the 64-hex key to sign natively, or turn KasWare on.');
          }
          await requirePin(title);
        }
        await run();
      } catch (e) {
        if (errText(e) === 'cancelled') return;
        toast(errText(e));
        setSheetStatus(errText(e), true);
      }
    }
  });
}

async function reviewAtTrade(side) {
  const amount = ($('at-amt')?.value || '').trim();
  const tick = ($('at-tick')?.value || 'KKDAG').trim().toUpperCase();
  const limit = atLimitKas();
  const slip = atSlipPct();
  if (!amount) { toast('Enter an amount'); return; }
  if (!wallet) { toast('Unlock a wallet'); return; }
  const mine = localTnLaunch(tick);
  if (mine && !isTestnet()) {
    await offerTn10ForLaunch(mine);
    return;
  }
  if (deskUsesCook() || (mine && isTestnet())) return reviewCookTrade(side);
  let q;
  try { q = await quoteKronTrade({ tick, side, amount }); }
  catch (e) { toast(errText(e)); return; }
  let px = 0;
  try { px = assertLimitSlip(q, { limit, slip, side }); }
  catch (e) { toast(errText(e)); return; }
  const bits = q.side === 'buy'
    ? `<div class="kv"><span class="k">Pay</span><span class="v">${esc(formatKasSompi(q.kasIn))} KAS</span></div>
       <div class="kv"><span class="k">You get</span><span class="v">${esc(formatTokenUnits(q.tokenOut, q.decimals))} ${esc(q.tick)}</span></div>
       <div class="kv"><span class="k">Price</span><span class="v">${px ? px.toPrecision(4) : '—'} KAS/${esc(q.tick)}</span></div>
       <div class="kv"><span class="k">Slippage</span><span class="v">${slip}%</span></div>
       ${limit ? `<div class="kv"><span class="k">Limit</span><span class="v">≤ ${limit} KAS</span></div>` : ''}
       <div class="kv"><span class="k">Protocol fees</span><span class="v">${esc(formatKasSompi(q.fee))} KAS</span></div>
       <p class="muted" style="text-align:left;padding-top:8px;">KRON AMM on mainnet. Covenants hold pool funds. This app never custody. Re-quoted at confirm — worse than slip/limit is rejected.</p>`
    : `<div class="kv"><span class="k">Sell</span><span class="v">${esc(formatTokenUnits(q.tokenIn, q.decimals))} ${esc(q.tick)}</span></div>
       <div class="kv"><span class="k">You receive</span><span class="v">${esc(formatKasSompi(q.net))} KAS</span></div>
       <div class="kv"><span class="k">Price</span><span class="v">${px ? px.toPrecision(4) : '—'} KAS/${esc(q.tick)}</span></div>
       <div class="kv"><span class="k">Slippage</span><span class="v">${slip}%</span></div>
       ${limit ? `<div class="kv"><span class="k">Limit</span><span class="v">≥ ${limit} KAS</span></div>` : ''}`;
  await confirmAtSign('Review ' + q.tick + ' ' + side, bits, async () => {
    setSheetStatus('Re-quoting…');
    const q2 = await quoteKronTrade({ tick, side, amount });
    assertLimitSlip(q2, { limit, slip, side });
    if (side === 'buy' && Number(q2.tokenOut) < Number(q.tokenOut) * (100 - slip) / 100) {
      throw new Error('Slippage: fewer tokens than quoted');
    }
    if (side === 'sell' && Number(q2.net) < Number(q.net) * (100 - slip) / 100) {
      throw new Error('Slippage: less KAS than quoted');
    }
    await runTrade({ tick, side, amount, quote: q2, forceKasware: kaswareEnabled() });
  });
}

async function reviewCookMint(id, tick, amount) {
  const amt = String(amount || '').trim() || '1';
  const bits = `
    <div class="kv"><span class="k">Mint</span><span class="v">${esc(amt)} ${esc(tick)}</span></div>
    <div class="kv"><span class="k">Network</span><span class="v">Cook TN10</span></div>
    <p class="muted" style="text-align:left;padding-top:8px;">This token is not on the DEX book yet. Buy = public mint from the minter you launched. Cook builds the PSKT. ${kaswareEnabled() ? 'KasWare on TN10 signs the funding input only.' : 'This device PIN-signs the funding input only.'}</p>`;
  await confirmAtSign('Mint ' + tick, bits, async () => {
    setSheetStatus('Building mint…');
    const mint = await cookMint({
      walletAddress: wallet.address,
      tokenId: id,
      tokenAmount: String(amt)
    });
    await signCookBuild(mint, 'Mint ' + tick);
  });
}

async function reviewCookTrade(side) {
  if (!isTestnetAddr(wallet?.address)) {
    const mine = localTnLaunch(($('at-tick')?.value || '').trim().toUpperCase());
    if (mine) {
      await offerTn10ForLaunch(mine);
      return;
    }
    toast('K.COM / Scorpion launch buys are TN10. Switch Network to Testnet-10. KRON AMM is mainnet.');
    return;
  }
  const amount = ($('at-amt')?.value || '').trim();
  const tick = ($('at-tick')?.value || '').trim().toUpperCase();
  const limit = atLimitKas();
  const slip = atSlipPct();
  let id = atCook?.tokenId || atDesk?.tokenId;
  if (!id) {
    const rows = await cookMarkets(40);
    const hit = rows.find(m => cookTickOf(m) === tick);
    id = hit?.tokenIdHex || loadLaunched().find(t => t.tick === tick)?.tokenId || '';
    if (id) atCook = { tokenId: id, tick };
  }
  if (!id) { toast('Tap a K.COM or Scorpion token first'); return; }
  const wrappers = await cookWrappers(id);
  const wrapped = pickWrappedMarketId(wrappers);
  if (!wrapped) {
    if (side === 'buy') return reviewCookMint(id, tick, amount);
    toast('This ticker is not on the DEX book yet (no wrapper). Mint it with Buy, or Graduate after Cook lists a wrapper.');
    return;
  }
  const limSompi = limit > 0 ? String(kasToSompiNum(limit)) : '';
  let q = null;
  try {
    q = await cookQuote(id, {
      side,
      amount,
      mode: limit > 0 ? 'limit' : 'market',
      limitUnitPriceSompi: limSompi || undefined
    });
  } catch (e) {
    q = { valid: false, errors: [errText(e)] };
  }
  const rest = !q?.valid || !(q.fills || []).length;
  if (rest && !(limit > 0)) {
    toast((q?.errors || []).join(' ') || 'No fill. Set a limit to rest on the book.');
    return;
  }
  const px = q?.valid ? sompiToKas(q.averageUnitPriceSompi || q.unitPriceSompi) : limit;
  const bits = rest
    ? `<div class="kv"><span class="k">Rest ${side}</span><span class="v">${esc(amount)} ${esc(tick)}</span></div>
       <div class="kv"><span class="k">Limit</span><span class="v">${limit} KAS/token</span></div>
       <p class="muted" style="text-align:left;padding-top:8px;">Places a KCC20 DEX Orderbook V1 limit on Cook TN10. You sign the PSKT. Cook never sees keys.</p>`
    : `<div class="kv"><span class="k">${esc(side)}</span><span class="v">${esc(amount)} ${esc(tick)}</span></div>
       <div class="kv"><span class="k">Avg</span><span class="v">${px ? px.toPrecision(4) : '—'} KAS</span></div>
       <div class="kv"><span class="k">You pay</span><span class="v">${sompiToKas(q.buyerPaysSompi).toPrecision(4)} KAS</span></div>
       <div class="kv"><span class="k">Slippage</span><span class="v">${slip}%</span></div>
       <p class="muted" style="text-align:left;padding-top:8px;">Fills Cook TN10 order book. Wallet signs. We broadcast. No custody.</p>`;
  await confirmAtSign((rest ? 'Rest ' : 'Fill ') + tick + ' ' + side, bits, async () => {
    await runCookOrder({ side, amount, id, wrapped, rest, quote: q, limit, slip });
  });
}

async function runCookOrder({ side, amount, id, wrapped, rest, quote, limit, slip }) {
  setSheetStatus('Building unsigned PSKT…');
  const addr = wallet.address;
  let build;
  if (rest) {
    build = await cookBuildOrder({
      walletAddress: addr,
      tokenId: id,
      wrappedMarketId: wrapped,
      side,
      tokenAmount: amount,
      unitPriceSompi: String(kasToSompiNum(limit))
    });
  } else if ((quote.fills || []).length > 1 || quote.executionMode === 'sweep') {
    const cap = Math.round(Number(quote.buyerPaysSompi || 0) * (100 + slip) / 100);
    build = await cookSweep({
      walletAddress: addr,
      tokenId: id,
      wrappedMarketId: wrapped,
      side,
      tokenAmount: amount,
      mode: limit > 0 ? 'limit' : 'market',
      limitUnitPriceSompi: limit > 0 ? String(kasToSompiNum(limit)) : undefined,
      expectedFills: (quote.fills || []).map(f => ({
        orderId: f.orderId,
        tokenAmount: String(f.tokenAmount),
        unitPriceSompi: String(f.unitPriceSompi)
      })),
      maxBuyerPaysSompi: String(cap || quote.buyerPaysSompi || '')
    });
  } else {
    const f = quote.fills[0];
    build = await cookFillOrder({
      walletAddress: addr,
      tokenId: id,
      wrappedMarketId: wrapped,
      side,
      targetOrderId: f.orderId || quote.orderId,
      tokenAmount: amount,
      unitPriceSompi: String(f.unitPriceSompi || quote.unitPriceSompi)
    });
  }
  return signCookBuild(build, 'Cook ' + side);
}

async function signCookBuild(build, label) {
  const sign = extractSigning(build);
  if (build?.payload?.builderError || build?.builderError) {
    throw new Error(build.payload?.builderError || build.builderError);
  }
  if (!sign.ready || !sign.json) throw new Error(sign.status || 'Build is not ready to sign');
  const { txId } = await signAndBroadcastPskt({
    wallet,
    txJson: sign.json,
    signInputs: sign.inputs,
    onStatus: (m) => { toast(m); setSheetStatus(m); }
  });
  const cid = cookTokenId(build);
  const tick = ($('at-ltick')?.value || lastCookToken?.tick || $('at-tick')?.value || '').toUpperCase();
  if (cid) lastCookToken = { tokenId: cid, tick };
  rememberLaunch({
    tick,
    name: ($('at-lname')?.value || tick),
    tokenId: cid,
    network: networkId(),
    txId,
    address: wallet.address,
    image: launchLogoData(),
    xHandle: launchXHandle(),
    kns: ($('at-kns')?.value || '').trim()
  });
  afterTx();
  openSheet(label + ' sent', `
    <div class="kv"><span class="k">Network</span><span class="v">${isTestnetAddr(wallet.address) ? 'TN10' : 'mainnet'}</span></div>
    <div class="kv"><span class="k">Signed</span><span class="v">${kaswareEnabled() ? 'KasWare' : 'This device'}</span></div>
    <div class="kv"><span class="k">Ticker</span><span class="v">${esc(tick || '—')}</span></div>
    ${txidBlock(txId)}
  `, { confirm: isTestnet() ? 'Buy / mint it' : 'View in TOKENS', cancel: false, onConfirm: () => {
    closeSheet();
    const row = loadLaunched().find(t => t.tokenId === cid || (t.tick === tick && t.tokenId)) || { tick, tokenId: cid, name: tick, network: networkId() };
    if (isTestnet() && row.tick) {
      setAtPane('book');
      setAtSrc('scorpion');
      openLaunchedToken(row);
      return;
    }
    setAtPane('tokens');
    setTokPane('scorpion');
    refreshAll();
  } });
  return { txId, quote: build };
}

async function applyAppNetwork(id) {
  const next = id === 'testnet-10' ? 'testnet-10' : 'mainnet';
  setNetworkId(next);
  try { await disconnectRpc(); } catch {}
  if (kaswareEnabled() && isKaswareInstalled()) {
    try {
      const linked = await connectKasware();
      await adoptKaswareAccount(linked);
    } catch (e) {
      toast('KasWare network: ' + errText(e));
    }
  } else if (wallet) {
    applyWalletNetwork(wallet, next);
    saveWallet();
    const list = loadWalletList();
    const row = list.find(w => w.id === wallet.id);
    if (row) {
      applyWalletNetwork(row, next);
      saveWalletList(list);
    }
  }
  toast(next === 'testnet-10' ? 'TN10 — native import is kaspatest:. COOK shows K.COM + Scorpion only.' : 'Mainnet — kaspa: address. KRON COOK is live.');
  syncAtVenues();
  renderHome();
  if (currentTab === 'you') renderProfile();
  if (currentTab === 'tokens') setAtPane(atPane || 'book');
  refreshAll();
}

function openNetworkSheet() {
  haptic();
  const tn = isTestnet();
  openSheet('Network', `
    <p class="muted" style="text-align:left;padding:0 0 10px;">Same key. Address prefix changes. Mainnet uses real KAS and KRON. Testnet-10 uses TKAS so you can launch a real KCC20 on Cook.</p>
    <div class="kv"><span class="k">Now</span><span class="v">${tn ? 'Testnet-10' : 'Mainnet'}</span></div>
    <div class="kv"><span class="k">Address</span><span class="v">${esc(shortAddr(wallet?.address || '', 10, 6) || '—')}</span></div>
    <label class="kw-toggle">
      <input type="checkbox" id="net-tn" ${tn ? 'checked' : ''}>
      <span>Testnet-10 (Cook launch)</span>
    </label>
    ${tn ? `<p class="muted" style="text-align:left;padding:8px 0 0;">Get TKAS from <a href="https://faucet-tn10.kaspanet.io/" target="_blank" rel="noopener" style="color:var(--gold-2)">the TN10 faucet</a>, then Launch. KasWare is usually mainnet — use Native PIN on TN10.</p>` : `<p class="muted" style="text-align:left;padding:8px 0 0;">KRON does not publish a third-party genesis builder. Real mainnet tokens launch on <a href="https://kron.technology" target="_blank" rel="noopener" style="color:var(--gold-2)">kron.technology</a>, then trade here. Cook deploy is TN10.</p>`}
  `, { confirm: 'Done', cancel: false });
  $('net-tn')?.addEventListener('change', async (e) => {
    const want = !!e.target.checked;
    try {
      await applyAppNetwork(want ? 'testnet-10' : 'mainnet');
    } catch (err) {
      e.target.checked = !want;
      toast(errText(err));
      return;
    }
    closeSheet();
    openNetworkSheet();
  });
}

async function runCookLaunch() {
  if (!wallet) { toast('Unlock a wallet'); return; }
  if (!isTestnet()) {
    openSheet('Launch a real token', `
      <p class="muted" style="text-align:left;">Cook’s public deploy is TN10. Turn on Testnet-10 in Settings — this same key becomes a kaspatest address and Launch signs a real KCC20 V1 on Cook.</p>
      <p class="muted" style="text-align:left;padding-top:8px;">Mainnet launches sit on KRON’s bonding curve. Their SDK does not build genesis txs, so that deploy is on kron.technology. After it lists, Home Trade and COOK buy it here. We never hold funds.</p>
    `, {
      confirm: 'Switch to Testnet-10',
      gold: true,
      cancelLabel: 'Open KRON',
      onConfirm: async () => {
        await applyAppNetwork('testnet-10');
        closeSheet();
        setAtPane('launch');
        toast('TN10 on. Get TKAS from the faucet, then Launch.');
      }
    });
    $('sheet-cancel')?.addEventListener('click', () => {
      window.open('https://kron.technology', '_blank', 'noopener');
    }, { once: true });
    return;
  }
  if (kaswareEnabled()) {
    try {
      const linked = await connectKasware();
      await adoptKaswareAccount(linked);
    } catch (e) {
      toast(errText(e));
      return;
    }
  } else {
    applyWalletNetwork(wallet);
  }
  if (!isTestnetAddr(wallet.address)) {
    toast('This address is not kaspatest. Keep Network on Testnet-10 and KasWare on TN10.');
    return;
  }
  if (!wallet.privKey && !kaswareEnabled()) {
    toast('Need Native key or KasWare on TN10 to sign.');
    return;
  }
  try { utxos = await fetchAddressUtxos(wallet.address); } catch {}
  const ticker = ($('at-ltick')?.value || '').trim().toUpperCase();
  const tokenName = ($('at-lname')?.value || ticker).trim();
  const maxSupply = ($('at-lmax')?.value || '1000000').trim();
  const premintSupply = ($('at-lpre')?.value || '0').trim();
  const mintKas = Number($('at-lprice')?.value || 0);
  if (!/^[A-Z0-9]{2,8}$/.test(ticker)) { toast('Ticker 2–8 letters'); return; }
  if (!tokenName || tokenName.length < 2) { toast('Name at least 2 characters'); return; }
  const maxN = Number(maxSupply);
  const preN = Number(premintSupply);
  if (!(maxN >= 1 && maxN <= 1e12)) { toast('Max supply between 1 and 1,000,000,000,000'); return; }
  if (!(preN >= 0 && preN <= maxN)) { toast('Premint must be 0 up to max supply'); return; }
  if (!(mintKas >= 0) || mintKas > 1000) { toast('Mint price 0–1000 KAS per token. Typical 0.01–1.'); return; }
  const mintPricePerTokenSompi = String(kasToSompiNum(mintKas));
  try {
    const tnBal = Number(await fetchAddressBalance(wallet.address) || 0);
    if (tnBal < 120000000) {
      toast('Need ~1.2 TKAS on this TN10 address to deploy. Faucet: faucet-tn10.kaspanet.io');
      return;
    }
  } catch {}
  const bits = `
    <div class="kv"><span class="k">Ticker</span><span class="v">${esc(ticker)}</span></div>
    <div class="kv"><span class="k">Name</span><span class="v">${esc(tokenName)}</span></div>
    <div class="kv"><span class="k">Max</span><span class="v">${esc(maxSupply)}</span></div>
    <div class="kv"><span class="k">Premint</span><span class="v">${esc(premintSupply)}</span></div>
    <div class="kv"><span class="k">Mint price</span><span class="v">${mintKas || 0} KAS / token</span></div>
    <div class="kv"><span class="k">Pay from</span><span class="v">${esc(shortAddr(wallet.address, 10, 6))}</span></div>
    <div class="kv"><span class="k">UTXOs</span><span class="v">${Array.isArray(utxos) ? utxos.length : 0}</span></div>
    <p class="muted" style="text-align:left;padding-top:8px;">Cook builds an unsigned KCC20 Token V1 deploy. ${kaswareEnabled() ? 'KasWare on TN10 signs.' : 'This device signs.'} Needs ~1.2 TKAS for the covenant cell + fee.</p>`;
  await confirmAtSign('Launch ' + ticker, bits, async () => {
    setSheetStatus('Building deploy…');
    const build = await cookDeploy({
      walletAddress: wallet.address,
      ticker,
      tokenName,
      maxSupply,
      premintSupply,
      mintPricePerTokenSompi
    });
    await signCookBuild(build, 'Launch ' + ticker);
    const mintAmt = Number(premintSupply);
    if (mintAmt > 0 && lastCookToken?.tokenId) {
      try {
        setSheetStatus('Minting premint…');
        const mint = await cookMint({
          walletAddress: wallet.address,
          tokenId: lastCookToken.tokenId,
          tokenAmount: String(mintAmt)
        });
        await signCookBuild(mint, 'Mint ' + ticker);
      } catch (e) {
        toast('Deployed. Premint mint: ' + errText(e));
      }
    }
  });
}

async function runCookGraduate() {
  if (!wallet) { toast('Unlock a wallet'); return; }
  if (!isTestnet()) {
    toast('Graduate/wrap is Cook TN10. Switch Network to Testnet-10. KRON tokens graduate on KRON itself.');
    return;
  }
  const tick = ($('at-ltick')?.value || atCook?.tick || lastCookToken?.tick || '').trim().toUpperCase();
  const amount = ($('at-lpre')?.value || '').trim();
  if (!amount || Number(amount) <= 0) { toast('Set Premint to the wrap amount'); return; }
  let id = lastCookToken?.tokenId || atCook?.tokenId || '';
  if (!id && tick) {
    const rows = await cookMarkets(40);
    const hit = rows.find(m => String(m.metadata?.ticker || '').toUpperCase() === tick);
    id = hit?.tokenIdHex || '';
  }
  if (!id) { toast('Launch first, or pick the token on Cook book'); return; }
  const wrappers = await cookWrappers(id);
  const wrapped = pickWrappedMarketId(wrappers);
  if (!wrapped) { toast('No DEX wrapper yet for this token'); return; }
  const bits = `
    <div class="kv"><span class="k">Token</span><span class="v">${esc(tick || id.slice(0, 8))}</span></div>
    <div class="kv"><span class="k">Wrap</span><span class="v">${esc(amount)}</span></div>
    <p class="muted" style="text-align:left;padding-top:8px;">Wraps canonical KCC20 V1 into DEX Orderbook V1 so it can rest/fill on Cook. You sign. No custody.</p>`;
  await confirmAtSign('Graduate / wrap ' + (tick || 'token'), bits, async () => {
    setSheetStatus('Building wrap…');
    const build = await cookWrap({
      walletAddress: wallet.address,
      tokenId: id,
      wrappedMarketId: wrapped,
      tokenAmount: amount
    });
    await signCookBuild(build, 'Wrap ' + tick);
  });
}

const AGENT_STRATS = {
  range: 'Range: buy if the live AMM quote is at or under Buy below. Sell if it is at or over Sell above. Floors/ceilings prefill ~4% under / 5% over the current price when you pick a token.',
  dip: 'Dip catch: buy after a drop of Dip % off the recent candle high (not your typed floor). Set Sell above if you also want to dump a bounce.',
  trend: 'Trend: buy after three green closes while price is above the 8-bar average. Sell after three red closes. Ignores Buy below / Sell above.',
  curve: 'Curve stack: on an ungraduated KRON curve, keep buying dips until Max KAS. After graduation it falls back to your range caps and can sell.',
  fade: 'Fade pump: sell into a spike (near the recent high or a hot 24h). Only buy back after a full Dip % crash from that high.'
};

function selectedAgentStrat() {
  return $('ag-strat')?.querySelector('button.on')?.dataset.strat || 'range';
}

function syncAgStratUi(strat) {
  const s = strat || selectedAgentStrat();
  $('ag-strat')?.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.strat === s));
  if ($('ag-strat-help')) $('ag-strat-help').textContent = AGENT_STRATS[s] || AGENT_STRATS.range;
  $('ag-pct-wrap')?.classList.toggle('hidden', s !== 'dip' && s !== 'fade');
  $('ag-levels')?.classList.toggle('hidden', s === 'trend');
}

async function fillAgentMarkets() {
  const box = $('ag-picks');
  const list = $('ag-tick-list');
  try {
    const mkts = await kronMarkets();
    const rows = (mkts || []).filter(m => validTick(m.tick));
    const byTick = new Map(rows.map(m => [m.tick, m]));
    const featured = ['KKDAG', 'KRON', 'IFWEN', 'KASCOV', 'KASDIA', 'PEPE', 'NACHO', 'ANSEM', 'MACH', 'KROSHI'];
    const top = [];
    for (const t of featured) if (byTick.has(t)) top.push(byTick.get(t));
    for (const m of rows) {
      if (top.length >= 10) break;
      if (!top.some(x => x.tick === m.tick)) top.push(m);
    }
    if (list) {
      list.innerHTML = rows.slice(0, 40).map(m => `<option value="${esc(m.tick)}">${esc(m.tick)}</option>`).join('');
    }
    if (box) {
      const cur = ($('ag-tick')?.value || 'KKDAG').trim().toUpperCase();
      box.innerHTML = top.map(m =>
        `<button type="button" data-ag-pick="${esc(m.tick)}" class="${m.tick === cur ? 'on' : ''}">${esc(m.tick)}</button>`
      ).join('');
    }
  } catch {}
}

function prefillAgentLevels(px) {
  const p = Number(px || 0);
  if (!(p > 0)) return;
  // Buy on a dip (~14%), sell for a real spread after AMM fees (~24%) — not a 1–2% scalp.
  if ($('ag-buy') && document.activeElement !== $('ag-buy')) $('ag-buy').value = Number(p * 0.86).toPrecision(4);
  if ($('ag-sell') && document.activeElement !== $('ag-sell')) $('ag-sell').value = Number(p * 1.24).toPrecision(4);
}

async function agentLiveInfo(tick) {
  const t = String(tick || '').toUpperCase();
  let info = await lookupKronTick(t).catch(() => null);
  if (!(Number(info?.price) > 0)) {
    const mk = ((await kronMarkets().catch(() => [])) || []).find(m => m.tick === t);
    if (mk) info = { tick: t, price: mk.price, change24h: mk.change24h, graduated: mk.graduated, decimals: mk.decimals };
  }
  return info;
}

async function applyAgentTick(tick, { prefill = true } = {}) {
  const t = String(tick || '').trim().toUpperCase();
  if (!validTick(t) && t) { toast('Ticker like KRON, KKDAG, IFWEN'); return; }
  if (!t) return;
  const job = loadAgentJob();
  if (job?.on && job.tick && job.tick !== t) {
    toast('Stop Scorpion to switch token');
    if ($('ag-tick')) $('ag-tick').value = job.tick;
    return;
  }
  if ($('ag-tick')) $('ag-tick').value = t;
  document.querySelectorAll('#ag-picks [data-ag-pick]').forEach(b => b.classList.toggle('on', b.dataset.agPick === t));
  if (!isTestnet() && prefill) {
    try {
      const info = await agentLiveInfo(t);
      const px = Number(info?.price || 0);
      if (px > 0) {
        if ($('ag-now')) $('ag-now').textContent = t + ' now ' + fmtPx(px) + ' KAS · 24h ' + fmtChg(info.change24h);
        prefillAgentLevels(px);
        const paused = loadAgentJob();
        if (paused && !paused.on) {
          saveAgentJob({
            ...paused,
            tick: t,
            buyBelow: Number($('ag-buy')?.value || 0),
            sellAbove: Number($('ag-sell')?.value || 0),
            preview: { tick: t, indexPx: px, ammPx: px, change24h: Number(info.change24h || 0), graduated: !!info.graduated }
          });
        }
      }
    } catch (e) {
      if ($('ag-now')) $('ag-now').textContent = t + ' · ' + agentSoftErr(e, t);
    }
  }
  await refreshAgentPreview();
}

function candleHigh(candles, n = 36) {
  const rows = (candles || []).slice(-n);
  let h = 0;
  for (const c of rows) h = Math.max(h, Number(c.h || c.c || 0));
  return h;
}

function candleSma(candles, n = 8) {
  const rows = (candles || []).slice(-n);
  if (!rows.length) return 0;
  return rows.reduce((a, c) => a + Number(c.c || 0), 0) / rows.length;
}

function lastClosesDir(candles, n = 3) {
  const rows = (candles || []).slice(-n);
  if (rows.length < n) return 0;
  let up = true, down = true;
  for (let i = 1; i < rows.length; i++) {
    if (!(rows[i].c > rows[i - 1].c)) up = false;
    if (!(rows[i].c < rows[i - 1].c)) down = false;
  }
  if (up) return 1;
  if (down) return -1;
  return 0;
}

function agentWants(job, { px, candles, graduated, change24h }) {
  if (job.scalp) {
    const sma = candleSma(candles, 8);
    const gap = sma > 0 ? (px - sma) / sma : 0;
    return {
      buy: sma > 0 && gap <= -0.02,
      sell: sma > 0 && gap >= 0.02,
      why: sma ? ('scalp vs SMA ' + fmtPx(sma) + ' · gap ' + (gap * 100).toFixed(1) + '%') : 'need candles for mean-revert'
    };
  }
  const strat = job.strat || 'range';
  const buyCap = Number(job.buyBelow || 0);
  const sellCap = Number(job.sellAbove || 0);
  const pct = Math.max(1, Number(job.pct || 5)) / 100;
  const high = candleHigh(candles, 36);
  const sma = candleSma(candles, 8);
  const dir = lastClosesDir(candles, 3);
  const chg = Number(change24h || 0);
  const chgPct = Math.abs(chg) <= 2 ? chg * 100 : chg;
  if (strat === 'dip') {
    const floor = high > 0 ? high * (1 - pct) : 0;
    return {
      buy: px > 0 && floor > 0 && px <= floor && (!buyCap || px <= buyCap),
      sell: sellCap > 0 && px >= sellCap,
      why: high ? ('dip trigger ' + fmtPx(floor) + ' · high ' + fmtPx(high)) : 'need candles'
    };
  }
  if (strat === 'trend') {
    return {
      buy: dir > 0 && sma > 0 && px >= sma,
      sell: dir < 0,
      why: dir > 0 ? '3 green closes · SMA ' + fmtPx(sma) : (dir < 0 ? '3 red closes' : 'chop · SMA ' + fmtPx(sma))
    };
  }
  if (strat === 'curve') {
    if (graduated) {
      return { buy: buyCap > 0 && px <= buyCap, sell: sellCap > 0 && px >= sellCap, why: 'graduated — using range caps' };
    }
    const floor = buyCap || (high > 0 ? high * 0.97 : 0);
    return { buy: px > 0 && floor > 0 && px <= floor, sell: false, why: 'curve stack · buy ≤ ' + fmtPx(floor) };
  }
  if (strat === 'fade') {
    const ext = high > 0 ? high * (1 - pct * 0.4) : 0;
    const dip = high > 0 ? high * (1 - pct) : 0;
    return {
      buy: dip > 0 && px <= dip,
      sell: (ext > 0 && px >= ext) || chgPct >= 8,
      why: 'fade · dump ≥ ' + fmtPx(ext) + ' · buy ≤ ' + fmtPx(dip)
    };
  }
  return {
    buy: buyCap > 0 && px <= buyCap,
    sell: sellCap > 0 && px >= sellCap,
    why: 'range ' + fmtPx(buyCap) + ' / ' + fmtPx(sellCap)
  };
}

function agentNetLine(job) {
  const tn = isTestnet();
  if (tn) return 'TN10 · K.COM / Scorpion book — not KRON AMM';
  const mode = job?.preview?.graduated === false ? 'curve AMM' : 'pool AMM';
  return 'Mainnet · KRON ' + mode + ' · real KAS';
}

function paintAgentFills(job) {
  const box = $('ag-fills');
  if (!box) return;
  const fills = Array.isArray(job?.fills) ? job.fills.slice(-12).reverse() : [];
  if (!fills.length) {
    box.innerHTML = '<span>No Scorpion fills this session. Buys and sells print here and on Activity with an A-Trade badge.</span>';
    return;
  }
  const tick = job?.tick || '';
  box.innerHTML = '<div class="ag-fills-h">Scorpion fills</div>' + fills.map(f => {
    const cls = f.side === 'buy' ? 'up' : 'down';
    const when = f.t ? new Date(f.t).toLocaleTimeString() : '';
    const tx = f.txId
      ? `<a href="${esc(explorerTx(f.txId))}" target="_blank" rel="noopener">${esc(String(f.txId).slice(0, 10))}…</a>`
      : esc(f.note || '');
    return `<div class="ag-fill">${tokenDot({ ticker: f.tick || tick, protocol: 'kcc20', image: kronLogoFor(f.tick || tick) })}<span class="${cls}">${esc((f.side || '').toUpperCase())}</span> ${esc(f.tick || tick)} @ ${esc(fmtPx(f.px))} KAS · ${esc(when)} · ${tx}</div>`;
  }).join('');
}

function paintAgentStatus() {
  const mem = $('ag-memory');
  if (mem && !mem.dataset.ok) {
    mem.textContent = SCORPION_MEMORY;
    mem.dataset.ok = '1';
  }
  const el = $('ag-status');
  const btn = $('ag-toggle');
  const net = $('ag-net');
  const job = loadAgentJob();
  const running = !!(job?.on && agentTimer);
  if (btn) btn.textContent = running ? 'Stop Scorpion agent' : 'Start Scorpion agent';
  if (net) net.textContent = agentNetLine(job);
  if (!el) return;
  if (!job) {
    el.textContent = isTestnet()
      ? 'TN10 agent uses the K.COM book. Unlock, set a token, then Start.'
      : 'Mainnet agent buys/sells on the KRON AMM. Unlock, set levels, then Start. Keys stay here.';
    paintAgentFills(null);
    return;
  }
  const viewTick = (job.on ? job.tick : ($('ag-tick')?.value || job.tick || 'KKDAG')).trim().toUpperCase();
  if (job.on && $('ag-tick') && document.activeElement !== $('ag-tick')) $('ag-tick').value = viewTick;
  if (job.on && $('ag-size') && document.activeElement !== $('ag-size') && job.sizeKas) $('ag-size').value = String(job.sizeKas);
  if (job.on && $('ag-buy') && document.activeElement !== $('ag-buy') && job.buyBelow) $('ag-buy').value = String(job.buyBelow);
  if (job.on && $('ag-sell') && document.activeElement !== $('ag-sell') && job.sellAbove) $('ag-sell').value = String(job.sellAbove);
  if (job.on && $('ag-max') && document.activeElement !== $('ag-max') && job.maxKas) $('ag-max').value = String(job.maxKas);
  if (job.on && job.pct && $('ag-pct') && document.activeElement !== $('ag-pct')) $('ag-pct').value = String(job.pct);
  if (job.strat) syncAgStratUi(job.strat);
  document.querySelectorAll('#ag-picks [data-ag-pick]').forEach(b => b.classList.toggle('on', b.dataset.agPick === viewTick));
  const last = job.last || 'waiting for a cross';
  const spent = Number(job.spentKas || 0);
  const cap = Number(job.maxKas || 0);
  el.textContent = (running ? 'Scorpion on · ' : 'Paused · ') + viewTick + ' · bought '
    + spent.toFixed(3) + '/' + cap + ' KAS'
    + (spent >= cap - 1e-9 && cap > 0 ? ' · buy cap hit, sells still on' : '')
    + ' · ' + last;
  paintAgentFills(job);
  const p = (job.preview?.tick === viewTick ? job.preview : null)
    || (agentPreview?.tick === viewTick ? agentPreview : null);
  const qel = $('ag-quote');
  const stats = $('ag-stats');
  const nowPx = Number(p?.ammPx || p?.indexPx || 0);
  if ($('ag-now')) {
    $('ag-now').textContent = nowPx > 0
      ? viewTick + ' now ' + fmtPx(nowPx) + ' KAS · 24h ' + fmtChg(p.change24h)
      : viewTick + ' · loading quote';
  }
  if (p && stats) {
    const chg = Number(p.change24h || 0);
    stats.innerHTML = `
      <div class="at-stat"><b>${esc(fmtPx(p.ammPx || p.indexPx))}</b><span>Now AMM</span></div>
      <div class="at-stat"><b>${esc(fmtPx(p.indexPx))}</b><span>Index</span></div>
      <div class="at-stat"><b>${esc(p.tokens != null ? fmtTok(p.tokens) : '—')}</b><span>${esc(viewTick)} out</span></div>
      <div class="at-stat"><b>${esc(fmtChg(chg))}</b><span>24h</span></div>`;
  } else if (stats) {
    stats.innerHTML = '';
  }
  if (p && qel) {
    const buy = Number((job.on ? job.buyBelow : $('ag-buy')?.value) || job.buyBelow || 0);
    const sell = Number((job.on ? job.sellAbove : $('ag-sell')?.value) || job.sellAbove || 0);
    const px = Number(p.ammPx || p.indexPx || 0);
    const buyGap = buy > 0 && px > 0 ? ((px - buy) / buy) * 100 : null;
    const sellGap = sell > 0 && px > 0 ? ((sell - px) / px) * 100 : null;
    const bits = [];
    if (p.tokens != null) bits.push(fmtTok(job.sizeKas || $('ag-size')?.value) + ' KAS → ~' + fmtTok(p.tokens) + ' ' + viewTick);
    if (buyGap != null) bits.push(buyGap > 0 ? fmtPx(buyGap) + '% above buy ' + fmtPx(buy) : 'at buy ' + fmtPx(buy));
    if (sellGap != null) bits.push(sellGap > 0 ? fmtPx(sellGap) + '% to sell ' + fmtPx(sell) : 'at sell ' + fmtPx(sell));
    qel.textContent = bits.join(' · ') || last;
  } else if (qel) {
    qel.textContent = last;
  }
}

function stopAgentPreviewLoop() {
  if (agentPreviewTimer) { clearInterval(agentPreviewTimer); agentPreviewTimer = null; }
}

function startAgentPreviewLoop() {
  if (agentPreviewTimer) return;
  agentPreviewTimer = setInterval(() => { refreshAgentPreview().catch(() => {}); }, 5000);
  fillAgentMarkets().catch(() => {});
  refreshAgentPreview().catch(() => {});
}

async function refreshAgentPreview() {
  const job = loadAgentJob();
  const onAgent = !$('at-agent')?.classList.contains('hidden');
  if (!onAgent && !job?.on) return;
  const tick = ((job?.on ? job.tick : null) || $('ag-tick')?.value || 'KKDAG').trim().toUpperCase();
  const sizeKas = Number(job?.sizeKas || $('ag-size')?.value || 0.15);
  if (!tick) return;
  if (isTestnet()) {
    agentPreview = { tick, indexPx: 0, ammPx: 0, tokens: null, graduated: null, change24h: 0 };
    if ($('ag-quote')) $('ag-quote').textContent = 'TN10 preview is the K.COM book on COOK. KRON AMM is mainnet only.';
    if ($('ag-net')) $('ag-net').textContent = agentNetLine(job);
    return;
  }
  try {
    const [info, candles] = await Promise.all([
      agentLiveInfo(tick),
      kronCandles(tick, 48).catch(() => [])
    ]);
    let ammPx = Number(info?.price || 0);
    let tokens = null;
    let graduated = !!(info?.graduated);
    if (sizeKas > 0) {
      try {
        const q = await quoteKronTrade({ tick, side: 'buy', amount: String(sizeKas) });
        ammPx = impliedKronPx(q) || ammPx;
        tokens = Number(q.tokenOut) / (10 ** Number(q.decimals || 0));
        graduated = !!q.graduated;
      } catch {}
    }
    if (!(ammPx > 0) && !(Number(info?.price) > 0)) {
      agentPreview = { tick, indexPx: 0, ammPx: 0, tokens: null, graduated, change24h: Number(info?.change24h || 0) };
      if ($('ag-quote')) $('ag-quote').textContent = tick + ' quote retry';
      paintAgentStatus();
      return;
    }
    agentPreview = {
      tick,
      indexPx: Number(info?.price || 0),
      ammPx,
      tokens,
      graduated,
      decimals: Number(info?.decimals ?? 0),
      change24h: Number(info?.change24h || 0),
      note: 'Green 1d can still print a tape of sells — close vs prior close, not “no sellers”.'
    };
    if (job && (!job.on || String(job.tick).toUpperCase() === tick)) {
      job.preview = agentPreview;
      saveAgentJob(job);
    }
    if (onAgent) drawAtChart(candles, 'ag-chart');
    paintAgentStatus();
  } catch (e) {
    const msg = /fail(ed)? to fetch|network|HTTP/i.test(errText(e)) ? (tick + ' quote retry') : errText(e);
    if ($('ag-quote')) $('ag-quote').textContent = msg;
  }
}

function stopAgentLoop() {
  if (agentTimer) { clearInterval(agentTimer); agentTimer = null; }
  dropAgentWake();
  paintAgentStatus();
}

function resumeAgentIfAny() {
  const job = loadAgentJob();
  if (job?.on && sessionOpen()) {
    startAgentLoop();
    startAgentPreviewLoop();
    toast('Scorpion resumed · ' + (job.tick || '') + ' · ' + (isTestnet() ? 'TN10 book' : 'mainnet AMM'));
  } else paintAgentStatus();
}

async function holdAgentWake() {
  try {
    if (navigator.wakeLock?.request) agentWake = await navigator.wakeLock.request('screen');
  } catch { agentWake = null; }
}
function dropAgentWake() {
  try { agentWake?.release?.(); } catch {}
  agentWake = null;
}

function loadDeskId() {
  try { return localStorage.getItem(DESK_ID_KEY) || ''; } catch { return ''; }
}
function saveDeskId(id) {
  try {
    if (id) localStorage.setItem(DESK_ID_KEY, id);
    else localStorage.removeItem(DESK_ID_KEY);
  } catch {}
}
function deskWallet() {
  const id = loadDeskId();
  if (!id) return null;
  return loadWalletList().find(w => w.id === id && w.role === 'desk') || loadWalletList().find(w => w.id === id) || null;
}
function botVault() {
  let addr = '';
  try { addr = localStorage.getItem(DESK_VAULT_KEY) || ''; } catch {}
  const list = loadVaults();
  if (addr) {
    const hit = list.find(v => v.address === addr);
    if (hit) return hit;
  }
  return list.find(v => v.bot || v.params?.bot) || null;
}
async function ensureBotVault() {
  const existing = botVault();
  if (existing) return existing;
  if (!wallet?.pubKey) throw new Error('Unlock a wallet first');
  await loadKaspaSdk();
  const built = await buildOwnerEnvelope({ pubkeyHex: wallet.pubKey });
  const v = {
    address: built.address,
    redeemHex: built.redeemHex,
    scriptHex: built.redeemHex,
    spkHex: built.spkHex,
    type: 'life',
    productId: 'life',
    name: 'Scorpion Bot',
    bot: true,
    status: 'ready',
    deskId: loadDeskId(),
    ownerAddress: wallet.address,
    params: {
      bot: true,
      unlockAnytime: true,
      lifeKind: 'control',
      lifeLabel: 'Bot treasury'
    }
  };
  saveVault(v);
  try { localStorage.setItem(DESK_VAULT_KEY, v.address); } catch {}
  return v;
}
function agentWallet() {
  const job = loadAgentJob();
  if (job?.deskId) {
    const w = loadWalletList().find(x => x.id === job.deskId);
    if (w) return w;
  }
  return deskWallet() || wallet;
}

function paintDesk() {
  const dw = deskWallet();
  const vault = botVault();
  const line = $('desk-wallet-line');
  const st = $('desk-status');
  const job = loadAgentJob();
  if (line) {
    if (!dw) line.textContent = 'No bot yet. New desk wallet makes a covenant++ treasury (kaspa:p) plus a till key.';
    else if (vault) line.textContent = 'Treasury ' + shortAddr(vault.address, 12, 8) + ' · till ' + shortAddr(dw.address, 10, 6);
    else line.textContent = 'Till ' + shortAddr(dw.address, 12, 8) + ' · keys on this device';
  }
  if (st) {
    if (job?.on && job.deskId) st.textContent = (job.last || 'armed') + ' · ' + (job.tick || '');
    else if (dw) st.textContent = 'Pick a wallet with KAS, fund the treasury, then sign to deploy.';
  }
}

async function researchDeskTick() {
  const tick = String($('desk-tick')?.value || 'KKDAG').trim().toUpperCase();
  if (!tick) { toast('Set a ticker'); return; }
  $('desk-verdict').textContent = 'Checking ' + tick + ' on KRON idx + AMM…';
  $('desk-facts').innerHTML = '';
  let info = {};
  let q = null;
  let candles = [];
  const sizeKas = Number($('desk-size')?.value || 0.15);
  try { info = await lookupKronTick(tick); } catch (e) { info = { error: errText(e) }; }
  try { q = await quoteKronTrade({ tick, side: 'buy', amount: String(sizeKas) }); } catch (e) { q = { error: errText(e) }; }
  try { candles = await kronCandles(tick, 48); } catch { candles = []; }
  const indexPx = Number(info?.price || 0);
  const ammPx = q && !q.error ? impliedKronPx(q) : 0;
  const gate = scalpGate({
    sizeKas,
    indexPx,
    ammPx,
    quote: q && !q.error ? q : null,
    lastFillAt: 0
  });
  const report = {
    tick,
    indexPx,
    ammPx,
    change24h: Number(info?.change24h || 0),
    graduated: !!(info?.graduated || q?.graduated),
    feeBps: gate.feeBps,
    poolKas: gate.poolKas,
    candles: (candles || []).length
  };
  const facts = factCheck(report);
  $('desk-verdict').textContent =
    (gate.tradable ? 'Gates open for a tiny mean-revert. ' : 'Do not scalp this size. ')
    + (gate.reasons[0] || 'fees and pool look usable.')
    + '\n\n' + DESK_PLAYBOOK.split('\n').slice(0, 4).join('\n');
  $('desk-facts').innerHTML = facts.map(f => {
    const cls = String(f.verdict).toLowerCase();
    return '<li><b class="' + cls + '">' + esc(f.verdict) + '</b> ' + esc(f.claim) + ' — ' + esc(f.why) + '</li>';
  }).join('');
  try {
    const grok = await fetch('/api/desk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report, facts })
    });
    if (grok.ok) {
      const j = await grok.json();
      if (j.summary) $('desk-verdict').textContent = String(j.trade || 'wait').toUpperCase() + ' — ' + j.summary + (j.why ? '\n' + j.why : '');
    }
  } catch {}
  toast(gate.tradable ? tick + ' · desk could try a tiny size' : tick + ' · skip (thin or expensive)');
}

async function createDeskWallet() {
  if (!wallet) { toast('Unlock a wallet first'); return; }
  if (deskWallet()) { toast('Desk already exists — Show desk key or Send it KAS'); paintDesk(); return; }
  await requirePin('Create Scorpion desk wallet');
  await loadCryptoLibs();
  const priv = await generatePrivateKey();
  const kp = await createKeypairFromHex(priv);
  const list = loadWalletList();
  const w = {
    ...kp,
    id: uid(),
    name: 'Scorpion Desk',
    role: 'desk',
    createdAt: Date.now()
  };
  list.push(w);
  saveWalletList(list);
  saveDeskId(w.id);
  const vault = await ensureBotVault();
  paintDesk();
  renderProfile();
  toast('Bot treasury ' + shortAddr(vault.address, 10, 6) + ' + till key. Fund from any wallet, then sign.');
}

function fundDesk() {
  openFundBotSheet().catch(err => toast(errText(err)));
}

function fundSources() {
  const desk = deskWallet();
  return loadWalletList().filter(w => w.role !== 'desk' && w.id !== desk?.id);
}

function walletKasLabel(w) {
  const active = w.id === wallet?.id || w.address === wallet?.address;
  const sompi = active ? balanceSompi : walletSnap[w.address]?.sompi;
  return sompi == null ? '…' : formatAmount(sompi) + ' KAS';
}

function sourceSompi(w) {
  if (!w) return 0;
  if (w.id === wallet?.id || w.address === wallet?.address) return Number(balanceSompi || 0);
  return Number(walletSnap[w.address]?.sompi || 0);
}

async function openFundBotSheet() {
  const dw = deskWallet();
  if (!dw) { toast('Create the bot first'); return; }
  const vault = await ensureBotVault();
  const dest = vault.address;
  haptic();
  toast('Reading wallet balances…');
  const sources = fundSources();
  await Promise.all(sources.map(async w => {
    if (w.id === wallet?.id || w.address === wallet?.address) return;
    try {
      const sompi = await fetchAddressBalance(w.address);
      walletSnap[w.address] = { ...(walletSnap[w.address] || {}), sompi: Number(sompi), at: Date.now() };
    } catch {}
  }));
  persistSnaps();
  sources.sort((a, b) => sourceSompi(b) - sourceSompi(a));
  const amt0 = $('desk-max')?.value || '1';
  const rows = sources.map(w => {
    const sompi = sourceSompi(w);
    const empty = !(sompi > 800000);
    const active = w.id === wallet?.id;
    return `
      <button class="row token-row" type="button" data-fund-from="${esc(w.id)}" ${empty ? 'disabled style="opacity:.45"' : ''}>
        <div class="you-wava ${active ? 'on' : ''}">${youInitial(w.name)}</div>
        <div style="flex:1;min-width:0">
          <div class="title">${esc(w.name || 'Wallet')}</div>
          <div class="sub">${esc(walletKns(w) || shortAddr(w.address, 10, 6))}${active ? ' · open now' : ''}</div>
        </div>
        <div class="amt"><b>${esc(formatAmount(sompi))} KAS</b><em>${empty ? 'empty' : 'Send from here'}</em></div>
      </button>`;
  }).join('') || '<div class="empty">No wallets to fund from.</div>';
  const funded = sources.filter(w => sourceSompi(w) > 800000).length;
  openSheet('Fund bot', `
    <p class="muted" style="text-align:left;padding:0 0 10px;">Tap a wallet that has KAS. It pays the <b>covenant++ treasury</b> (${esc(shortAddr(dest, 12, 8))}). Empty wallets are greyed out — that 0.00 send sheet was not a network error.</p>
    <div class="field"><label>Amount KAS</label>
      <input id="desk-fund-amt" type="number" min="0.05" step="0.05" value="${esc(amt0)}">
    </div>
    <div class="glass list" id="desk-fund-list">${rows}</div>
    ${funded ? '' : '<p class="muted" style="text-align:left;padding-top:8px;">None of these wallets have KAS on this network. Switch Network if the coins are on the other chain, or receive KAS first.</p>'}
  `, { confirm: 'Close', cancel: false });
  $('desk-fund-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-fund-from]');
    if (!btn?.dataset.fundFrom || btn.disabled) return;
    fundBotFrom(btn.dataset.fundFrom).catch(err => toast(errText(err)));
  });
}

async function fundBotFrom(id) {
  const src = loadWalletList().find(w => w.id === id);
  const vault = await ensureBotVault();
  const dest = vault.address;
  const amt = Number($('desk-fund-amt')?.value || 1);
  if (!src) throw new Error('Pick a wallet');
  if (!dest) throw new Error('Create the bot first');
  if (!(amt > 0)) throw new Error('Set an amount');
  hydrateNativeKey(src);
  const sompi = sourceSompi(src);
  const need = Math.round((amt + 0.02) * 1e8);
  if (!(sompi >= need)) {
    throw new Error((src.name || 'Wallet') + ' has ' + formatAmount(sompi) + ' KAS. Need ' + amt + ' + fee. Pick a funded wallet.');
  }
  if (!hexKey(src.privKey) && !kaswareSigning(src)) {
    throw new Error('No local key for ' + (src.name || 'that wallet') + '. Open it on You, then fund.');
  }
  await requirePin('Send ' + amt + ' KAS from ' + (src.name || 'wallet') + ' to bot treasury');
  toast('Sending from ' + (src.name || 'wallet') + '…');
  const utxos = await fetchAddressUtxos(src.address);
  if (!utxos.length) throw new Error((src.name || 'Wallet') + ' has 0 UTXOs');
  const result = await sendKas({
    wallet: src,
    dest,
    amountKas: String(amt),
    utxos
  });
  toast('Treasury funded · ' + String(result.txId || '').slice(0, 10) + '…');
  closeSheet();
  openBotSheet();
}

async function showDeskKey() {
  const dw = deskWallet();
  if (!dw?.privKey) { toast('No local desk key'); return; }
  await requirePin('Show Scorpion desk private key');
  openSheet('Desk key', `
    <p class="muted" style="text-align:left;">This hex is the desk’s Schnorr key. It never left this device. Anyone with it can spend the KAS you sent the desk.</p>
    <div class="field"><label>Private key</label><textarea id="desk-hex" rows="3" readonly>${esc(dw.privKey)}</textarea></div>
    <p class="at-tiny">${esc(dw.address || '')}</p>
  `, {
    confirm: 'Copy key', gold: true, cancel: 'Hide', onConfirm: async () => {
      await navigator.clipboard.writeText(dw.privKey);
      toast('Desk key copied');
    }
  });
}

async function deployDesk() {
  const dw = deskWallet();
  if (!dw) { toast('Create the desk wallet first'); return; }
  const tick = String($('desk-tick')?.value || 'KKDAG').trim().toUpperCase();
  const sizeKas = Number($('desk-size')?.value || 0.15);
  const maxKas = Number($('desk-max')?.value || 1);
  if (isTestnet()) { toast('Desk scalp is mainnet KRON. Switch Network off TN10.'); return; }
  if (!tick || tick === 'KRON') { toast('Pick a KRON KCC20 tick (e.g. KKDAG), not the venue name'); return; }
  if (!(sizeKas > 0) || !(maxKas > 0)) { toast('Set Size and Max KAS'); return; }
  await requirePin('Sign desk policy: ' + tick + ' · max ' + maxKas + ' KAS from desk wallet');
  const vault = botVault();
  if (vault) {
    try {
      const vUtxos = await fetchAddressUtxos(vault.address);
      if (vUtxos.length) {
        toast('Sweeping treasury into till…');
        const owner = loadWalletList().find(w => sameAddrPayload(w.address, vault.ownerAddress || vault.walletAddress)) || wallet;
        await sweepVault({ wallet: owner, vault, utxos: vUtxos, payoutAddr: dw.address });
        toast('Till loaded from covenant++');
      }
    } catch (e) {
      toast('Treasury still locked / empty · ' + errText(e));
    }
  }
  const prev = loadAgentJob();
  saveAgentJob({
    on: true,
    tick,
    sizeKas,
    maxKas,
    strat: 'range',
    pct: 5,
    buyBelow: 0,
    sellAbove: 0,
    scalp: true,
    deskId: dw.id,
    spentKas: 0,
    last: 'signed desk · ' + tick,
    startedAt: Date.now(),
    signedAt: Date.now(),
    signer: wallet?.address || '',
    venue: 'kron',
    tokenId: '',
    fills: Array.isArray(prev?.fills) ? prev.fills.slice(-12) : []
  });
  if ($('ag-tick')) $('ag-tick').value = tick;
  if ($('ag-size')) $('ag-size').value = String(sizeKas);
  if ($('ag-max')) $('ag-max').value = String(maxKas);
  startAgentLoop();
  paintDesk();
  paintAgentStatus();
  toast('Desk signed. It spends only the desk wallet. Stop anytime.');
}

function stopDesk() {
  const job = loadAgentJob();
  if (job?.on) saveAgentJob({ ...job, on: false, last: 'desk stopped' });
  stopAgentLoop();
  paintDesk();
  paintAgentStatus();
  toast('Desk stopped');
}

function startAgentLoop() {
  stopAgentLoop();
  const job = loadAgentJob();
  if (!job?.on) return;
  agentTimer = setInterval(() => { tickAgent().catch(() => {}); }, 8000);
  startAgentPreviewLoop();
  holdAgentWake();
  paintAgentStatus();
  tickAgent().catch(() => {});
}

async function toggleAgent() {
  const job = loadAgentJob();
  if (job?.on) {
    saveAgentJob({ ...job, on: false, last: 'stopped' });
    stopAgentLoop();
    toast('Scorpion stopped');
    paintAgentStatus();
    return;
  }
  if (!wallet) { toast('Unlock a wallet'); return; }
  const tick = ($('ag-tick')?.value || (isTestnet() ? '' : 'KKDAG')).trim().toUpperCase();
  const sizeKas = Number($('ag-size')?.value || 0.15);
  const buyBelow = Number($('ag-buy')?.value || 0);
  const sellAbove = Number($('ag-sell')?.value || 0);
  const maxKas = Number($('ag-max')?.value || 1);
  if (!tick) { toast(isTestnet() ? 'Pick a K.COM or Scorpion token first' : 'Set a token'); return; }
  if (isTestnet() && tick === 'KRON') { toast('KRON is mainnet-only. Arm a K.COM / Scorpion token on TN10.'); return; }
  if (!(sizeKas > 0)) { toast('Set Size KAS (native Kaspa per buy)'); return; }
  if (!(maxKas > 0)) { toast('Set Max KAS (session buy budget)'); return; }
  const strat = selectedAgentStrat();
  const pct = Number($('ag-pct')?.value || 5);
  if (strat === 'range' && !(buyBelow > 0) && !(sellAbove > 0)) {
    toast('Range needs a buy-below and/or sell-above');
    return;
  }
  if (kaswareEnabled()) {
    toast('KasWare will pop for each fill');
  } else {
    try { await requirePin('Start Scorpion on ' + tick); }
    catch (e) { if (errText(e) === 'cancelled') return; toast(errText(e)); return; }
  }
  const prev = Array.isArray(job?.fills) ? job.fills : [];
  saveAgentJob({
    on: true, tick, sizeKas, buyBelow, sellAbove, maxKas,
    strat, pct: Number.isFinite(pct) ? pct : 5,
    spentKas: 0, last: 'armed ' + strat + ' · buy cap ' + maxKas + ' KAS', startedAt: Date.now(),
    venue: isTestnet() ? 'cook' : 'kron',
    tokenId: isTestnet() ? (atCook?.tokenId || atDesk?.tokenId || '') : '',
    fills: prev.slice(-12)
  });
  startAgentLoop();
  startAgentPreviewLoop();
  refreshAgentPreview().catch(() => {});
  toast('Scorpion armed on ' + tick + (isTestnet() ? ' · TN10 book' : ' · mainnet KRON AMM'));
  paintAgentStatus();
}

function agentSoftErr(e, tick) {
  const msg = errText(e);
  if (/fail(ed)? to fetch|network|HTTP|indexer/i.test(msg)) return (tick || 'token') + ' idx retry';
  return msg;
}

function pushAgentFill(job, side, fillPx, txId, note) {
  job.fills = (job.fills || []).concat({
    t: Date.now(),
    side,
    tick: job.tick,
    px: fillPx,
    txId: txId || '',
    note: note || ''
  }).slice(-12);
}

async function tickAgent() {
  if (agentBusy) return;
  if (!sessionOpen()) {
    paintAgentStatus();
    return;
  }
  const job = loadAgentJob();
  if (!job?.on) { stopAgentLoop(); return; }
  const signer = agentWallet();
  if (!signer?.address) { job.last = 'no desk/signer'; saveAgentJob(job); paintAgentStatus(); return; }
  agentBusy = true;
  try {
    if (job.venue === 'cook' && job.tokenId) {
      const q = await cookQuote(job.tokenId, { side: 'buy', amount: String(job.sizeKas), mode: 'market' });
      const px = sompiToKas(q?.averageUnitPriceSompi || q?.unitPriceSompi);
      if (!(px > 0) || !q?.valid) { job.last = 'no K.COM fill'; saveAgentJob(job); paintAgentStatus(); return; }
      const canBuy = (job.spentKas || 0) + job.sizeKas <= job.maxKas + 1e-9;
      if (job.buyBelow > 0 && px <= job.buyBelow && canBuy) {
        job.last = 'buying @ ' + px.toPrecision(4);
        saveAgentJob(job);
        paintAgentStatus();
        const wrappers = await cookWrappers(job.tokenId);
        const wrapped = pickWrappedMarketId(wrappers);
        if (!wrapped) { job.last = 'no wrapper'; saveAgentJob(job); paintAgentStatus(); return; }
        const result = await runCookOrder({
          side: 'buy', amount: String(job.sizeKas), id: job.tokenId, wrapped,
          rest: false, quote: q, limit: job.buyBelow, slip: 2
        });
        job.spentKas = (job.spentKas || 0) + job.sizeKas;
        job.last = 'bought cook · ' + px.toPrecision(4);
        pushAgentFill(job, 'buy', px, result?.txId, job.sizeKas + ' KAS');
        noteATradeActivity(job, 'buy', px, result || {});
        saveAgentJob(job);
        afterTx();
      } else {
        job.last = (!canBuy ? 'buy cap hit, sells still on · ' : '') + px.toPrecision(4) + ' KAS · waiting';
        saveAgentJob(job);
      }
      paintAgentStatus();
      return;
    }
    const [info, candles] = await Promise.all([
      agentLiveInfo(job.tick),
      kronCandles(job.tick, 48).catch(() => [])
    ]);
    const indexPx = Number(info?.price || 0);
    let px = indexPx;
    let qBuy = null;
    try {
      qBuy = await quoteKronTrade({ tick: job.tick, side: 'buy', amount: String(job.sizeKas) });
      px = impliedKronPx(qBuy) || indexPx;
      job.preview = {
        tick: job.tick,
        indexPx,
        ammPx: px,
        tokens: Number(qBuy.tokenOut) / (10 ** Number(qBuy.decimals || 0)),
        graduated: !!qBuy.graduated,
        decimals: Number(qBuy.decimals || 0),
        change24h: Number(info?.change24h || 0)
      };
    } catch (qe) {
      if (!(indexPx > 0)) {
        job.last = agentSoftErr(qe, job.tick);
        saveAgentJob(job);
        paintAgentStatus();
        return;
      }
    }
    if (!(px > 0)) { job.last = job.tick + ' idx retry'; saveAgentJob(job); paintAgentStatus(); return; }
    drawAtChart(candles, 'ag-chart');
    const want = agentWants(job, {
      px,
      candles,
      graduated: !!(job.preview?.graduated ?? info?.graduated),
      change24h: Number(info?.change24h || 0)
    });
    const canBuy = (job.spentKas || 0) + job.sizeKas <= Number(job.maxKas || 0) + 1e-9;
    if (job.scalp && (want.buy || want.sell)) {
      const lastFillAt = (job.fills || []).slice(-1)[0]?.t || 0;
      const hold = holdingForTick(job.tick);
      const dec = Number(hold?.decimals ?? job.preview?.decimals ?? 0);
      const holdTokens = hold ? Number(hold.balance || 0) / (10 ** dec) : 0;
      const gate = scalpGate({
        sizeKas: job.sizeKas,
        indexPx,
        ammPx: px,
        quote: qBuy,
        lastFillAt,
        holdTokens: want.buy ? holdTokens : 0,
        sizeTokens: px > 0 ? job.sizeKas / px : 0
      });
      if (!gate.tradable) {
        job.last = 'no scalp · ' + (gate.reasons[0] || 'gate');
        saveAgentJob(job);
        paintAgentStatus();
        paintDesk();
        return;
      }
    }
    const tradeWallet = signer;
    const tradeUtxos = await fetchAddressUtxos(tradeWallet.address).catch(() => []);
    const forceKw = !!(tradeWallet.kasware && kaswareEnabled());
    if (want.buy && canBuy) {
      job.last = 'buying AMM @ ' + px.toPrecision(4);
      saveAgentJob(job);
      paintAgentStatus();
      const result = await executeKronTrade({
        wallet: tradeWallet,
        tick: job.tick,
        side: 'buy',
        amount: String(job.sizeKas),
        utxos: tradeUtxos,
        forceKasware: forceKw,
        onStatus: (m) => toast(m)
      });
      job.spentKas = (job.spentKas || 0) + job.sizeKas;
      job.last = 'bought AMM · ' + px.toPrecision(4);
      noteKronFill(result.quote);
      noteATradeActivity(job, 'buy', px, result);
      pushAgentFill(job, 'buy', px, result.txId, job.sizeKas + ' KAS');
      saveAgentJob(job);
      afterTx();
    } else if (want.sell) {
      let hold = holdingForTick(job.tick);
      if (job.deskId && tradeWallet.address !== wallet?.address) {
        const rows = await fetchKronAddrHoldings(tradeWallet.address);
        hold = (rows || []).find(x => String(x.ticker || x.tick || '').toUpperCase() === job.tick) || hold;
      }
      if (!hold || !(Number(hold.balance) > 0)) {
        job.last = fmtPx(px) + ' AMM · no ' + job.tick + ' to sell';
        saveAgentJob(job);
        paintAgentStatus();
        return;
      }
      const dec = Number(hold.decimals ?? job.preview?.decimals ?? 0);
      const have = Number(hold.balance || 0) / (10 ** dec);
      const wantAmt = job.sizeKas / px;
      let amt = Math.min(have, wantAmt);
      if (dec === 0) amt = Math.floor(amt);
      if (!(amt > 0)) { job.last = 'need at least 1 ' + job.tick + ' to sell'; saveAgentJob(job); return; }
      job.last = 'selling AMM @ ' + px.toPrecision(4);
      saveAgentJob(job);
      paintAgentStatus();
      const result = await executeKronTrade({
        wallet: tradeWallet,
        tick: job.tick,
        side: 'sell',
        amount: String(amt),
        utxos: await fetchAddressUtxos(tradeWallet.address).catch(() => []),
        forceKasware: forceKw,
        onStatus: (m) => toast(m)
      });
      job.last = 'sold AMM · ' + px.toPrecision(4);
      noteKronFill(result.quote);
      noteATradeActivity(job, 'sell', px, result);
      pushAgentFill(job, 'sell', px, result.txId, '');
      saveAgentJob(job);
      afterTx();
    } else {
      const capNote = (!canBuy ? 'buy cap hit, sells still on · ' : '');
      job.last = capNote + fmtPx(px) + ' AMM · ' + (want.why || 'waiting');
      saveAgentJob(job);
    }
    paintAgentStatus();
  } catch (e) {
    const job2 = loadAgentJob() || job;
    job2.last = agentSoftErr(e, job.tick);
    saveAgentJob(job2);
    paintAgentStatus();
  } finally {
    agentBusy = false;
  }
}

function betTickNow() {
  return String($('bet-tick')?.value || betFocus || 'KKDAG').trim().toUpperCase() || 'KKDAG';
}

function paintBetHireStatus() {
  const job = loadBetHire();
  const el = $('bet-hire-st');
  const pass = isKcc20Pass(kccHoldings);
  if ($('bet-pass')) {
    $('bet-pass').textContent = pass
      ? 'KCC20 pass on · hold ≥ ' + SUB_HOLD_SAFE() + ' KKDAG · extra hours + 1 hour free'
      : 'KCC20 pass locked · hold ≥ 1,000 KKDAG to unlock more hire hours';
  }
  paintBetCost();
  paintBetFills();
  if (!job || !job.on || betAbort || readBetAbort()) {
    if (el) el.textContent = 'Stopped.';
    return;
  }
  const left = Math.max(0, Number(job.until || 0) - Date.now());
  if (el) {
    el.textContent = 'Hired · ' + (job.tick || '') + ' · '
      + Math.ceil(left / 3600000) + 'h left · ' + (job.last || 'waiting next 15m');
  }
}

function paintBetFills() {
  const fills = $('bet-fills');
  if (!fills) return;
  const rows = loadBetBook().slice(-10).reverse();
  fills.innerHTML = rows.map(f => {
    const cls = f.side === 'yes' ? 'up' : 'down';
    const st = f.paidTxId
      ? (f.won ? 'paid' : (f.refunded ? 'refund' : 'settled'))
      : (f.pending ? (f.won ? 'waiting escrow' : 'lost · escrow') : 'locked');
    const id = f.betId || betIdFromAddr(f.vaultAddr);
    const href = explorerTx(f.txId);
    const tx = href ? `<a href="${esc(href)}" target="_blank" rel="noopener">tx</a>` : '';
    return `<button class="bet-ticket" type="button" data-bet-addr="${esc(f.vaultAddr || f.txId || '')}" title="Copy id">
      <b class="bet-id">${esc(id || betIdFromTxid(f.txId) || 'Bet')}</b>
      <span class="${cls}">${esc((f.side || '').toUpperCase())}</span>
      ${esc(String(f.sizeKas || ''))} ${esc(f.tick || '')} · ${esc(st)} ${tx}
    </button>`;
  }).join('') || '<div>No tickets yet. Tap YES or NO — a covenant++ escrow is created for that bet.</div>';
}

function SUB_HOLD_SAFE() { return 1000; }

function betStakeMeta() {
  const tick = betTickNow();
  const hold = holdingForTick(tick);
  const dec = betDecimals(hold);
  return {
    tick,
    hold,
    dec,
    have: humanTokenBalance(hold),
    min: betMinStake(dec),
    step: betStakeStep(dec)
  };
}

function paintBetStakeLabels() {
  const m = betStakeMeta();
  if ($('bet-size-lab')) $('bet-size-lab').textContent = 'Stake ' + m.tick;
  if ($('bet-hire-size-lab')) $('bet-hire-size-lab').textContent = m.tick + ' / bet';
  ['bet-size', 'bet-hire-kas'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.min = String(m.min);
    el.step = String(m.step);
    const snapped = snapBetStake(el.value || m.min, m.dec);
    if (Number(el.value) !== snapped) el.value = String(snapped);
  });
  const stake = snapBetStake($('bet-size')?.value || m.min, m.dec);
  const fee = betProtocolFee(stake, m.dec);
  if ($('bet-fee')) {
    $('bet-fee').textContent = 'You have ' + (m.have ? m.have.toLocaleString() : '0') + ' ' + m.tick
      + '. Stake is ' + m.tick + ', not KAS. First tickets nudge ¢ from 50/50 like Kalshi.'
      + (fee > 0 ? ' Protocol ' + fee + ' ' + m.tick + ' to KCC20.' : '');
  }
}

function paintBetCost() {
  const hours = Math.max(1, Math.round(Number($('bet-hours')?.value || 1)));
  const sub = isKcc20Pass(kccHoldings);
  const cap = maxHireHours(sub);
  if (hours > cap && $('bet-hours')) $('bet-hours').value = String(cap);
  const cost = hireCost(Math.min(hours, cap), sub);
  if ($('bet-cost')) $('bet-cost').value = cost + ' KKDAG' + (sub ? ' · pass' : '');
  paintBetStakeLabels();
}

function paintBetClock() {
  const w = windowBounds();
  if ($('bet-clock')) $('bet-clock').textContent = fmtRemain(w.remainMs);
}

async function paintBetBoard() {
  const box = $('bet-board');
  if (!box) return;
  if (isTestnet()) {
    box.innerHTML = '<div class="empty">Bets use the mainnet KRON oracle. Switch Network off Testnet-10.</div>';
    return;
  }
  try {
    const mkts = await kronMarkets();
    const top = (mkts || []).filter(m => m.tick && m.tick !== '?').slice(0, 10);
    const focus = betTickNow();
    box.innerHTML = top.map(m => `
      <button class="row token-row" type="button" data-bet-tick="${esc(m.tick)}">
        <div>
          <div class="title">${esc(m.tick)}${m.tick === focus ? ' · live' : ''}</div>
          <div class="sub">${esc(m.graduated ? 'Pool AMM' : 'Curve')} · ${esc(fmtChg(m.change24h))}</div>
        </div>
        <div class="amt"><b>${esc(fmtPx(m.price))}</b><em>KAS</em></div>
      </button>`).join('') || '<div class="empty">No KRON markets.</div>';
  } catch (e) {
    box.innerHTML = '<div class="empty">' + esc(errText(e)) + '</div>';
  }
}

function paintBetOdds(yes) {
  const y = Math.max(1, Math.min(99, Number(yes) || 50));
  if ($('bet-yes-c')) $('bet-yes-c').textContent = y + '¢';
  if ($('bet-no-c')) $('bet-no-c').textContent = (100 - y) + '¢';
  if ($('bet-odds-yes')) $('bet-odds-yes').style.width = y + '%';
}

async function paintBetMarket() {
  const tick = betTickNow();
  betFocus = tick;
  const w = windowBounds();
  if ($('bet-q')) $('bet-q').innerHTML = `Will <b>${esc(tick)}</b> close higher than it opened this 15 minutes?`;
  if (isTestnet()) {
    paintBetOdds(50);
    if ($('bet-pool')) $('bet-pool').textContent = 'Switch to mainnet — bets use the KRON idx oracle.';
    if ($('bet-net')) $('bet-net').textContent = 'Mainnet only';
    return;
  }
  const info = await lookupKronTick(tick).catch(() => null);
  const px = Number(info?.price || 0);
  let pool = loadPool(tick, w.start);
  if (px && !pool.openPx) {
    pool.openPx = px;
    pool = addPoolStake(tick, w.start, 'yes', 0, px);
  }
  let tape = [];
  try { tape = await fetchPublicBetTape(); } catch {}
  const merged = mergeTapeAndLocal(tape, tick, w.start);
  const live = poolFromTape(merged, tick, w.start);
  pool.yesKas = live.yesKas;
  pool.noKas = live.noKas;
  pool.nYes = live.nYes;
  pool.nNo = live.nNo;
  const yes = yesCentsFromPool(pool);
  paintBetOdds(yes);
  const traders = (live.nYes || 0) + (live.nNo || 0);
  const yesAmt = Number(pool.yesKas || 0);
  const noAmt = Number(pool.noKas || 0);
  const unit = tick;
  if ($('bet-pool')) {
    if (!traders && yesAmt + noAmt <= 0) {
      $('bet-pool').textContent = '50¢ / 50¢ · nobody on this 15m market yet · first YES or NO sets the ratio';
    } else {
      $('bet-pool').textContent = yes + '¢ YES / ' + (100 - yes) + '¢ NO  ·  '
        + (live.nYes || 0) + ' yes vs ' + (live.nNo || 0) + ' no  ·  '
        + yesAmt.toLocaleString() + ' / ' + noAmt.toLocaleString() + ' ' + unit
        + '  ·  ' + yesAmt + ':' + noAmt;
    }
  }
  if ($('bet-net')) $('bet-net').textContent = 'Open ' + fmtPx(pool.openPx || px) + ' · now ' + fmtPx(px);
  paintBetLive(merged);
  settleOpenBets(tick, px, Date.now());
  paintBetHireStatus();
  tickBetSettle().catch(() => {});
}

function paintBetLive(rows) {
  const box = $('bet-live');
  if (!box) return;
  const tick = betTickNow();
  const start = windowBounds().start;
  const list = (rows || []).filter(r => r.tick === tick && Number(r.start) === start).slice(-16).reverse();
  box.innerHTML = list.map(f => {
    const cls = f.side === 'yes' ? 'up' : 'down';
    const mine = f.userAddr && wallet && sameAddrPayload(f.userAddr, wallet.address);
    return `<div><b class="bet-id">${esc(f.betId || betIdFromAddr(f.vaultAddr) || betIdFromTxid(f.txId))}</b> <span class="${cls}">${esc((f.side || '').toUpperCase())}</span> ${esc(String(f.sizeKas || ''))} ${esc(tick)}${mine ? ' · you' : ''}</div>`;
  }).join('') || '<div>Empty book. First YES or NO on this 15m market is the first shared ticket — every wallet reads the same tape.</div>';
}

function ensureBetHireLoop() {
  if (betAbort || readBetAbort()) return;
  if (!loadBetHire()?.on) return;
  if (betHireTimer) return;
  betHireTimer = setInterval(() => tickBetHire().catch(() => {}), 8000);
}

function startBetUi() {
  if ($('bet-tick') && !$('bet-tick').value) $('bet-tick').value = 'KKDAG';
  paintBetStakeLabels();
  paintBetClock();
  paintBetCost();
  paintBetBoard().catch(() => {});
  paintBetMarket().catch(() => {});
  if (!betTimer) {
    betTimer = setInterval(() => {
      paintBetClock();
      const w = windowBounds();
      if (w.remainMs < 4000 || w.remainMs > WINDOW_MS - 2500) paintBetMarket().catch(() => {});
    }, 1000);
  }
  if (!betAbort && loadBetHire()?.on) ensureBetHireLoop();
  else paintBetHireStatus();
}

function stopBetClock() {
  if (betTimer) { clearInterval(betTimer); betTimer = null; }
}

function resumeBetHireIfAny() {
  betAbort = readBetAbort();
  const job = loadBetHire();
  if (betAbort || job?.massFail || /stopped/i.test(String(job?.last || ''))) {
    setBetAbort(true);
    killBetHireLoop();
    if (job?.on) saveBetHire({ ...job, on: false, last: job.last || 'stopped' });
    return;
  }
  if (job?.on && Number(job.until || 0) > Date.now() && sessionOpen()) {
    if (/storage mass|small UTXOs|Compound/i.test(String(job.last || ''))) {
      saveBetHire({ ...job, on: false, massFail: true, last: 'paused — Compound on Home, then hire again' });
      toast('Bet agent paused. Compound, then hire again.');
      return;
    }
    ensureBetHireLoop();
    tickBetHire().catch(() => {});
    toast('Bet agent resumed · ' + (job.tick || TTT_TICK));
  } else {
    tickBetSettle().catch(() => {});
  }
}

function betErr(e) {
  const t = errText(e);
  if (isMassError(e) || /storage mass|5100|500000/i.test(t)) {
    return 'Kaspa rejected storage mass. Home → Compound, then hire/bet again.';
  }
  if (/Need .* KAS to fund/i.test(t)) return t;
  return t;
}

async function compoundForBet() {
  const utxos = await fetchAddressUtxos(wallet.address).catch(() => []);
  if ((utxos || []).length < 3) return utxos || [];
  toast('Merging UTXOs so Kaspa accepts the bet…');
  try {
    await compoundUtxos({ wallet, utxos, signWithKasware: kaswareSigning(wallet) || walletIsKaswareChip(wallet) });
  } catch (e) {
    if (!isMassError(e)) throw e;
    throw new Error('Kaspa rejected storage mass. Home → Compound, then hire/bet again.');
  }
  await new Promise(r => setTimeout(r, 2200));
  return fetchAddressUtxos(wallet.address).catch(() => []);
}

async function placeBet(side, opts = {}) {
  if (betAbort && opts.skipPin) return;
  if (isTestnet()) { toast('Bets are mainnet KRON only'); return; }
  if (!wallet) { toast('Unlock a wallet'); return; }
  const tick = String(opts.tick || betTickNow()).toUpperCase();
  const hold = holdingForTick(tick);
  if (!hold || hold.native) throw new Error('Need ' + tick + ' in this wallet to stake');
  const dec = betDecimals(hold);
  const size = snapBetStake(opts.sizeKas != null ? opts.sizeKas : ($('bet-size')?.value || $('bet-hire-kas')?.value || betMinStake(dec)), dec);
  const feeTok = betProtocolFee(size, dec);
  const have = humanTokenBalance(hold);
  if (have < size + feeTok) throw new Error('Stake ' + size + ' ' + tick + ' — this wallet has ' + Math.floor(have));
  const info = await lookupKronTick(tick);
  const w = windowBounds();
  if (!opts.skipPin) {
    try { await requirePin((side === 'yes' ? 'YES' : 'NO') + ' ' + size + ' ' + tick); }
    catch (e) { if (errText(e) === 'cancelled') return; toast(errText(e)); return; }
  }
  toast('Locking ' + size + ' ' + tick + ' in a covenant++ escrow…');
  const sendAmt = feeTok > 0 ? size + feeTok : size;
  const minutes = refundMinutesFromNow(w.end);
  const capsule = await buildBetEscrowCovenant({
    agentPubHex: agentPubHex(),
    userPubHex: wallet.pubKey,
    userAddr: wallet.address,
    minutes
  });
  const utxos = await compoundForBet();
  const locked = await lockKcc20Timelock({
    wallet,
    tick,
    amountHuman: String(sendAmt),
    decimals: dec,
    minutes,
    utxos,
    onStatus: (m) => toast(m),
    capsule
  });
  const result = locked;
  const openPx = Number(info?.price || 0);
  addPoolStake(tick, w.start, side, size, openPx);
  const pool = loadPool(tick, w.start);
  paintBetOdds(yesCentsFromPool(pool));
  const betId = betIdFromAddr(capsule.address) || betIdFromTxid(result?.txId);
  const row = {
    tick, side, openPx, start: w.start, end: w.end, sizeKas: size, feeKas: feeTok, betId,
    asset: 'kcc20', decimals: dec,
    txId: result?.txId || '', fundTxId: result?.vault?.fundTxId || '',
    vaultAddr: capsule.address, redeemHex: capsule.redeemHex, unlockDaa: capsule.unlockDaa,
    tokenCovid: result?.vault?.tokenCovid || '',
    userAddr: wallet.address, settled: false, at: Date.now()
  };
  recordBet(row);
  if (result?.vault) {
    setVaultOwner(wallet.address);
    saveVault({
      ...result.vault,
      type: 'betescrow',
      name: 'Bet ' + betId + ' ' + side.toUpperCase() + ' ' + tick,
      params: {
        ...(result.vault.params || {}),
        tick, side, start: w.start, end: w.end, amountKas: size, betId,
        userAddr: wallet.address, feeAddr: BET_AGENT_ADDR
      }
    });
  }
  try {
    const raw = BigInt(Math.round(sendAmt * (10 ** dec)));
    applyLocalTokenDelta(tick, 'kcc20', '-' + String(raw));
  } catch {}
  afterTx();
  toast((side === 'yes' ? 'YES' : 'NO') + ' ' + size + ' ' + tick + ' · ' + yesCentsFromPool(pool) + '¢ · Bet ' + betId);
  paintBetMarket().catch(() => {});
  return row;
}

async function hireBetAgent() {
  if (isTestnet()) { toast('Hire is mainnet KKDAG'); return; }
  if (!wallet) { toast('Unlock a wallet'); return; }
  const tick = betTickNow();
  const sub = isKcc20Pass(kccHoldings);
  let hours = Math.max(1, Math.round(Number($('bet-hours')?.value || 1)));
  hours = Math.min(hours, maxHireHours(sub));
  const cost = hireCost(hours, sub);
  const hold = holdingForTick(tick);
  if (!hold || hold.native) throw new Error('Need ' + tick + ' in this wallet to stake');
  const dec = betDecimals(hold);
  const sizeKas = snapBetStake($('bet-hire-kas')?.value || $('bet-size')?.value || betMinStake(dec), dec);
  if ($('bet-size')) $('bet-size').value = String(sizeKas);
  if ($('bet-hire-kas')) $('bet-hire-kas').value = String(sizeKas);
  const feeTok = betProtocolFee(sizeKas, dec);
  if (humanTokenBalance(hold) < sizeKas + feeTok) {
    throw new Error('Fund at least ' + (sizeKas + feeTok) + ' ' + tick + ' first, then hire');
  }
  const held = kkdagsHeld(kccHoldings);
  if (cost > 0 && held < cost) throw new Error('Need ' + cost + ' KKDAG to hire. This wallet has ' + Math.floor(held));
  try { await requirePin('Hire Scorpion ' + hours + 'h on ' + tick); }
  catch (e) { if (errText(e) === 'cancelled') return; throw e; }
  let payTxId = '';
  if (cost > 0) {
    const token = holdingForTick(TTT_TICK);
    if (!token) throw new Error('Unlock TTT token (KKDAG) in this wallet first');
    toast('Paying ' + cost + ' KKDAG to the agent…');
    const sent = await sendKcc20({
      wallet,
      dest: BET_AGENT_ADDR,
      token,
      amountHuman: String(cost),
      utxos: await fetchAddressUtxos(wallet.address).catch(() => []),
      onStatus: (m) => toast(m)
    });
    payTxId = sent?.txId || '';
  }
  setBetAbort(false);
  writeBetHireRaw({
    on: true, tick, hours, sizeKas, mode: 'auto',
    until: Date.now() + hours * 3600000,
    paid: cost, payTxId, lastWindow: windowBounds().start, last: 'hired · next 15m', fills: [],
    startedAt: Date.now(), pass: sub, massFail: false
  });
  afterTx();
  ensureBetHireLoop();
  startBetUi();
  toast('Agent hired ' + hours + 'h · ' + sizeKas + ' ' + tick + ' each window · starts next 15m');
  paintBetHireStatus();
}

function stopBetHire() {
  setBetAbort(true);
  killBetHireLoop();
  const job = loadBetHire() || {};
  writeBetHireRaw({ ...job, on: false, last: 'stopped', stoppedAt: Date.now() });
  paintBetHireStatus();
  toast('Bet agent stopped');
}

async function tickBetHire() {
  if (betAbort || readBetAbort()) {
    killBetHireLoop();
    const job = loadBetHire();
    if (job?.on) writeBetHireRaw({ ...job, on: false, last: 'stopped' });
    return;
  }
  if (atPane === 'bet') paintBetMarket().catch(() => {});
  else tickBetSettle().catch(() => {});
  if (betBusy) return;
  const job = loadBetHire();
  if (!job?.on) return;
  if (job.massFail || /storage mass|Compound|Too many small/i.test(String(job.last || ''))) {
    saveBetHire({ ...job, on: false, massFail: true, last: 'paused — Compound on Home, then hire again' });
    paintBetHireStatus();
    return;
  }
  if (Date.now() >= Number(job.until || 0)) {
    saveBetHire({ ...job, on: false, last: 'hours ended' });
    paintBetHireStatus();
    return;
  }
  if (!sessionOpen()) {
    job.last = 'unlock to bet';
    saveBetHire(job);
    paintBetHireStatus();
    return;
  }
  const w = windowBounds();
  if (job.lastWindow === w.start) return;
  betBusy = true;
  try {
    if (betAbort || readBetAbort() || !loadBetHire()?.on) return;
    const pool = loadPool(job.tick, w.start);
    const yes = yesCentsFromPool(pool);
    const side = job.mode === 'no' ? 'no' : (job.mode === 'yes' ? 'yes' : (yes >= 50 ? 'yes' : 'no'));
    const row = await placeBet(side, { skipPin: true, tick: job.tick, sizeKas: Number(job.sizeKas || 0.15) });
    if (betAbort || readBetAbort() || !loadBetHire()?.on) return;
    const live = loadBetHire() || job;
    live.lastWindow = w.start;
    if (row) {
      live.fills = (live.fills || []).concat({
        t: Date.now(), side, px: row?.openPx, txId: row?.txId || ''
      }).slice(-12);
      live.last = side.toUpperCase() + ' escrow · ' + String(row?.txId || '').slice(0, 10);
    } else {
      live.last = 'waiting for fund / PIN';
    }
    saveBetHire(live);
    paintBetHireStatus();
  } catch (e) {
    if (betAbort || readBetAbort()) {
      const j = loadBetHire() || {};
      writeBetHireRaw({ ...j, on: false, last: 'stopped' });
      paintBetHireStatus();
      return;
    }
    const j = loadBetHire() || job || {};
    j.lastWindow = windowBounds().start;
    j.last = betErr(e);
    if (isMassError(e) || /storage mass|500000/i.test(errText(e))) {
      j.on = false;
      j.massFail = true;
    }
    saveBetHire(j);
    paintBetHireStatus();
    toast(betErr(e));
  } finally {
    betBusy = false;
  }
}

let betSettleBusy = false;

async function hydrateBetRow(row) {
  if (row?.redeemHex && row.vaultAddr) return row;
  const userPub = userPubFromAddr(row.userAddr);
  if (!userPub || !row.unlockDaa) return row;
  const built = await buildBetEscrowCovenant({
    agentPubHex: agentPubHex(),
    userPubHex: userPub,
    userAddr: row.userAddr,
    unlockDaa: row.unlockDaa
  });
  if (row.vaultAddr && String(built.address).toLowerCase() !== String(row.vaultAddr).toLowerCase()) return row;
  return { ...row, redeemHex: built.redeemHex, vaultAddr: row.vaultAddr || built.address };
}

async function tickBetSettle() {
  if (betSettleBusy || !wallet || isTestnet()) return;
  let tape = [];
  try { tape = await fetchPublicBetTape(); } catch {}
  const groups = dueBetGroups();
  const extra = new Map();
  for (const n of tape) {
    if (Number(n.end) > Date.now()) continue;
    const id = marketId(n.tick, n.start);
    if (!extra.has(id)) extra.set(id, []);
    extra.get(id).push(n);
  }
  const allGroups = groups.slice();
  for (const [id, rows] of extra) {
    if (allGroups.some(g => marketId(g[0].tick, g[0].start) === id)) continue;
    allGroups.push(rows);
  }
  if (!allGroups.length) return;
  betSettleBusy = true;
  try {
    const agent = isEscrowAgent(wallet.address);
    for (const rawGroup of allGroups) {
      const tick = rawGroup[0].tick;
      const start = rawGroup[0].start;
      const group = mergeTapeAndLocal(tape, tick, start);
      const info = await lookupKronTick(tick).catch(() => null);
      const closePx = Number(info?.price || 0);
      const openPx = Number(group.find(r => r.openPx)?.openPx || loadPool(tick, start).openPx || 0);
      const win = winSideFromPrices(openPx, closePx);
      settleOpenBets(tick, closePx);
      const yesKas = group.filter(r => r.side === 'yes').reduce((a, r) => a + Number(r.sizeKas || 0), 0);
      const noKas = group.filter(r => r.side === 'no').reduce((a, r) => a + Number(r.sizeKas || 0), 0);
      const matched = yesKas > 0 && noKas > 0;
      if (!agent) {
        for (const r of group) {
          const mine = r.userAddr && sameAddrPayload(r.userAddr, wallet.address);
          const refundReady = Date.now() >= refundAtMs(r.end);
          if (mine && refundReady) {
            try {
              const paid = await settleBetVault(r, r.userAddr, [], false);
              patchBet(r.txId, {
                paid: true, refunded: true, pending: false, won: r.side === win,
                outcome: win, closePx, paidTxId: paid?.txId || '',
                note: matched ? 'agent offline · reclaimed' : 'no opponent · refunded'
              });
              if (r.vaultAddr) updateVault(r.vaultAddr, { status: 'swept', unlockTxId: paid?.txId || '' });
            } catch (e) {
              patchBet(r.txId, {
                pending: true, won: r.side === win, outcome: win, closePx, note: errText(e)
              });
            }
          } else {
            patchBet(r.txId, {
              pending: true, won: r.side === win, outcome: win, closePx,
              note: matched ? 'waiting escrow agent' : 'no opponent · reclaim after close grace'
            });
          }
        }
        continue;
      }
      const winners = group.filter(r => r.side === win);
      const losers = group.filter(r => r.side !== win);
      if (!matched) {
        for (const raw of group) {
          const r = await hydrateBetRow(raw);
          const paid = await settleBetVault(r, r.userAddr || wallet.address);
          patchBet(r.txId, {
            paid: true, refunded: true, pending: false, won: r.side === win,
            outcome: win, closePx, paidTxId: paid?.txId || '', note: 'no opponent · refunded'
          });
          if (r.vaultAddr) updateVault(r.vaultAddr, { status: 'swept', unlockTxId: paid?.txId || '' });
        }
        toast(tick + ' window: no opponent — KAS returned');
        continue;
      }
      for (const raw of winners) {
        const r = await hydrateBetRow(raw);
        const paid = await settleBetVault(r, r.userAddr || wallet.address);
        patchBet(r.txId, {
          paid: true, pending: false, won: true, outcome: win, closePx,
          paidTxId: paid?.txId || '', note: 'winner principal returned'
        });
        if (r.vaultAddr) updateVault(r.vaultAddr, { status: 'swept', unlockTxId: paid?.txId || '' });
      }
      const dest = winners[0]?.userAddr || BET_AGENT_ADDR;
      for (const raw of losers) {
        const r = await hydrateBetRow(raw);
        const paid = await settleBetVault(r, dest);
        patchBet(r.txId, {
          paid: true, pending: false, won: false, outcome: win, closePx,
          paidTxId: paid?.txId || '', note: 'loser KAS to winner'
        });
        if (r.vaultAddr) updateVault(r.vaultAddr, { status: 'swept', unlockTxId: paid?.txId || '' });
      }
      toast(tick + ' settled · ' + win.toUpperCase() + ' won');
    }
    paintBetFills();
  } catch (e) {
    console.warn('bet settle', e);
  } finally {
    betSettleBusy = false;
  }
}

async function settleBetVault(row, dest, extraOutputs = [], agentSettle = true) {
  if (row?.vaultAddr && row?.redeemHex) {
    const utxosV = await fetchAddressUtxos(row.vaultAddr).catch(() => []);
    return sweepKcc20Capsule({
      wallet,
      vault: {
        type: 'betescrow',
        address: row.vaultAddr,
        scriptHex: row.redeemHex,
        redeemHex: row.redeemHex,
        unlockDaa: row.unlockDaa,
        tick: row.tick,
        tokenCovid: row.tokenCovid
      },
      utxos: utxosV,
      escrowRelease: !!agentSettle,
      destAddr: dest || row.userAddr || wallet.address
    });
  }
  const tokenBet = row?.asset === 'kcc20' || (!row?.redeemHex && row?.tick && row.tick !== 'KAS');
  if (tokenBet) {
    if (!agentSettle) throw new Error('Waiting for escrow to return ' + (row.tick || 'token'));
    const token = holdingForTick(row.tick);
    if (!token) throw new Error('Settler needs ' + row.tick + ' in this wallet to pay out');
    const sent = await sendKcc20({
      wallet,
      dest,
      token,
      amountHuman: String(row.sizeKas),
      utxos: await fetchAddressUtxos(wallet.address).catch(() => [])
    });
    return { txId: sent?.txId || '' };
  }
  if (!row?.vaultAddr || !row?.redeemHex) throw new Error('Bet ticket missing escrow script');
  const utxosV = await fetchAddressUtxos(row.vaultAddr);
  if (!utxosV.length) return { txId: '', skipped: true };
  return sweepVault({
    wallet,
    vault: {
      type: 'betescrow',
      address: row.vaultAddr,
      scriptHex: row.redeemHex,
      redeemHex: row.redeemHex,
      unlockDaa: row.unlockDaa
    },
    utxos: utxosV,
    escrowRelease: !!agentSettle,
    payoutAddr: dest,
    extraOutputs
  });
}

function loadBoosts() {
  try {
    const list = JSON.parse(localStorage.getItem(BOOST_KEY) || '[]');
    const live = list.filter(b => Number(b.until || 0) > Date.now());
    if (live.length !== list.length) localStorage.setItem(BOOST_KEY, JSON.stringify(live));
    return live.sort((a, b) => (b.pts || 0) - (a.pts || 0));
  } catch { return []; }
}

function saveBoosts(list) {
  localStorage.setItem(BOOST_KEY, JSON.stringify(list || []));
}

function renderBoosts() {
  const rail = $('boost-rail');
  if (!rail) return;
  const live = loadBoosts();
  rail.innerHTML = live.map(b => `
    <div class="boost-pill">
      <b>${esc(b.tick)}</b>
      <em>${esc(b.pts || BOOST_PTS)} pts</em>
      <span>${Math.max(0, Math.ceil((b.until - Date.now()) / 3600000))}h left</span>
    </div>`).join('');
}

function openBoost() {
  haptic();
  openSheet('Boost a token', `
    <label class="field"><span>Ticker</span>
      <input id="boost-tick" maxlength="12" placeholder="KKDAG" spellcheck="false" value="${esc(($('at-tick')?.value || 'KKDAG').toUpperCase())}">
    </label>
    <p class="muted" style="text-align:left;">Sends ${BOOST_KAS} KAS to this same wallet. Features the ticker here for 24h. Points stack. We never take the KAS.</p>
  `, {
    confirm: kaswareEnabled() ? 'Pay with KasWare' : 'Boost ' + BOOST_KAS + ' KAS',
    gold: true,
    onConfirm: async () => {
      const tick = ($('boost-tick')?.value || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{2,12}$/.test(tick)) throw new Error('Ticker 2–12 letters');
      if (kaswareEnabled()) await ensureKaswareSigner(wallet);
      else await requirePin('Boost ' + tick);
      setSheetStatus('Sending…');
      const res = await sendKas({ wallet, dest: wallet.address, amountKas: String(BOOST_KAS) });
      const list = loadBoosts();
      const hit = list.find(b => b.tick === tick);
      if (hit) { hit.pts = (hit.pts || 0) + BOOST_PTS; hit.until = Date.now() + BOOST_MS; hit.txId = res?.txId || hit.txId; }
      else list.push({ tick, pts: BOOST_PTS, until: Date.now() + BOOST_MS, txId: res?.txId || '' });
      saveBoosts(list);
      renderBoosts();
      afterTx();
      closeSheet();
      toast(tick + ' boosted');
    }
  });
}

function loadDcaJob() {
  try { return JSON.parse(localStorage.getItem(DCA_KEY) || 'null') || null; } catch { return null; }
}
function saveDcaJob(job) {
  if (!job) localStorage.removeItem(DCA_KEY);
  else localStorage.setItem(DCA_KEY, JSON.stringify(job));
}

function dcaEveryLabel(ms) {
  const n = Number(ms || 0);
  if (n <= 900000) return 'every 15 minutes';
  if (n <= 3600000) return 'every 1 hour';
  if (n <= 14400000) return 'every 4 hours';
  return 'every day';
}

function dcaSpanLabel(ms, laterCount) {
  const t = Math.max(0, Number(laterCount || 0)) * Number(ms || 0);
  if (!(t > 0)) return 'now only';
  if (t < 3600000) return Math.round(t / 60000) + ' minutes';
  if (t < 86400000) {
    const h = t / 3600000;
    return (Number.isInteger(h) ? h : h.toFixed(1)) + ' hour' + (h === 1 ? '' : 's');
  }
  const d = t / 86400000;
  return (Number.isInteger(d) ? d : d.toFixed(1)) + ' day' + (d === 1 ? '' : 's');
}

function dcaPlanBits() {
  const tick = ($('trade-ticker')?.value || 'TOKEN').trim().toUpperCase();
  const budget = Number($('dca-budget')?.value || 0);
  const slice = Number($('dca-slice')?.value || 0);
  const every = Number($('dca-every')?.value || 3600000);
  const buys = slice > 0 ? Math.floor(budget / slice) : 0;
  return { tick, budget, slice, every, buys };
}

function paintDcaPlan() {
  const box = $('dca-plan');
  if (!box) return;
  const { tick, budget, slice, every, buys } = dcaPlanBits();
  if (!validTick(tick)) { box.textContent = 'Look up a KCC20 ticker first.'; return; }
  if (!(slice >= 0.5)) { box.textContent = 'Each buy must be at least 0.5 KAS into the market.'; return; }
  if (!(budget >= slice)) { box.textContent = 'Budget must cover at least one buy.'; return; }
  if (buys < 1) { box.textContent = 'Budget ÷ each buy must be at least 1 buy.'; return; }
  const leftover = budget - buys * slice;
  const later = Math.max(0, buys - 1);
  const span = dcaSpanLabel(every, later);
  box.innerHTML = `<b>${esc(tick)}</b> · ${buys} buys of ${slice} KAS (${esc(dcaEveryLabel(every))}, over ${esc(span)}). Quoting buy-now vs DCA…`;
  paintDcaLive();
  const gen = (paintDcaPlan._g = (paintDcaPlan._g || 0) + 1);
  Promise.all([
    quoteKronTrade({ tick, side: 'buy', amount: String(slice) }),
    quoteKronTrade({ tick, side: 'buy', amount: String(budget) }).catch(() => null)
  ]).then(([q, lump]) => {
    if (paintDcaPlan._g !== gen || !box.isConnected) return;
    paintDcaPlan._q = q;
    paintDcaPlan._lump = lump;
    const first = Number(q.nativeLeave || 0) / 1e8;
    const next = Number(q.netGone || q.nativeLeave || 0) / 1e8;
    const dcaTotal = first + later * (next + 0.01);
    const lumpLeave = lump ? Number(lump.nativeLeave || 0) / 1e8 : budget + Number(q.fee || 0) / 1e8 + 0.9;
    const extra = Math.max(0, dcaTotal - lumpLeave);
    box.innerHTML = `<b>${buys} buys</b> of ${slice} KAS ${esc(dcaEveryLabel(every))} · last slice in ${esc(span)}.
      <span class="dca-cmp">
        <span><em>Buy ${budget} KAS now</em>Protocol ${lump ? esc(formatKasSompi(lump.fee)) : 'once'} · cell 0.50 once · network ~0.40 once<br>Leaves ~${lumpLeave.toFixed(2)} KAS</span>
        <span><em>DCA ${buys} × ${slice}</em>Protocol ${esc(formatKasSompi(q.fee))} × ${buys} · cell 0.50 once · network × ${buys}<br>Prefund ~${dcaTotal.toFixed(2)} KAS</span>
      </span>
      DCA costs ~${extra.toFixed(2)} KAS more than buying now (extra KRON protocol + network on each slice). First buy when you sign; capsules cover the rest.
      ${leftover > 0.00000001 ? `Unused ${leftover.toFixed(4)} KAS stays in the wallet (budget not a multiple of each buy).` : ''}`;
  }).catch(e => {
    if (paintDcaPlan._g !== gen) return;
    box.innerHTML = `${buys} buys of ${slice} KAS ${esc(dcaEveryLabel(every))} over ${esc(span)}. Could not quote: ${esc(errText(e))}`;
  });
}

function paintDcaLive() {
  const el = $('dca-live');
  if (!el) return;
  const job = loadDcaJob();
  const running = !!(job?.on && dcaTimer);
  el.classList.toggle('hidden', !job);
  if (!job) return;
  const left = Math.max(0, Number(job.nextAt || 0) - Date.now());
  const wait = left > 60000 ? Math.ceil(left / 60000) + 'm' : Math.ceil(left / 1000) + 's';
  el.innerHTML = `
    <b>${running ? 'DCA locked' : 'DCA paused'} · ${esc(job.tick)}</b>
    <p>${job.buys || 0} / ${job.maxBuys} buys · ${(job.vaults || []).filter(v => v.swept).length} capsules opened
      · ${running ? ('next in ' + wait) : (job.last || 'stopped')}</p>
    <button class="btn btn-glass" id="dca-stop" type="button" style="margin-top:8px;height:40px;">Delete DCA</button>`;
  $('dca-stop')?.addEventListener('click', () => stopDca());
}

function dcaVaultRecord(row, job) {
  if (row?.scriptHex || row?.redeemHex || row?.hops) return row;
  return {
    type: 'dca',
    address: row.address,
    scriptHex: row.scriptHex || row.redeemHex,
    redeemHex: row.redeemHex || row.scriptHex,
    hops: [{ ...row, redeemHex: row.redeemHex || row.scriptHex, address: row.address, destAmt: row.destAmt, nextAmt: row.destAmt || row.nextAmt, unlockDaa: row.unlockDaa }],
    hopIndex: 0,
    unlockDaa: row.unlockDaa,
    destAmt: row.destAmt,
    params: { beneficiary: job?.address || wallet?.address, dcaTick: job?.tick }
  };
}

async function reclaimDcaCapsules() {
  const job = loadDcaJob();
  const fromStore = loadVaults().filter(v => v.type === 'dca' && v.status !== 'swept' && v.status !== 'cancelled');
  const fromJob = (job?.vaults || []).filter(d => d?.address && !d.swept);
  const seen = new Set();
  const list = [];
  for (const v of [...fromStore, ...fromJob]) {
    if (!v?.address || seen.has(v.address)) continue;
    seen.add(v.address);
    list.push(dcaVaultRecord(v, job));
  }
  if (!list.length) return { ok: 0, miss: 0 };
  hydrateNativeKey(wallet);
  if (!hexKey(wallet?.privKey) && !kaswareSigning(wallet)) {
    throw new Error('Need the native key or KasWare to return capsule KAS');
  }
  await pingPublicNode();
  let ok = 0;
  let miss = 0;
  for (const vault of list) {
    try {
      let utxosV = await fetchAddressUtxos(vault.address).catch(() => []);
      if (!utxosV.length) {
        await new Promise(r => setTimeout(r, 1500));
        utxosV = await fetchAddressUtxos(vault.address).catch(() => []);
      }
      if (!utxosV.length) { miss++; continue; }
      const rel = await cancelDcaDrip({ wallet, vault, utxos: utxosV });
      updateVault(vault.address, { status: 'swept', unlockTxId: rel.txId || '', fundedSompi: 0, cancelled: true });
      if (job?.vaults) {
        const drip = job.vaults.find(d => d.address === vault.address);
        if (drip) drip.swept = true;
      }
      ok++;
    } catch (e) {
      console.warn(e);
      toast(errText(e));
    }
  }
  if (job) {
    const left = (job.vaults || []).filter(d => !d.swept).length;
    saveDcaJob(left ? { ...job, on: false, last: 'stopped · ' + ok + ' returned' } : null);
  }
  afterTx();
  renderHome();
  renderVault();
  return { ok, miss };
}

function purgeDcaActivity(removed) {
  const txids = new Set();
  for (const v of removed || []) {
    for (const id of String(v.fundTxId || '').split(',')) if (id) txids.add(id);
    if (v.unlockTxId) txids.add(v.unlockTxId);
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(ACT_KEY)) continue;
      const list = JSON.parse(localStorage.getItem(k) || '[]');
      if (!Array.isArray(list)) continue;
      const next = list.filter(a => {
        if (a.txId && txids.has(a.txId)) return false;
        if (/DCA/i.test(String(a.label || '')) || /DCA/i.test(String(a.note || ''))) return false;
        return true;
      });
      localStorage.setItem(k, JSON.stringify(next));
    }
  } catch {}
}

function purgeAllDcaUi() {
  if (dcaTimer) { clearInterval(dcaTimer); dcaTimer = null; }
  const removed = purgeVaultsWhere(isDcaVault);
  purgeDcaActivity(removed);
  saveDcaJob(null);
  try { $('dca-home')?.remove(); } catch {}
  return removed.length;
}

function deleteDcaVault(address) {
  if (!address) return;
  const v = loadVaults().find(x => x.address === address);
  if (v) purgeDcaActivity([v]);
  deleteVault(address);
  const job = loadDcaJob();
  if (job?.vaults) {
    job.vaults = job.vaults.filter(d => d.address !== address);
    saveDcaJob(job.vaults.length ? { ...job, on: false } : null);
  }
  if (!loadVaults().some(isDcaVault)) saveDcaJob(null);
  renderHome();
  renderVault();
  paintDcaHome();
  paintDcaLive();
  if (currentTab === 'activity') renderActivity(window.__txs || []);
  toast('Deleted from this device');
}

function wipeTestDcaNow() {
  const n = purgeAllDcaUi();
  renderHome();
  renderVault();
  paintDcaHome();
  paintDcaLive();
  if (currentTab === 'activity') renderActivity(window.__txs || []);
  return n;
}

function stopDca() {
  wipeTestDcaNow();
  syncTradeLabel();
  toast('DCA removed from Home, Vaults, and Activity');
}

function resumeDcaIfAny() {
  const job = loadDcaJob();
  if (job?.on) startDcaLoop();
  paintDcaHome();
}

function startDcaLoop() {
  if (dcaTimer) clearInterval(dcaTimer);
  dcaTimer = setInterval(() => { tickDca().catch(() => {}); }, 15000);
  paintDcaLive();
  paintDcaHome();
  tickDca().catch(() => {});
}

async function startDcaFromForm() {
  if (isTestnet()) { toast('Home DCA is mainnet KCC20. Use COOK Agent on TN10.'); return; }
  if (!wallet) { toast('Unlock a wallet'); return; }
  const { tick, slice, every, buys } = dcaPlanBits();
  const n = buys;
  if (!validTick(tick)) { toast('Look up a ticker first'); return; }
  if (!(slice >= 0.5)) { toast('Each buy at least 0.5 KAS'); return; }
  if (n < 1) { toast('Budget must cover at least one buy'); return; }
  if (n > 24) { toast('Too many slices (max 24). Raise each buy or lower the budget.'); return; }
  try { await lookupKronTick(tick); }
  catch (e) { toast(errText(e)); return; }
  hydrateNativeKey(wallet);
  if (!wallet.pubKey && hexKey(wallet.privKey)) {
    try {
      const pub = await derivePublicKey(hexToBytes(wallet.privKey));
      wallet.pubKey = privKeyToHex(pub);
    } catch {}
  }
  if (!wallet.pubKey) { toast('Need a public key on this wallet to lock capsules'); return; }
  if (kaswareEnabled()) {
    try { await ensureKaswareSigner(wallet); }
    catch (e) { toast(errText(e)); return; }
    toast('Approve in KasWare — first KRON buy, then lock the remaining capsules');
  } else {
    if (!hexKey(wallet.privKey)) {
      toast('Import the 64-hex key to sign natively, or turn KasWare on');
      return;
    }
    try { await requirePin('DCA first buy + lock capsules for ' + tick); }
    catch (e) { if (errText(e) === 'cancelled') return; toast(errText(e)); return; }
  }
  toast('Buying first ' + slice + ' KAS of ' + tick + '…');
  const q = paintDcaPlan._q || await quoteKronTrade({ tick, side: 'buy', amount: String(slice) });
  const dcaFill = await executeKronTrade({
    wallet,
    tick,
    side: 'buy',
    amount: String(slice),
    utxos: await fetchAddressUtxos(wallet.address).catch(() => []),
    forceKasware: kaswareEnabled(),
    onStatus: (m) => toast(m)
  });
  noteKronFill(dcaFill?.quote);
  afterTx();
  const later = Math.max(0, n - 1);
  const leave = BigInt(q.netGone || q.nativeLeave || kasToSompi(String(slice + 1)));
  let fund = { txId: '', feeKas: 0 };
  let drips = [];
  if (later > 0) {
    toast('Locking ' + later + ' capsules on Kaspa…');
    setVaultOwner(wallet.address);
    const built = await buildDcaDrips({
      ownerPubHex: wallet.pubKey,
      destAddr: wallet.address,
      sliceSompi: kasToSompi(slice),
      destAmtSompi: leave,
      periods: later,
      intervalMs: every
    });
    drips = built.drips;
    const outputs = drips.map(d => ({ address: d.address, amount: BigInt(d.value) }));
    const ids = [];
    for (let i = 0; i < outputs.length; i += 6) {
      const chunk = outputs.slice(i, i + 6);
      toast('Funding capsules ' + (i + 1) + '–' + (i + chunk.length) + '…');
      const part = await sendKasMany({
        wallet,
        outputs: chunk,
        utxos: await fetchAddressUtxos(wallet.address).catch(() => []),
        signWithKasware: kaswareEnabled()
      });
      ids.push(part.txId);
      fund = part;
    }
    fund = { ...fund, txId: ids.filter(Boolean).join(',') };
    for (const d of drips) {
      saveVault({
        type: 'dca',
        name: 'DCA ' + tick,
        address: d.address,
        scriptHex: d.redeemHex,
        redeemHex: d.redeemHex,
        spkHex: d.spkHex,
        unlockDaa: d.unlockDaa,
        unlockAt: d.unlockAt,
        destAmt: d.destAmt,
        nextAmt: d.nextAmt,
        hops: [d],
        hopIndex: 0,
        params: {
          beneficiary: wallet.address,
          dcaTick: tick,
          sliceKas: slice,
          amountKas: Number(d.value) / 1e8
        },
        status: 'locked',
        fundedSompi: Number(d.value),
        fundTxId: fund.txId,
        tick
      });
    }
  }
  saveDcaJob({
    on: later > 0,
    mode: 'covenant',
    tick,
    sliceKas: slice,
    budgetKas: n * slice,
    maxBuys: n,
    buys: 1,
    spentKas: slice,
    intervalMs: every,
    fundTxId: fund.txId,
    vaults: drips.map(d => ({
      address: d.address,
      redeemHex: d.redeemHex,
      scriptHex: d.redeemHex,
      unlockDaa: d.unlockDaa,
      unlockAt: d.unlockAt,
      destAmt: d.destAmt,
      value: d.value,
      swept: false,
      bought: false
    })),
    nextAt: drips[0]?.unlockAt || 0,
    last: later ? ('bought now · next capsule ' + dcaEveryLabel(every)) : 'single buy complete',
    startedAt: Date.now(),
    walletId: wallet.id,
    address: wallet.address
  });
  afterTx();
  if (later > 0) startDcaLoop();
  setVaultTab('mine');
  setVaultHistory(false);
  renderVault();
  toast(later ? ('Bought ' + tick + ' · ' + later + ' capsules locked') : ('Bought ' + tick));
  paintDcaPlan();
}

async function tickDca() {
  if (dcaBusy) return;
  const job = loadDcaJob();
  if (!job?.on) { if (dcaTimer) { clearInterval(dcaTimer); dcaTimer = null; } paintDcaLive(); paintDcaHome(); return; }
  if (document.visibilityState !== 'visible') {
    job.last = 'tab in background — capsules wait on-chain';
    saveDcaJob(job);
    paintDcaLive();
    paintDcaHome();
    return;
  }
  if (job.walletId && wallet?.id && job.walletId !== wallet.id) {
    job.last = 'paused — switch back to the wallet that locked DCA';
    saveDcaJob(job);
    paintDcaLive();
    paintDcaHome();
    return;
  }
  dcaBusy = true;
  try {
    let daa = 0;
    try { daa = await currentDaa(); } catch {}
    const vaults = job.vaults || [];
    for (const drip of vaults) {
      if (drip.swept) continue;
      const due = (daa && drip.unlockDaa && daa >= Number(drip.unlockDaa))
        || (drip.unlockAt && Date.now() >= Number(drip.unlockAt));
      if (!due) continue;
      let utxosV = [];
      try { utxosV = await fetchAddressUtxos(drip.address); } catch {}
      if (!utxosV.length) continue;
      const vault = {
        type: 'dca',
        address: drip.address,
        scriptHex: drip.scriptHex || drip.redeemHex,
        hops: [{ ...drip, redeemHex: drip.redeemHex, address: drip.address, destAmt: drip.destAmt, nextAmt: drip.destAmt, unlockDaa: drip.unlockDaa }],
        hopIndex: 0,
        unlockDaa: drip.unlockDaa,
        destAmt: drip.destAmt,
        params: { beneficiary: job.address || wallet.address }
      };
      const rel = await releaseDcaDrip({ wallet, vault, utxos: utxosV });
      drip.swept = true;
      drip.buyDue = true;
      drip.sweepTx = rel.txId || '';
      try { updateVault(drip.address, { status: 'swept', unlockTxId: rel.txId, fundedSompi: 0 }); } catch {}
      job.last = 'capsule dripped · ' + (rel.txId || '').slice(0, 10);
      saveDcaJob(job);
      toast(job.tick + ' capsule opened');
      afterTx();
      break;
    }
    const dueBuy = (job.vaults || []).find(d => d.swept && d.buyDue && !d.bought);
    if (dueBuy && sessionOpen()) {
      hydrateNativeKey(wallet);
      job.last = 'buying ' + job.sliceKas + ' KAS of ' + job.tick;
      saveDcaJob(job);
      await executeKronTrade({
        wallet,
        tick: job.tick,
        side: 'buy',
        amount: String(job.sliceKas),
        utxos: await fetchAddressUtxos(wallet.address).catch(() => []),
        forceKasware: kaswareEnabled(),
        onStatus: (m) => toast(m)
      });
      dueBuy.bought = true;
      dueBuy.buyDue = false;
      job.buys = (job.buys || 0) + 1;
      job.spentKas = (job.spentKas || 0) + Number(job.sliceKas || 0);
      job.last = 'bought slice ' + job.buys + '/' + job.maxBuys;
      afterTx();
      toast(job.tick + ' DCA ' + job.buys + '/' + job.maxBuys);
    } else if (dueBuy && !sessionOpen()) {
      job.last = 'KAS dripped — unlock to buy ' + job.tick;
    }
    const nextClosed = (job.vaults || []).filter(d => !d.swept).sort((a, b) => Number(a.unlockAt || 0) - Number(b.unlockAt || 0))[0];
    job.nextAt = nextClosed?.unlockAt || job.nextAt;
    const allDone = (job.vaults || []).length && (job.vaults || []).every(d => d.swept && d.bought);
    if (allDone) {
      job.on = false;
      job.last = 'budget complete';
      if (dcaTimer) { clearInterval(dcaTimer); dcaTimer = null; }
    }
    saveDcaJob(job);
  } catch (e) {
    const j = loadDcaJob() || job;
    j.last = errText(e);
    saveDcaJob(j);
    toast('DCA: ' + errText(e));
  } finally {
    dcaBusy = false;
    paintDcaLive();
    paintDcaHome();
  }
}

function paintDcaHome() {
  const job = loadDcaJob();
  let bar = $('dca-home');
  const host = $('holdings')?.parentElement;
  const leftover = loadVaults().filter(v => v.type === 'dca' && v.status !== 'swept' && v.status !== 'cancelled');
  if (!job?.on && !leftover.length) {
    bar?.remove();
    return;
  }
  if (!bar && host) {
    bar = document.createElement('button');
    bar.id = 'dca-home';
    bar.type = 'button';
    bar.className = 'glass dca-home';
    $('holdings')?.before(bar);
  }
  if (!bar) return;
  bar.onclick = () => {
    if (job?.on || leftover.length) stopDca();
    else openTrade({ tick: job?.tick, side: 'dca' });
  };
  if (!job?.on && leftover.length) {
    bar.innerHTML = `<span class="w-kas" aria-hidden="true"></span><span><b>Return DCA KAS</b><span>${leftover.length} test capsule${leftover.length === 1 ? '' : 's'} still locked · tap to send back to this wallet</span></span>`;
    return;
  }
  const left = Math.max(0, Number(job.nextAt || 0) - Date.now());
  const wait = left > 60000 ? Math.ceil(left / 60000) + 'm' : Math.ceil(left / 1000) + 's';
  bar.innerHTML = `<span class="w-kas" aria-hidden="true"></span><span><b>DCA ${esc(job.tick)}</b><span>${job.buys || 0}/${job.maxBuys} on-chain · next ${wait} · tap to stop & return</span></span>`;
}

function hideTradeScreen() {
  $('trade-screen')?.classList.add('hidden');
  $('trade-screen')?.setAttribute('aria-hidden', 'true');
}

function openTrade(prefill = {}) {
  if (isTestnet()) {
    toast('Home Trade is mainnet KRON. Use COOK on TN10.');
    showPage('tokens');
    setAtPane('book');
    return;
  }
  haptic();
  const screen = $('trade-screen');
  if (!screen) return;
  screen.classList.remove('hidden');
  screen.setAttribute('aria-hidden', 'false');
  const tick0 = String(prefill.tick || 'KKDAG').toUpperCase();
  const side0 = prefill.side === 'sell' ? 'sell' : (prefill.side === 'dca' ? 'dca' : 'buy');
  if ($('trade-ticker')) $('trade-ticker').value = tick0;
  if ($('trade-amount')) $('trade-amount').value = prefill.amount || '';
  $('trade-side')?.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.side === side0));
  if ($('trade-go')) {
    $('trade-go').disabled = false;
    $('trade-go').onclick = () => reviewTrade();
  }
  syncTradeLabel();
  lookupTradeTicker();
  paintDcaPlan();
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
  const dca = side === 'dca';
  $('trade-spot')?.classList.toggle('hidden', dca);
  $('trade-dca')?.classList.toggle('hidden', !dca);
  const lab = $('trade-amt-label');
  if (lab) lab.textContent = side === 'sell' ? `Amount (${tick})` : 'Pay (KAS)';
  const job = loadDcaJob();
  if ($('trade-go')) {
    if (dca && job?.on) $('trade-go').textContent = 'Stop DCA';
    else if (dca) $('trade-go').textContent = 'Review DCA plan';
    else $('trade-go').textContent = side === 'sell' ? 'Review sell' : 'Review buy';
  }
  if (dca) paintDcaPlan();
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
  const tick = ($('trade-ticker')?.value || 'KKDAG').toUpperCase();
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
  const tick = ($('trade-ticker')?.value || 'KKDAG').toUpperCase();
  const side = $('trade-side')?.querySelector('.on')?.dataset.side || 'buy';
  if (side === 'dca') {
    const job = loadDcaJob();
    if (job?.on || (job?.vaults || []).some(d => !d.swept)) {
      stopDca();
      return;
    }
    const plan = dcaPlanBits();
    if (!validTick(plan.tick)) { toast('Look up a ticker first'); return; }
    if (!(plan.slice >= 0.5) || plan.buys < 1) { toast('Set budget and each buy'); return; }
    const n = plan.buys;
    if (n > 24) { toast('Too many slices (max 24). Raise each buy or lower the budget.'); return; }
    const q = paintDcaPlan._q;
    const lump = paintDcaPlan._lump;
    const first = q ? Number(q.nativeLeave || 0) / 1e8 : plan.slice + 1.5;
    const next = q ? Number(q.netGone || q.nativeLeave || 0) / 1e8 : plan.slice + 1;
    const later = Math.max(0, n - 1);
    const dcaTotal = first + later * (next + 0.01);
    const lumpLeave = lump ? Number(lump.nativeLeave || 0) / 1e8 : plan.budget + 0.9;
    const span = dcaSpanLabel(plan.every, later);
    openSheet('Review DCA ' + plan.tick, `
      <div class="kv"><span class="k">Buys</span><span class="v">${n} × ${plan.slice} KAS (${esc(dcaEveryLabel(plan.every))})</span></div>
      <div class="kv"><span class="k">Schedule</span><span class="v">1 now, then ${later} over ${esc(span)}</span></div>
      <div class="kv"><span class="k">Buy ${plan.budget} now</span><span class="v">~${lumpLeave.toFixed(2)} KAS leaves</span></div>
      <div class="kv"><span class="k">DCA total</span><span class="v">~${dcaTotal.toFixed(2)} KAS (${later} capsules)</span></div>
      <div class="kv"><span class="k">DCA extra</span><span class="v">~${Math.max(0, dcaTotal - lumpLeave).toFixed(2)} KAS vs lump sum</span></div>
      ${q ? `<div class="kv"><span class="k">Protocol / slice</span><span class="v">${esc(formatKasSompi(q.fee))} KAS × ${n} buys</span></div>
      <div class="kv"><span class="k">Cell</span><span class="v">0.50 KAS once</span></div>` : ''}
      <p class="muted" style="text-align:left;padding-top:8px;">Buy-now pays KRON protocol once. DCA pays it on every slice (covenant). Cell is once. Capsules prefund later ${esc(plan.tick)} buys only.</p>
    `, {
      confirm: kaswareEnabled() ? 'Buy now + lock (KasWare)' : 'Buy now + lock with PIN',
      gold: true,
      onConfirm: async () => { closeSheet(); await startDcaFromForm(); }
    });
    return;
  }
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
  const kw = kaswareEnabled();
  openSheet('Review ' + q.tick + ' ' + q.side, buyBits, {
    confirm: kw ? 'Pay with KasWare' : 'Pay with PIN',
    gold: true,
    onConfirm: async () => {
      try {
        if (kw) {
          setSheetStatus('Opening KasWare…');
          await ensureKaswareSigner(wallet);
        } else {
          hydrateNativeKey(wallet);
          if (!hexKey(wallet?.privKey)) {
            throw new Error('No in-app key on this wallet. Import the 64-hex key to sign natively, or turn KasWare on.');
          }
          await requirePin(q.side === 'buy' ? 'Confirm buy ' + tick : 'Confirm sell ' + tick);
        }
        await runTrade({ tick, side, amount, quote: q, forceKasware: kw });
      } catch (e) {
        if (errText(e) === 'cancelled') return;
        toast(errText(e));
        setSheetStatus(errText(e), true);
      }
    }
  });
}

async function runTrade({ tick, side, amount, quote, forceKasware = false }) {
  const kw = !!(forceKasware && kaswareEnabled());
  toast(kw ? 'Building KCC20 swap for KasWare…' : 'Building KRON swap…');
  try {
    if (!kw) hydrateNativeKey(wallet);
    await loadKaspaSdk();
    const utxosNow = kw
      ? await fetchKaswareUtxos(wallet.address).catch(() => [])
      : await fetchAddressUtxos(wallet.address).catch(() => []);
    const result = await executeKronTrade({
      wallet,
      tick,
      side,
      amount,
      utxos: utxosNow,
      forceKasware: kw,
      onStatus: (m) => { toast(m); setSheetStatus(m); }
    });
    hideTradeScreen();
    const q = result.quote || quote;
    noteKronFill(q);
    if (q?.side === 'buy' && q.tokenOut != null) {
      const tickU = String(q.tick || tick).toUpperCase();
      const row = kccHoldings.find(t => String(t.ticker).toUpperCase() === tickU);
      const logo = kronLogoFor(tickU);
      if (row) {
        row.balance = (BigInt(row.balance || '0') + BigInt(q.tokenOut)).toString();
        if (logo && !row.image) row.image = logo;
        if (q.decimals != null) row.decimals = q.decimals;
      } else {
        kccHoldings.unshift({
          ticker: tickU, name: tickU, protocol: 'kcc20',
          balance: String(q.tokenOut), decimals: q.decimals || 0,
          image: logo || ''
        });
      }
      try { kccHoldings = await attachKronLogos(kccHoldings); } catch {}
      try {
        const info = await lookupKronTick(tickU);
        const lq = liveQuote(info);
        if (lq.price) kronPx[tickU] = { price: lq.price, change24h: lq.change24h };
      } catch {}
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
        label: 'Bought',
        image: kronLogoFor(q.tick || tick)
      });
    } else if (q?.side === 'sell') {
      pushTokenActivity({
        dir: 'out',
        tick: q.tick || tick,
        protocol: 'kcc20',
        amount: String(q.tokenIn || amount || ''),
        decimals: q.decimals || 0,
        txId: result.txId || '',
        label: 'Sold',
        image: kronLogoFor(q.tick || tick)
      });
    }
    renderHome();
    if (currentTab === 'tokens') renderTokens();
    if (q?.side === 'buy' && wallet?.address) {
      const waitTick = String(q.tick || tick).toUpperCase();
      (async () => {
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 1800));
          try {
            const rows = await fetchKronAddrHoldings(wallet.address);
            const hit = (rows || []).find(r => String(r.ticker || '').toUpperCase() === waitTick);
            if (hit && Number(hit.balance) > 0) {
              await refreshTokenHoldings();
              renderHome();
              if (currentTab === 'tokens') renderTokens();
              return;
            }
          } catch {}
        }
      })();
    }
    openSheet('Swap sent', `
      <div class="kv"><span class="k">Market</span><span class="v">${esc(tick)}</span></div>
      <div class="kv"><span class="k">Side</span><span class="v">${esc(side)}</span></div>
      <div class="kv"><span class="k">Signed</span><span class="v">${result.signer === 'kasware' ? 'KasWare' : 'This device'}</span></div>
      ${q?.side === 'buy' ? `<div class="kv"><span class="k">Received</span><span class="v">${esc(formatTokenUnits(q.tokenOut, q.decimals))} ${esc(q.tick)}</span></div>` : ''}
      <div class="kv"><span class="k">Network fee</span><span class="v">${esc(formatKasSompi(result.fee))} KAS</span></div>
      ${txidBlock(result.txId)}
    `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
  } catch (e) {
    if (errText(e) === 'cancelled') return;
    let msg = errText(e);
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      msg = 'Could not reach Kaspa/KRON (network). Turn VPN off if it is on, hard-refresh, tap Buy again.';
    }
    toast(msg);
    setSheetStatus(msg, true);
  }
}

function openCompound() {
  haptic();
  const n = Array.isArray(utxos) ? utxos.length : 0;
  if (n < 2) { toast('Already one UTXO'); return; }
  const feeEst = 0.0045 + n * 0.00015;
  if (walletIsKaswareChip(wallet)) autoArmKaswareForWallet(wallet).catch(() => {});
  const kw = kaswareSigning(wallet) || walletIsKaswareChip(wallet);
  openSheet('Compound UTXOs', `
    <div class="kv"><span class="k">Wallet</span><span class="v">${esc(wallet?.name || 'This wallet')}</span></div>
    <div class="kv"><span class="k">Network</span><span class="v">${isTestnet() ? 'TN10' : 'mainnet'}</span></div>
    <div class="kv"><span class="k">UTXOs now</span><span class="v">${n}</span></div>
    <div class="kv"><span class="k">Balance</span><span class="v">${formatAmount(balanceSompi)} KAS</span></div>
    <div class="kv"><span class="k">Network fee</span><span class="v">~${feeEst.toFixed(4)} KAS</span></div>
    <p class="muted" style="text-align:left;">Merges <b>every spendable KAS coin</b> into <b>one</b> UTXO. No leftover change coin (that is what left you on 2 UTXOs). ${kw ? 'Approve the PSKT in KasWare — it must show one output.' : 'Native PIN signs.'}</p>
  `, { confirm: kw ? 'Pay with KasWare' : 'Compound now', gold: true, onConfirm: () => runCompound() });
}

function applyCompoundLocal(result) {
  const sompi = Math.max(0, Math.round(Number(result.amountKas || 0) * 1e8));
  utxos = [{
    outpoint: { transactionId: result.txId || ('compound-' + Date.now()), index: 0 },
    amount: BigInt(sompi),
    address: wallet?.address || ''
  }];
  hushUtxosUntil = Date.now() + 40000;
  paintUtxoCount();
  if (currentTab === 'home') renderHome();
}

async function runCompound() {
  toast('Connecting to Kaspa…');
  try {
    if (walletIsKaswareChip(wallet)) {
      setSheetStatus('Arming KasWare to sign this chip…');
      await autoArmKaswareForWallet(wallet);
    }
    const kw = kaswareSigning(wallet) || walletIsKaswareChip(wallet);
    if (kw) {
      setSheetStatus('Matching KasWare to ' + (isTestnet() ? 'TN10' : 'mainnet') + '…');
      await ensureKaswareSigner(wallet);
    } else {
      await requirePin('Confirm compound');
    }
    await loadKaspaSdk();
    setSheetStatus('Collecting every spendable UTXO in this wallet…');
    await pingPublicNode();
    const available = await collectSpendableUtxos(wallet);
    if (!available.length) throw new Error('No UTXOs — receive KAS first');
    if (available.length < 2) throw new Error('Already one UTXO — nothing to compound');
    setSheetStatus(kw
      ? `Approve merge of ${available.length} UTXOs in KasWare (one output)…`
      : `Merging ${available.length} UTXOs into one…`);
    const result = await compoundUtxos({ wallet, utxos: available, signWithKasware: kw });
    applyCompoundLocal(result);
    afterTx();
    openSheet('UTXOs compounded', `
      <div class="kv"><span class="k">Wallet</span><span class="v">${esc(wallet?.name || 'This wallet')}</span></div>
      <div class="kv"><span class="k">Signed</span><span class="v">${kw ? 'KasWare PSKT' : 'Native PIN'}</span></div>
      <div class="kv"><span class="k">Merged</span><span class="v">${esc(result.inputs)} → 1 UTXO</span></div>
      <div class="kv"><span class="k">Held</span><span class="v">${esc(formatKas(result.amountKas))} KAS</span></div>
      <div class="kv"><span class="k">Network fee</span><span class="v">${Number(result.feeKas || 0).toFixed(6)} KAS</span></div>
      ${txidBlock(result.txId)}
      <p class="muted" style="text-align:left;">This wallet now has one spendable UTXO. Vault capsules are separate and are not counted here.</p>
    `, { confirm: 'Done', cancel: false, onConfirm: () => { closeSheet(); refreshAll(); } });
  } catch (e) {
    let msg = errText(e);
    if (/false stack/i.test(msg)) {
      msg = 'KasWare signature did not match these UTXOs (false stack). Reject any leftover popup, hard-refresh, then Compound again. Only native kaspa:q coins merge — not vaults or token cells.';
    }
    toast(msg);
    setSheetStatus(msg, true);
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
      const bal = Number(await fetchAddressBalance(v.address)) || 0;
      const optimistic = vaultLockedSompi(v);
      const fundedSompi = bal > 0 ? bal : (v.status === 'swept' ? 0 : optimistic);
      const locked = v.unlockDaa && lastDaa && lastDaa < Number(v.unlockDaa);
      let status = v.status;
      if (v.status === 'swept') status = 'swept';
      else if (isKcc20Vault(v) && Number(v.tokenAmount || 0) > 0) status = locked ? 'locked' : 'funded';
      else if (fundedSompi > 0) status = locked ? 'locked' : (v.status === 'funding' ? 'locked' : 'funded');
      else if (!v.fundTxId && v.status !== 'funding' && v.status !== 'locked') status = 'unfunded';
      const patch = { fundedSompi, status };
      if (bal > 0 && !v.lockedSompi) patch.lockedSompi = bal;
      updateVault(v.address, patch);
    } catch {}
  }
  if (currentTab === 'vault') renderVault();
  if (currentTab === 'home') renderHome();
}

function vaultDue(v, daa) {
  if (!v?.address || v.status === 'swept' || v.status === 'cancelled' || v.type === 'xmss') return false;
  if (isDdPayVault(v) || isDcaVault(v)) return false;
  if (autoSweepFails.get(v.address)?.quiet) return false;
  if (isHopVault(v) && v.params?.beneficiary && v.params.beneficiary !== wallet?.address) return false;
  const at = Number(v.unlockAt || 0);
  if (at && Date.now() + 800 < at) return false;
  const unlock = Number((currentHop(v) || v).unlockDaa || v.unlockDaa || 0);
  if (unlock && daa && daa < unlock) return at ? Date.now() >= at : false;
  if (!unlock && !at) return false;
  return true;
}

function markVaultReturned(v) {
  if (!v?.address || v.status === 'swept') return;
  updateVault(v.address, { status: 'swept', fundedSompi: 0 });
  autoSweepFails.delete(v.address);
  try { clearTimeout(freezeTimers.get(v.address)); } catch {}
  freezeTimers.delete(v.address);
  if (currentTab === 'home') renderHome();
  if (currentTab === 'vault') renderVault();
}

function scheduleFreezeWatch(v) {
  if (!v?.address || v.status === 'swept') return;
  const at = Number(v.unlockAt || 0);
  const delay = at ? Math.max(250, at - Date.now()) : Math.max(250, (remainingLockSec(v.unlockDaa, v.unlockAt) || 0) * 1000);
  try { clearTimeout(freezeTimers.get(v.address)); } catch {}
  const id = setTimeout(() => { maybeAutoUnlock(); }, delay + 400);
  freezeTimers.set(v.address, id);
}

function scheduleAllFreezeWatches() {
  loadVaults().forEach(scheduleFreezeWatch);
}

async function maybeAutoUnlock() {
  if (!wallet || autoSweepBusy) return;
  lastAutoSweep = Date.now();
  autoSweepBusy = true;
  try {
    const daa = await currentDaa().catch(() => lastDaa || 0);
    lastDaa = daa || lastDaa;
    lastDaaAt = Date.now();
    const mine = loadVaults().filter(v => v.address && v.type !== 'dca' && v.type !== 'betescrow' && v.type !== 'bet' && (Number(v.unlockDaa) > 0 || Number(v.unlockAt) > 0 || isHopVault(v)));
    for (const v of mine) {
      if (!vaultDue(v, daa)) continue;
      const fail = autoSweepFails.get(v.address) || { n: 0 };
      const backoff = Math.min(180000, 15000 * (2 ** Math.min(fail.n, 3)));
      const lastTry = autoSweepTriedAt.get(v.address) || 0;
      if (lastTry && Date.now() - lastTry < backoff) continue;
      autoSweepTriedAt.set(v.address, Date.now());
      let utxosV = [];
      try { utxosV = await fetchAddressUtxos(v.address); } catch {}
      if (!utxosV.length) {
        markVaultReturned(v);
        continue;
      }
      if (fail.n < 1) {
        toast(isKcc20Vault(v) ? ('Time lock ended — returning ' + (v.tick || 'KCC20') + '…') : 'Time lock ended — returning KAS…');
      }
      try {
        const result = isKcc20Vault(v)
          ? await sweepKcc20Capsule({ wallet, vault: v, utxos: utxosV })
          : await sweepVault({ wallet, vault: v, utxos: utxosV });
        updateVault(v.address, { status: 'swept', unlockTxId: result.txId, fundedSompi: 0, tokenAmount: isKcc20Vault(v) ? '0' : v.tokenAmount });
        autoSweepFails.delete(v.address);
        noteVaultActivity({
          vault: v,
          label: isKcc20Vault(v) ? 'Unfrozen' : 'Unlocked',
          dir: 'in',
          tick: isKcc20Vault(v) ? v.tick : 'KAS',
          protocol: isKcc20Vault(v) ? 'kcc20' : 'kas',
          amount: isKcc20Vault(v) ? (result.tokenAmount || v.tokenAmount) : String(Math.round(Number(result.amountKas || 0) * 1e8)),
          decimals: isKcc20Vault(v) ? v.decimals : 8,
          txId: result.txId || '',
          note: 'Returned ' + formatUtc(Date.now())
        });
        if (isKcc20Vault(v) && result.tokenAmount) {
          applyLocalTokenDelta(v.tick, 'kcc20', result.tokenAmount);
          toast(`Returned ${formatTokenUnits(result.tokenAmount, v.decimals)} ${v.tick} from freeze`);
        } else {
          toast(`Returned ${result.amountKas} KAS from time capsule`);
        }
        afterTx();
        if (currentTab === 'vault') renderVault();
        if (currentTab === 'home') renderHome();
        if (currentTab === 'activity') renderActivity(window.__txs || []);
      } catch (e) {
        console.warn('auto-unlock', e);
        const msg = errText(e);
        const empty = /empty|nothing to unlock|no frozen|no redeem/i.test(msg);
        const n = (fail.n || 0) + 1;
        if (empty) {
          markVaultReturned(v);
          continue;
        }
        autoSweepFails.set(v.address, { n, quiet: n >= 3, lastErr: msg });
        if (n < 3) scheduleFreezeWatch({ ...v, unlockAt: Date.now() + backoff });
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
  const destOk = validateKaspaAddress(dest, networkId());
  if (!destOk.isValid) { toast(destOk.error || 'Invalid Kaspa address — use kaspa:q… or a .kas domain'); return; }
  if (!form.amount) { toast('Enter an amount'); return; }
  if (asset.native || asset.protocol === 'kas') {
    let sompi;
    try { sompi = kasToSompi(form.amount); } catch { toast('Enter an amount'); return; }
    if (sompi <= 0n) { toast('Enter an amount'); return; }
    const amount = sompiToKasString(sompi);
    const feeEst = 0.0045;
    if (Number(balanceSompi || 0) < Number(sompi) + Math.round(feeEst * 1e8)) {
      toast('This wallet has ' + formatAmount(balanceSompi) + ' KAS. Open Bot → Send it KAS and pick a funded wallet.');
      return;
    }
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
    let result;
    if (kaswareSigning(wallet)) {
      toast('Approve in KasWare…');
      result = await sendKas({ wallet, dest, amountKas: amount });
    } else {
      await loadKaspaSdk();
      toast('Connecting to public Kaspa node…');
      await pingPublicNode();
      toast('Signing & broadcasting…');
      const availableUtxos = wallet.receiveAddrs?.length > 1
        ? await fetchOwnedUtxos(wallet)
        : await fetchAddressUtxos(wallet.address);
      if (!availableUtxos.length) { toast('No UTXOs yet — receive KAS first'); return; }
      result = await sendKas({ wallet, dest, amountKas: amount, utxos: availableUtxos });
    }
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
    const onStatus = (m) => { toast(m); setSheetStatus(m); };
    let result;
    if (kaswareSigning(wallet) && asset.protocol === 'krc20') {
      toast('Approve KRC-20 in KasWare…');
      result = await sendKrc20({ wallet, dest, tick: asset.ticker, amtRaw: raw, onStatus });
    } else {
      await loadKaspaSdk();
      await pingPublicNode();
      const availableUtxos = wallet.receiveAddrs?.length > 1
        ? await fetchOwnedUtxos(wallet)
        : await fetchAddressUtxos(wallet.address);
      if (!availableUtxos.length) { toast('Need a little KAS in this wallet for fees'); return; }
      if (asset.protocol === 'krc20') {
        result = await sendKrc20({ wallet, dest, tick: asset.ticker, amtRaw: raw, utxos: availableUtxos, onStatus });
      } else {
        result = await sendKcc20({ wallet, dest, token: asset, amountHuman: human, utxos: availableUtxos, onStatus });
      }
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
    const res = await fetch(`${API_BASE()}/addresses/${encodeURIComponent(addr)}/transactions-count`);
    if (res.ok) {
      const j = await res.json();
      const n = Number(j.total ?? j.totalTransactions ?? j.tx_count ?? j.count ?? j.limit ?? 0);
      if (Number.isFinite(n)) return n;
    }
  } catch {}
  try {
    const res = await fetch(`${API_BASE()}/addresses/${encodeURIComponent(addr)}/full-transactions?limit=1&resolve_previous_outpoints=no`);
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

async function openBuyKas(prefill) {
  haptic();
  if (!wallet?.address) { toast('Unlock a wallet first'); return; }
  const dest = wallet.address;
  const from0 = cnFrom(prefill?.from || 'usdc');
  const amt0 = prefill?.amount != null ? String(prefill.amount) : '20';
  openSheet('Buy KAS · ChangeNOW', `
    <p class="muted" style="text-align:left;padding:0 0 8px;">Floating rate via ChangeNOW. You send USDC/USDT on their network. KAS pays out to <b>this</b> kaspa:q. We do not hold the USDC.</p>
    <div class="field"><label>You send</label>
      <select id="cn-from">
        <option value="usdcerc20"${from0 === 'usdcerc20' ? ' selected' : ''}>USDC (Ethereum)</option>
        <option value="usdterc20"${from0 === 'usdterc20' ? ' selected' : ''}>USDT (Ethereum)</option>
        <option value="usdttrc20"${from0 === 'usdttrc20' ? ' selected' : ''}>USDT (Tron)</option>
        <option value="eth"${from0 === 'eth' ? ' selected' : ''}>ETH</option>
      </select>
    </div>
    <div class="field"><label>Amount</label><input id="cn-amt" type="text" inputmode="decimal" value="${esc(amt0)}"></div>
    <div class="kv"><span class="k">You get ~</span><span class="v" id="cn-out">…</span></div>
    <div class="kv kv-stack"><span class="k">KAS payout</span><span class="v">${esc(dest)}</span></div>
    <div id="cn-payin" class="hidden" style="margin-top:10px;"></div>
    <iframe id="cn-frame" title="ChangeNOW" class="hidden" style="width:100%;height:380px;border:0;border-radius:12px;margin-top:10px;background:#0b0b0c;"></iframe>
  `, {
    confirm: 'Get pay-in',
    gold: true,
    cancelLabel: 'Close',
    onConfirm: async () => {
      try {
        const from = $('cn-from')?.value || 'usdcerc20';
        const amount = $('cn-amt')?.value;
        const tx = await changenowCreate({ amount, address: dest, from });
        if (tx.mode === 'api' && tx.payinAddress) {
          $('cn-payin').classList.remove('hidden');
          $('cn-payin').innerHTML = `<div class="kv kv-stack"><span class="k">Send ${esc(String(tx.fromAmount))} ${esc(tx.from)}</span><span class="v" data-copy="${esc(tx.payinAddress)}">${esc(tx.payinAddress)}</span></div>
            ${tx.payinExtraId ? `<div class="kv"><span class="k">Memo</span><span class="v">${esc(tx.payinExtraId)}</span></div>` : ''}
            <p class="muted" style="text-align:left;">Floating rate. After ChangeNOW sees the deposit, KAS arrives here. Id ${esc(tx.id || '')}</p>`;
          toast('Send that asset to the pay-in address');
        } else {
          const url = tx.widgetUrl || changenowWidgetUrl({ from, amount, address: dest });
          const f = $('cn-frame');
          if (f) { f.classList.remove('hidden'); f.src = url; }
          toast('Finish the swap in ChangeNOW — payout is this wallet');
        }
      } catch (e) { toast(errText(e)); setSheetStatus(errText(e), true); }
    }
  });
  const quote = async () => {
    try {
      const est = await changenowEstimate($('cn-amt')?.value, $('cn-from')?.value);
      if ($('cn-out')) $('cn-out').textContent = est.toAmount + ' KAS';
    } catch (e) {
      if ($('cn-out')) $('cn-out').textContent = errText(e);
    }
  };
  quote();
  $('cn-amt')?.addEventListener('input', () => { clearTimeout(openBuyKas._t); openBuyKas._t = setTimeout(quote, 400); });
  $('cn-from')?.addEventListener('change', quote);
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

function openKaswareSheet() {
  haptic();
  const installed = isKaswareInstalled();
  const pref = loadKaswarePref();
  const on = !!pref.enabled && installed;
  const connected = kaswareConnectedAddress();
  const match = kaswareSigning(wallet);
  const desktop = isDesktopBrowser();
  openSheet('KasWare', `
    <p class="muted" style="text-align:left;padding:0 0 10px;">Desktop Chrome / Edge. KasWare follows this app’s Network toggle: TN10 stays kaspatest, mainnet stays kaspa:. It signs sends, vault locks, compound, KRC-20, and Cook launches — keys never leave KasWare.</p>
    <div class="kv"><span class="k">Extension</span><span class="v">${installed ? 'Found' : (desktop ? 'Not installed' : 'Desktop only')}</span></div>
    <div class="kv"><span class="k">This wallet</span><span class="v">${esc(shortAddr(wallet?.address || '', 10, 6) || '—')}</span></div>
    <div class="kv"><span class="k">KasWare</span><span class="v">${connected ? esc(shortAddr(connected, 10, 6)) : 'Not connected'}</span></div>
    <div class="kv"><span class="k">Signing</span><span class="v">${match ? 'KasWare' : 'In-app key'}</span></div>
    <label class="kw-toggle">
      <input type="checkbox" id="kw-on" ${on ? 'checked' : ''} ${installed ? '' : 'disabled'}>
      <span>Sign with KasWare</span>
    </label>
    ${!installed ? `<p class="muted" style="text-align:left;padding:8px 0 0;">Install <a href="https://chromewebstore.google.com/detail/kasware-wallet/hklhheigdmpoolooomdihmhlpjjdbklf" target="_blank" rel="noopener" style="color:var(--gold-2)">KasWare Wallet</a> in this browser, then come back here.</p>` : ''}
    ${on && connected && wallet?.address && connected !== wallet.address ? `<p class="muted" style="text-align:left;padding:8px 0 0;">KasWare is a different account. Turn the toggle on and we will switch this profile to that address (watch / sign-only — no key stored here).</p>` : ''}
    <p class="muted" style="text-align:left;padding:8px 0 0;">When this is on, KAS sends, vault locks, compound, KRC-20, KRON buys/sells, and Cook PSKTs pop KasWare. Vault sweeps still use the in-app key when this wallet has one.</p>
  `, { confirm: 'Done', cancel: false });
  $('kw-on')?.addEventListener('change', async (e) => {
    const want = !!e.target.checked;
    try {
      if (want) {
        setSheetStatus('Approve in KasWare…');
        const linked = await connectKasware();
        await adoptKaswareAccount(linked);
        toast('KasWare signing on');
      } else {
        await disconnectKasware();
        if (wallet) wallet.kasware = false;
        hydrateNativeKey(wallet);
        saveWallet();
        toast(hexKey(wallet?.privKey) ? 'Signing with in-app key' : 'KasWare off — import the hex key to sign natively');
      }
    } catch (err) {
      e.target.checked = !want;
      if (errText(err) === 'cancelled') { toast('KasWare cancelled'); return; }
      toast(errText(err));
    }
    closeSheet();
    openKaswareSheet();
    if (currentTab === 'you') renderProfile();
    if (currentTab === 'home') renderHome();
    syncAtKwBtn();
  });
}

async function adoptKaswareAccount(linked) {
  const addr = String(linked?.address || '');
  if (!addr) return;
  const list = loadWalletList();
  const pk = String(linked.pubKey || '').replace(/^0x/i, '');
  const existing = list.find(w =>
    sameAddrPayload(w.address, addr)
    || (pk && w.pubKey && String(w.pubKey).replace(/^0x/i, '') === pk)
  );
  if (existing) {
    existing.kasware = true;
    existing.address = addr;
    if (linked.pubKey && !existing.pubKey) existing.pubKey = linked.pubKey;
    if (!existing.name || existing.name.startsWith('Wallet ')) existing.name = 'KasWare';
    saveWalletList(list);
    if (!wallet || wallet.id !== existing.id) {
      await activateWallet(existing, { toastMsg: 'Using KasWare account' });
      return;
    }
    wallet.kasware = true;
    wallet.address = addr;
    if (linked.pubKey) wallet.pubKey = wallet.pubKey || linked.pubKey;
    saveWallet();
    pinUnlockedFor = wallet.id;
    sessionUnlocked = true;
    return;
  }
  const w = {
    id: uid(),
    name: 'KasWare',
    address: addr,
    privKey: '',
    pubKey: linked.pubKey || '',
    createdAt: Date.now(),
    kasware: true,
    receiveAddrs: [{
      id: 'home',
      privateKey: '',
      pubKey: linked.pubKey || '',
      address: addr,
      label: 'KasWare',
      used: false,
      createdAt: Date.now(),
      role: 'home',
      tick: ''
    }]
  };
  list.push(w);
  saveWalletList(list);
  await activateWallet(w, { toastMsg: 'KasWare connected' });
}

function openSettings() {
  haptic();
  const hideKey = !!(wallet?.kasware && !wallet.privKey);
  openSheet('Keys', hideKey ? `
    <p class="muted" style="text-align:left;padding:0 0 10px;">This profile is signed by KasWare. No private key is stored in this app.</p>
    <div class="field"><label>Address</label><input readonly value="${esc(wallet.address)}"></div>
    <button class="btn btn-gold" id="settings-compound" style="margin-bottom:10px;">Compound UTXOs</button>
    <button class="btn btn-danger" id="wipe">Remove wallet from this device</button>
  ` : `
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
  if ($('reveal-pk')) $('reveal-pk').onclick = async () => {
    try { await requirePin('Reveal key'); } catch { return; }
    const i = $('pk-view');
    i.type = i.type === 'password' ? 'text' : 'password';
  };
  if ($('copy-pk')) $('copy-pk').onclick = async () => {
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
  if (type === 'sentinel' || type === 'recurring' || type === 'hashlock' || type === 'onramp') {
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
  if (type === 'hashlock' || type === 'onramp') {
    params.receiver = $('ct-receiver')?.value.trim() || '';
    params.secretHex = ($('ct-secret')?.value || '').trim();
    if (type === 'onramp' && !params.lockMinutes) {
      params.lockMinutes = 5;
      params.lockDays = 5 / 1440;
      params.durationLabel = params.durationLabel || '5 minutes';
    }
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
      <div class="field"><label>Who can claim with the secret?</label><input id="ct-receiver" placeholder="kaspa:q… (blank = you)" spellcheck="false" value="${esc(prefill?.receiver || '')}"></div>
      <div class="field"><label>Secret (blank = we make one)</label><input id="ct-secret" placeholder="optional 32-byte hex" spellcheck="false"></div>`;
  } else if (p.type === 'onramp') {
    fields += durField('Refund if they do not claim', '5 minutes') + `
      <div class="field"><label>Buyer kaspa:q (only they can claim)</label><input id="ct-receiver" placeholder="kaspa:q…" spellcheck="false" value="${esc(prefill?.receiver || prefill?.destination || '')}"></div>
      <p class="muted" style="text-align:left;">After they pay in your app, they Claim with the secret. You Sweep if the window ends. Card money never hits this wallet.</p>`;
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
  if (p.type === 'onramp' && $('ct-duration') && !prefill?.lockMinutes) $('ct-duration').value = '5 minutes';
}

async function executeKcc20Freeze(params) {
  hydrateNativeKey(wallet);
  const tick = String(params.tick || '').toUpperCase().trim();
  const amountToken = Number(params.amountToken);
  const minutes = Number(params.lockMinutes) || Math.round((Number(params.lockDays) || 0) * 1440);
  if (!tick) { toast('Enter a KCC20 ticker'); return; }
  if (!Number.isFinite(amountToken) || amountToken <= 0) { toast('Enter a token amount like 20'); return; }
  if (!minutes) { toast('Enter a duration like 3 minutes'); return; }
  if (!kaswareSigning(wallet) && !hexKey(wallet?.privKey)) {
    toast('This wallet has no native key. Import the 64-hex key or turn on KasWare.');
    return;
  }
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
    const life = !!params.lifeKind;
    const vault = {
      ...result.vault,
      type: life ? 'life' : result.vault.type,
      name: life ? (params.lifeLabel || result.vault.name) : result.vault.name,
      lifeKind: params.lifeKind || '',
      unlockAnytime: false,
      unlockAt: params.dueAt || result.vault.unlockAt,
      params: { ...(result.vault.params || {}), ...params }
    };
    saveVault(vault);
    if (life) setVaultTab('life');
    applyLocalTokenDelta(tick, 'kcc20', '-' + result.tokenAmount);
    noteVaultActivity({
      vault,
      label: 'Frozen',
      dir: 'out',
      tick,
      protocol: 'kcc20',
      amount: result.tokenAmount,
      decimals: result.decimals,
      txId: result.txId || result.revealId || '',
      until: vault.unlockAt,
      note: 'Returns ' + formatUtc(result.vault.unlockAt)
    });
    afterTx();
    renderVault();
    scheduleFreezeWatch(vault);
    openSheet((life ? (params.lifeLabel + ' · ') : '') + tick + ' frozen', `
      <div class="kv"><span class="k">Locked</span><span class="v">${esc(formatTokenUnits(result.tokenAmount, result.decimals))} ${esc(tick)}</span></div>
      ${life ? `<div class="kv"><span class="k">Case</span><span class="v">${esc(params.lifeLabel || params.lifeKind)}</span></div>` : ''}
      <div class="kv"><span class="k">Witness in capsule</span><span class="v">${esc(result.witnessKas)} KAS</span></div>
      <div class="kv"><span class="k">Network fee</span><span class="v">${Number(result.feeKas || 0).toFixed(6)} KAS</span></div>
      <div class="kv"><span class="k">Returns</span><span class="v">${esc(formatUtc(vault.unlockAt))}</span></div>
      <div class="kv"><span class="k">Unlock DAA</span><span class="v">${esc(vault.unlockDaa)}</span></div>
      <div class="kv"><span class="k">Capsule</span><span class="v">${esc(vault.address)}</span></div>
      ${txidBlock(result.txId)}
      <p class="muted" style="text-align:left;">${esc(tick)} returns to this wallet at that UTC time. Auto-return fires then (and as soon as you reopen the app). Leave the wallet open if you can.</p>
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

async function buildCovenant(p, explicit, opts = {}) {
  const silent = !!opts.silent;
  const fail = (msg) => { if (silent) throw new Error(msg); toast(msg); };
  const params = explicit && Object.keys(explicit).length ? { ...explicit } : readProductForm(p.type);
  hydrateNativeKey(wallet);
  if (p.type === 'kcc20lock') {
    if (silent) throw new Error('KCC20 freeze still uses the in-app Vault sheet. Open Vault → Freeze tokens, or lock native KAS (timelock / sentinel).');
    await executeKcc20Freeze(params);
    return;
  }
  if ((p.type === 'life' || params.lifeKind) && params.tick && params.amountToken) {
    if (silent) throw new Error('KCC20 life freeze still uses the in-app Vault sheet.');
    await executeKcc20Freeze({ ...params, lifeKind: params.lifeKind, lifeLabel: params.lifeLabel });
    return;
  }
  if (!params.amountKas || !Number.isFinite(Number(params.amountKas))) {
    fail('Enter an amount like 0.15');
    return;
  }
  if (p.type === 'onramp' && !params.lockDays && !params.lockMinutes) {
    params.lockMinutes = 5;
    params.lockDays = 5 / 1440;
    params.durationLabel = '5 minutes';
  }
  if (p.type === 'onramp' && !params.receiver) {
    fail('Need the buyer kaspa:q — only they can claim this sale lock');
    return;
  }
  if (p.type !== 'life' && (p.type === 'timelock' || p.type === 'sentinel' || p.type === 'recurring' || p.type === 'hashlock' || p.type === 'onramp')
      && !params.lockDays && !params.lockMinutes) {
    fail('Enter a duration like 3 minutes');
    return;
  }
  if (p.type === 'life' && !params.unlockAnytime && !params.lockMinutes && !params.dueAt) {
    fail('Need a due date, or say unlock anytime');
    return;
  }
  if (p.type === 'escrow' && !params.buyerAddress) { fail('Need a buyer address'); return; }
  if (p.type === 'multisig' && !params.counterparty) { fail('Need a counterparty'); return; }
  if (p.type === 'multisig' && params.counterparty === wallet.address) {
    fail('2-of-2 needs a different wallet, not this one');
    return;
  }
  if (p.type === 'multisig' && !walletByAddress(params.counterparty)) {
    fail('Import the counterparty wallet on You first — Sweep needs both keys on this device');
    return;
  }
  if (p.type === 'recurring' && !params.payee) { fail('Need a payee kaspa:q address'); return; }
  if (p.type === 'recurring' && !params.payKas) { fail('Enter how much KAS to pay each check-in'); return; }
  if (p.type === 'xmss' && !params.kit) { fail('Paste the XMSS public kit JSON (never the private file)'); return; }
  if (p.type === 'silverscript' && !params.artifact && !params.redeemHex) {
    fail('Paste a silverc JSON artifact (schema_version 1). Argent does not compile .sil');
    return;
  }
  if (p.type === 'sentinel' && params.beneficiary && !isValidKaspaAddress(params.beneficiary)) {
    fail('Beneficiary must be a kaspa: address');
    return;
  }

  if (!silent) toast('Building P2SH covenant…');
  const payload = backendParams(p.type === 'sentinel' || p.type === 'recurring' || p.type === 'hashlock' || p.type === 'onramp' ? 'timelock' : p.type, params);
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
    } else if (p.type === 'silverscript') {
      const art = parseSilArtifact(params.artifact || params.artifactJson);
      const names = Object.keys(art.contracts || {});
      const cName = params.contract || names[0];
      const redeem = params.redeemHex || silRedeemHex(art, cName);
      built = await p2shFromRedeemHex(redeem);
      payload.silContract = cName;
      payload.silEntries = Object.keys(art.contracts[cName].entries || {});
      payload.redeemHex = redeem;
    } else if (p.type === 'timelock') {
      built = await buildTimelockCovenant({ pubkeyHex: wallet.pubKey, minutes });
    } else if (p.type === 'life') {
      const anytime = !!params.unlockAnytime;
      if (anytime) {
        built = await buildOwnerEnvelope({ pubkeyHex: wallet.pubKey });
      } else {
        const wait = Number(params.lockMinutes) || Math.round((Number(params.lockDays) || 0) * 1440)
          || Math.max(1, Math.round((Number(params.dueAt) - Date.now()) / 60000));
        if (!wait) throw new Error('Need a due date or duration');
        built = await buildTimelockCovenant({ pubkeyHex: wallet.pubKey, minutes: wait });
        payload.lockMinutes = wait;
      }
      payload.lifeKind = params.lifeKind || 'spend';
      payload.lifeLabel = params.lifeLabel || lifeKindMeta(payload.lifeKind).label;
      payload.unlockAnytime = anytime;
      payload.dueAt = anytime ? 0 : (params.dueAt || (Date.now() + Number(payload.lockMinutes || 0) * 60000));
      payload.dueLabel = params.dueLabel || '';
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
    } else if (p.type === 'hashlock' || p.type === 'onramp') {
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
    const life = p.type === 'life';
    const vault = {
      type: p.type,
      name: life ? (payload.lifeLabel || p.name) : (p.name || p.type),
      address: built.address,
      scriptHex: built.redeemHex,
      spkHex: built.spkHex,
      unlockDaa: built.unlockDaa || null,
      unlockAt: life ? (payload.unlockAnytime ? 0 : (payload.dueAt || 0)) : null,
      unlockAnytime: life ? !!payload.unlockAnytime : false,
      lifeKind: life ? payload.lifeKind : '',
      hops: built.hops || null,
      hopIndex: built.hopIndex || 0,
      paySompi: built.paySompi || null,
      payeeAddr: built.payeeAddr || payload.payee || '',
      params: payload,
      status: 'unfunded',
      fundedSompi: 0
    };
    saveVault(vault);
    noteVaultActivity({ vault, label: 'Vault created', dir: 'out' });
    if (p.type === 'escrow' && payload.buyerAddress) mirrorVaultTo(payload.buyerAddress, vault);
    if (p.type === 'multisig' && payload.counterparty) mirrorVaultTo(payload.counterparty, vault);
    if (p.type === 'sentinel' && payload.beneficiary && payload.beneficiary !== wallet.address) {
      mirrorVaultTo(payload.beneficiary, vault);
    }
    if (silent) return vault;
    renderVault();
    if (life) setVaultTab('life');
    openVaultReady(vault);
    return vault;
  } catch (e) {
    if (silent) throw e;
    toast(errText(e));
  }
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

async function fundVault(vault, opts = {}) {
  const silent = !!opts.silent;
  const amt = vault.params?.amountKas;
  if (amt == null || amt === '') throw new Error('Missing amount');
  if (!wallet?.address) throw new Error('No wallet');
  hydrateNativeKey(wallet);
  if (!kaswareSigning(wallet) && !hexKey(wallet.privKey) && kaswareEnabled() && isKaswareInstalled()) {
    try { await ensureKaswareSigner(wallet); } catch {}
  }
  if (!kaswareSigning(wallet) && !hexKey(wallet.privKey)) {
    throw new Error('This wallet has no native signing key. Import the 64-character hex key, or turn on KasWare for this address.');
  }
  if (!opts.skipPin) {
    try {
      await requirePin('Confirm vault fund');
    } catch (e) {
      if (errText(e) === 'cancelled') return;
      throw e;
    }
  }
  let result;
  if (kaswareSigning(wallet)) {
    setSheetStatus('Approve lock in KasWare…');
    result = await sendKas({ wallet, dest: vault.address, amountKas: amt, exact: true });
  } else {
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
    result = await sendKas({ wallet, dest: vault.address, amountKas: amt, utxos: availableUtxos, exact: true });
  }
  const lockedSompi = Math.round((Number(result.amountKas) || amt) * 1e8);
  const mins = Number(vault.params?.lockMinutes || vault.params?.minutes || 0);
  const unlockAt = vault.unlockAt || (mins ? Date.now() + mins * 60 * 1000 : 0);
  const stillLocked = (unlockAt && unlockAt > Date.now())
    || (vault.unlockDaa && lastDaa && lastDaa < Number(vault.unlockDaa));
  updateVault(vault.address, {
    status: stillLocked ? 'locked' : 'funded',
    fundTxId: result.txId,
    covenantId: result.covenantId || null,
    fundedSompi: lockedSompi,
    lockedSompi: lockedSompi,
    fundFeeKas: result.feeKas || 0,
    unlockAt: unlockAt || vault.unlockAt,
    params: { ...(vault.params || {}), amountKas: result.amountKas || amt }
  });
  noteVaultActivity({
    vault: { ...vault, unlockAt },
    label: 'Locked',
    dir: 'out',
    amount: String(lockedSompi),
    txId: result.txId || '',
    until: unlockAt,
    note: unlockAt ? ('Returns ' + formatUtc(unlockAt)) : ''
  });
  if (unlockAt) scheduleFreezeWatch({ ...vault, unlockAt, status: 'funding' });
  afterTx();
  const lockedKas = Number(result.amountKas || amt);
  const feeKas = Number(result.feeKas || 0);
  if (silent) {
    return {
      txId: result.txId,
      address: vault.address,
      type: vault.type,
      amountKas: lockedKas,
      feeKas
    };
  }
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
  const sec = remainingLockSec(vault.unlockDaa, vault.unlockAt);
  const locked = ((vault.unlockDaa || vault.unlockAt) && (sec == null || sec > 0));
  const tok = vaultTokenLabel(vault);
  const kcc = isKcc20Vault(vault);
  const isEscrow = vault.type === 'escrow';
  const isBetEscrow = vault.type === 'betescrow' || vault.type === 'bet';
  const isMsig = vault.type === 'multisig';
  const hop = isHopVault(vault);
  const isHash = vault.type === 'hashlock' || vault.type === 'onramp';
  const isXmss = vault.type === 'xmss';
  const iAmBuyer = isEscrow && wallet?.address === vault.params?.buyerAddress;
  const msigReady = isMsig && !!vaultCounterpartyKey(vault);
  const hopN = (vault.hops || []).length;
  const hopI = Number(vault.hopIndex || 0);
  let help = 'Sweep returns KAS to this wallet.';
  if (kcc && locked) help = 'Still frozen. When the timer hits zero, Sweep returns the tokens plus leftover witness KAS.';
  else if (kcc) help = 'Lock has expired. Sweep now, or wait — auto-return is on.';
  else if (isLifeVault(vault) && (vault.unlockAnytime || vault.params?.unlockAnytime)) help = 'Control envelope. Sweep returns KAS whenever you confirm with PIN.';
  else if (isLifeVault(vault) && locked) help = 'Real-life lock. Sweep is blocked until the due time you set.';
  else if (isLifeVault(vault)) help = 'Due time passed. Sweep returns this KAS to the wallet.';
  else if (vault.type === 'dca') help = 'Test DCA. Delete removes it from this device instantly. On-chain sweep is skipped.';
  else if (hop && locked) help = 'Check-in now to move the coins to the next hop. If this window ends, the beneficiary can claim.';
  else if (hop) help = 'Check-in window ended. Sweep / timeout releases to the beneficiary.';
  else if (isXmss) help = 'Paste the witness JSON from xmss_sign.py (offline). Spend uses ~0.32 KAS from this wallet as the fee input.';
  else if (isHash && locked) help = 'Claim with the secret, or wait for the refund timer.';
  else if (isHash) help = 'Refund timer ended. Sweep returns KAS to the sender.';
  else if (isBetEscrow && locked) help = 'This ticket is the covenant++ escrow. Id is the kaspa:p lock, not a key. After KRON idx close the settler can pay the winner. If they are offline, Sweep returns your KAS when this timer ends.';
  else if (isBetEscrow) help = 'Refund window is open. Sweep returns this ticket’s KAS to you. Keys were never shown.';
  else if (vault.unlockDaa && locked) help = 'Still frozen on-chain. When this timer hits zero, Sweep returns the KAS automatically.';
  else if (vault.unlockDaa) help = 'Lock has expired. Sweep now, or wait — auto-return is on.';
  else if (isEscrow && iAmBuyer) help = 'You are the buyer. Release sends the KAS to this wallet.';
  else if (isEscrow) help = 'You are the seller. Refund returns the KAS to this wallet. Buyer can Release if their wallet is imported here.';
  else if (isMsig && !msigReady) help = '2-of-2: import the counterparty wallet on You, switch back here, then Sweep.';
  else if (isMsig) help = 'Both keys are on this device. Sweep signs 2-of-2 and returns KAS here.';
  const sweepLabel = isEscrow ? (iAmBuyer ? 'Release to me' : 'Refund to me')
    : (vault.type === 'dca' ? 'Return KAS now' : (isXmss ? 'Spend with witness' : (hop ? 'Timeout release' : (isHash && locked ? 'Claim with secret' : 'Sweep to wallet'))));
  openSheet(vault.name || 'Time Capsule', `
    <div class="kv"><span class="k">Locked</span><span class="v">${tok ? esc(tok) : formatAmount(vaultLockedSompi(vault)) + ' KAS'}</span></div>
    ${kcc ? `<div class="kv"><span class="k">Witness dust</span><span class="v">${formatAmount(vault.fundedSompi || 0)} KAS</span></div>` : ''}
    ${vault.fundFeeKas ? `<div class="kv"><span class="k">Lock fee paid</span><span class="v">${Number(vault.fundFeeKas).toFixed(6)} KAS</span></div>` : ''}
    ${vault.unlockDaa || vault.unlockAt ? `<div class="kv"><span class="k">Time left</span><span class="v" id="lock-timer-live" data-unlock-daa="${esc(vault.unlockDaa || '')}" data-unlock-at="${esc(vault.unlockAt || '')}" data-addr="${esc(vault.address || '')}">${esc(formatLockClock(sec))}</span></div>
    <div class="kv"><span class="k">Returns</span><span class="v" id="lock-timer-utc">${esc(vault.unlockAt ? formatUtc(vault.unlockAt) : unlockAtUtc(sec))}</span></div>
    ${vault.unlockDaa ? `<div class="kv"><span class="k">Unlock DAA</span><span class="v">${esc(vault.unlockDaa)} (now ${esc(lastDaa || '—')})</span></div>` : ''}` : ''}
    ${isEscrow ? `<div class="kv"><span class="k">Buyer</span><span class="v">${esc(shortAddr(vault.params?.buyerAddress || '', 10, 6))}</span></div>` : ''}
    ${isBetEscrow ? `<div class="kv"><span class="k">Bet</span><span class="v">${esc(vault.params?.betId || betIdFromAddr(vault.address))}</span></div>
    <div class="kv"><span class="k">Side</span><span class="v">${esc((vault.params?.side || '').toUpperCase())} ${esc(vault.params?.tick || '')}</span></div>` : ''}
    ${isMsig ? `<div class="kv"><span class="k">Counterparty</span><span class="v">${esc(shortAddr(vault.params?.counterparty || '', 10, 6))}</span></div>` : ''}
    ${hop ? `<div class="kv"><span class="k">Hop</span><span class="v">${hopI + 1} / ${hopN}</span></div>` : ''}
    ${vault.params?.beneficiary ? `<div class="kv"><span class="k">Beneficiary</span><span class="v">${esc(shortAddr(vault.params.beneficiary, 10, 6))}</span></div>` : ''}
    ${vault.payeeAddr ? `<div class="kv"><span class="k">Payee</span><span class="v">${esc(shortAddr(vault.payeeAddr, 10, 6))}</span></div>` : ''}
    ${isHash ? `<div class="field"><label>Secret</label><input id="v-secret" placeholder="32-byte hex" value="${esc(vault.params?.secretHex || '')}" spellcheck="false"></div>` : ''}
    ${isXmss ? `<div class="field"><label>Witness JSON</label><textarea id="v-witness" rows="6" placeholder='{"witness_hex":["…"]}' spellcheck="false"></textarea></div>` : ''}
    <div class="kv"><span class="k">Address</span><span class="v">${esc(vault.address)}</span></div>
    <p class="muted" style="text-align:left;">${esc(help)}</p>
    ${canCheckinVault(vault) ? `<button class="btn btn-gold" id="v-checkin" style="margin-top:14px;">Check in</button>` : ''}
    ${vault.type === 'dca'
      ? `<button class="btn btn-gold" id="v-deldca" style="margin-top:10px;">Delete from this device</button>`
      : `<button class="btn ${canCheckinVault(vault) ? 'btn-glass' : 'btn-gold'}" id="v-unlock" style="margin-top:10px;" ${isMsig && !msigReady ? 'disabled' : ''}>${esc(sweepLabel)}</button>`}
    ${kcc ? `<div class="btn-row" style="margin-top:10px;"><button class="btn btn-glass" id="v-copy">Copy capsule</button></div>` : `<div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-glass" id="v-copy">Copy</button>
      ${vault.type === 'dca' ? `<button class="btn btn-glass" id="v-delalldca">Delete all DCA</button>` : `<button class="btn btn-glass" id="v-fund">Fund more</button>`}
    </div>`}
  `, { confirm: 'Close', cancel: false });
  $('v-copy').onclick = async () => { await navigator.clipboard.writeText(vault.address); toast('Copied'); };
  $('v-fund')?.addEventListener('click', () => fundVault(vault).catch(e => toast(errText(e))));
  $('v-deldca')?.addEventListener('click', () => { closeSheet(); deleteDcaVault(vault.address); });
  $('v-delalldca')?.addEventListener('click', () => { closeSheet(); stopDca(); });
  $('v-unlock')?.addEventListener('click', () => {
    unlockVault(vault, {
      escrowRelease: isEscrow && iAmBuyer,
      secretHex: $('v-secret')?.value.trim() || vault.params?.secretHex || '',
      witness: $('v-witness')?.value || ''
    }).catch(e => { setSheetStatus(errText(e), true); toast(errText(e)); });
  });
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
  noteVaultActivity({
    vault,
    label: 'Checked in',
    dir: 'out',
    amount: String(vault.fundedSompi || 0),
    txId: result.txId || ''
  });
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
  noteVaultActivity({
    vault,
    label: kcc ? 'Unfrozen' : 'Unlocked',
    dir: 'in',
    tick: kcc ? vault.tick : 'KAS',
    protocol: kcc ? 'kcc20' : 'kas',
    amount: kcc ? (result.tokenAmount || vault.tokenAmount) : String(Math.round(Number(result.amountKas || 0) * 1e8)),
    decimals: kcc ? vault.decimals : 8,
    txId: result.txId || ''
  });
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
        noteVaultActivity({
          vault: v,
          label: 'Unfrozen',
          dir: 'in',
          tick: v.tick,
          protocol: 'kcc20',
          amount: result.tokenAmount || v.tokenAmount,
          decimals: v.decimals,
          txId: result.txId || ''
        });
      } else {
        const extraPrivKey = v.type === 'multisig' ? vaultCounterpartyKey(v) : '';
        const escrowRelease = v.type === 'escrow' && wallet?.address === v.params?.buyerAddress;
        const result = await sweepVault({ wallet, vault: v, utxos: utxosV, extraPrivKey, escrowRelease });
        updateVault(v.address, { status: 'swept', fundedSompi: 0 });
        noteVaultActivity({
          vault: v,
          label: 'Unlocked',
          dir: 'in',
          amount: String(Math.round(Number(result.amountKas || 0) * 1e8)),
          txId: result.txId || ''
        });
      }
      ok++;
    } catch (e) {
      errors.push(shortAddr(v.address) + ': ' + errText(e));
    }
  }
  renderVault();
  refreshActivityNow();
  refreshAll();
  if (!ok && errors.length) throw new Error(errors[0]);
  toast(`Swept ${ok} vault(s)` + (skipped ? `, skipped ${skipped}` : '') + (errors.length ? `. ${errors[0]}` : ''));
}

function setArgentOpen(on) {
  const dock = $('argent-dock');
  if (!dock) return;
  dock.classList.toggle('open', !!on);
  $('argent-orb')?.setAttribute('aria-expanded', on ? 'true' : 'false');
  $('argent-orb')?.setAttribute('aria-label', on ? 'Close Argent' : 'Open Argent');
  if (on) setTimeout(() => $('chat-input')?.focus(), 280);
}

function toggleArgent() {
  haptic();
  setArgentOpen(!$('argent-dock')?.classList.contains('open'));
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
  if (intent.type === 'changenow') {
    appendChat('ai', `${esc(summary)}<button class="btn btn-gold" style="margin-top:10px;height:42px;" data-cn-intent="${id}">Buy KAS via ChangeNOW</button>`);
    window.__intents = window.__intents || {};
    window.__intents[id] = intent;
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
      lifeKinds: LIFE_KINDS,
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
        : 'Argent here. I lock rent, car notes, savings, and time capsules. Example: <em>lock 1000 kas for rent until September 1 2026 9:00 UTC</em>';
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
  click('lock-net', async () => {
    haptic();
    try {
      await applyAppNetwork(isTestnet() ? 'mainnet' : 'testnet-10');
    } catch (e) { toast(errText(e)); }
    paintLockNet();
  });
  click('btn-send', openSend);
  click('btn-receive', openReceive);
  click('btn-buy-kas', () => openBuyKas());
  click('btn-trade', () => openTrade({ tick: 'KKDAG', side: 'buy' }));
  click('btn-trade-tokens', () => openTrade({ tick: 'KKDAG', side: 'buy' }));
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
    if ($('trade-amount') && b.dataset.side !== 'dca') $('trade-amount').value = '';
    syncTradeLabel();
    if (b.dataset.side === 'dca') paintDcaPlan();
    else quoteTradePreview();
  });
  const dcaSoon = () => { clearTimeout(paintDcaPlan._t); paintDcaPlan._t = setTimeout(paintDcaPlan, 200); };
  $('dca-budget')?.addEventListener('input', dcaSoon);
  $('dca-slice')?.addEventListener('input', dcaSoon);
  $('dca-every')?.addEventListener('change', paintDcaPlan);
  $('pin-cancel')?.addEventListener('click', cancelPinGate);
  $('kron-markets')?.addEventListener('click', e => {
    const row = e.target.closest('[data-trade-tick]');
    if (!row?.dataset.tradeTick) return;
    if (currentTab === 'tokens') {
      openAtDesk({ venue: 'kron', tick: row.dataset.tradeTick });
      return;
    }
    openTrade({ tick: row.dataset.tradeTick, side: 'buy' });
  });
  click('at-desk-back', () => { haptic(); closeAtDesk(); setAtSrc(atSrc); });
  $('at-ob')?.addEventListener('click', e => {
    const lvl = e.target.closest('[data-px]');
    if (!lvl?.dataset.px) return;
    if ($('at-limit')) $('at-limit').value = lvl.dataset.px;
    haptic();
    atQuotePreview();
  });
  $('at-sco-mkts')?.addEventListener('click', e => {
    const row = e.target.closest('[data-sco-tick]');
    if (!row?.dataset.scoTick) return;
    const tick = row.dataset.scoTick;
    if (row.dataset.scoKron === '1' || (!isTestnet() && !row.dataset.scoId)) {
      openAtDesk({
        venue: 'kron',
        tick,
        name: row.dataset.scoName || tick,
        logo: row.dataset.scoLogo || '',
        graduated: row.dataset.scoGrad === '1',
        price: Number(row.dataset.scoPx || 0)
      });
      return;
    }
    pickCookRow(row.dataset.scoId || '', tick, {
      venue: 'scorpion',
      name: row.dataset.scoName,
      logo: row.dataset.scoLogo,
      ask: row.dataset.cookAsk,
      bid: row.dataset.cookBid
    });
  });
  $('at-seg')?.addEventListener('click', e => {
    const b = e.target.closest('[data-at]');
    if (!b?.dataset.at) return;
    haptic();
    setAtPane(b.dataset.at);
  });
  click('at-tokens-btn', () => { haptic(); setAtPane(atPane === 'tokens' ? 'book' : 'tokens'); });
  click('at-bet-btn', () => { haptic(); setAtPane(atPane === 'bet' ? 'book' : 'bet'); });
  click('bet-yes', () => placeBet('yes').catch(err => toast(betErr(err))));
  click('bet-no', () => placeBet('no').catch(err => toast(betErr(err))));
  click('bet-hire', () => hireBetAgent().catch(err => toast(betErr(err))));
  let lastStopTap = 0;
  const stopHire = ev => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    if (Date.now() - lastStopTap < 400) return;
    lastStopTap = Date.now();
    haptic();
    stopBetHire();
  };
  click('bet-stop', () => stopHire());
  $('bet-stop')?.addEventListener('pointerdown', stopHire, true);
  $('at-bet')?.addEventListener('click', e => {
    if (e.target.closest('#bet-stop')) stopHire(e);
  });
  $('bet-hours')?.addEventListener('input', paintBetCost);
  $('bet-size')?.addEventListener('input', () => {
    if ($('bet-hire-kas') && $('bet-size').value) $('bet-hire-kas').value = $('bet-size').value;
    paintBetCost();
  });
  $('bet-hire-kas')?.addEventListener('input', () => {
    if ($('bet-size') && $('bet-hire-kas').value) $('bet-size').value = $('bet-hire-kas').value;
    paintBetCost();
  });
  $('bet-tick')?.addEventListener('change', () => {
    paintBetStakeLabels();
    paintBetMarket().catch(() => {});
  });
  $('bet-tick')?.addEventListener('input', () => paintBetStakeLabels());
  $('bet-fills')?.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const row = e.target.closest('[data-bet-addr]');
    if (!row?.dataset.betAddr) return;
    haptic();
    copyText(row.dataset.betAddr).then(() => toast('Copied Bet ' + betIdFromAddr(row.dataset.betAddr))).catch(() => {});
  });
  $('bet-board')?.addEventListener('click', e => {
    const row = e.target.closest('[data-bet-tick]');
    if (!row?.dataset.betTick) return;
    haptic();
    betFocus = row.dataset.betTick;
    if ($('bet-tick')) $('bet-tick').value = betFocus;
    paintBetStakeLabels();
    paintBetMarket().catch(() => {});
    paintBetBoard().catch(() => {});
  });
  $('tok-seg')?.addEventListener('click', e => {
    const b = e.target.closest('[data-tok]');
    if (b?.dataset.tok) { haptic(); setTokPane(b.dataset.tok); }
  });
  $('token-launched')?.addEventListener('click', e => {
    const row = e.target.closest('[data-launched]');
    if (!row) return;
    const t = loadLaunched().find(x => (x.tokenId || x.tick) === row.dataset.launched);
    if (t) openLaunchedToken(t);
  });
  click('at-kw-btn', () => openKaswareSheet());
  $('at-src')?.addEventListener('click', e => {
    const b = e.target.closest('[data-src]');
    if (b?.dataset.src) { haptic(); setAtSrc(b.dataset.src); }
  });
  click('at-buy', () => reviewAtTrade('buy'));
  click('at-sell', () => { syncAtLabels('sell'); reviewAtTrade('sell'); });
  click('at-launch-go', () => runCookLaunch().catch(err => toast(errText(err))));
  click('at-logo-btn', () => $('at-logo-file')?.click());
  $('at-logo-file')?.addEventListener('change', e => pickLaunchLogo(e.target.files?.[0]));
  click('at-x-go', () => connectLaunchX().catch(err => toast(errText(err))));
  click('at-grad-go', () => runCookGraduate().catch(err => toast(errText(err))));
  click('ag-toggle', () => toggleAgent().catch(err => toast(errText(err))));
  $('ag-strat')?.addEventListener('click', e => {
    const b = e.target.closest('[data-strat]');
    if (!b?.dataset.strat) return;
    haptic();
    syncAgStratUi(b.dataset.strat);
  });
  syncAgStratUi('range');
  $('ag-tick')?.addEventListener('change', () => applyAgentTick($('ag-tick').value, { prefill: true }).catch(() => {}));
  $('ag-tick')?.addEventListener('input', () => {
    clearTimeout(agentTickDebounce);
    agentTickDebounce = setTimeout(() => {
      const t = ($('ag-tick')?.value || '').trim().toUpperCase();
      if (validTick(t)) applyAgentTick(t, { prefill: true }).catch(() => {});
    }, 450);
  });
  $('ag-picks')?.addEventListener('click', e => {
    const b = e.target.closest('[data-ag-pick]');
    if (!b?.dataset.agPick) return;
    haptic();
    applyAgentTick(b.dataset.agPick, { prefill: true }).catch(err => toast(errText(err)));
  });
  $('ag-size')?.addEventListener('change', () => refreshAgentPreview().catch(() => {}));
  click('boost-open', openBoost);
  $('at-cook-mkts')?.addEventListener('click', e => {
    const row = e.target.closest('[data-cook-tick]');
    if (!row) return;
    pickCookRow(row.dataset.cookId || '', row.dataset.cookTick, {
      name: row.dataset.cookName,
      logo: row.dataset.cookLogo,
      ask: row.dataset.cookAsk,
      bid: row.dataset.cookBid
    });
  });
  const atQuoteSoon = () => { clearTimeout(setAtPane._q); setAtPane._q = setTimeout(atQuotePreview, 280); };
  $('at-tick')?.addEventListener('input', () => {
    atQuoteSoon();
    if (atSrc === 'scorpion' && !atDesk) renderScorpionMarkets().catch(() => {});
  });
  $('at-amt')?.addEventListener('input', atQuoteSoon);
  $('at-limit')?.addEventListener('input', atQuoteSoon);
  $('at-slip')?.addEventListener('input', atQuoteSoon);
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
  $('btn-dd-treasury')?.addEventListener('click', () => openTreasurySweep().catch(e => toast(errText(e))));
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
  click('br-quote-btn', () => quoteBridgeUi().catch(err => toast(errText(err))));
  click('br-go', () => runBridge().catch(err => toast(errText(err))));
  click('br-flip', () => {
    const a = $('br-from')?.value;
    const b = $('br-to')?.value;
    if ($('br-from')) $('br-from').value = b || 'KRON';
    if ($('br-to')) $('br-to').value = a || 'KKDAG';
    syncBridgeLabels();
    lastBridgeQuote = null;
  });
  $('br-from')?.addEventListener('input', syncBridgeLabels);
  $('br-from')?.addEventListener('change', syncBridgeLabels);
  $('vault-hist-seg')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-vhist]');
    if (!btn?.dataset.vhist) return;
    haptic();
    setVaultHistory(btn.dataset.vhist === 'history');
  });
  $('life-filters')?.addEventListener('click', e => {
    const b = e.target.closest('[data-lifekind]');
    if (!b) return;
    haptic();
    lifeFilter = b.dataset.lifekind || 'all';
    renderLifeVaults();
  });
  $('life-hist-seg')?.addEventListener('click', e => {
    const b = e.target.closest('[data-lifehist]');
    if (!b?.dataset.lifehist) return;
    haptic();
    showLifeHistory = b.dataset.lifehist === 'history';
    renderLifeVaults();
  });
  click('btn-life-new', () => openLifeComposer());
  $('vault-life')?.addEventListener('click', e => {
    const sweepBtn = e.target.closest('[data-sweep]');
    if (sweepBtn?.dataset.sweep) {
      e.preventDefault();
      e.stopPropagation();
      const vault = loadVaults().find(v => v.address === sweepBtn.dataset.sweep);
      if (!vault) { toast('Vault not found'); return; }
      unlockVault(vault).catch(err => toast(errText(err)));
      return;
    }
    const row = e.target.closest('[data-vault]');
    if (row?.dataset.vault) openVaultDetail(row.dataset.vault);
  });
  click('btn-add-token', openAddToken);
  click('argent-orb', toggleArgent);
  click('argent-close', () => setArgentOpen(false));
  click('chat-send', sendChat);
  $('chat-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  $('chat-input')?.addEventListener('focus', () => {
    setTimeout(() => { const log = $('chat-log'); if (log) log.scrollTop = log.scrollHeight; }, 350);
  });
  $('chat-log')?.addEventListener('click', e => {
    const buildBtn = e.target.closest('[data-build-intent]');
    const sendBtn = e.target.closest('[data-send-intent]');
    const cnBtn = e.target.closest('[data-cn-intent]');
    const intent = window.__intents?.[buildBtn?.dataset.buildIntent || sendBtn?.dataset.sendIntent || cnBtn?.dataset.cnIntent];
    if (!intent) return;
    haptic();
    if (cnBtn) {
      openBuyKas({ from: intent.params.from || intent.params.tick || 'usdc', amount: intent.params.amountToken || intent.params.amountKas });
      return;
    }
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
    if (tab === 'tokens') setAtPane(atPane || 'book');
    if (tab === 'vault') {
      setVaultTab('mine');
      const all = loadVaults();
      const live = all.some(v => !isVaultHistory(v));
      setVaultHistory(!live && all.length > 0);
    }
    if (tab === 'activity') {
      setLiveFast(true);
      kickTokenRefresh();
      ingestNewKcc20Cells().catch(() => {});
      ingestKronActivity().catch(() => {});
      refreshActivityNow();
    } else if (liveFast && Date.now() > hushTokenToastsUntil) {
      setLiveFast(false);
    }
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
  click('profile-build', openTtt);
  click('ttt-close', closeTtt);
  click('ttt-fund', openTttFund);
  click('ttt-sweep', () => openTreasurySweep().catch(e => toast(errText(e))));
  click('build-close', closeBuildRoadmap);
  click('build-back', () => showBuildApp('home'));
  click('studio-go', () => generateStudio().catch(err => toast(errText(err))));
  click('studio-pause', toggleStudioPlay);
  $('studio-video')?.addEventListener('click', toggleStudioPlay);
  $('studio-video')?.addEventListener('play', syncStudioPauseBtn);
  $('studio-video')?.addEventListener('pause', syncStudioPauseBtn);
  $('studio-video')?.addEventListener('ended', syncStudioPauseBtn);
  $('studio-video')?.addEventListener('timeupdate', () => {
    const v = $('studio-video');
    const seek = $('studio-seek');
    const t = $('studio-time');
    if (!v || !v.duration) return;
    if (seek && document.activeElement !== seek) {
      seek.value = String(Math.round((v.currentTime / v.duration) * 1000));
    }
    if (t) t.textContent = fmtStudioTime(v.currentTime) + ' / ' + fmtStudioTime(v.duration);
  });
  $('studio-seek')?.addEventListener('input', () => {
    const v = $('studio-video');
    const seek = $('studio-seek');
    if (!v?.duration || !seek) return;
    v.currentTime = (Number(seek.value) / 1000) * v.duration;
  });
  $('studio-engine')?.addEventListener('change', () => {
    $('studio-url')?.classList.toggle('hidden', $('studio-engine').value !== 'server');
  });
  click('truth-stamp', () => stampTruth().catch(err => toast(errText(err))));
  click('truth-copy', copyTruthHash);
  $('build-screen')?.addEventListener('click', e => {
    const app = e.target.closest('[data-app]');
    if (app?.dataset.app) { showBuildApp(app.dataset.app); return; }
    const b = e.target.closest('[data-phase]');
    if (b) setBuildPhase(Number(b.dataset.phase));
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
  click('profile-kasware', openKaswareSheet);
  click('profile-net', openNetworkSheet);
  click('profile-look', openLookSheet);
  click('profile-name', openLookSheet);
  click('profile-scorpion', openScorpionSheet);
  click('profile-bot', openBotSheet);
  click('profile-wipe', logout);
  click('you-cover-btn', (e) => { e?.stopPropagation?.(); $('you-cover-file')?.click(); });
  click('profile-avatar', () => $('you-avatar-file')?.click());
  $('you-cover')?.addEventListener('click', (e) => {
    if (e.target.closest('#you-cover-btn') || e.target.closest('#profile-avatar')) return;
    $('you-cover-file')?.click();
  });
  const onYouFile = (kind) => (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    pickYouImage(kind, file).catch(err => toast(errText(err)));
  };
  $('you-avatar-file')?.addEventListener('change', onYouFile('avatar'));
  $('you-cover-file')?.addEventListener('change', onYouFile('cover'));
  $('you-wall-file')?.addEventListener('change', onYouFile('wallpaper'));
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
  $('scorpion-hint')?.addEventListener('click', () => openScorpionSheet());
  $('holdings')?.addEventListener('click', e => {
    const lock = e.target.closest('[data-lock-holding]');
    if (lock?.dataset.lockHolding) {
      const vault = loadVaults().find(v => v.address === lock.dataset.lockHolding);
      openLockTimer(vault);
      return;
    }
    const dd = e.target.closest('[data-dd-cell]');
    if (dd?.dataset.ddCell) {
      openTreasurySweep().catch(err => toast(errText(err)));
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
    const delDca = e.target.closest('[data-deldca]');
    if (delDca?.dataset.deldca) {
      e.preventDefault();
      e.stopPropagation();
      deleteDcaVault(delDca.dataset.deldca);
      return;
    }
    const sweepBtn = e.target.closest('[data-sweep]');
    if (sweepBtn?.dataset.sweep) {
      e.preventDefault();
      e.stopPropagation();
      const vault = loadVaults().find(v => v.address === sweepBtn.dataset.sweep);
      if (!vault) { toast('Vault not found'); return; }
      if (isDdPayVault(vault)) {
        purgeDdPayVaults();
        renderVault();
        return;
      }
      unlockVault(vault).catch(err => { toast(errText(err)); });
      return;
    }
    const row = e.target.closest('[data-vault]');
    if (row?.dataset.vault) openVaultDetail(row.dataset.vault);
  });
  document.addEventListener('visibilitychange', () => {
    const job = loadAgentJob();
    if (document.visibilityState === 'visible' && wallet) {
      tickLive(true);
      maybeAutoUnlock();
      resumeAgentIfAny();
      resumeDcaIfAny();
      if (job?.on) holdAgentWake();
    } else if (job?.on && sessionOpen()) {
      tickAgent().catch(() => {});
    }
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
      ? [TOKEN_FALLBACK_LOGO]
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
  try { wipeTestDcaNow(); } catch {}
  try { purgeDdPayVaults(); } catch {}
  try { bind(); } catch (e) {
    console.error(e);
    window.__kccBound = false;
    toast('UI failed to bind — hard refresh. ' + errText(e));
  }
  document.querySelector('.bg-poster')?.classList.remove('hidden');
  try { applyLook(); } catch {}
  try { saveWalletList(loadWalletList()); } catch {}
  try { paintLockNet(); syncAtVenues(); } catch {}
  try { bindKaswareEvents(); } catch {}
  try { bootIframeVaultWatch(); } catch {}
  try { bootDappConnect(dappHooks()); } catch {}
  window.addEventListener('kcc20-kasware-net', async (ev) => {
    if (!kaswareEnabled()) return;
    const want = isTestnet() ? 'kaspa_testnet_10' : 'kaspa_mainnet';
    const got = String(ev.detail || '');
    if (got && got !== want) {
      try { await syncKaswareNetwork(); } catch {}
    }
  });
  const saved = loadStoredWallet();
  if (saved) hydrateNativeKey(saved);
  const hasLocalKey = !!(saved?.address && hexKey(saved.privKey));
  const kaswareOnly = !!(saved?.address && saved?.kasware && !hexKey(saved.privKey));
  const hasAnyWallet = !!(saved?.address);
  if (hasLocalKey || kaswareOnly || hasAnyWallet) {
    wallet = migratePinOnto(saved);
    hydrateNativeKey(wallet);
    applyWalletNetwork(wallet);
    hydrateFromSnap(wallet.address);
    if (restorePersistedSession() || isDappPopup()) {
      pinUnlockedFor = wallet.id;
      sessionUnlocked = true;
    } else if (kaswareOnly || (saved.kasware && kaswareSigning(wallet))) {
      pinUnlockedFor = wallet.id;
      sessionUnlocked = true;
    } else if (!loadPin()) beginPinFlow('set');
    else beginPinFlow('unlock');
  }
  try { await loadCryptoLibs(); } catch { toast('Signing library delayed — check network'); }
  if (hasLocalKey || kaswareOnly || hasAnyWallet) {
    wallet = migratePinOnto(saved);
    hydrateNativeKey(wallet);
    if (wallet.privKey && !wallet.pubKey) {
      try {
        const pub = await derivePublicKey(hexToBytes(wallet.privKey));
        wallet.pubKey = privKeyToHex(pub);
        wallet.address = wallet.address || kaspaAddressFromPubkey(pub);
        saveWallet();
      } catch {}
    }
    if (wallet.kasware && isKaswareInstalled() && !isDappPopup()) {
      try {
        await autoArmKaswareForWallet(wallet);
        const p = window.kasware;
        let accounts = [];
        try { accounts = await p.getAccounts(); } catch {}
        let addr = Array.isArray(accounts) ? accounts[0] : accounts;
        if (!addr) {
          const linked = await connectKasware();
          addr = linked.address;
        }
        if (addr && sameAddrPayload(addr, wallet.address)) {
          pinUnlockedFor = wallet.id;
          sessionUnlocked = true;
        }
      } catch {}
    } else if (isDappPopup() && wallet) {
      pinUnlockedFor = wallet.id;
      sessionUnlocked = true;
    }
    if (sessionOpen() || (wallet.kasware && kaswareSigning(wallet))) {
      pinUnlockedFor = wallet.id;
      sessionUnlocked = true;
      await unlockToHome();
      return;
    }
    if (!sessionOpen()) {
      if (kaswareOnly) {
        showPage('lock');
        $('tabbar').classList.remove('show');
        $('nav-title').textContent = 'KCC20';
        toast('Open KasWare on desktop to sign this profile');
        return;
      }
      if (!loadPin()) beginPinFlow('set');
      else beginPinFlow('unlock');
      return;
    }
    await unlockToHome();
  } else {
    markBooted();
    showPage('lock');
    $('tabbar').classList.remove('show');
    $('nav-title').textContent = 'KCC20';
  }
}

init();
