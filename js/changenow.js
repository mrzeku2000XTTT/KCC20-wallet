/* ChangeNOW floating swaps.
   On-ramp: USDC/USDT → KAS payout to this wallet.
   Cash-out: KAS from this wallet → USDC/USDT on ETH / Tron / Base / Solana.
   Live Ethereum USDC ticker is `usdc` (usdcerc20 is inactive). */

const CN = 'https://api.changenow.io';
const WIDGET = 'https://changenow.io/embeds/exchange-widget/v2/widget.html';

export function cnTick(raw, fallback = 'usdc') {
  const s = String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) return fallback;
  if (s === 'kas' || s === 'kaspa') return 'kas';
  if (s === 'usdcerc20' || s === 'usdceth' || s === 'usdc' || s === 'usd') return 'usdc';
  if (s === 'usdterc20' || s === 'usdteth' || s === 'usdt') return 'usdterc20';
  if (s === 'usdttrc20' || s === 'usdttrc') return 'usdttrc20';
  if (s === 'usdcbase') return 'usdcbase';
  if (s === 'usdcsol' || s === 'usdcspl' || s === 'usdcsolana') return 'usdcsol';
  if (s === 'usdcmatic' || s === 'usdcpolygon') return 'usdcmatic';
  if (s === 'usdcbsc') return 'usdcbsc';
  if (s === 'usdcarb') return 'usdcarb';
  if (s === 'eth') return 'eth';
  if (s === 'btc') return 'btc';
  return s;
}

export function cnFrom(raw) {
  return cnTick(raw, 'usdc');
}

export function cnLabel(raw) {
  const t = cnTick(raw);
  if (t === 'kas') return 'KAS';
  if (t === 'usdc') return 'USDC (Ethereum)';
  if (t === 'usdterc20') return 'USDT (Ethereum)';
  if (t === 'usdttrc20') return 'USDT (Tron)';
  if (t === 'usdcbase') return 'USDC (Base)';
  if (t === 'usdcsol') return 'USDC (Solana)';
  if (t === 'usdcmatic') return 'USDC (Polygon)';
  if (t === 'usdcbsc') return 'USDC (BSC)';
  if (t === 'usdcarb') return 'USDC (Arbitrum)';
  if (t === 'eth') return 'ETH';
  if (t === 'btc') return 'BTC';
  return t.toUpperCase();
}

export function cnPayoutHint(raw) {
  const t = cnTick(raw);
  if (t === 'usdttrc20') return 'Tron address (starts with T)';
  if (t === 'usdcsol') return 'Solana address';
  if (t === 'kas') return 'kaspa:q payout';
  if (t === 'eth' || t === 'usdc' || t === 'usdterc20' || t === 'usdcbase' || t === 'usdcmatic' || t === 'usdcbsc' || t === 'usdcarb') {
    return cnLabel(t) + ' 0x address';
  }
  return 'Payout address';
}

export function cnPayoutPlaceholder(raw) {
  const t = cnTick(raw);
  if (t === 'usdttrc20') return 'T…';
  if (t === 'usdcsol') return 'Solana address';
  if (t === 'kas') return 'kaspa:q…';
  return '0x…';
}

export function cnPayoutOk(tick, address) {
  const t = cnTick(tick);
  const a = String(address || '').trim();
  if (t === 'kas') return /^kaspa:q[a-z0-9]+$/i.test(a);
  if (t === 'usdttrc20') return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
  if (t === 'usdcsol') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) && !/^0x/i.test(a) && !/^T/.test(a);
  if (t === 'eth' || t === 'usdc' || t === 'usdterc20' || t === 'usdcbase' || t === 'usdcmatic' || t === 'usdcbsc' || t === 'usdcarb') {
    return /^0x[a-fA-F0-9]{40}$/.test(a);
  }
  return a.length > 12;
}

export function changenowKey() {
  try { if (window.CHANGENOW_API_KEY) return String(window.CHANGENOW_API_KEY); } catch {}
  try { return localStorage.getItem('kcc20_changenow_key') || ''; } catch { return ''; }
}

