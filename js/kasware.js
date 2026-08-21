/* KasWare desktop extension — optional signer. Keys stay in KasWare. */

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

function firstAddr(accounts) {
  if (!accounts) return '';
  if (typeof accounts === 'string') return accounts;
  if (Array.isArray(accounts)) return String(accounts[0] || '');
  return String(accounts.address || accounts[0] || '');
}

export function kaswareConnectedAddress() {
  return String(loadKaswarePref().address || '');
}

export function kaswareSigning(wallet) {
  if (!kaswareEnabled() || !isKaswareInstalled()) return false;
  const mine = String(wallet?.address || '');
  const theirs = kaswareConnectedAddress();
  return !!(mine && theirs && mine === theirs);
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
  const address = firstAddr(accounts);
  if (!address) throw new Error('KasWare did not return an address');
  try { await p.switchNetwork('kaspa_mainnet'); } catch {}
  let pubKey = '';
  try { pubKey = await p.getPublicKey(); } catch {}
  const pref = { enabled: true, address, pubKey: pubKey || '', at: Date.now() };
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

export async function signPsktWithKasware(txJsonString, signInputs) {
  const p = kaswareProvider();
  if (!p) throw new Error('KasWare is not installed');
  if (typeof p.signPskt !== 'function') {
    throw new Error('This KasWare version cannot sign PSKT. Update KasWare to sign KRON trades.');
  }
  const inputs = (signInputs || []).map(s => ({
    index: Number(s.index),
    sighashType: Number(s.sighashType ?? 1)
  }));
  let res;
  try {
    res = await p.signPskt({
      txJsonString: String(txJsonString || ''),
      options: { signInputs: inputs }
    });
  } catch (e) { rejectUser(e); }
  if (typeof res === 'string' && res) return res;
  if (res && typeof res === 'object') {
    return res.txJsonString || res.signedTx || res.tx || JSON.stringify(res);
  }
  throw new Error('KasWare did not return a signed transaction');
}

export async function fetchKaswareUtxos(address) {
  const p = kaswareProvider();
  if (!p?.getUtxoEntries) return [];
  let rows = [];
  try {
    rows = address ? await p.getUtxoEntries(address) : await p.getUtxoEntries();
  } catch {
    try { rows = await p.getUtxoEntries(); } catch { return []; }
  }
  return (Array.isArray(rows) ? rows : []).map(u => {
    const e = u.entry || u;
    const out = u.outpoint || e.outpoint || {};
    const spk = u.scriptPublicKey || e.scriptPublicKey || {};
    const script = typeof spk === 'string' ? spk : (spk.script || spk.scriptPublicKey || '');
    const txid = out.transactionId || out.transaction_id;
    if (!txid || !script) return null;
    return {
      outpoint: { transactionId: String(txid), index: Number(out.index || 0) },
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
  let bal = {};
  try { bal = await p.getBalance(); } catch {}
  const total = Number(bal?.confirmed ?? bal?.total ?? bal?.balance ?? 0);
  const fee = 500_000;
  if (!Number.isFinite(total) || total <= fee + 10_000) {
    throw new Error('KasWare balance is too small to compound');
  }
  let raw;
  try {
    raw = await p.sendKaspa(address, total - fee);
  } catch (e) { rejectUser(e); }
  const parsed = parseKaswareTx(raw);
  return {
    txId: parsed.txId,
    feeKas: fee / 1e8,
    amountKas: (total - fee) / 1e8,
    inputs: 0
  };
}
