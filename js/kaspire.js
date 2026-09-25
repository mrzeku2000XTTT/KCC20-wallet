/* Kaspire Chrome extension — optional signer via window.kaspire.
   Docs: https://kaspire.kaslab.space/developers/extension
   Keys stay in Kaspire. Do not overwrite window.kasware. */
import { networkId } from './crypto.js?v=100';
import { safeSetItem } from './storage.js?v=1';

const STORE = 'kcc20_kaspire_v1';
const CWS = 'https://chromewebstore.google.com/detail/kaspire-wallet/ldjonnkfjmcingabncepnibledcanmoe';

export function kaspireStoreUrl() {
  return CWS;
}

export function kaspireProvider() {
  try {
    const p = typeof window !== 'undefined' ? window.kaspire : null;
    if (p && (p.isKaspire || typeof p.request === 'function')) return p;
  } catch {}
  return null;
}

export function isKaspireInstalled() {
  return !!kaspireProvider();
}

export function loadKaspirePref() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; }
}

export function saveKaspirePref(pref) {
  const slim = {
    enabled: !!(pref && pref.enabled),
    address: String((pref && pref.address) || '').slice(0, 80),
    pubKey: String((pref && pref.pubKey) || '').replace(/^0x/i, '').slice(0, 66)
  };
  if (!safeSetItem(STORE, JSON.stringify(slim))) {
    throw new Error('This browser is out of storage. Open Activity → Notices, then try Kaspire again.');
  }
}

export function kaspireEnabled() {
  return !!loadKaspirePref().enabled;
}

export function setKaspireEnabled(on) {
  const pref = loadKaspirePref();
  pref.enabled = !!on;
  saveKaspirePref(pref);
  if (on) {
    try {
      const kw = JSON.parse(localStorage.getItem('kcc20_kasware_v1') || '{}') || {};
      safeSetItem('kcc20_kasware_v1', JSON.stringify({
        enabled: false,
        address: String(kw.address || '').slice(0, 80),
        pubKey: String(kw.pubKey || '').replace(/^0x/i, '').slice(0, 66)
      }));
    } catch {}
  }
}

