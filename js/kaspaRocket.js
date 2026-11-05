/* Official KaspaRocket mainnet SDK (@kasparocket/sdk 0.1.6).
   Holds no key. Package API_ROOTS still list testnet-10 only; live
   https://kasparocket.fun/pro-api/health reports network:mainnet, so we
   pass apiUrl + catalogueUrl explicitly. Catalogue is CORS-open; pro-api
   is not, so the browser talks through /api/rocket on this origin. */

import {
  KaspaRocket, TOKEN_DECIMALS, tokenPriceSompi, tokensToRaw,
  instructionsToSign, scriptP2pkh, spliceCovenantSignature
} from '../vendor/kasparocket/dist/esm/index.js';
import { kaswareSigning } from './kasware.js?v=221';

export const KASPAROCKET_SDK = '0.1.6';
export const KASPAROCKET_ORIGIN = 'https://kasparocket.fun';
export const KASPAROCKET_API = 'https://kasparocket.fun/pro-api';
export const KASPAROCKET_CATALOGUE = 'https://kasparocket.fun';

function browserFetch(url, init) {
  const headers = new Headers(init?.headers || {});
  headers.delete('user-agent');
  headers.delete('User-Agent');
  return fetch(url, { ...init, headers, cache: 'no-store' });
}

function rocketApiUrl() {
  try {
    if (typeof location !== 'undefined' && /^https?:/i.test(location.origin || '')) {
      return location.origin.replace(/\/$/, '') + '/rocket-api';
    }
  } catch {}
  return KASPAROCKET_API;
}

let client = null;

export function kaspaRocket() {
  if (!client) {
    client = new KaspaRocket({
      network: 'mainnet',
      apiUrl: rocketApiUrl(),
      catalogueUrl: KASPAROCKET_CATALOGUE,
      timeoutMs: 8000,
      maxRetries: 1,
      fetch: browserFetch
    });
  }
  return client;
}

function isTn10() {
  try { return localStorage.getItem('kcc20_network_v1') === 'testnet-10'; } catch { return false; }
}

function tokenIdOf(row) {
  return String(row?.kcc20_covenant_id || row?.token_id || row?.tokenId || '')
    .replace(/^0x/i, '')
    .toLowerCase();
}

function rawBalance(row) {
  const v = row?.balance_tokens ?? row?.balance ?? 0;
  if (typeof v === 'bigint') return v.toString();
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return String(Math.trunc(n));
  const s = String(v || '0');
  return /^\d+$/.test(s) ? s : '0';
}

function priceKasOf(row) {
  const p = row?.price_sompi;
  if (p == null) return null;
  const n = typeof p === 'bigint' ? Number(p) : Number(p);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    return Number(tokenPriceSompi(BigInt(Math.round(n)))) / 1e8;
  } catch {
    return null;
  }
}

export function mapRocketHolding(row, meta) {
  const tokenId = tokenIdOf(row);
  const ticker = String(row?.ticker || meta?.ticker || 'TOKEN').toUpperCase();
  return {
    protocol: 'kcc20',
    tokenId,
    ticker,
    name: row?.token_name || row?.name || meta?.token_name || meta?.name || ticker,
    image: row?.image_url || row?.image || meta?.image_url || meta?.image || '',
    balance: rawBalance(row),
    decimals: TOKEN_DECIMALS,
    cells: Number(row?.utxo_count || row?.cells || 0),
    standard: 'kasparocket',
    layout: 'final',
    venue: 'kasparocket',
    lpCovenantId: row?.lp_amm_covenant_id || meta?.lp_amm_covenant_id || '',
    priceKas: priceKasOf(row),
    rocketUrl: tokenId ? (KASPAROCKET_ORIGIN + '/token/' + tokenId) : KASPAROCKET_ORIGIN
  };
}

export function mapRocketCatalogueRow(row) {
  const tokenId = tokenIdOf(row);
  const ticker = String(row?.ticker || row?.token_ticker || '').toUpperCase();
  if (!tokenId && !ticker) return null;
  return {
    tokenId,
    ticker,
    name: row?.token_name || row?.name || ticker,
    image: row?.image_url || row?.image || '',
    standard: 'kasparocket',
    layout: 'final',
    venue: 'kasparocket',
    rocketUrl: tokenId ? (KASPAROCKET_ORIGIN + '/token/' + tokenId) : KASPAROCKET_ORIGIN
  };
}

let catCache = { at: 0, map: new Map() };

