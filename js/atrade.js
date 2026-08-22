/* KCC20 A-Trade — Cook public API (order book / launch) + local Scorpion agent.
   Never holds keys. Wallet or KasWare signs PSKT; we only broadcast. */
import { loadKaspaSdk, connectPublicNode } from './tx.js?v=90';
import { kaswareEnabled, kaswareSigning, ensureKaswareSigner, signPsktWithKasware } from './kasware.js?v=89';

const COOK_DIRECT = 'https://dev-api-kcc20.kaspa.com';
const AGENT_KEY = 'kcc20_agent_v1';

export function cookApiBase() {
  try {
    const host = String(location.hostname || '');
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return location.origin + '/cook-api';
    }
  } catch {}
  return COOK_DIRECT;
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
    return new Error('Could not reach Cook from this page. Use the hosted app (it proxies Cook). Also need ~1.2 TKAS on this TN10 address — faucet-tn10.kaspanet.io');
  }
  if (status) return new Error('Cook HTTP ' + status + (data?.raw ? ': ' + String(data.raw).slice(0, 140) : ''));
  return new Error(m);
}

export async function cookGet(path) {
  let res;
  try {
    res = await fetch(cookApiBase() + path, { cache: 'no-store' });
  } catch (e) {
    throw cookFail(e);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw cookFail(null, data, res.status);
  return data;
}

export async function cookPost(path, body) {
  let res;
  try {
    res = await fetch(cookApiBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body || {})
    });
  } catch (e) {
    throw cookFail(e);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw cookFail(null, data, res.status);
  return data;
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
  const on = list.find(w => w.enabled !== false && (w.covenantId || w.wrappedMarketId || w.id));
  return on?.covenantId || on?.wrappedMarketId || on?.id || wrappers?.wrappedMarketId || '';
}

export async function cookDeploy({ walletAddress, ticker, tokenName, maxSupply, premintSupply, mintPricePerTokenSompi }) {
  return cookPost('/kcc20/build/deploy', {
    walletAddress,
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
  if (kaswareEnabled()) {
    onStatus?.('Approve in KasWare…');
    await ensureKaswareSigner(wallet);
    signedJson = await signPsktWithKasware(txJson, inputs);
  } else {
    if (!wallet?.privKey) throw new Error('No in-app key — turn on KasWare or import a wallet');
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
