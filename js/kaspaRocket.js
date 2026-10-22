/* Official KaspaRocket mainnet SDK (@kasparocket/sdk 0.1.6).
   Holds no key. Package API_ROOTS still list testnet-10 only; live
   https://kasparocket.fun/pro-api/health reports network:mainnet, so we
   pass apiUrl + catalogueUrl explicitly. Catalogue is CORS-open; pro-api
   is not, so the browser talks through /api/rocket on this origin. */

import { KaspaRocket, TOKEN_DECIMALS, tokenPriceSompi } from '../vendor/kasparocket/dist/esm/index.js';

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
