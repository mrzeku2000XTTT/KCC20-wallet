/* KasSeal (kasseal.com) catalogue + display quotes.
   REST is CORS-locked to KasSeal origins, so the browser talks through
   /seal-api on this host. Identify tokens by covenant id, never ticker. */

export const KASSEAL_ORIGIN = 'https://app.kasseal.com';
export const KASSEAL_API = 'https://app.kasseal.com/v1';

function isTn10() {
  try { return localStorage.getItem('kcc20_network_v1') === 'testnet-10'; } catch { return false; }
}

function sealApiRoot() {
  try {
    if (typeof location !== 'undefined' && /^https?:/i.test(location.origin || '')) {
      return location.origin.replace(/\/$/, '') + '/seal-api';
    }
  } catch {}
  return KASSEAL_API;
}

async function sealGet(path) {
  const url = sealApiRoot() + (path.startsWith('/') ? path : '/' + path);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('KasSeal HTTP ' + res.status);
  return res.json();
}

function absUrl(u) {
  const s = String(u || '');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return KASSEAL_ORIGIN + (s.startsWith('/') ? s : '/' + s);
}

function sompiNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function phasePool(phase) {
  const p = String(phase || '').toLowerCase();
  return p === 'listed' || p === 'graduated' || p === 'pool';
}

export function mapKasSealToken(row) {
  const meta = row?.meta || row || {};
  const id = String(meta.covenantId || row?.covenantId || row?.id || '').replace(/^0x/i, '').toLowerCase();
  const tick = String(meta.ticker || row?.ticker || '').replace(/^\$/, '').toUpperCase();
  if (!id && !tick) return null;
  const curve = row?.curve || {};
  const lotSize = Number(curve.lotSize || 1000) || 1000;
  const nextLot = sompiNum(curve.nextLotPrice);
  const price = lotSize > 0 && nextLot > 0 ? (nextLot / lotSize) / 1e8 : 0;
  const mcap = sompiNum(row?.marketCapSompi) / 1e8;
  const graduated = phasePool(row?.phase);
  return {
    venue: 'kasseal',
    venueLabel: 'KasSeal',
    tick: tick || id.slice(0, 8).toUpperCase(),
    name: String(meta.name || tick || 'KasSeal'),
    decimals: 0,
    logo: absUrl(meta.imageUrl),
    graduated,
    phase: graduated ? 'Pool' : 'Curve',
    price,
    change24h: 0,
    volume24h: 0,
    tvl: mcap,
    marketCap: mcap,
    trades: Number(row?.trades || 0),
    covenantId: id,
    tokenId: id,
    lotSize,
    nextLotPrice: nextLot,
    verification: row?.verification || '',
    key: 'kasseal:' + id
  };
}

let cache = { at: 0, rows: [] };

export async function fetchKasSealTokens() {
  if (isTn10()) return [];
  if (cache.rows.length && Date.now() - cache.at < 60_000) return cache.rows;
  const rows = [];
  let cursor = '';
  for (let i = 0; i < 6; i++) {
    const q = '/tokens?sort=active&limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const body = await sealGet(q);
    const list = Array.isArray(body?.tokens) ? body.tokens : (Array.isArray(body) ? body : []);
    for (const row of list) {
      const m = mapKasSealToken(row);
      if (m?.tokenId) rows.push(m);
    }
    cursor = body?.nextCursor || '';
    if (!cursor || list.length < 1) break;
  }
  cache = { at: Date.now(), rows };
  return rows;
}

function sealPxKas(n, lotSize) {
  const x = Number(n);
  if (!(x > 0) || !Number.isFinite(x)) return 0;
  const lot = Number(lotSize || 1000) || 1000;
  return x / lot / 1e8;
}

