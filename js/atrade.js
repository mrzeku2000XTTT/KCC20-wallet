/* KCC20 A-Trade — Cook public API (order book / launch) + local Scorpion agent.
   Never holds keys. Wallet or KasWare signs PSKT; we only broadcast. */
import { loadKaspaSdk, connectPublicNode } from './tx.js?v=93';
import { kaswareEnabled, kaswareSigning, ensureKaswareSigner, signPsktWithKasware } from './kasware.js?v=93';

const COOK_DIRECT = 'https://dev-api-kcc20.kaspa.com';
const COOK_HOSTED = 'https://kcc-20-wallet.vercel.app';
const AGENT_KEY = 'kcc20_agent_v1';
const LAUNCH_KEY = 'kcc20_launched_v1';

export function cookUrls(path) {
  const p = path.startsWith('/') ? path : '/' + path;
  const relay = '/api/relay?path=' + encodeURIComponent(p);
  const urls = [];
  const seen = new Set();
  const add = (u) => { if (u && !seen.has(u)) { seen.add(u); urls.push(u); } };
  try {
    if (typeof location !== 'undefined' && location.protocol !== 'file:' && location.origin) {
      add(location.origin + relay);
    }
  } catch {}
  add(COOK_HOSTED + relay);
  return urls;
}

export const COOK_API = COOK_DIRECT;

function errText(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.message || e.toString?.() || String(e);
}

function hexish(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.replace(/^0x/i, '');
  if (v instanceof Uint8Array) return Array.from(v, b => b.toString(16).padStart(2, '0')).join('');
  return String(v);
}

function withT(p, ms, msg) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))
  ]);
}

export function isTestnetAddr(addr) {
  return String(addr || '').toLowerCase().startsWith('kaspatest:');
}