export function setChangenowKey(k) {
  const s = String(k || '').trim();
  try {
    if (s) localStorage.setItem('kcc20_changenow_key', s);
    else localStorage.removeItem('kcc20_changenow_key');
  } catch {}
  return s;
}

export function changenowWidgetUrl({ from = 'usdc', to = 'kas', amount = '20', address = '', linkId = '' } = {}) {
  const q = [
    'FAQ=false', 'darkMode=true', 'backgroundColor=0B0B0C', 'primaryColor=C9A36A',
    'logo=false', 'locales=false', 'horizontal=false', 'lang=en-US',
    'from=' + encodeURIComponent(cnTick(from)),
    'to=' + encodeURIComponent(cnTick(to, 'kas')),
    'amount=' + encodeURIComponent(String(amount || '20'))
  ];
  if (address) q.push('toAddress=' + encodeURIComponent(address));
  if (linkId) q.push('link_id=' + encodeURIComponent(linkId));
  return WIDGET + '?' + q.join('&');
}

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.message || j.error || ('ChangeNOW HTTP ' + r.status));
  return j;
}

export async function changenowEstimate(amount, from = 'usdc', to = 'kas') {
  const a = Number(amount);
  if (!(a > 0)) throw new Error('Enter an amount to send');
  const f = cnTick(from);
  const t = cnTick(to, 'kas');
  if (f === t) throw new Error('Pick two different assets');
  const j = await getJson(CN + '/v1/exchange-amount/' + encodeURIComponent(String(a)) + '/' + f + '_' + t + '/');
  const estimated = Number(j.estimatedAmount != null ? j.estimatedAmount : j.amount);
  if (!(estimated > 0)) throw new Error('No floating quote for that pair right now');
  return {
    from: f,
    to: t,
    fromAmount: a,
    toAmount: estimated,
    warningMessage: j.warningMessage || '',
    speed: j.transactionSpeedForecast || ''
  };
}

export async function changenowMin(from = 'usdc', to = 'kas') {
  const f = cnTick(from);
  const t = cnTick(to, 'kas');
  const j = await getJson(CN + '/v1/min-amount/' + f + '_' + t);
  return Number(j.minAmount != null ? j.minAmount : j.min) || 0;
}

export async function changenowCreate({ amount, address, from = 'usdc', to = 'kas', refundAddress = '' } = {}) {
  const key = changenowKey();
  const f = cnTick(from);
  const t = cnTick(to, 'kas');
  const a = Number(amount);
  if (!(a > 0)) throw new Error('Enter an amount');
  if (f === t) throw new Error('Pick two different assets');
  const dest = String(address || '').trim();
  if (!cnPayoutOk(t, dest)) throw new Error(cnPayoutHint(t));
  if (!key) {
    return {
      mode: 'widget',
      widgetUrl: changenowWidgetUrl({ from: f, to: t, amount: a, address: dest }),
      payoutAddress: dest,
      from: f,
      to: t,
      fromAmount: a
    };
  }
  const r = await fetch(CN + '/v1/transactions/' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      from: f,
      to: t,
      amount: String(a),
      address: dest,
      refundAddress: refundAddress || ''
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.message || j.error || ('ChangeNOW HTTP ' + r.status));
  return {
    mode: 'api',
    id: j.id,
    payinAddress: j.payinAddress,
    payinExtraId: j.payinExtraId || '',
    payoutAddress: j.payoutAddress || dest,
    from: j.fromCurrency || f,
    to: j.toCurrency || t,
    fromAmount: j.fromAmount || a,
    toAmount: j.toAmount,
    widgetUrl: changenowWidgetUrl({ from: f, to: t, amount: a, address: dest }),
    statusUrl: 'https://changenow.io/exchange/txs/' + j.id
  };
}

export async function changenowStatus(id) {
  const key = changenowKey() || ' ';
  return getJson(CN + '/v1/transactions/' + encodeURIComponent(id) + '/' + encodeURIComponent(key));
}
