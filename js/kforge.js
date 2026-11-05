/* KForge.xyz mainnet catalogue. Open API at api.kforge.xyz (CORS *).
   Lots are 1,000,000 tokens. Phase curve | pool. Identify by tokenCovId. */

export const KFORGE_ORIGIN = 'https://kforge.xyz';
export const KFORGE_API = 'https://api.kforge.xyz';
const LOT = 1_000_000n;

function isTn10() {
  try { return localStorage.getItem('kcc20_network_v1') === 'testnet-10'; } catch { return false; }
}

function kforgeRoot() {
  try {
    if (typeof location !== 'undefined' && /^https?:/i.test(location.origin || '')) {
      return location.origin.replace(/\/$/, '') + '/kforge-api';
    }
  } catch {}
  return KFORGE_API;
}

async function kforgeGet(path) {
  const direct = KFORGE_API + (path.startsWith('/') ? path : '/' + path);
  try {
    const res = await fetch(direct, { cache: 'no-store' });
    if (res.ok) return res.json();
  } catch {}
  const res = await fetch(kforgeRoot() + (path.startsWith('/') ? path : '/' + path), { cache: 'no-store' });
  if (!res.ok) throw new Error('KForge HTTP ' + res.status);
  return res.json();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function imageUrl(file) {
  const s = String(file || '');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return KFORGE_ORIGIN + '/images/' + s.replace(/^\//, '');
}

export function mapKforgeToken(row) {
  const id = String(row?.tokenCovId || row?.id || '').replace(/^0x/i, '').toLowerCase();
  const tick = String(row?.ticker || '').replace(/^\$/, '').toUpperCase();
  if (!id && !tick) return null;
  const phase = String(row?.phase || '').toLowerCase();
  const graduated = phase === 'pool' || phase === 'listed' || !!row?.pool;
  const lotPrice = num(row?.pricePerLot || row?.nextLotPrice);
  const price = lotPrice > 0 ? lotPrice / Number(LOT) / 1e8 : 0;
  const vol = num(row?.volume24h) / 1e8;
  const chg = num(row?.change24h);
  return {
    venue: 'kforge',
    venueLabel: 'KForge',
    tick: tick || id.slice(0, 8).toUpperCase(),
    name: String(row?.name || tick || 'KForge'),
    decimals: 0,
    logo: imageUrl(row?.image),
    graduated,
    phase: graduated ? 'Pool' : 'Curve',
    price,
    change24h: chg,
    volume24h: vol,
    tvl: num(row?.marketCap) / 1e8,
    marketCap: num(row?.marketCap) / 1e8,
    trades: Number(row?.trades24h || row?.trades || 0),
    covenantId: id,
    tokenId: id,
    rungCovId: String(row?.rungCovId || '').toLowerCase(),
    lotSize: Number(LOT),
    nextLotPrice: lotPrice,
    key: 'kforge:' + id
  };
}

let cache = { at: 0, rows: [] };

export async function fetchKforgeTokens() {
  if (isTn10()) return [];
  if (cache.rows.length && Date.now() - cache.at < 60_000) return cache.rows;
  const body = await kforgeGet('/v6/tokens');
  const list = Array.isArray(body) ? body : (body?.tokens || []);
  const rows = [];
  for (const row of list) {
    const m = mapKforgeToken(row);
    if (m?.tokenId) rows.push(m);
  }
  cache = { at: Date.now(), rows };
  return rows;
}

export async function quoteKforgeTrade({ tokenId, side, amount, nextLotPrice, lotSize = Number(LOT) }) {
  const buy = String(side || 'buy') !== 'sell';
  const n = Number(String(amount || '').replace(',', '.'));
  if (!(n > 0)) throw new Error('Enter an amount');
  let row = null;
  if (tokenId) {
    try { row = await kforgeGet('/v6/tokens/' + encodeURIComponent(tokenId)); } catch {}
  }
  const lotPrice = BigInt(Math.round(num(row?.pricePerLot || row?.nextLotPrice || nextLotPrice || 0)));
  if (lotPrice <= 0n) throw new Error('KForge has no live lot price');
  const size = BigInt(lotSize || Number(LOT));
  let lots;
  if (buy) {
    const kas = BigInt(Math.round(n * 1e8));
    lots = kas / lotPrice;
    if (lots < 1n) throw new Error('Amount too small for one KForge lot');
  } else {
    lots = BigInt(Math.floor(n / Number(size)));
    if (lots < 1n) throw new Error('Sell at least one lot (' + size + ' tokens)');
  }
  const kasGross = lots * lotPrice;
  const fee = kasGross / 100n; // 1 % curve / pool fee
  const tokens = lots * size;
  if (buy) {
    return {
      venue: 'kforge',
      tick: String(row?.ticker || '').toUpperCase(),
      side: 'buy',
      graduated: String(row?.phase || '').toLowerCase() === 'pool',
      decimals: 0,
      kasIn: kasGross,
      tokenOut: tokens,
      fee,
      total: kasGross + fee,
      nativeLeave: kasGross + fee + 500000000n,
      lots: Number(lots),
      raw: row
    };
  }
  const net = kasGross > fee ? kasGross - fee : 0n;
  if (net <= 0n) throw new Error('Amount too small to sell — fees would exceed proceeds');
  return {
    venue: 'kforge',
    tick: String(row?.ticker || '').toUpperCase(),
    side: 'sell',
    graduated: String(row?.phase || '').toLowerCase() === 'pool',
    decimals: 0,
    tokenIn: tokens,
    kasOut: kasGross,
    fee,
    net,
    lots: Number(lots),
    raw: row
  };
}
