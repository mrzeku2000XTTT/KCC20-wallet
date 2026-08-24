/* dApp connect host: popup / protocol-handler session for window.kcc20 (sdk.js). */
import { networkId } from './crypto.js?v=100';
import { fetchAddressUtxos, fetchAddressBalance, signPsktJson } from './tx.js?v=119';
import { kaswareSigning, signPsktWithKasware } from './kasware.js?v=100';

const ALLOW_KEY = 'kcc20_dapp_allow_v1';
const NS = 'kcc20';

let hooks = null;
let booted = false;
let queue = Promise.resolve();
let sourceWin = null;
let sourceOrigin = '';

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function netName() {
  return networkId() === 'testnet-10' ? 'kaspa_testnet_10' : 'kaspa_mainnet';
}

function parseWantNet(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'kaspa_testnet_10' || s === 'testnet-10' || s === 'tn10' || s === 'testnet') return 'testnet-10';
  if (s === 'kaspa_mainnet' || s === 'mainnet' || s === 'kaspa') return 'mainnet';
  return '';
}

function loadAllow() {
  try { return JSON.parse(localStorage.getItem(ALLOW_KEY) || '{}') || {}; } catch { return {}; }
}

function saveAllow(map) {
  localStorage.setItem(ALLOW_KEY, JSON.stringify(map || {}));
}

function originAllowed(origin) {
  const map = loadAllow();
  return !!(origin && map[origin]);
}

function rememberOrigin(origin, name) {
  if (!origin) return;
  const map = loadAllow();
  map[origin] = { at: Date.now(), name: String(name || '').slice(0, 80) };
  saveAllow(map);
}

function forgetOrigin(origin) {
  const map = loadAllow();
  delete map[origin];
  saveAllow(map);
}

function pageParams() {
  const u = new URL(location.href);
  let from = u.searchParams.get('from') || '';
  let ret = u.searchParams.get('return') || '';
  const handler = u.searchParams.get('handler') || '';
  if (handler) {
    try {
      const raw = decodeURIComponent(handler);
      const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw.replace(/^web\+kcc20:[^?]*/, '');
      const hp = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q);
      from = from || hp.get('from') || '';
      ret = ret || hp.get('return') || '';
    } catch {}
  }
  return { from, ret, dapp: u.searchParams.get('dapp') === '1' || !!handler };
}

function isHttpOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    return false;
  } catch {
    return false;
  }
}

function safeReturn(url, origin) {
  try {
    const u = new URL(url);
    return u.origin === origin && isHttpOrigin(u.origin);
  } catch {
    return false;
  }
}

function hexKey(v) {
  const s = String(v || '').replace(/^0x/i, '').trim();
  return /^[0-9a-fA-F]{64}$/.test(s) ? s.toLowerCase() : '';
}

function postTo(win, origin, msg) {
  if (!win) return false;
  try {
    win.postMessage({ ns: NS, ...msg }, origin || '*');
    return true;
  } catch {
    return false;
  }
}

function reply(req, result, error) {
  const msg = { type: 'res', id: req.id, result: error ? undefined : result, error: error || undefined };
  const origin = req.origin || sourceOrigin;
  if (sourceWin && origin) postTo(sourceWin, origin, msg);
  else if (window.opener && origin) postTo(window.opener, origin, msg);
  const ret = pageParams().ret;
  if ((!window.opener || window.opener.closed) && ret && origin && safeReturn(ret, origin)) {
    try {
      location.href = ret + (ret.includes('#') ? '&' : '#') + 'kcc20=' + encodeURIComponent(JSON.stringify({ ns: NS, ...msg }));
    } catch {}
  }
}

function summarizePskt(json) {
  try {
    const o = JSON.parse(String(json || ''));
    const tx = o.transaction || o;
    const ins = tx.inputs || [];
    const outs = tx.outputs || [];
    return ins.length + ' input' + (ins.length === 1 ? '' : 's') + ' → ' + outs.length + ' output' + (outs.length === 1 ? '' : 's');
  } catch {
    return 'PSKT (unreadable preview)';
  }
}

