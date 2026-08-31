/* How real scalpers actually work — encoded as hard gates, not hopium.
   CEX books (Binance / Bybit / OKX) are millisecond order books.
   KRON is an on-chain AMM. Same *discipline*, different venue. */

export const DESK_PLAYBOOK = `SCALP DISCIPLINE (on-chain KRON / K.COM)

CEX bots (3Commas, Haas, ccxt) make money on Binance, Bybit, OKX, Kraken, Coinbase Advanced, KuCoin, Gate, Bitget, MEXC, Hyperliquid because those venues have:
- REST + WebSocket APIs that allow bots (ToS: API keys, often KYC, never share withdraw keys)
- Deep books so a 0.1–1% move can cover maker/taker fees
- Cancel/replace in milliseconds

This wallet does NOT deposit on a CEX. Keys never leave the PWA. The desk trades KRON AMM (mainnet) or Cook books (TN10). That means:

1. Edge must beat fees + slippage. If fee > ~80 bps of notional, skip.
2. Size is a fraction of pool KAS. Never buy more than ~2% of visible kasReserve.
3. Index vs AMM skew is a fact. If they disagree a lot, the “price” is not tradable.
4. Cooldown ≥ 15s between fills (Kaspa confirm + UTXO). CEX-style 10 fills/sec is impossible here.
5. Inventory cap: do not keep buying if you already hold > 3× one size in tokens.
6. Kill: 3 consecutive losing round-trips or session drawdown — stop, do not revenge.
7. No volume → no scalp. Thin KRON ticks are not Binance BTCUSDT. Waiting is a trade.
8. Fact-check every ticker against live quote + idx. Claims without numbers are noise.

Strategies that survive thin AMMs:
- Mean-revert a small size when AMM is a few % off recent SMA and fees still fit.
- Fade only after an extension, sell into strength, never market-dump the whole bag.
- Do not “make volume”. Wash volume is not profit and is not this product.
`;

export function feeBps(quote) {
  const kasIn = Number(quote?.kasIn || 0) / 1e8;
  const feeKas = Number(quote?.fee || 0) / 1e8;
  if (!(kasIn > 0)) return Infinity;
  return (feeKas / kasIn) * 10000;
}

export function poolKasApprox(quote) {
  const raw = quote?.raw || {};
  const v = raw.kasReserve ?? raw.poolKas ?? raw.kasIn;
  try {
    if (typeof v === 'bigint') return Number(v) / 1e8;
  } catch {}
  const n = Number(v);
  return Number.isFinite(n) ? n / (n > 1e6 ? 1e8 : 1) : 0;
}

export function scalpGate({ sizeKas, indexPx, ammPx, quote, lastFillAt, holdTokens, sizeTokens }) {
  const reasons = [];
  const bps = feeBps(quote);
  const pool = poolKasApprox(quote);
  const skew = indexPx > 0 && ammPx > 0 ? Math.abs(ammPx - indexPx) / indexPx : 0;
  if (!(ammPx > 0)) reasons.push('no live AMM quote');
  if (Date.now() - (lastFillAt || 0) < 15000) reasons.push('cooldown 15s');
  if (Number.isFinite(bps) && bps > 80) reasons.push('fee ' + bps.toFixed(0) + ' bps > 80');
  if (pool > 0 && sizeKas > 0 && sizeKas > pool * 0.02) {
    reasons.push('size ' + sizeKas + ' KAS > 2% of ~' + pool.toFixed(2) + ' KAS pool');
  }
  if (skew > 0.12) reasons.push('idx vs AMM skew ' + (skew * 100).toFixed(1) + '% — not a clean scalp');
  if (holdTokens > 0 && sizeTokens > 0 && holdTokens > sizeTokens * 3) {
    reasons.push('inventory > 3× size — sell or wait, do not add');
  }
  return {
    tradable: reasons.length === 0,
    reasons,
    feeBps: bps,
    poolKas: pool,
    skew
  };
}

export function factCheck(report) {
  const rows = [];
  const tick = report.tick || '?';
  if (!(report.ammPx > 0)) {
    rows.push({ claim: tick + ' has a tradable live price', verdict: 'FALSE', why: 'No AMM quote. Cannot scalp a number that is not a fill.' });
  } else {
    rows.push({ claim: tick + ' quoted on KRON AMM', verdict: 'TRUE', why: report.ammPx.toPrecision(6) + ' KAS/token' });
  }
  if (report.indexPx > 0 && report.ammPx > 0) {
    const skew = Math.abs(report.ammPx - report.indexPx) / report.indexPx;
    rows.push({
      claim: 'idx.kron.technology matches the AMM',
      verdict: skew < 0.05 ? 'TRUE' : 'WEAK',
      why: 'idx ' + report.indexPx.toPrecision(6) + ' vs AMM ' + report.ammPx.toPrecision(6)
    });
  }
  const vol = Number(report.change24h);
  rows.push({
    claim: 'enough 24h movement to pay KRON fees',
    verdict: Math.abs(vol) >= 3 ? 'MAYBE' : 'FALSE',
    why: Number.isFinite(vol) ? ('24h change ' + vol.toFixed(2) + (Math.abs(vol) <= 2 ? ' (already fraction)' : '%')) : 'no 24h figure'
  });
  if (report.poolKas > 0) {
    rows.push({
      claim: 'pool is deep enough for CEX-style size',
      verdict: report.poolKas >= 50 ? 'WEAK' : 'FALSE',
      why: '~' + report.poolKas.toFixed(2) + ' KAS in pool. CEX scalps need millions in the book, not tens of KAS.'
    });
  } else {
    rows.push({
      claim: 'visible CEX-like volume',
      verdict: 'FALSE',
      why: 'KRON is a curve/pool, not Binance. Thin prints look like “no volume” because they are.'
    });
  }
  if (report.feeBps > 80) {
    rows.push({ claim: 'fees leave room for a scalp', verdict: 'FALSE', why: report.feeBps.toFixed(0) + ' bps fee on this size' });
  } else if (report.ammPx > 0) {
    rows.push({ claim: 'fees leave room for a tiny mean-revert', verdict: 'WEAK', why: (report.feeBps || 0).toFixed(0) + ' bps — only trade if SMA gap is larger' });
  }
  rows.push({
    claim: 'this agent will make money',
    verdict: 'UNPROVEN',
    why: 'No bot, CEX or on-chain, has a guaranteed edge. Desk only fires when gates pass. You can still lose the KAS you send it.'
  });
  return rows;
}