export function loadLaunched() {
  try {
    const list = JSON.parse(localStorage.getItem(LAUNCH_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
export function saveLaunched(list) {
  localStorage.setItem(LAUNCH_KEY, JSON.stringify(list || []));
}
export function rememberLaunch(row) {
  if (!row) return;
  const list = loadLaunched().filter(x => x.tokenId !== row.tokenId && !(x.tick === row.tick && x.network === row.network));
  list.unshift({ ...row, at: Date.now() });
  saveLaunched(list.slice(0, 40));
}

export async function cookDeployed(addr) {
  const data = await cookGet('/tokens/owners/' + encodeURIComponent(addr) + '/deployed');
  return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
}

export async function cookOwnerBalances(addr) {
  const a = encodeURIComponent(addr);
  try {
    const data = await cookGet('/trading/addresses/' + a + '/balances');
    return Array.isArray(data) ? data : (data?.items || data?.balances || []);
  } catch {
    const data = await cookGet('/trading/owners/' + a + '/balances');
    return Array.isArray(data) ? data : (data?.items || data?.balances || []);
  }
}

export function loadAgentJob() {
  try { return JSON.parse(localStorage.getItem(AGENT_KEY) || 'null') || null; } catch { return null; }
}
export function saveAgentJob(job) {
  if (!job) localStorage.removeItem(AGENT_KEY);
  else localStorage.setItem(AGENT_KEY, JSON.stringify(job));
}

function cookFail(e, data, status) {
  if (data?.error || data?.message || data?.reason) return new Error(data.error || data.message || data.reason);
  const m = errText(e);
  if (/failed to fetch|networkerror|load failed|network request/i.test(m)) {
    return new Error('Could not reach Cook. Hard-refresh, then Launch again. KasWare on TN10 can sign once Cook answers.');
  }
  if (status) return new Error('Cook HTTP ' + status + (data?.raw ? ': ' + String(data.raw).slice(0, 140) : ''));
  return new Error(m);
}

async function cookRequest(path, init) {
  let last = new Error('Could not reach Cook');
  const urls = cookUrls(path);
  for (const url of urls) {
    try {
      const res = await fetch(url, { ...(init || {}), cache: 'no-store', credentials: 'omit', mode: 'cors' });
      const text = await res.text();
      if (res.status === 404 || /^\s*</.test(text || '')) {
        last = new Error('Cook proxy missed');
        continue;
      }
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!res.ok) throw cookFail(null, data, res.status);
      return data;
    } catch (e) {
      const m = errText(e);
      if (/failed to fetch|networkerror|load failed|network request|proxy missed/i.test(m)) {
        last = e;
        continue;
      }
      throw e;
    }
  }
  throw cookFail(last);
}

export async function cookGet(path) {
  return cookRequest(path, { method: 'GET' });
}

export async function cookPost(path, body) {
  return cookRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
}

export async function cookMarkets(limit = 20) {
  const data = await cookGet('/trading/markets/discovery?limit=' + limit);
  return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
}

export async function cookOrderbook(tokenId) {
  return cookGet('/trading/tokens/' + encodeURIComponent(tokenId) + '/orderbook');
}

export async function cookQuote(tokenId, { side, amount, mode = 'limit', limitUnitPriceSompi }) {
  const q = new URLSearchParams({ side, amount: String(amount), mode });
  if (limitUnitPriceSompi) q.set('limitUnitPriceSompi', String(limitUnitPriceSompi));
  return cookGet('/trading/tokens/' + encodeURIComponent(tokenId) + '/quote?' + q.toString());
}

export async function cookWrappers(tokenId) {
  return cookGet('/tokens/' + encodeURIComponent(tokenId) + '/wrappers');
}

export function pickWrappedMarketId(wrappers) {
  const list = Array.isArray(wrappers) ? wrappers : (wrappers?.items || wrappers?.wrappers || []);
  const on = list.find(w => w && w.enabled !== false && (
    w.marketId || w.wrapperId || w.activeCovenantId || w.covenantId || w.wrappedMarketId || w.id
  ));
  return on?.marketId
    || on?.wrapperId
    || on?.activeCovenantId
    || on?.covenantId
    || on?.wrappedMarketId
    || on?.id
    || wrappers?.wrappedMarketId
    || wrappers?.marketId
    || '';
}

export async function cookDeploy({ walletAddress, ticker, tokenName, maxSupply, premintSupply, mintPricePerTokenSompi }) {
  return cookPost('/kcc20/build/deploy', {
    walletAddress,
    ownerIdentifier: walletAddress,
    ticker,
    tokenName,
    maxSupply: String(maxSupply || '1000000'),
    premintSupply: String(premintSupply || '0'),
    mintMode: 'publicMint',
    mintPricePerTokenSompi: String(mintPricePerTokenSompi || '0')
  });
}

export async function cookMint({ walletAddress, tokenId, tokenAmount }) {
  return cookPost('/kcc20/build/tokens/' + encodeURIComponent(tokenId) + '/mint', {
    walletAddress,
    tokenAmount: String(tokenAmount)
  });
}

export async function cookBuildOrder({ walletAddress, tokenId, wrappedMarketId, side, tokenAmount, unitPriceSompi }) {
  return cookPost('/kcc20/build/tokens/' + encodeURIComponent(tokenId) + '/orders', {
    walletAddress,
    wrappedMarketId,
    side,
    tokenAmount: String(tokenAmount),
    unitPriceSompi: String(unitPriceSompi)
  });
}

export async function cookFillOrder({ walletAddress, tokenId, wrappedMarketId, side, targetOrderId, tokenAmount, unitPriceSompi }) {
  return cookPost('/kcc20/build/tokens/' + encodeURIComponent(tokenId) + '/orders/fill', {
    walletAddress,
    wrappedMarketId,
    side,
    targetOrderId,
    tokenAmount: String(tokenAmount),
    unitPriceSompi: String(unitPriceSompi)
  });
}

export async function cookSweep({ walletAddress, tokenId, wrappedMarketId, side, tokenAmount, mode, limitUnitPriceSompi, expectedFills, maxBuyerPaysSompi }) {
  const body = {
    walletAddress,
    wrappedMarketId,
    side,
    tokenAmount: String(tokenAmount),
    mode: mode || 'limit'
  };
  if (limitUnitPriceSompi) body.limitUnitPriceSompi = String(limitUnitPriceSompi);
  if (Array.isArray(expectedFills)) body.expectedFills = expectedFills;
  if (maxBuyerPaysSompi) body.maxBuyerPaysSompi = String(maxBuyerPaysSompi);
  return cookPost('/kcc20/build/tokens/' + encodeURIComponent(tokenId) + '/orders/sweep', body);
}

export async function cookWrap({ walletAddress, tokenId, wrappedMarketId, tokenAmount }) {
  return cookPost('/kcc20/build/tokens/' + encodeURIComponent(tokenId) + '/wrap', {
    walletAddress,
    wrappedMarketId,
    tokenAmount: String(tokenAmount)
  });
}

export async function cookSettlement(txid) {
  return cookGet('/trading/tx/' + encodeURIComponent(txid) + '/settlement-status');
}

export function extractSigning(build) {
  const signing = build?.payload?.signing || build?.signing || build;
  const json = signing?.psktTransactionJson || signing?.txJsonString || signing?.pskt;
  const inputs = signing?.signInputs || [];
  const status = signing?.status || '';
  return {
    signing,
    json,
    inputs,
    status,
    ready: status === 'ready-to-sign' || status === 'wallet-operation-ready' || !!json
  };
}

export function cookTokenId(build) {
  return build?.payload?.tokenIdHex
    || build?.payload?.covenantId
    || build?.tokenIdHex
    || build?.covenantId
    || build?.payload?.token?.tokenIdHex
    || '';
}

let _tnRpc = null;
let _tnUrl = null;

export async function connectTradeRpc(address) {
  if (!isTestnetAddr(address)) return connectPublicNode();
  const k = await loadKaspaSdk();
  if (_tnRpc && _tnRpc.isConnected) return { rpc: _tnRpc, url: _tnUrl, reused: true };
  const encoding = k.Encoding.Borsh;
  const urls = [];
  try {
    const resolver = new k.Resolver();
    const resolved = await withT(resolver.getUrl(encoding, 'testnet-10'), 6000, 'TN10 resolver timeout');
    if (resolved) urls.push(String(resolved));
  } catch {}
  for (const u of [
    'wss://kaspa.aspectron.org:443/kaspa/testnet-10/wrpc/borsh',
    'wss://tn10.kaspa.ws/kaspa/testnet-10/wrpc/borsh'
  ]) if (!urls.includes(u)) urls.push(u);
  let last = 'no TN10 node responded';
  for (const url of urls) {
    let rpc = null;
    try {
      rpc = new k.RpcClient({ url, encoding, networkId: 'testnet-10' });
      await withT(rpc.connect(), 10000, 'TN10 connect timeout');
      _tnRpc = rpc;
      _tnUrl = url;
      return { rpc, url, reused: false };
    } catch (e) {
      last = url + ' → ' + errText(e);
      try { if (rpc) await rpc.disconnect(); } catch {}
    }
  }
  throw new Error('Could not reach a public TN10 node. Last: ' + last);
}

export async function signAndBroadcastPskt({ wallet, txJson, signInputs, onStatus }) {
  if (!txJson) throw new Error('Build is not ready to sign');
  const inputs = (signInputs || []).map(s => ({
    index: Number(s.index),
    sighashType: Number(s.sighashType ?? 1)
  }));
  const k = await loadKaspaSdk();
  let signedJson = txJson;
  const tn = isTestnetAddr(wallet?.address);
  const useKw = kaswareEnabled();
  if (useKw) {
    onStatus?.('Approve in KasWare…');
    await ensureKaswareSigner(wallet);
    signedJson = await signPsktWithKasware(txJson, inputs);
  } else {
    if (!wallet?.privKey) {
      throw new Error(tn
        ? 'No in-app key on TN10. Turn on KasWare (set to TN10) or import the seed.'
        : 'No in-app key — turn on KasWare or import a wallet');
    }
    onStatus?.('Signing locally…');
    const tx = k.Transaction.deserializeFromSafeJSON(txJson);
    const priv = new k.PrivateKey(wallet.privKey);
    const want = new Set(inputs.map(s => s.index));
    const n = tx.inputs.length;
    for (let i = 0; i < n; i++) {
      if (want.size && !want.has(i)) continue;
      const sig = hexish(k.createInputSignature(tx, i, priv, k.SighashType.All));
      if (!sig || sig.length < 20) throw new Error('Empty signature on input ' + i);
      tx.inputs[i].signatureScript = sig;
    }
    signedJson = tx.serializeToSafeJSON();
  }
  onStatus?.('Broadcasting…');
  const { rpc } = await connectPublicNode();
  const tx = k.Transaction.deserializeFromSafeJSON(signedJson);
  const submitted = await rpc.submitTransaction({ transaction: tx, allowOrphan: false });
  const txId = submitted?.transactionId || submitted || tx.id;
  if (!txId) throw new Error('Node did not return a transaction id');
  return { txId, signedJson };
}

export function sompiToKas(s) {
  return Number(s || 0) / 1e8;
}

export function kasToSompiNum(k) {
  return Math.round(Number(k || 0) * 1e8);
}

export { errText as atradeErr, kaswareEnabled, kaswareSigning };