function showOverlay({ title, origin, body, approveLabel }) {
  return new Promise((resolve, reject) => {
    const overlay = $('dapp-overlay');
    if (!overlay) {
      reject(new Error('Connect UI missing'));
      return;
    }
    $('dapp-title').textContent = title || 'dApp request';
    const originEl = $('dapp-origin');
    if (originEl) originEl.textContent = origin || '';
    const bodyEl = $('dapp-body');
    if (bodyEl) bodyEl.innerHTML = body || '';
    const ok = $('dapp-approve');
    const no = $('dapp-reject');
    if (ok) ok.textContent = approveLabel || 'Approve';
    overlay.classList.add('open');
    const done = (fn) => {
      overlay.classList.remove('open');
      ok.onclick = null;
      no.onclick = null;
      fn();
    };
    ok.onclick = () => done(() => resolve(true));
    no.onclick = () => done(() => reject(new Error('User rejected')));
  });
}

async function ensureUnlocked() {
  const w = hooks?.getWallet?.();
  if (!w?.address) throw new Error('Open KCC20 Wallet and create or import a key first');
  if (typeof hooks.sessionOpen === 'function' && !hooks.sessionOpen()) {
    if (typeof hooks.requirePin === 'function') await hooks.requirePin('Unlock to connect a dApp');
  }
  if (typeof hooks.hydrateNativeKey === 'function') hooks.hydrateNativeKey(w);
  return w;
}

async function handleConnect(req) {
  const w = await ensureUnlocked();
  const origin = req.origin;
  if (!originAllowed(origin)) {
    await showOverlay({
      title: 'Connect dApp',
      origin,
      approveLabel: 'Connect',
      body:
        '<p class="muted" style="text-align:left;padding:0 0 8px;">This site wants your Kaspa address. Keys stay in this PWA. Never share your PIN or hex key.</p>'
        + '<div class="kv"><span class="k">dApp</span><span class="v">' + esc(req.name || origin) + '</span></div>'
        + '<div class="kv"><span class="k">Wallet</span><span class="v">' + esc(w.name || 'Wallet') + '</span></div>'
        + '<div class="kv kv-stack"><span class="k">Address</span><span class="v">' + esc(w.address) + '</span></div>'
        + '<div class="kv"><span class="k">Network</span><span class="v">' + esc(netName()) + '</span></div>'
    });
    rememberOrigin(origin, req.name);
  }
  return {
    accounts: [w.address],
    network: netName(),
    publicKey: w.pubKey || ''
  };
}

async function handleSign(req) {
  const w = await ensureUnlocked();
  const origin = req.origin;
  if (!originAllowed(origin)) {
    await handleConnect(req);
  }
  const json = String(req.params?.txJsonString || '');
  if (!json) throw new Error('dApp sent an empty PSKT');
  const inputs = Array.isArray(req.params?.signInputs) ? req.params.signInputs : [];
  await showOverlay({
    title: 'Sign transaction',
    origin,
    approveLabel: 'Sign',
    body:
      '<p class="muted" style="text-align:left;padding:0 0 8px;">Review this PSKT. Signing happens on this device (or KasWare). The dApp never sees your key.</p>'
      + '<div class="kv"><span class="k">dApp</span><span class="v">' + esc(req.name || origin) + '</span></div>'
      + '<div class="kv"><span class="k">Wallet</span><span class="v">' + esc(w.address) + '</span></div>'
      + '<div class="kv"><span class="k">Network</span><span class="v">' + esc(netName()) + '</span></div>'
      + '<div class="kv"><span class="k">PSKT</span><span class="v">' + esc(summarizePskt(json)) + '</span></div>'
  });
  if (typeof hooks.requirePin === 'function' && !kaswareSigning(w)) {
    await hooks.requirePin('Sign dApp PSKT');
  }
  if (kaswareSigning(w) && !hexKey(w.privKey)) {
    return await signPsktWithKasware(json, inputs);
  }
  return await signPsktJson({ wallet: w, txJsonString: json, signInputs: inputs });
}