export async function fetchKaspaRocketCatalogue() {
  if (isTn10()) return new Map();
  if (catCache.map.size && Date.now() - catCache.at < 120000) return catCache.map;
  const rows = await kaspaRocket().catalogue.tokens();
  const list = Array.isArray(rows) ? rows : [];
  const map = new Map();
  for (const row of list) {
    const m = mapRocketCatalogueRow(row);
    if (m?.tokenId) map.set(m.tokenId, m);
  }
  catCache = { at: Date.now(), map };
  return map;
}

function sompiFromKas(amount) {
  const n = Number(String(amount || '').replace(',', '.'));
  if (!(n > 0) || !Number.isFinite(n)) throw new Error('Enter an amount');
  return BigInt(Math.round(n * 1e8));
}

function tokenRawFromHuman(amount) {
  const s = String(amount || '').trim().replace(',', '.');
  if (!s) throw new Error('Enter an amount');
  try { return tokensToRaw(s); } catch {
    const n = Number(s);
    if (!(n > 0)) throw new Error('Enter an amount');
    return BigInt(Math.round(n * (10 ** TOKEN_DECIMALS)));
  }
}

function hexSig65(sig) {
  let h = String(sig || '').replace(/^0x/i, '').toLowerCase();
  if (h.length === 128) h += '01';
  if (h.length === 130) return h;
  throw new Error('Rocket signature must be 64 or 65 bytes');
}

function hexBytesStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.replace(/^0x/i, '').toLowerCase();
  if (v instanceof Uint8Array) return Array.from(v, b => b.toString(16).padStart(2, '0')).join('');
  return String(v);
}

export async function fetchKaspaRocketFeed(limit = 200) {
  if (isTn10()) return [];
  const kr = kaspaRocket();
  const body = await kr.catalogue.feed({ limit });
  const list = Array.isArray(body?.tokens) ? body.tokens : (Array.isArray(body) ? body : []);
  return list.map(row => {
    const m = mapRocketCatalogueRow(row);
    if (!m) return null;
    const vol = Number(row?.volume_24h_kas || row?.volume24h || 0);
    return {
      venue: 'kasparocket',
      venueLabel: 'Rocket',
      tick: m.ticker,
      name: m.name,
      decimals: TOKEN_DECIMALS,
      logo: m.image,
      graduated: false,
      phase: 'Curve',
      price: 0,
      change24h: 0,
      volume24h: Number.isFinite(vol) ? vol : 0,
      tvl: 0,
      covenantId: m.tokenId,
      tokenId: m.tokenId,
      lpCovenantId: '',
      placement: row?.placement || '',
      key: 'kasparocket:' + m.tokenId
    };
  }).filter(Boolean);
}

export async function rocketPoolCovenant(tokenId) {
  const id = String(tokenId || '').replace(/^0x/i, '').toLowerCase();
  if (!id) return null;
  try {
    const pool = await kaspaRocket().catalogue.poolCovenant(id);
    return pool?.lp_amm_covenant_id || pool?.lpCovenantId || null;
  } catch {
    return null;
  }
}

export async function quoteRocketTrade({ tokenId, lpCovenantId, side, amount, address }) {
  const id = String(tokenId || '').replace(/^0x/i, '').toLowerCase();
  if (!id) throw new Error('KaspaRocket token id missing');
  const lp = lpCovenantId || await rocketPoolCovenant(id);
  if (!lp) throw new Error('This KaspaRocket token has no pool yet');
  const buy = String(side || 'buy') !== 'sell';
  const params = {
    tokenId: id,
    lpCovenantId: lp,
    direction: buy ? 'buy' : 'sell'
  };
  if (buy) params.kasBudgetSompi = sompiFromKas(amount);
  else params.amountTokens = tokenRawFromHuman(amount);
  const q = await kaspaRocket().quote(params);
  if (q.uneconomic) throw new Error('This sale costs more in fees than it returns');
  const fee = q.fee?.total ?? 0n;
  if (buy) {
    return {
      venue: 'kasparocket',
      tick: '',
      side: 'buy',
      graduated: String(q.phase || '') !== 'bonding',
      decimals: TOKEN_DECIMALS,
      kasIn: q.kasFlowSompi || params.kasBudgetSompi,
      tokenOut: q.amountTokens,
      fee,
      total: q.netKasSompi > 0n ? q.netKasSompi : (q.kasFlowSompi || 0n) + fee,
      nativeLeave: (q.netKasSompi > 0n ? q.netKasSompi : (q.kasFlowSompi || 0n)) + 40000000n,
      lpCovenantId: lp,
      tokenId: id,
      raw: q
    };
  }
  return {
    venue: 'kasparocket',
    tick: '',
    side: 'sell',
    graduated: String(q.phase || '') !== 'bonding',
    decimals: TOKEN_DECIMALS,
    tokenIn: q.amountTokens || params.amountTokens,
    kasOut: q.kasFlowSompi || 0n,
    fee,
    net: q.netKasSompi,
    lpCovenantId: lp,
    tokenId: id,
    raw: q
  };
}

