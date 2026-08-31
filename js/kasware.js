/* KasWare desktop extension — optional signer. Keys stay in KasWare. */
import { networkId } from './crypto.js?v=90';

const STORE = 'kcc20_kasware_v1';

export function kaswareProvider() {
  try {
    if (typeof window !== 'undefined' && window.kasware) return window.kasware;
  } catch {}
  return null;
}

export function isKaswareInstalled() {
  return !!kaswareProvider();
}

export function isDesktopBrowser() {
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const narrow = window.matchMedia('(max-width: 520px)').matches;
    const ua = String(navigator.userAgent || '');
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return false;
    if (coarse && narrow) return false;
    return true;
  } catch {
    return true;
  }
}

export function loadKaswarePref() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; }
}

export function saveKaswarePref(pref) {
  localStorage.setItem(STORE, JSON.stringify(pref || {}));
}

export function kaswareEnabled() {
  return !!loadKaswarePref().enabled;
}

function hasNativeHex(w) {
  const s = String(w?.privKey || '').replace(/^0x/i, '').trim();
  return /^[0-9a-fA-F]{64}$/.test(s);
}

/** Named KasWare chip in this app — no in-app key; extension must sign. */
export function walletIsKaswareChip(w) {
  if (!w) return false;
  if (w.kasware && !hasNativeHex(w)) return true;
  const theirs = kaswareConnectedAddress();
  if (!hasNativeHex(w) && theirs && sameKasAddr(w.address, theirs)) return true;
  return false;
}

export function setKaswareEnabled(on) {
  const pref = loadKaswarePref();
  pref.enabled = !!on;
  saveKaswarePref(pref);
}

export function kaswareNetName(net) {
  return (net || networkId()) === 'testnet-10' ? 'kaspa_testnet_10' : 'kaspa_mainnet';
}

export async function syncKaswareNetwork() {
  const p = kaswareProvider();
  if (!p?.switchNetwork) return '';
  const want = kaswareNetName();
  try {
    const cur = String(await p.getNetwork?.() || '');
    if (cur && cur === want) return want;
  } catch {}
  try {
    await p.switchNetwork(want);
  } catch (e) { rejectUser(e); }
  return want;
}

export function payWithKaswareLabel() {
  return kaswareEnabled() ? 'Pay with KasWare' : '';
}

function firstAddr(accounts) {
  if (!accounts) return '';
  if (typeof accounts === 'string') return accounts;
  if (Array.isArray(accounts)) return String(accounts[0] || '');
  return String(accounts.address || accounts[0] || '');
}

export function normKasAddr(a) {
  return String(a || '').trim().toLowerCase();
}

export function sameKasAddr(a, b) {
  const x = normKasAddr(a), y = normKasAddr(b);
  if (x && y && x === y) return true;
  const xp = x.split(':')[1] || '';
  const yp = y.split(':')[1] || '';
  return !!(xp && yp && xp === yp);
}

export function kaswareConnectedAddress() {
  return String(loadKaswarePref().address || '');
}

export function kaswareSigning(wallet) {
  if (!isKaswareInstalled()) return false;
  if (!kaswareEnabled() && !walletIsKaswareChip(wallet)) return false;
  const mine = wallet?.address || '';
  const theirs = kaswareConnectedAddress();
  if (walletIsKaswareChip(wallet) && mine && theirs && sameKasAddr(mine, theirs)) return true;
  if (walletIsKaswareChip(wallet) && mine && !theirs) return true;
  if (!kaswareEnabled()) return false;
  if (mine && theirs && sameKasAddr(mine, theirs)) return true;
  if (mine && !theirs) return true;
  return false;
}

/** When Home is the KasWare-named chip, arm the Settings toggle so Compound/Send pop the extension. */
export async function autoArmKaswareForWallet(w) {
  if (!walletIsKaswareChip(w)) return false;
  if (!isKaswareInstalled()) return false;
  const pref = loadKaswarePref();
  pref.enabled = true;
  if (w?.address) pref.address = pref.address || w.address;
  saveKaswarePref(pref);
  try { await ensureKaswareSigner(w); } catch {}
  return true;
}