async function handleSwitch(req) {
  const w = await ensureUnlocked();
  const want = parseWantNet(req.params?.network);
  if (!want) throw new Error('Unknown network');
  const already = networkId() === want;
  if (!already) {
    await showOverlay({
      title: 'Switch network',
      origin: req.origin,
      approveLabel: want === 'testnet-10' ? 'Switch to TN10' : 'Switch to mainnet',
      body:
        '<div class="kv"><span class="k">Now</span><span class="v">' + esc(netName()) + '</span></div>'
        + '<div class="kv"><span class="k">Requested</span><span class="v">' + esc(want === 'testnet-10' ? 'kaspa_testnet_10' : 'kaspa_mainnet') + '</span></div>'
        + '<p class="muted" style="text-align:left;padding:8px 0 0;">Same key. Address prefix follows the network.</p>'
    });
    if (typeof hooks.applyAppNetwork === 'function') await hooks.applyAppNetwork(want);
  }
  const live = hooks.getWallet?.() || w;
  return { network: netName(), accounts: live?.address ? [live.address] : [] };
}

async function handleGetUtxos(req) {
  const w = await ensureUnlocked();
  if (!originAllowed(req.origin)) await handleConnect(req);
  const addr = String(req.params?.address || w.address || '');
  if (!addr) throw new Error('No address');
  return await fetchAddressUtxos(addr);
}

async function handleGetBalance(req) {
  const w = await ensureUnlocked();
  if (!originAllowed(req.origin)) await handleConnect(req);
  const addr = String(req.params?.address || w.address || '');
  if (!addr) throw new Error('No address');
  const sompi = await fetchAddressBalance(addr);
  return { confirmed: sompi, unconfirmed: 0, address: addr };
}

async function dispatch(req) {
  const method = String(req.method || '');
  if (method === 'connect') return handleConnect(req);
  if (method === 'getAccounts') {
    const w = await ensureUnlocked();
    if (!originAllowed(req.origin)) return handleConnect(req);
    return { accounts: [w.address] };
  }
  if (method === 'getNetwork') return netName();
  if (method === 'getPublicKey') {
    const w = await ensureUnlocked();
    if (!originAllowed(req.origin)) await handleConnect(req);
    return w.pubKey || '';
  }
  if (method === 'disconnect') {
    forgetOrigin(req.origin);
    return true;
  }
  if (method === 'switchNetwork') return handleSwitch(req);
  if (method === 'signPskt' || method === 'signPsbt') return handleSign(req);
  if (method === 'getUtxoEntries') return handleGetUtxos(req);
  if (method === 'getBalance') return handleGetBalance(req);
  throw new Error('Unknown method ' + method);
}

function onMessage(ev) {
  const msg = ev.data;
  if (!msg || msg.ns !== NS) return;
  if (!isHttpOrigin(ev.origin) && ev.origin !== location.origin) return;
  if (msg.type === 'hello') {
    sourceWin = ev.source || window.opener;
    sourceOrigin = ev.origin;
    postTo(sourceWin, ev.origin, { type: 'ready', origin: location.origin });
    return;
  }
  if (msg.type !== 'req' || !msg.id) return;
  sourceWin = ev.source || sourceWin || window.opener;
  sourceOrigin = ev.origin;
  const req = {
    id: msg.id,
    method: msg.method,
    params: msg.params || {},
    origin: ev.origin,
    name: String(msg.name || msg.from || ev.origin)
  };
  queue = queue.then(async () => {
    try {
      const result = await dispatch(req);
      reply(req, result);
    } catch (e) {
      const text = e && e.message ? e.message : String(e);
      reply(req, undefined, text);
      try { hooks?.toast?.(text); } catch {}
    }
  }).catch(() => {});
}

function announce() {
  const { from } = pageParams();
  const target = from && isHttpOrigin(from) ? from : '';
  if (window.opener && target) postTo(window.opener, target, { type: 'ready', origin: location.origin });
  try {
    if (window.parent && window.parent !== window) {
      const parentOrigin = target || (document.referrer ? new URL(document.referrer).origin : '');
      if (parentOrigin && isHttpOrigin(parentOrigin)) {
        postTo(window.parent, parentOrigin, { type: 'ready', origin: location.origin });
      }
    }
  } catch {}
}

export function bootDappConnect(opts) {
  hooks = opts || {};
  if (booted) {
    announce();
    return;
  }
  booted = true;
  window.addEventListener('message', onMessage);
  announce();
}
