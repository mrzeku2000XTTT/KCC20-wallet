/* dApp connect host: popup / protocol-handler session for window.kcc20 (sdk.js). */
import { networkId, validateKaspaAddress } from './crypto.js?v=100';
import { fetchAddressUtxos, fetchAddressBalance, signPsktJson, pushSignedPskt } from './tx.js?v=167';
import { kaswareSigning, signPsktWithKasware, walletIsKaswareChip, isKaswareInstalled } from './kasware.js?v=161';

const ALLOW_KEY = 'kcc20_dapp_allow_v1';
const TREASURY_KEY = 'kcc20_dapp_treasury_v1';
const NS = 'kcc20';
const HOST_METHODS = [
  'connect', 'requestAccounts', 'disconnect', 'getAccounts', 'getNetwork', 'getPublicKey',
  'switchNetwork', 'signPskt', 'signPsbt', 'pushTx', 'getUtxoEntries', 'getBalance',
  'getTokenBalance', 'getHoldings', 'getState', 'sendToken', 'sendKcc20', 'payToken', 'payKcc20', 'fundCredits',
  'quoteKron', 'quoteToken', 'buyKron', 'buyToken', 'sellKron', 'sellToken', 'tradeKron', 'tradeToken',
  'compileVault', 'lockVault', 'sendKas', 'sendKaspa'
];

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

function loadTreasuryMap() {
  try { return JSON.parse(localStorage.getItem(TREASURY_KEY) || '{}') || {}; } catch { return {}; }
}

function pinnedTreasury(origin) {
  const row = loadTreasuryMap()[origin];
  return row?.dest || '';
}