export async function fetchKasSealCandles(tokenId, lotSize = 1000, limit = 80) {
  const id = String(tokenId || '').replace(/^0x/i, '').toLowerCase();
  if (!id) return [];
  let body = {};
  try { body = await sealGet('/tokens/' + encodeURIComponent(id) + '/candles'); }
  catch { return []; }
  const list = Array.isArray(body?.candles) ? body.candles : (Array.isArray(body) ? body : []);
  const rows = list.map(c => {
    const t = Number(c.startMs || c.time || c.t || 0);
    const close = sealPxKas(c.close ?? c.c, lotSize);
    return {
      t: t > 1e12 ? t : t * 1000,
      o: sealPxKas(c.open ?? c.o, lotSize) || close,
      h: sealPxKas(c.high ?? c.h, lotSize) || close,
      l: sealPxKas(c.low ?? c.l, lotSize) || close,
      c: close,
      v: sompiNum(c.volumeSompi ?? c.volume ?? c.v) / 1e8
    };
  }).filter(x => x.c > 0 && x.t > 0).sort((a, b) => a.t - b.t).slice(-limit);
  const open24 = sealPxKas(body?.open24h, lotSize);
  if (open24 > 0 && rows.length) rows[0]._open24h = open24;
  return rows;
}

export async function quoteKasSealTrade({ tokenId, side, amount, lotSize = 1000 }) {
  const id = String(tokenId || '').replace(/^0x/i, '').toLowerCase();
  if (!id) throw new Error('KasSeal token id missing');
  const buy = String(side || 'buy') !== 'sell';
  const n = Number(String(amount || '').replace(',', '.'));
  if (!(n > 0)) throw new Error('Enter an amount');
  const size = Number(lotSize || 1000) || 1000;
  let lots;
  if (buy) {
    const probe = await sealGet('/tokens/' + encodeURIComponent(id) + '/quote?side=buy&lots=1');
    const per = Number(probe?.totalSompi || probe?.kasSompi || 0);
    if (!(per > 0)) throw new Error('KasSeal quote is empty');
    lots = Math.max(1, Math.floor((n * 1e8) / per));
  } else {
    lots = Math.max(1, Math.floor(n / size));
  }
  const q = await sealGet('/tokens/' + encodeURIComponent(id) + '/quote?side=' + (buy ? 'buy' : 'sell') + '&lots=' + lots);
  const kasSompi = BigInt(String(q.kasSompi || '0'));
  const fee = BigInt(String(q.feeSompi || '0'));
  const total = BigInt(String(q.totalSompi || '0'));
  const tokens = BigInt(lots) * BigInt(size);
  if (buy) {
    return {
      venue: 'kasseal',
      tick: '',
      side: 'buy',
      graduated: false,
      decimals: 0,
      kasIn: kasSompi,
      tokenOut: tokens,
      fee,
      total: total || (kasSompi + fee),
      nativeLeave: total || (kasSompi + fee + 500000000n),
      lots,
      raw: q
    };
  }
  return {
    venue: 'kasseal',
    tick: '',
    side: 'sell',
    graduated: false,
    decimals: 0,
    tokenIn: tokens,
    kasOut: kasSompi,
    fee,
    net: total || (kasSompi > fee ? kasSompi - fee : 0n),
    lots,
    raw: q
  };
}

export async function fetchKasSealHoldings(address) {
  if (!address || isTn10()) return [];
  try {
    const body = await sealGet('/address/' + encodeURIComponent(address) + '/tokens');
    const holdings = Array.isArray(body?.holdings) ? body.holdings : [];
    const meta = new Map();
    for (const t of (body?.tokens || [])) {
      const m = mapKasSealToken(t);
      if (m?.tokenId) meta.set(m.tokenId, m);
    }
    return holdings.map(h => {
      const id = String(h.tokenId || h.covenantId || '').replace(/^0x/i, '').toLowerCase();
      const m = meta.get(id) || {};
      const bal = String(h.balance || '0');
      if (!id) return null;
      try { if (BigInt(bal) <= 0n) return null; } catch { return null; }
      return {
        protocol: 'kcc20',
        tokenId: id,
        ticker: m.tick || 'TOKEN',
        name: m.name || m.tick || 'KasSeal',
        image: m.logo || '',
        balance: bal,
        decimals: 0,
        cells: Number(h.cells || 0),
        standard: 'kasseal',
        layout: 'final',
        venue: 'kasseal',
        sealUrl: id ? (KASSEAL_ORIGIN + '/token/' + id) : KASSEAL_ORIGIN
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}