async function signRocketPlan(wallet, plan, { forceKasware = false, onStatus } = {}) {
  const kr = kaspaRocket();
  const useKw = !!(forceKasware || kaswareSigning(wallet));
  const nativeHex = String(wallet?.privKey || '').replace(/^0x/i, '').trim();
  const canPin = /^[0-9a-fA-F]{64}$/.test(nativeHex);
  if (useKw && !canPin) {
    throw new Error('KaspaRocket swaps sign the plan digest on this device. Import the 64-hex key, or turn KasWare off for this chip.');
  }
  const { loadKaspaSdk } = await import('./tx.js?v=240');
  const k = await loadKaspaSdk();
  const priv = new k.PrivateKey(nativeHex);
  const signer = {
    getAddress: () => wallet.address,
    async sign(planned) {
      onStatus?.('Signing KaspaRocket swap…');
      for (const ins of instructionsToSign(planned)) {
        const digest = ins.sighash;
        if (!digest) throw new Error('KaspaRocket plan is missing sighash on input ' + ins.inputIndex);
        let sig;
        try {
          sig = k.signScriptHash(digest, priv);
        } catch {
          sig = k.signScriptHash(hexBytesStr(digest), priv);
        }
        const sig65 = hexSig65(sig);
        const input = planned.tx.inputs[ins.inputIndex];
        input.signatureScript = ins.kind === 'p2pkh'
          ? scriptP2pkh(sig65)
          : spliceCovenantSignature(ins, sig65);
      }
      return planned.tx;
    }
  };
  onStatus?.('Broadcasting KaspaRocket swap…');
  const results = await kr.signAndSubmit(plan, signer);
  const last = Array.isArray(results) ? results[results.length - 1] : results;
  const txId = last?.txid || last?.txId || last?.transaction_id || last?.id || '';
  return { txId: String(txId), raw: results };
}

export async function executeRocketTrade({ wallet, tokenId, lpCovenantId, side, amount, onStatus, forceKasware = false }) {
  const id = String(tokenId || '').replace(/^0x/i, '').toLowerCase();
  if (!id) throw new Error('KaspaRocket token id missing');
  if (!wallet?.address) throw new Error('Open the wallet first');
  onStatus?.('Quoting on KaspaRocket…');
  const quoted = await quoteRocketTrade({ tokenId: id, lpCovenantId, side, amount, address: wallet.address });
  const lp = quoted.lpCovenantId;
  const buy = quoted.side === 'buy';
  onStatus?.('Building KaspaRocket swap…');
  const route = await kaspaRocket().route({
    address: wallet.address,
    tokenId: id,
    lpCovenantId: lp,
    side: buy ? 'buy' : 'sell',
    kind: 'market',
    budgetSompi: buy ? quoted.kasIn : undefined,
    tokens: buy ? undefined : quoted.tokenIn,
    maxFills: 3
  });
  const plan = await kaspaRocket().planTrade({
    address: wallet.address,
    tokenId: id,
    lpCovenantId: lp,
    side: buy ? 'buy' : 'sell',
    kind: 'market',
    budgetSompi: buy ? quoted.kasIn : undefined,
    tokens: buy ? undefined : quoted.tokenIn,
    maxFills: 3,
    expected: route?.attendu || route?.expected || undefined
  });
  const { txId } = await signRocketPlan(wallet, plan, { forceKasware, onStatus });
  return { txId, fee: quoted.fee, quote: quoted, signer: 'local' };
}

export async function fetchKaspaRocketHoldings(address) {
  if (!address || isTn10()) return [];
  const [bag, cat] = await Promise.all([
    kaspaRocket().holdings(address),
    fetchKaspaRocketCatalogue().catch(() => new Map())
  ]);
  const tokens = Array.isArray(bag?.tokens) ? bag.tokens : (Array.isArray(bag) ? bag : []);
  return tokens.map(row => {
    const id = tokenIdOf(row);
    return mapRocketHolding(row, id ? cat.get(id) : null);
  }).filter(t => {
    try { return BigInt(t.balance || '0') > 0n; } catch { return false; }
  });
}