export async function ensureKaswareSigner(wallet) {
  if (!kaswareEnabled() && !walletIsKaswareChip(wallet)) return false;
  if (!kaswareEnabled()) setKaswareEnabled(true);
  const p = kaswareProvider();
  if (!p) throw new Error('KasWare is not in this browser. Open Chrome/Edge with the KasWare extension, then toggle it on in Settings.');
  await syncKaswareNetwork();
  let addr = kaswareConnectedAddress();
  try {
    const accounts = await p.getAccounts();
    addr = firstAddr(accounts) || addr;
  } catch {}
  if (!addr) {
    const linked = await connectKasware();
    addr = linked.address;
  }
  if (addr) {
    const pref = loadKaswarePref();
    pref.enabled = true;
    pref.address = addr;
    saveKaswarePref(pref);
  }
  if (wallet?.address && addr && !sameKasAddr(wallet.address, addr)) {
    throw new Error('KasWare is on a different account than this wallet. Switch KasWare to the same ' + (networkId() === 'testnet-10' ? 'TN10' : 'mainnet') + ' account, or reconnect in Settings.');
  }
  return true;
}

export function parseKaswareTx(raw) {
  if (raw == null || raw === '') return { txId: '' };
  if (typeof raw === 'object') {
    return { txId: String(raw.id || raw.transactionId || raw.txId || raw.txid || ''), raw };
  }
  const text = String(raw);
  try {
    const j = JSON.parse(text);
    return { txId: String(j.id || j.transactionId || j.txId || j.txid || ''), raw: j };
  } catch {}
  if (/^[0-9a-f]{64}$/i.test(text.trim())) return { txId: text.trim() };
  return { txId: text };
}

function rejectUser(e) {
  const m = e && (e.message || e.toString?.() || String(e));
  if (/reject|denied|cancel|closed/i.test(m)) {
    const err = new Error('cancelled');
    throw err;
  }
  throw (e instanceof Error ? e : new Error(m || 'KasWare failed'));
}

export async function connectKasware() {
  const p = kaswareProvider();
  if (!p) throw new Error('KasWare is not installed. Use Chrome or Edge on desktop, then install the KasWare extension.');
  let accounts;
  try {
    accounts = await p.requestAccounts();
  } catch (e) { rejectUser(e); }
  await syncKaswareNetwork();
  try {
    const again = await p.getAccounts();
    if (firstAddr(again)) accounts = again;
  } catch {}
  const address = firstAddr(accounts);
  if (!address) throw new Error('KasWare did not return an address');
  let pubKey = '';
  try { pubKey = await p.getPublicKey(); } catch {}
  const pref = { enabled: true, address, pubKey: pubKey || '', at: Date.now(), network: kaswareNetName() };
  saveKaswarePref(pref);
  bindKaswareEvents();
  return pref;
}

export async function disconnectKasware() {
  const p = kaswareProvider();
  const pref = loadKaswarePref();
  pref.enabled = false;
  saveKaswarePref(pref);
  try {
    if (p?.disconnect) await p.disconnect(window.location.origin);
  } catch {}
  return pref;
}

let eventsBound = false;
export function bindKaswareEvents() {
  const p = kaswareProvider();
  if (!p || eventsBound) return;
  eventsBound = true;
  const onAccounts = (accounts) => {
    const address = firstAddr(accounts);
    const pref = loadKaswarePref();
    if (!address) {
      pref.enabled = false;
      pref.address = '';
    } else {
      pref.address = address;
    }
    saveKaswarePref(pref);
    window.dispatchEvent(new CustomEvent('kcc20-kasware', { detail: pref }));
  };
  try { p.on?.('accountsChanged', onAccounts); } catch {}
  try { p.on?.('networkChanged', (net) => {
    window.dispatchEvent(new CustomEvent('kcc20-kasware-net', { detail: net }));
  }); } catch {}
}

export async function sendKaspaWithKasware(dest, amountKas) {
  const p = kaswareProvider();
  if (!p) throw new Error('KasWare is not installed');
  const sompi = Math.round(Number(amountKas) * 1e8);
  if (!Number.isFinite(sompi) || sompi <= 0) throw new Error('Invalid amount');
  let raw;
  try {
    raw = await p.sendKaspa(String(dest), sompi);
  } catch (e) { rejectUser(e); }
  const parsed = parseKaswareTx(raw);
  return {
    txId: parsed.txId,
    feeKas: 0,
    amountKas: Number(amountKas),
    node: 'kasware',
    covenantId: null,
    boosted: false
  };
}

