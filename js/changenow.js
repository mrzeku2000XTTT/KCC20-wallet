/* ChangeNOW floating (standard) USDC/USDT → KAS. Payout = this wallet kaspa:q. */

const CN = 'https://api.changenow.io';
const WIDGET = 'https://changenow.io/embeds/exchange-widget/v2/widget.html';

export function cnFrom(raw) {
  const s = String(raw || 'usdc').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s === 'usdcerc20' || s === 'usdceth' || s === 'usdc' || s === 'usd') return 'usdcerc20';
  if (s === 'usdterc20' || s === 'usdteth' || s === 'usdt') return 'usdterc20';
  if (s === 'usdttrc20' || s === 'usdttrc') return 'usdttrc20';
  if (s === 'eth') return 'eth';
  if (s === 'btc') return 'btc';
  return s || 'usdcerc20';
}

export function changenowKey() {
  try { if (window.CHANGENOW_API_KEY) return String(window.CHANGENOW_API_KEY); } catch {}
  try { return localStorage.getItem('kcc20_changenow_key') || ''; } catch { return ''; }
}

export function changenowWidgetUrl({ from = 'usdcerc20', amount = '20', address = '', linkId = '' } = {}) {
  const q = [
    'FAQ=false', 'darkMode=true', 'backgroundColor=0B0B0C', 'primaryColor=C9A36A',
    'logo=false', 'locales=false', 'horizontal=false', 'lang=en-US',
    'from=' + encodeURIComponent(cnFrom(from)),
    'to=kas',
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

export async function changenowEstimate(amount, from = 'usdcerc20') {
  const a = Number(amount);
  if (!(a > 0)) throw new Error('Enter an amount to send');
  const tick = cnFrom(from);
  const j = await getJson(CN + '/v1/exchange-amount/' + encodeURIComponent(String(a)) + '/' + tick + '_kas/');
  const estimated = Number(j.estimatedAmount != null ? j.estimatedAmount : j.amount);
  if (!(estimated > 0)) throw new Error('No floating quote for that pair right now');
  return { from: tick, to: 'kas', fromAmount: a, toAmount: estimated, warningMessage: j.warningMessage || '' };
}

export async function changenowMin(from = 'usdcerc20') {
  const j = await getJson(CN + '/v1/min-amount/' + cnFrom(from) + '_kas');
  return Number(j.minAmount != null ? j.minAmount : j.min) || 0;
}

export async function changenowCreate({ amount, address, from = 'usdcerc20', refundAddress = '' }) {
  const key = changenowKey();
  const tick = cnFrom(from);
  const a = Number(amount);
  if (!(a > 0)) throw new Error('Enter an amount');
  if (!address || !/^kaspa:q/i.test(address)) throw new Error('Need a kaspa:q payout address');
  if (!key) {
    return {
      mode: 'widget',
      widgetUrl: changenowWidgetUrl({ from: tick, amount: a, address }),
      payoutAddress: address,
      from: tick,
      fromAmount: a
    };
  }
  const r = await fetch(CN + '/v1/transactions/' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      from: tick,
      to: 'kas',
      amount: String(a),
      address,
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
    payoutAddress: j.payoutAddress || address,
    from: j.fromCurrency || tick,
    fromAmount: j.fromAmount || a,
    toAmount: j.toAmount,
    widgetUrl: changenowWidgetUrl({ from: tick, amount: a, address }),
    statusUrl: 'https://changenow.io/exchange/txs/' + j.id
  };
}

export async function changenowStatus(id) {
  const key = changenowKey() || ' ';
  return getJson(CN + '/v1/transactions/' + encodeURIComponent(id) + '/' + encodeURIComponent(key));
}