function firstAddr(accounts) {
  if (!accounts) return '';
  if (typeof accounts === 'string') {
    const s = accounts.trim();
    if (/^\[object /i.test(s) || /^0x[0-9a-f]+$/i.test(s)) return '';
    return s;
  }
  if (Array.isArray(accounts)) return firstAddr(accounts[0]);
  if (typeof accounts === 'object') {
    return firstAddr(accounts.address || accounts.addr || accounts.mainnet || accounts.publicAddress || '');
  }
  return '';
}

function normKasAddr(a) {
  return String(a || '').trim().toLowerCase();
}

export function sameKaspireAddr(a, b) {
  const x = normKasAddr(a), y = normKasAddr(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xp = x.includes(':') ? x.slice(x.indexOf(':') + 1) : x;
  const yp = y.includes(':') ? y.slice(y.indexOf(':') + 1) : y;
  return !!(xp && yp && xp === yp);
}

export function kaspireConnectedAddress() {
  const a = String(loadKaspirePref().address || '');
  if (!a || /^0x/i.test(a) || /\[object /i.test(a)) return '';
  return a;
}

function rejectUser(e) {
  const m = e && (e.message || e.code || e.toString?.() || String(e));
  const code = e && e.code;
  if (code === 4001 || /reject|denied|cancel|closed/i.test(String(m))) {
    throw new Error('cancelled');
  }
  throw (e instanceof Error ? e : new Error(String(m || 'Kaspire failed')));
}

export async function kaspireCall(method, params) {
  const p = kaspireProvider();
  if (!p) throw new Error('Kaspire is not in this browser. Install the Chrome extension, then toggle it in Settings.');
  if (typeof p.request === 'function') {
    const arg = params === undefined ? { method } : { method, params };
    try {
      return await p.request(arg);
    } catch (e) {
      rejectUser(e);
    }
  }
  if (typeof p[method] === 'function') {
    try {
      return params === undefined ? await p[method]() : await p[method](params);
    } catch (e) { rejectUser(e); }
  }
  throw new Error('Kaspire has no ' + method);
}

export function kaspireNetName(net) {
  return (net || networkId()) === 'testnet-10' ? 'testnet-10' : 'mainnet';
}

export async function syncKaspireNetwork() {
  const want = kaspireNetName();
  let cur = '';
  try { cur = String(await kaspireCall('getNetwork') || ''); } catch {}
  if (cur && cur === want) return want;
  try {
    await kaspireCall('switchNetwork', want);
  } catch {
    try {
      await kaspireCall('switchNetwork', { network: want });
    } catch {
      if (cur && cur !== want) {
        throw new Error('Kaspire is on ' + cur + '. Switch it to ' + want + ' in the extension, then try again.');
      }
    }
  }
  return want;
}

export async function connectKaspire() {
  const p = kaspireProvider();
  if (!p) throw new Error('Kaspire is not installed. Use Chrome or Edge, then install Kaspire Wallet.');
  let accounts;
  try {
    accounts = await kaspireCall('requestAccounts');
  } catch (e) { rejectUser(e); }
  try { await syncKaspireNetwork(); } catch (e) { rejectUser(e); }
  try {
    const again = await kaspireCall('getAccounts');
    if (firstAddr(again)) accounts = again;
  } catch {}
  const address = firstAddr(accounts);
  if (!address) throw new Error('Kaspire did not return an address');
  let pubKey = '';
  try { pubKey = String(await kaspireCall('getPublicKey') || '').replace(/^0x/i, ''); } catch {}
  const pref = { enabled: true, address, pubKey: pubKey || '' };
  saveKaspirePref(pref);
  setKaspireEnabled(true);
  bindKaspireEvents();
  return pref;
}

export async function disconnectKaspire() {
  const pref = loadKaspirePref();
  pref.enabled = false;
  saveKaspirePref(pref);
  try { await kaspireCall('disconnect'); } catch {}
  return pref;
}

let eventsBound = false;
export function bindKaspireEvents() {
  const p = kaspireProvider();
  if (eventsBound) return;
  const onInit = () => {
    window.dispatchEvent(new CustomEvent('kcc20-kaspire', { detail: { installed: true } }));
  };
  try { window.addEventListener('kaspire#initialized', onInit); } catch {}
  if (!p) return;
  eventsBound = true;
  const onAccounts = (accounts) => {
    const address = firstAddr(accounts);
    const pref = loadKaspirePref();
    if (!address) {
      pref.enabled = pref.enabled && false;
      pref.address = '';
      pref.pubKey = '';
    } else {
      pref.address = address;
    }
    saveKaspirePref(pref);
    window.dispatchEvent(new CustomEvent('kcc20-kaspire', { detail: { ...pref } }));
  };
  try { p.on?.('accountsChanged', onAccounts); } catch {}
  try { p.on?.('disconnect', () => onAccounts([])); } catch {}
  try {
    p.on?.('networkChanged', (net) => {
      window.dispatchEvent(new CustomEvent('kcc20-kaspire-net', { detail: net }));
    });
  } catch {}
}

export function kaspireSigning(wallet) {
  if (!isKaspireInstalled() || !kaspireEnabled()) return false;
  const theirs = kaspireConnectedAddress();
  if (!theirs) return false;
  if (!wallet) return true;
  return sameKaspireAddr(wallet.address, theirs);
}

export async function ensureKaspireSigner(wallet) {
  if (!kaspireEnabled()) return false;
  if (!isKaspireInstalled()) {
    throw new Error('Kaspire is not in this browser. Open Chrome/Edge with the Kaspire extension, then toggle it on in Settings.');
  }
  await syncKaspireNetwork();
  let addr = kaspireConnectedAddress();
  try { addr = firstAddr(await kaspireCall('getAccounts')) || addr; } catch {}
  if (!addr) {
    const linked = await connectKaspire();
    addr = linked.address;
  }
  if (addr && /^kaspa/i.test(addr)) {
    const pref = loadKaspirePref();
    pref.enabled = true;
    pref.address = addr;
    saveKaspirePref(pref);
  }
  if (wallet?.address && addr && /^kaspa/i.test(addr) && !sameKaspireAddr(wallet.address, addr)) {
    throw new Error('Kaspire is on a different account than this wallet. Switch Kaspire to the same ' + (networkId() === 'testnet-10' ? 'TN10' : 'mainnet') + ' account, then reconnect in Settings.');
  }
  return true;
}

function repairSafeJson(s) {
  let t = String(s || '').replace(/,(\s*[}\]])/g, '$1');
  t = t.replace(/("blockDaaScore"\s*:\s*(?:"[0-9]+"|[0-9]+))\s*}/g, '$1,"isCoinbase":false}');
  t = t.replace(/("block_daa_score"\s*:\s*(?:"[0-9]+"|[0-9]+))\s*}/g, '$1,"is_coinbase":false}');
  return t;
}