export async function sendKrc20WithKasware({ dest, tick, amtRaw }) {
  const p = kaswareProvider();
  if (!p?.signKRC20Transaction) throw new Error('This KasWare version cannot sign KRC-20');
  const ticker = String(tick || '').toUpperCase().trim();
  const inscribe = JSON.stringify({
    p: 'krc-20',
    op: 'transfer',
    tick: ticker,
    amt: String(amtRaw),
    to: dest
  });
  let raw;
  try {
    raw = await p.signKRC20Transaction(inscribe, 4, dest, 0.01);
  } catch (e) { rejectUser(e); }
  let revealId = '', commitId = '';
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    revealId = j.revealId || j.txId || j.id || '';
    commitId = j.commitId || '';
  } catch {
    revealId = String(raw || '');
  }
  return { txId: revealId, revealId, commitTxId: commitId };
}

/** kaspa-wasm serde rejects trailing commas. Do not JSON.parse/stringify KRON PSKTs. */
export function repairSafeJson(s) {
  return String(s || '').replace(/,(\s*[}\]])/g, '$1');
}

function signedJsonFrom(res) {
  if (typeof res === 'string' && res.length > 2) return repairSafeJson(res);
  if (!res || typeof res !== 'object') return '';
  const s = res.txJsonString || res.signedTx || res.tx || res.data?.txJsonString;
  if (typeof s === 'string' && s.length > 2) return repairSafeJson(s);
  if (Array.isArray(res.inputs) || res.transaction?.inputs) return JSON.stringify(res);
  return '';
}

export async function signPsktWithKasware(txJsonString, signInputs) {
  const p = kaswareProvider();
  if (!p) throw new Error('KasWare is not installed');
  const fn = p.signPskt || p.signPsbt;
  if (typeof fn !== 'function') {
    throw new Error('This KasWare version cannot sign PSKT. Update KasWare to sign KCC20 trades.');
  }
  const json = repairSafeJson(txJsonString);
  const inputs = (signInputs || []).map(s => ({
    index: Number(s.index),
    sighashType: Number(s.sighashType ?? 1)
  }));
  const payload = { txJsonString: json, options: { signInputs: inputs } };
  let res;
  try {
    res = await fn.call(p, payload);
  } catch (e1) {
    const recovered = signedJsonFrom(e1) || signedJsonFrom(e1?.data) || signedJsonFrom(e1?.result);
    if (recovered) return recovered;
    try {
      res = await fn.call(p, json, { signInputs: inputs });
    } catch (e2) {
      const recovered2 = signedJsonFrom(e2) || signedJsonFrom(e2?.data);
      if (recovered2) return recovered2;
      rejectUser(e1);
    }
  }
  const out = signedJsonFrom(res);
  if (out) return out;
  throw new Error('KasWare did not return a signed transaction');
}

function withMs(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
}

export async function fetchKaswareUtxos(address) {
  const p = kaswareProvider();
  if (!p?.getUtxoEntries) return [];
  let rows = [];
  try {
    rows = await withMs(address ? p.getUtxoEntries(address) : p.getUtxoEntries(), 2500);
  } catch {
    try { rows = await withMs(p.getUtxoEntries(), 2500); } catch { return []; }
  }
  return (Array.isArray(rows) ? rows : []).map(u => {
    const e = u.entry || u;
    const out = u.outpoint || e.outpoint || {};
    const spk = u.scriptPublicKey || e.scriptPublicKey || {};
    let script = typeof spk === 'string' ? spk : (spk.script || spk.scriptPublicKey || '');
    if (script && typeof script !== 'string') {
      try { script = Array.from(script, b => (b + 256).toString(16).slice(-2)).join(''); } catch { script = String(script || ''); }
    }
    script = String(script || '').replace(/^0x/i, '');
    if (/^000020[0-9a-f]{64}ac$/i.test(script)) script = script.slice(4);
    let txid = out.transactionId || out.transaction_id || '';
    if (txid && typeof txid !== 'string') txid = txid.toString ? txid.toString() : String(txid);
    txid = String(txid).replace(/^0x/i, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(txid) || !script) return null;
    return {
      outpoint: { transactionId: txid, index: Number(out.index || 0) },
      utxoEntry: {
        amount: e.amount ?? u.amount,
        scriptPublicKey: { version: Number(spk.version || 0), script },
        blockDaaScore: e.blockDaaScore ?? u.blockDaaScore ?? 0,
        isCoinbase: !!(e.isCoinbase ?? u.isCoinbase)
      }
    };
  }).filter(Boolean);
}

export async function compoundWithKasware(address) {
  const p = kaswareProvider();
  if (!p) throw new Error('KasWare is not installed');
  await syncKaswareNetwork();
  let rows = await fetchKaswareUtxos(address);
  return { utxos: rows, address };
}
