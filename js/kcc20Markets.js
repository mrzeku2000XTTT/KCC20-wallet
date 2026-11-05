/* Unified KCC20 24h board: KRON + KaspaRocket + KasSeal + KForge.
   Rows carry venue + covenant/token id so lookalike tickers never mix. */

import { kronMarkets, quoteKronTrade, executeKronTrade } from './kronTrade.js?v=235';
import { fetchKaspaRocketFeed, quoteRocketTrade, executeRocketTrade } from './kaspaRocket.js?v=3';
import { fetchKasSealTokens, quoteKasSealTrade } from './kasSeal.js?v=1';
import { fetchKforgeTokens, quoteKforgeTrade } from './kforge.js?v=1';

export const VENUE_LABEL = {
  kron: 'KRON',
  kasparocket: 'Rocket',
  kasseal: 'KasSeal',
  kforge: 'KForge'
};

export function venueName(v) {
  return VENUE_LABEL[v] || 'KCC20';
}

function validTick(t) {
  return /^[A-Z0-9]{2,16}$/.test(String(t || '').toUpperCase());
}

function asKronRow(m) {
  const tick = String(m.tick || '').toUpperCase();
  if (!validTick(tick) || tick.includes('?')) return null;
  const id = String(m.covenantId || '').replace(/^0x/i, '').toLowerCase();
  return {
    venue: 'kron',
    venueLabel: 'KRON',
    tick,
    name: m.name || tick,
    decimals: Number(m.decimals || 0),
    logo: m.logo || '',
    graduated: !!m.graduated,
    phase: m.graduated ? 'Pool' : 'Curve',
    price: Number(m.price || 0),
    change24h: Number(m.change24h || 0),
    volume24h: Number(m.volume24h || 0),
    tvl: Number(m.tvl || 0),
    covenantId: id,
    tokenId: id,
    key: 'kron:' + (id || tick)
  };
}

let cache = { at: 0, rows: [] };

export async function kcc20Markets({ force = false } = {}) {
  if (!force && cache.rows.length && Date.now() - cache.at < 45_000) return cache.rows;
  const [kron, rocket, seal, forge] = await Promise.allSettled([
    kronMarkets(),
    fetchKaspaRocketFeed(200),
    fetchKasSealTokens(),
    fetchKforgeTokens()
  ]);
  const rows = [];
  if (kron.status === 'fulfilled') {
    for (const m of kron.value || []) {
      const r = asKronRow(m);
      if (r) rows.push(r);
    }
  }
  if (rocket.status === 'fulfilled') rows.push(...(rocket.value || []));
  if (seal.status === 'fulfilled') rows.push(...(seal.value || []));
  if (forge.status === 'fulfilled') rows.push(...(forge.value || []));
  rows.sort((a, b) => {
    const dv = (Number(b.volume24h) || 0) - (Number(a.volume24h) || 0);
    if (dv) return dv;
    return (Number(b.marketCap || b.tvl) || 0) - (Number(a.marketCap || a.tvl) || 0);
  });
  cache = { at: Date.now(), rows };
  if (!rows.length) {
    const err = [kron, rocket, seal, forge].find(x => x.status === 'rejected');
    if (err) throw err.reason;
  }
  return rows;
}

export async function lookupKcc20Market(tick, opts = {}) {
  const t = String(tick || '').trim().toUpperCase();
  const venue = String(opts.venue || '').toLowerCase();
  const tokenId = String(opts.tokenId || opts.covenantId || '').replace(/^0x/i, '').toLowerCase();
  const list = await kcc20Markets();
  if (tokenId) {
    const hit = list.find(m => m.tokenId === tokenId && (!venue || m.venue === venue));
    if (hit) return hit;
  }
  const matches = list.filter(m => m.tick === t && (!venue || m.venue === venue));
  if (matches.length) return matches[0];
  if (venue === 'kron' || !venue) {
    const kron = list.find(m => m.venue === 'kron' && m.tick === t);
    if (kron) return kron;
  }
  throw new Error(t + ' is not a launched KCC20 on KRON, KaspaRocket, KasSeal, or KForge');
}

export function canExecuteVenue(venue) {
  return venue === 'kron' || venue === 'kasparocket';
}

export async function quoteKcc20Trade({ tick, side, amount, venue, tokenId, lotSize, nextLotPrice, lpCovenantId }) {
  const v = String(venue || 'kron').toLowerCase();
  if (v === 'kasparocket') {
    const q = await quoteRocketTrade({ tokenId, lpCovenantId, side, amount });
    q.tick = String(tick || q.tick || '').toUpperCase();
    q.venue = 'kasparocket';
    return q;
  }
  if (v === 'kasseal') {
    const q = await quoteKasSealTrade({ tokenId, side, amount, lotSize });
    q.tick = String(tick || q.tick || '').toUpperCase();
    q.venue = 'kasseal';
    return q;
  }
  if (v === 'kforge') {
    const q = await quoteKforgeTrade({ tokenId, side, amount, nextLotPrice, lotSize });
    q.tick = String(tick || q.tick || '').toUpperCase();
    q.venue = 'kforge';
    return q;
  }
  const q = await quoteKronTrade({ tick, side, amount });
  q.venue = 'kron';
  return q;
}

export async function executeKcc20Trade({ wallet, tick, side, amount, venue, tokenId, lpCovenantId, onStatus, forceKasware = false }) {
  const v = String(venue || 'kron').toLowerCase();
  if (v === 'kasparocket') {
    return executeRocketTrade({ wallet, tokenId, lpCovenantId, side, amount, onStatus, forceKasware });
  }
  if (v === 'kasseal' || v === 'kforge') {
    throw new Error(
      venueName(v) + ' is listed and quoted in this wallet. ' +
      'KRON and KaspaRocket swaps sign here. ' + venueName(v) + ' still builds its own covenant tx — tap Review to see the live quote.'
    );
  }
  return executeKronTrade({ wallet, tick, side, amount, onStatus, forceKasware });
}