function pinTreasury(origin, dest) {
  if (!origin || !dest) return;
  const map = loadTreasuryMap();
  map[origin] = { dest, at: Date.now() };
  localStorage.setItem(TREASURY_KEY, JSON.stringify(map));
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
  if (!win || !origin || origin === '*') return false;
  if (!isHttpOrigin(origin) && origin !== location.origin) return false;
  try {
    win.postMessage({ ns: NS, ...msg }, origin);
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
  if (!error) maybeCloseDappPopup(req.method);
}

function closeDappPopupKeepOpener() {
  try {
    if (window.opener && !window.opener.closed) window.opener.focus();
  } catch {}
  try { window.blur(); } catch {}
  setTimeout(() => { try { window.close(); } catch {} }, 40);
}

function maybeCloseDappPopup(method) {
  try {
    if (window.parent && window.parent !== window) return;
    if (!pageParams().dapp) return;
    if (!window.opener) return;
    const closeAfter = {
      connect: 1, requestAccounts: 1, signPskt: 1, signPsbt: 1, pushTx: 1, disconnect: 1,
      sendToken: 1, sendKcc20: 1, payToken: 1, payKcc20: 1, fundCredits: 1,
      buyKron: 1, buyToken: 1, sellKron: 1, sellToken: 1, tradeKron: 1, tradeToken: 1,
      compileVault: 1, lockVault: 1, sendKas: 1, sendKaspa: 1
    };
    if (!closeAfter[String(method || '')]) return;
    setTimeout(() => closeDappPopupKeepOpener(), 50);
  } catch {}
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

function briefAddr(a) {
  const s = String(a || '');
  if (s.length < 18) return s;
  return s.slice(0, 10) + '…' + s.slice(-6);
}

async function ensureBoundPayer() {
  if (typeof hooks?.ensureDappPayer === 'function') {
    try { await hooks.ensureDappPayer(); } catch {}
  }
  return hooks?.getWallet?.();
}

function paintDappWallets() {
  const box = $('dapp-wallets');
  if (!box) return;
  const list = typeof hooks?.listWallets === 'function' ? (hooks.listWallets() || []) : [];
  const cur = hooks?.getWallet?.();
  if (list.length < 2) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = '<p class="dapp-wallets-lab">Tap a chip. KasWare chips Approve in the extension (funding input only). Native chips PIN-sign here.</p>' + list.map(w => {
    const on = !!(cur && (w.id === cur.id || String(w.address) === String(cur.address)));
    return `<button type="button" class="dapp-wchip${on ? ' on' : ''}" data-dapp-wid="${esc(w.id)}"><b>${esc(w.name || 'Wallet')}</b><span>${esc(briefAddr(w.address))}${w.kasware ? ' · KasWare' : ''}${on ? ' · connected' : ''}</span></button>`;
  }).join('');
}

function showOverlay({ title, origin, body, approveLabel, onWalletChange }) {
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
    paintDappWallets();
    const ok = $('dapp-approve');
    const no = $('dapp-reject');
    const chips = $('dapp-wallets');
    if (ok) ok.textContent = approveLabel || 'Approve';
    overlay.classList.add('open');
    const done = (fn) => {
      overlay.classList.remove('open');
      ok.onclick = null;
      no.onclick = null;
      if (chips) chips.onclick = null;
      fn();
    };
    if (chips) {
      chips.onclick = async (e) => {
        const b = e.target.closest('[data-dapp-wid]');
        if (!b?.dataset.dappWid || !hooks?.switchDappWallet) return;
        try {
          await hooks.switchDappWallet(b.dataset.dappWid);
          paintDappWallets();
          if (typeof onWalletChange === 'function') await onWalletChange(hooks.getWallet?.());
        } catch (err) {
          try { hooks.toast?.(err && err.message ? err.message : String(err)); } catch {}
        }
      };
    }
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

function connectBody(w, req, origin) {
  return '<p class="muted" style="text-align:left;padding:0 0 8px;">This dApp wants a Kaspa address. Pick which of your added wallets to use. Keys stay here.</p>'
    + '<div class="kv"><span class="k">App</span><span class="v">' + esc(req.name || (String(origin).includes('tttz.xyz') ? 'TTT' : origin)) + '</span></div>'
    + '<div class="kv"><span class="k">Wallet</span><span class="v">' + esc(w?.name || 'Wallet') + '</span></div>'
    + '<div class="kv kv-stack"><span class="k">Address</span><span class="v">' + esc(w?.address || '') + '</span></div>'
    + '<div class="kv"><span class="k">Network</span><span class="v">' + esc(netName()) + '</span></div>';
}

async function handleConnect(req) {
  await ensureBoundPayer();
  let w = await ensureUnlocked();
  const origin = req.origin;
  const many = (typeof hooks.listWallets === 'function' ? hooks.listWallets() : []).length > 1;
  if (!originAllowed(origin) || many) {
    const fill = () => {
      const live = hooks.getWallet?.() || w;
      if ($('dapp-body')) $('dapp-body').innerHTML = connectBody(live, req, origin);
    };
    await showOverlay({
      title: 'Connect dApp',
      origin,
      approveLabel: 'Connect',
      body: connectBody(w, req, origin),
      onWalletChange: fill
    });
    rememberOrigin(origin, req.name);
    w = hooks.getWallet?.() || w;
  }
  try { hooks?.rememberDappAccount?.(w.address); } catch {}
  return walletSnapshot(w);
}

async function walletSnapshot(w) {
  const sompi = await fetchAddressBalance(w.address).catch(() => 0);
  let holdings = [];
  try {
    if (typeof hooks.getHoldings === 'function') holdings = (await hooks.getHoldings()) || [];
  } catch {}
  const rows = (holdings || []).map(serializeHolding).filter(Boolean);
  const kkd = rows.find(h => h.tick === 'KKDAG') || null;
  const kas = rows.find(h => h.tick === 'KAS' || h.protocol === 'kas') || null;
  return {
    accounts: [w.address],
    address: w.address,
    network: netName(),
    publicKey: w.pubKey || '',
    name: w.name || 'Wallet',
    balance: {
      confirmed: Number(sompi || 0),
      unconfirmed: 0,
      address: w.address,
      kas: Number(sompi || 0) / 1e8
    },
    holdings: rows,
    kas: kas ? Number(kas.balance || sompi / 1e8) : Number(sompi || 0) / 1e8,
    kkdags: kkd ? Number(kkd.balance || 0) : 0
  };
}

async function handleGetState(req) {
  await ensureBoundPayer();
  const w = await ensureUnlocked();
  if (!originAllowed(req.origin)) return handleConnect(req);
  return walletSnapshot(w);
}

async function handleSign(req) {
  await ensureBoundPayer();
  let w = await ensureUnlocked();
  const origin = req.origin;
  if (!originAllowed(origin)) {
    await handleConnect(req);
  }
  const json = String(req.params?.txJsonString || '');
  if (!json) throw new Error('dApp sent an empty PSKT');
  const inputs = Array.isArray(req.params?.signInputs) ? req.params.signInputs : [];
  const signBody = () => {
    const live = hooks.getWallet?.() || w;
    return '<p class="muted" style="text-align:left;padding:0 0 8px;">Review this PSKT. Pick a wallet you added, then Sign. The dApp never sees your key.</p>'
      + '<div class="kv"><span class="k">dApp</span><span class="v">' + esc(req.name || origin) + '</span></div>'
      + '<div class="kv"><span class="k">Wallet</span><span class="v">' + esc(live?.name || 'Wallet') + '</span></div>'
      + '<div class="kv kv-stack"><span class="k">Address</span><span class="v">' + esc(live?.address || '') + '</span></div>'
      + '<div class="kv"><span class="k">Network</span><span class="v">' + esc(netName()) + '</span></div>'
      + '<div class="kv"><span class="k">PSKT</span><span class="v">' + esc(summarizePskt(json)) + '</span></div>';
  };
  await showOverlay({
    title: 'Sign transaction',
    origin,
    approveLabel: 'Sign',
    body: signBody(),
    onWalletChange: () => { if ($('dapp-body')) $('dapp-body').innerHTML = signBody(); }
  });
  w = hooks.getWallet?.() || w;
  if (typeof hooks.hydrateNativeKey === 'function') hooks.hydrateNativeKey(w);
  if (typeof hooks.requirePin === 'function' && !kaswareSigning(w)) {
    await hooks.requirePin('Sign dApp PSKT');
  }
  if (kaswareSigning(w) && !hexKey(w.privKey)) {
    return await signPsktWithKasware(json, inputs);
  }
  return await signPsktJson({ wallet: w, txJsonString: json, signInputs: inputs });
}

async function handlePushTx(req) {
  const w = await ensureUnlocked();
  const origin = req.origin;
  if (!originAllowed(origin)) await handleConnect(req);
  const json = String(req.params?.txJsonString || req.params?.signedTx || '');
  if (!json) throw new Error('dApp sent an empty signed transaction');
  await showOverlay({
    title: 'Broadcast transaction',
    origin,
    approveLabel: 'Broadcast',
    body:
      '<p class="muted" style="text-align:left;padding:0 0 8px;">Submit this already-signed PSKT to a public Kaspa node. The dApp does not get your key.</p>'
      + '<div class="kv"><span class="k">dApp</span><span class="v">' + esc(req.name || origin) + '</span></div>'
      + '<div class="kv"><span class="k">Wallet</span><span class="v">' + esc(w.address) + '</span></div>'
      + '<div class="kv"><span class="k">Network</span><span class="v">' + esc(netName()) + '</span></div>'
      + '<div class="kv"><span class="k">Tx</span><span class="v">' + esc(summarizePskt(json)) + '</span></div>'
  });
  const res = await pushSignedPskt(json);
  try { hooks?.afterTx?.(); } catch {}
  return res;
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

function serializeHolding(t) {
  if (!t) return null;
  const tick = String(t.ticker || t.tick || '').toUpperCase();
  const dec = Math.max(0, Number(t.decimals || 0));
  const raw = String(t.balance || t.raw || '0');
  const human = Number(raw) / (10 ** dec);
  return {
    tick,
    name: t.name || tick,
    decimals: dec,
    raw,
    balance: Number.isFinite(human) ? String(human) : '0',
    protocol: t.native ? 'kas' : (t.protocol || 'kcc20')
  };
}

async function handleHoldings(req) {
  const w = await ensureUnlocked();
  if (!originAllowed(req.origin)) await handleConnect(req);
  const list = typeof hooks.getHoldings === 'function' ? await hooks.getHoldings() : [];
  return {
    address: w.address,
    network: netName(),
    holdings: (list || []).map(serializeHolding).filter(Boolean)
  };
}

async function handleTokenBalance(req) {
  await ensureBoundPayer();
  const w = await ensureUnlocked();
  if (!originAllowed(req.origin)) await handleConnect(req);
  const tick = String(req.params?.tick || req.params?.ticker || 'KKDAG').toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(tick)) throw new Error('Bad ticker');
  let row = null;
  if (typeof hooks.getTokenBalance === 'function') row = await hooks.getTokenBalance(tick);
  return serializeHolding(row) || { tick, name: tick, decimals: 0, raw: '0', balance: '0', protocol: tick === 'KAS' ? 'kas' : 'kcc20', address: w.address };
}

function cleanKaspaDest(raw) {
  let dest = String(raw || '').trim().replace(/\s+/g, '').replace(/[.\u2026]+$/g, '').toLowerCase();
  if (dest && !dest.startsWith('kaspa:') && /^q[a-z0-9]{20,}$/.test(dest)) dest = 'kaspa:' + dest;
  return dest;
}

function destIsTreasury(dest) {
  return cleanKaspaDest(dest) === TTT_TREASURY;
}

async function handleSendToken(req) {
  await ensureBoundPayer();
  let w = await ensureUnlocked();
  const origin = req.origin;
  if (!originAllowed(origin)) await handleConnect(req);
  if (netName() !== 'kaspa_mainnet') throw new Error('KCC20 pay is mainnet. Switch this wallet off TN10.');
  const tick = String(req.params?.tick || req.params?.ticker || 'KKDAG').toUpperCase();
  let amount = String(req.params?.amount ?? req.params?.amountHuman ?? '').trim();
  let dest = cleanKaspaDest(
    req.params?.dest || req.params?.to || req.params?.treasury
    || req.params?.destination || req.params?.destinationAddress || req.params?.recipient || ''
  );
  if (!/^[A-Z0-9]{2,12}$/.test(tick)) throw new Error('Bad ticker');
  if (!(Number(amount) > 0)) amount = '10';
  if (!dest) dest = destIsTreasury(pinnedTreasury(origin)) ? pinnedTreasury(origin) : (isTttOrigin(origin) ? TTT_TREASURY : '');
  const parsed = validateKaspaAddress(dest, 'mainnet');
  if (!parsed.isValid) {
    throw new Error('Need a full kaspa:q… receive address (not truncated, not kaspa:p). ' + (parsed.error || ''));
  }
  if (Number(parsed.versionByte) !== 0) {
    throw new Error('Pay to a kaspa:q receive address, not a kaspa:p vault');
  }
  dest = dest.toLowerCase();
  const toTreasury = destIsTreasury(dest);
  const payBody = async () => {
    const live = hooks.getWallet?.() || w;
    const hold = typeof hooks.getTokenBalance === 'function' ? await hooks.getTokenBalance(tick) : null;
    const have = Number(serializeHolding(hold)?.balance || 0);
    const payerLine = (typeof hooks.payerLabel === 'function' && hooks.payerLabel()) || (live?.name || 'Wallet') + ' · ' + (live?.address || '');
    return {
      have,
      html:
        '<p class="muted" style="text-align:left;padding:0 0 8px;"><b>Pick the wallet that holds ' + esc(tick) + '.</b> Keys stay here.</p>'
        + '<div class="kv kv-stack"><span class="k">PAYING FROM</span><span class="v">' + esc(payerLine) + '</span></div>'
        + '<div class="kv"><span class="k">This bag holds</span><span class="v">' + esc(String(have)) + ' ' + esc(tick) + '</span></div>'
        + '<div class="kv"><span class="k">Send</span><span class="v">' + esc(amount) + ' ' + esc(tick) + '</span></div>'
        + '<div class="kv kv-stack"><span class="k">' + (toTreasury ? 'TO treasury (ews)' : 'TO') + '</span><span class="v">' + esc(dest) + '</span></div>'
        + '<p class="muted" style="text-align:left;padding:8px 0 0;">Same as Home → Send. ~0.50 KAS stays locked in the token cell (KRON dust), leftover KAS comes back as change. Network fee is tiny. This is not a KAS payment.</p>'
    };
  };
  let view = await payBody();
  await showOverlay({
    title: 'Sign ' + amount + ' ' + tick,
    origin,
    approveLabel: 'Sign ' + amount + ' ' + tick,
    body: view.html,
    onWalletChange: async () => {
      view = await payBody();
      if ($('dapp-body')) $('dapp-body').innerHTML = view.html;
    }
  });
  w = hooks.getWallet?.() || w;
  if (toTreasury && typeof hooks.isTreasuryPayer === 'function' && hooks.isTreasuryPayer()) {
    throw new Error('This chip is ews (treasury). Switch to another wallet on the sheet, then Sign.');
  }
  view = await payBody();
  if (!(view.have > 0)) {
    throw new Error('This wallet has 0 ' + tick + '. Tap another chip (Wallet 2) on the sheet, then Sign.');
  }
  if (Number(amount) > view.have + 1e-9) {
    throw new Error('Need ' + amount + ' ' + tick + '. This wallet holds ' + view.have);
  }
  if (typeof hooks.hydrateNativeKey === 'function') hooks.hydrateNativeKey(w);
  if (typeof hooks.requirePin === 'function' && !kaswareSigning(w)) {
    await hooks.requirePin('Sign ' + amount + ' ' + tick);
  }
  if (typeof hooks.sendToken !== 'function') throw new Error('Wallet cannot send KCC20 from this session');
  const result = await hooks.sendToken({ tick, amount, dest, origin });
  if (toTreasury) pinTreasury(origin, dest);
  return result;
}

function tradeSide(method, params) {
  const m = String(method || '');
  if (m === 'sellKron' || m === 'sellToken') return 'sell';
  const s = String(params?.side || '').toLowerCase();
  return s === 'sell' ? 'sell' : 'buy';
}

function tradeAmount(params, side) {
  if (side === 'buy') {
    return String(params?.amount ?? params?.kas ?? params?.kasAmount ?? params?.amountKas ?? '').trim();
  }
  return String(params?.amount ?? params?.token ?? params?.tokenAmount ?? '').trim();
}

async function handleQuoteKron(req) {
  await ensureBoundPayer();
  const w = await ensureUnlocked();
  if (!originAllowed(req.origin)) await handleConnect(req);
  if (netName() !== 'kaspa_mainnet') throw new Error('KRON trade is mainnet. Switch this wallet off TN10.');
  const tick = String(req.params?.tick || req.params?.ticker || 'KKDAG').toUpperCase();
  const side = tradeSide(req.method, req.params);
  const amount = tradeAmount(req.params, side);
  if (!/^[A-Z0-9]{2,12}$/.test(tick)) throw new Error('Bad ticker');
  if (!(Number(amount) > 0)) throw new Error('Enter an amount greater than 0');
  if (typeof hooks.quoteKron !== 'function') throw new Error('Wallet cannot quote KRON');
  return hooks.quoteKron({ tick, side, amount });
}

async function handleTradeKron(req) {
  await ensureBoundPayer();
  let w = await ensureUnlocked();
  const origin = req.origin;
  if (!originAllowed(origin)) await handleConnect(req);
  if (netName() !== 'kaspa_mainnet') throw new Error('KRON trade is mainnet. Switch this wallet off TN10.');
  const tick = String(req.params?.tick || req.params?.ticker || 'KKDAG').toUpperCase();
  const side = tradeSide(req.method, req.params);
  let amount = tradeAmount(req.params, side);
  if (!/^[A-Z0-9]{2,12}$/.test(tick)) throw new Error('Bad ticker');
  if (!(Number(amount) > 0)) amount = side === 'buy' ? '10' : amount;
  if (!(Number(amount) > 0)) throw new Error('Enter an amount greater than 0');
  const payBody = async () => {
    const live = hooks.getWallet?.() || w;
    const kw = !!(walletIsKaswareChip(live) || kaswareSigning(live));
    const payerLine = (typeof hooks.payerLabel === 'function' && hooks.payerLabel())
      || (live?.name || 'Wallet') + ' · ' + (live?.address || '');
    let q = null;
    let err = '';
    try {
      q = typeof hooks.quoteKron === 'function' ? await hooks.quoteKron({ tick, side, amount }) : null;
    } catch (e) {
      err = e && e.message ? e.message : String(e);
    }
    const line = q
      ? (side === 'buy'
        ? (q.kasHuman + ' KAS → ~' + q.tokenHuman + ' ' + tick)
        : (q.tokenHuman + ' ' + tick + ' → ~' + q.kasHuman + ' KAS'))
      : (err || 'Quote failed');
    return {
      q,
      err,
      kw,
      html:
        '<p class="muted" style="text-align:left;padding:0 0 8px;"><b>Same as Home → TRADE.</b> Wallet builds the KRON swap. Keys stay here.</p>'
        + '<div class="kv kv-stack"><span class="k">WALLET</span><span class="v">' + esc(payerLine) + (kw ? ' · KasWare' : '') + '</span></div>'
        + '<div class="kv"><span class="k">Side</span><span class="v">' + esc(side.toUpperCase()) + '</span></div>'
        + '<div class="kv"><span class="k">Token</span><span class="v">' + esc(tick) + (q && q.graduated ? ' · pool' : ' · curve') + '</span></div>'
        + '<div class="kv kv-stack"><span class="k">Quote</span><span class="v">' + esc(line) + '</span></div>'
        + (kw
          ? '<p class="muted" style="text-align:left;padding:8px 0 0;">KasWare only signs the KAS funding input. SCORPION keeps the covenant/curve/pool inputs. Same as Home TRADE.</p>'
          : '<p class="muted" style="text-align:left;padding:8px 0 0;">KAS pays the curve/pool. Token cells carry ~0.5 KAS dust. Not sendToken (that is a bag transfer).</p>')
    };
  };
  let view = await payBody();
  await showOverlay({
    title: (side === 'buy' ? 'Buy ' : 'Sell ') + tick,
    origin,
    approveLabel: view.kw
      ? ('Approve in KasWare')
      : (side === 'buy' ? 'Buy ' + tick : 'Sell ' + tick),
    body: view.html,
    onWalletChange: async () => {
      view = await payBody();
      if ($('dapp-body')) $('dapp-body').innerHTML = view.html;
      const btn = $('dapp-approve');
      if (btn) btn.textContent = view.kw
        ? 'Approve in KasWare'
        : (side === 'buy' ? 'Buy ' + tick : 'Sell ' + tick);
    }
  });
  w = hooks.getWallet?.() || w;
  view = await payBody();
  if (!view.q) throw new Error(view.err || 'KRON quote failed');
  if (typeof hooks.hydrateNativeKey === 'function') hooks.hydrateNativeKey(w);
  const useKw = !!(view.kw || walletIsKaswareChip(w) || kaswareSigning(w));
  if (useKw) {
    if (typeof hooks.ensureKasware === 'function') await hooks.ensureKasware(w);
    else if (!isKaswareInstalled()) throw new Error('KasWare is not in this browser');
  } else if (typeof hooks.requirePin === 'function') {
    await hooks.requirePin((side === 'buy' ? 'Buy ' : 'Sell ') + amount + (side === 'buy' ? ' KAS of ' : ' ') + tick);
  }
  if (typeof hooks.tradeKron !== 'function') throw new Error('Wallet cannot trade KRON from this session');
  return hooks.tradeKron({ tick, side, amount });
}

function vaultIntentFromReq(params) {
  const p = params || {};
  if (p.message || p.text || p.prompt) {
    return {
      message: String(p.message || p.text || p.prompt || '').trim(),
      type: p.type || p.vaultType || p.preset || p.product || '',
      params: p.params || {}
    };
  }
  return {
    type: String(p.type || p.vaultType || p.preset || p.product || '').trim(),
    params: p.params || p,
    message: ''
  };
}

async function handleCompileVault(req) {
  await ensureBoundPayer();
  let w = await ensureUnlocked();
  const origin = req.origin;
  if (!originAllowed(origin)) await handleConnect(req);
  if (typeof hooks.compileVault !== 'function') {
    throw new Error('This wallet build cannot compile vaults. Hard-refresh KCC20 (BUILD 179+). Card sale = type onramp.');
  }
  const spec = vaultIntentFromReq(req.params);
  let preview = { summary: spec.message || spec.type || 'vault', type: spec.type || 'timelock', ask: '', complete: true };
  if (typeof hooks.describeVaultIntent === 'function') {
    try { preview = await hooks.describeVaultIntent(spec); } catch (e) {
      throw new Error(e && e.message ? e.message : String(e));
    }
  }
  if (preview && preview.type === 'send') {
    throw new Error('That is a plain send, not a vault. Call sendKas({ dest, amount }). Time Capsule would return to you, not the destination.');
  }
  if (preview && preview.complete === false) {
    throw new Error(preview.ask || 'Argent needs more fields (amount, duration, or a kaspa: address).');
  }
  const payBody = async () => {
    const live = hooks.getWallet?.() || w;
    const payerLine = (typeof hooks.payerLabel === 'function' && hooks.payerLabel())
      || (live?.name || 'Wallet') + ' · ' + (live?.address || '');
    const kw = !!(walletIsKaswareChip(live) || kaswareSigning(live));
    return {
      kw,
      html:
        '<p class="muted" style="text-align:left;padding:0 0 8px;"><b>Argent compiles a P2SH kaspa:p in this wallet.</b> Keys stay here. Same as Vault → Argent.</p>'
        + '<div class="kv kv-stack"><span class="k">WALLET</span><span class="v">' + esc(payerLine) + (kw ? ' · KasWare' : '') + '</span></div>'
        + '<div class="kv"><span class="k">Type</span><span class="v">' + esc(preview.type || spec.type || 'vault') + '</span></div>'
        + '<div class="kv kv-stack"><span class="k">Intent</span><span class="v">' + esc(preview.summary || '') + '</span></div>'
        + '<p class="muted" style="text-align:left;padding:8px 0 0;">Time Capsule / life lock returns to this wallet. A grandson only gets funds on timeout if this is a sentinel with his kaspa:q as beneficiary.</p>'
    };
  };
  let view = await payBody();
  await showOverlay({
    title: 'Argent compile',
    origin,
    approveLabel: view.kw ? 'Approve in KasWare' : 'Compile & lock',
    body: view.html,
    onWalletChange: async () => {
      view = await payBody();
      if ($('dapp-body')) $('dapp-body').innerHTML = view.html;
      const btn = $('dapp-approve');
      if (btn) btn.textContent = view.kw ? 'Approve in KasWare' : 'Compile & lock';
    }
  });
  w = hooks.getWallet?.() || w;
  if (typeof hooks.hydrateNativeKey === 'function') hooks.hydrateNativeKey(w);
  const useKw = !!(view.kw || walletIsKaswareChip(w) || kaswareSigning(w));
  if (useKw) {
    if (typeof hooks.ensureKasware === 'function') await hooks.ensureKasware(w);
    else if (!isKaswareInstalled()) throw new Error('KasWare is not in this browser');
  } else if (typeof hooks.requirePin === 'function') {
    await hooks.requirePin('Confirm vault fund');
  }
  return hooks.compileVault({ ...spec, skipPin: true });
}

async function handleSendKas(req) {
  await ensureBoundPayer();
  let w = await ensureUnlocked();
  const origin = req.origin;
  if (!originAllowed(origin)) await handleConnect(req);
  const amount = String(req.params?.amount ?? req.params?.amountKas ?? req.params?.kas ?? '').trim();
  let dest = cleanKaspaDest(
    req.params?.dest || req.params?.to || req.params?.destination || req.params?.destinationAddress || req.params?.recipient || ''
  );
  if (!(Number(amount) > 0)) throw new Error('Enter an amount of KAS greater than 0');
  const parsed = validateKaspaAddress(dest, netName() === 'kaspa_testnet_10' ? 'testnet-10' : 'mainnet');
  if (!parsed.isValid) {
    throw new Error('Need a full kaspa:q… receive address (not truncated, not kaspa:p). ' + (parsed.error || ''));
  }
  dest = dest.toLowerCase();
  const payBody = async () => {
    const live = hooks.getWallet?.() || w;
    const payerLine = (typeof hooks.payerLabel === 'function' && hooks.payerLabel())
      || (live?.name || 'Wallet') + ' · ' + (live?.address || '');
    return {
      html:
        '<p class="muted" style="text-align:left;padding:0 0 8px;"><b>Plain KAS send.</b> Not a vault. Argent does not compile a covenant for this.</p>'
        + '<div class="kv kv-stack"><span class="k">FROM</span><span class="v">' + esc(payerLine) + '</span></div>'
        + '<div class="kv"><span class="k">Send</span><span class="v">' + esc(amount) + ' KAS</span></div>'
        + '<div class="kv kv-stack"><span class="k">TO</span><span class="v">' + esc(dest) + '</span></div>'
    };
  };
  let view = await payBody();
  await showOverlay({
    title: 'Send ' + amount + ' KAS',
    origin,
    approveLabel: 'Send ' + amount + ' KAS',
    body: view.html,
    onWalletChange: async () => {
      view = await payBody();
      if ($('dapp-body')) $('dapp-body').innerHTML = view.html;
    }
  });
  w = hooks.getWallet?.() || w;
  if (typeof hooks.hydrateNativeKey === 'function') hooks.hydrateNativeKey(w);
  if (typeof hooks.requirePin === 'function' && !kaswareSigning(w)) {
    await hooks.requirePin('Send ' + amount + ' KAS');
  }
  if (typeof hooks.sendKas !== 'function') throw new Error('Wallet cannot send KAS from this session');
  return hooks.sendKas({ dest, amount, amountKas: amount, skipPin: true });
}

async function dispatch(req) {
  const method = String(req.method || '');
  if (method === 'connect' || method === 'requestAccounts') return handleConnect(req);
  if (method === 'getAccounts') {
    await ensureBoundPayer();
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
    try { hooks?.rememberDappAccount?.(''); } catch {}
    return true;
  }
  if (method === 'switchNetwork') return handleSwitch(req);
  if (method === 'signPskt' || method === 'signPsbt') return handleSign(req);
  if (method === 'pushTx' || method === 'broadcast') return handlePushTx(req);
  if (method === 'getUtxoEntries') return handleGetUtxos(req);
  if (method === 'getBalance') return handleGetBalance(req);
  if (method === 'getHoldings' || method === 'getKcc20Holdings') return handleHoldings(req);
  if (method === 'getState') return handleGetState(req);
  if (method === 'getTokenBalance' || method === 'getKcc20Balance') return handleTokenBalance(req);
  if (method === 'sendToken' || method === 'sendKcc20' || method === 'payToken' || method === 'payKcc20' || method === 'fundCredits') {
    return handleSendToken(req);
  }
  if (method === 'quoteKron' || method === 'quoteToken') return handleQuoteKron(req);
  if (method === 'buyKron' || method === 'buyToken' || method === 'sellKron' || method === 'sellToken' || method === 'tradeKron' || method === 'tradeToken') {
    return handleTradeKron(req);
  }
  if (method === 'compileVault' || method === 'lockVault') return handleCompileVault(req);
  if (method === 'sendKas' || method === 'sendKaspa') return handleSendKas(req);
  throw new Error('Unknown method ' + method);
}

function onMessage(ev) {
  const msg = ev.data;
  if (!msg || msg.ns !== NS) return;
  if (!isHttpOrigin(ev.origin) && ev.origin !== location.origin) return;
  if (msg.type === 'hello') {
    sourceWin = ev.source || window.opener;
    sourceOrigin = ev.origin;
    postTo(sourceWin, ev.origin, { type: 'ready', origin: location.origin, browser: 'kcc20', methods: HOST_METHODS });
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
  const ready = { type: 'ready', origin: location.origin, browser: 'kcc20', methods: HOST_METHODS };
  if (window.opener && target) postTo(window.opener, target, ready);
  try {
    if (window.parent && window.parent !== window) {
      const parentOrigin = target || (document.referrer ? new URL(document.referrer).origin : '');
      if (parentOrigin && isHttpOrigin(parentOrigin)) {
        postTo(window.parent, parentOrigin, ready);
      }
    }
  } catch {}
}

export const TTT_TREASURY = 'kaspa:qq5yhvly6338dspa9mm24g8q6chvy6v0jww3k4dgqywh0lju5mmm5pj334ews';
const TTT_ORIGINS = ['https://tttz.xyz', 'https://www.tttz.xyz', 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173'];

function isTttOrigin(origin) {
  const o = String(origin || '').toLowerCase();
  return TTT_ORIGINS.some(x => x.toLowerCase() === o) || o.endsWith('tttz.xyz');
}

export function pingTttDappFrame(frame) {
  const win = frame && frame.contentWindow;
  if (!win) return;
  const payload = { type: 'host-ready', origin: location.origin, browser: 'kcc20', methods: HOST_METHODS };
  TTT_ORIGINS.forEach((o) => { try { postTo(win, o, payload); } catch {} });
}

export function bootDappConnect(opts) {
  hooks = opts || {};
  if (booted) {
    announce();
    pingTttDappFrame(typeof document !== 'undefined' ? document.getElementById('ttt-frame') : null);
    return;
  }
  booted = true;
  window.addEventListener('message', onMessage);
  announce();
}