function signedJsonFrom(res) {
  if (typeof res === 'string' && res.length > 2) return repairSafeJson(res);
  if (!res || typeof res !== 'object') return '';
  const s = res.txJsonString || res.signedTxJson || res.signedTx || res.tx || res.data?.txJsonString;
  if (typeof s === 'string' && s.length > 2) return repairSafeJson(s);
  if (Array.isArray(res.inputs) || res.transaction?.inputs) return JSON.stringify(res);
  return '';
}

export async function signPsktWithKaspire(txJsonString, signInputs) {
  await ensureKaspireSigner();
  const json = repairSafeJson(txJsonString);
  const inputs = (signInputs || []).map(s => ({
    index: Number(s.index),
    sighashType: Number(s.sighashType ?? 1)
  }));
  const sender = kaspireConnectedAddress();
  const params = {
    sender,
    txJsonString: json,
    options: { signInputs: inputs }
  };
  let res;
  try {
    res = await kaspireCall('signPskt', params);
  } catch (e1) {
    const recovered = signedJsonFrom(e1) || signedJsonFrom(e1?.data);
    if (recovered) return recovered;
    rejectUser(e1);
  }
  const out = signedJsonFrom(res);
  if (out) return out;
  throw new Error('Kaspire did not return a signed transaction');
}

export async function sendKaspaWithKaspire(dest, amountKas) {
  await ensureKaspireSigner();
  const sompi = Math.round(Number(amountKas) * 1e8);
  if (!Number.isFinite(sompi) || sompi <= 0) throw new Error('Invalid amount');
  const from = kaspireConnectedAddress();
  let raw;
  try {
    raw = await kaspireCall('sendKaspa', { from, to: String(dest), amountSompi: String(sompi) });
  } catch (e) { rejectUser(e); }
  const txId = typeof raw === 'string' ? raw : String(raw?.id || raw?.transactionId || raw?.txId || '');
  return { txId, feeKas: 0, amountKas: Number(amountKas), node: 'kaspire', covenantId: null, boosted: false };
}

export async function fetchKaspireUtxos(address) {
  const theirs = kaspireConnectedAddress();
  if (address && theirs && !sameKaspireAddr(address, theirs)) return [];
  await ensureKaspireSigner();
  let rows = [];
  try { rows = await kaspireCall('getUtxoEntries'); } catch {}
  if (!Array.isArray(rows) || !rows.length) {
    try { rows = await kaspireCall('getUtxoEntries', address || theirs); } catch (e) { rejectUser(e); }
  }
  return (Array.isArray(rows) ? rows : []).map(u => {
    const e = u.entry || u.utxoEntry || u;
    const out = u.outpoint || e.outpoint || {};
    const spk = u.scriptPublicKey || e.scriptPublicKey || {};
    let script = typeof spk === 'string' ? spk : (spk.script || spk.scriptPublicKey || '');
    script = String(script || '').replace(/^0x/i, '');
    let txid = out.transactionId || out.transaction_id || '';
    txid = String(txid).replace(/^0x/i, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(txid) || !script) return null;
    const amount = e.amount ?? u.amount;
    return {
      address: address || theirs || '',
      outpoint: { transactionId: txid, index: Number(out.index || 0) },
      amount,
      scriptPublicKey: { version: Number(spk.version || 0), script },
      blockDaaScore: e.blockDaaScore ?? u.blockDaaScore ?? 0,
      isCoinbase: !!(e.isCoinbase ?? u.isCoinbase),
      utxoEntry: {
        amount,
        scriptPublicKey: { version: Number(spk.version || 0), script },
        blockDaaScore: e.blockDaaScore ?? u.blockDaaScore ?? 0,
        isCoinbase: !!(e.isCoinbase ?? u.isCoinbase)
      }
    };
  }).filter(Boolean);
}

export function waitForKaspire(timeoutMs = 2500) {
  if (isKaspireInstalled()) return Promise.resolve(kaspireProvider());
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(kaspireProvider()), timeoutMs);
    window.addEventListener('kaspire#initialized', () => {
      clearTimeout(t);
      resolve(kaspireProvider());
    }, { once: true });
  });
}
