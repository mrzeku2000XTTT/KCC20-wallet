/* KRON DEX trades via @kronsdk/kron-sdk (v0.17.2). Quotes + builders from the SDK;
   templates from the CORS-open token descriptor; live heads from idx.kron.technology. */
import * as kron from '../vendor/kron-sdk/index.js';
import { loadKaspaSdk, connectPublicNode, fetchAddressUtxos } from './tx.js?v=85';
import { kaswareSigning, signPsktWithKasware, fetchKaswareUtxos } from './kasware.js?v=85';

const IDX = 'https://idx.kron.technology/v1/kcc20';
const REG = 'https://api.kron.technology';
const KASPA = 'https://api.kaspa.org';
const SCALE = 1_000_000n;
const DUST = 50_000_000n;
const NETWORK_EST = 40_000_000n; // ~0.40 KAS typical covenant mass fee
const PARTNER_REF = 'kcc20wallet';

let listCache = null;
let listAt = 0;
const descCache = new Map();

function errText(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.message || e.toString?.() || String(e);
}

function hexBytes(h) {
  const s = String(h || '').replace(/^0x/i, '');
  if (!s || s.length % 2) return new Uint8Array(0);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function xOnly(wallet) {
  let h = String(wallet.pubKey || '').replace(/^0x/i, '');
  if (h.length === 66) h = h.slice(2);
  if (h.length !== 64) throw new Error('Wallet public key is missing — reopen the wallet');
  return hexBytes(h);
}

async function idx(path) {
  const res = await fetch(IDX + path, { cache: 'no-store' });
  if (!res.ok) throw new Error('KRON indexer HTTP ' + res.status);
  const body = await res.json();
  return body.result;
}

async function idxToken(tick) {
  let r = await idx('/token/' + encodeURIComponent(tick));
  if (Array.isArray(r)) r = r[0];
  if (!r) throw new Error('Unknown KRON token ' + tick);
  return r;
}

export async function kronTokenlist() {
  if (listCache && Date.now() - listAt < 60_000) return listCache;
  const res = await fetch(REG + '/api/registry/tokenlist', { cache: 'no-store' });
  if (!res.ok) throw new Error('KRON token list HTTP ' + res.status);
  listCache = await res.json();
  listAt = Date.now();
  return listCache;
}

export async function kronMarkets() {
  const [list, mkts] = await Promise.all([
    kronTokenlist(),
    idx('/markets').catch(() => [])
  ]);
  const live = new Map();
  for (const m of (Array.isArray(mkts) ? mkts : [])) {
    live.set(String(m.tick || '').toUpperCase(), m);
  }
  return (list.tokens || []).map(e => {
    const tick = String(e.symbol || '').toUpperCase();
    const row = live.get(tick) || {};
    return {
      tick,
      name: e.name || tick,
      decimals: Number(e.decimals || 0),
      logo: e.logoURI || '',
      graduated: !!(e.extensions?.graduated || row.graduated),
      price: Number(row.price || 0),
      change24h: Number(row.change24h || 0),
      volume24h: Number(row.volume24h || 0),
      tvl: Number(row.tvl || 0),
      covenantId: e.covenantId,
      entry: e
    };
  }).sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
}

export function findKronEntry(tick) {
  const t = String(tick || '').toUpperCase();
  return (listCache?.tokens || []).find(e => String(e.symbol).toUpperCase() === t) || null;
}

export function kronLogoFor(tick) {
  const e = findKronEntry(tick);
  return e?.logoURI ? String(e.logoURI) : '';
}

export async function attachKronLogos(holdings) {
  try { await kronTokenlist(); } catch { return holdings || []; }
  return (holdings || []).map(t => {
    const kron = kronLogoFor(t.ticker);
    if (kron && (!t.image || !/^https?:\/\//i.test(String(t.image)))) return { ...t, image: kron };
    if (t.image) return t;
    return kron ? { ...t, image: kron } : t;
  });
}

export async function kronCandles(tick, limit = 72) {
  const r = await idx('/token/' + encodeURIComponent(String(tick || '').toUpperCase()) + '/ohlc');
  const rows = Array.isArray(r) ? r : [];
  return rows.map(c => {
    const t = Number(c.time || 0);
    return {
      t: t > 1e12 ? t : t * 1000,
      o: Number(c.open || 0),
      h: Number(c.high || 0),
      l: Number(c.low || 0),
      c: Number(c.close || 0),
      v: Number(c.volume || 0)
    };
  }).filter(x => x.c > 0 && x.t > 0).sort((a, b) => a.t - b.t).slice(-limit);
}

export async function lookupKronTick(tick) {
  const t = String(tick || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(t)) throw new Error('Enter a ticker like KRON or KKDAG');
  await kronTokenlist();
  const token = await idxToken(t);
  const entry = findKronEntry(t);
  return {
    tick: t,
    name: token.name || entry?.name || t,
    graduated: !!(token.graduated || entry?.extensions?.graduated),
    price: Number(token.price || 0),
    decimals: Number(entry?.decimals ?? token.dec ?? token.decimals ?? 0),
    change24h: Number(token.change24h || 0),
    volume24h: Number(token.volume24h || 0),
    covenantId: token.covenantId || entry?.covenantId || '',
    entry
  };
}

async function descriptor(covid) {
  if (descCache.has(covid)) return descCache.get(covid);
  const res = await fetch(REG + '/api/registry/token/' + encodeURIComponent(covid) + '/descriptor', { cache: 'no-store' });
  if (!res.ok) throw new Error('KRON descriptor HTTP ' + res.status);
  const d = await res.json();
  descCache.set(covid, d);
  return d;
}

function paintState(script, start, fields) {
  let rel = 0;
  for (const f of fields || []) {
    script[start + rel] = parseInt(String(f.push || '00'), 16);
    rel += 1 + Number(f.size || 0);
  }
}

function templateFromPart(part) {
  if (!part) throw new Error('Token descriptor is missing a compiled template');
  const prefix = hexBytes(part.prefix);
  const suffix = hexBytes(part.suffix);
  const start = Number(part.stateLayout?.start || 0);
  const len = Number(part.stateLayout?.len || 0);
  const script = new Uint8Array(prefix.length + len + suffix.length);
  script.set(prefix, 0);
  paintState(script, start, part.stateLayout?.fields);
  script.set(suffix, prefix.length + len);
  return {
    script,
    stateStart: start,
    maxIns: Number(part.maxIns || 4),
    maxOuts: Number(part.maxOuts || 4),
    canonicalInventoryRequired: true
  };
}

function poolParams(entry) {
  const p = entry.extensions?.curveParams;
  if (!p) throw new Error('No KRON curve/pool params for this token');
  return {
    creatorFeeOwner: hexBytes(p.creatorFeeOwner),
    platformFeeOwner: hexBytes(p.platformFeeOwner),
    creatorFeeBps: BigInt(p.dexCreatorFeeBps ?? 10),
    platformFeeBps: BigInt(p.dexPlatformFeeBps ?? 70),
    lpFeeBps: BigInt(p.dexLpFeeBps ?? 20),
    lockedShares: BigInt(p.poolLockedShares ?? 1_000_000)
  };
}

function curveParams(entry) {
  const p = entry.extensions?.curveParams;
  if (!p) throw new Error('No KRON curve params for this token');
  const out = {
    creatorFeeOwner: hexBytes(p.creatorFeeOwner),
    platformFeeOwner: hexBytes(p.platformFeeOwner),
    vKas: BigInt(p.vKas),
    graduationKas: BigInt(p.graduationKas),
    creatorFeeBps: BigInt(p.creatorFeeBps),
    platformFeeBps: BigInt(p.platformFeeBps),
    graduationFeeBps: BigInt(p.graduationFeeBps ?? 500)
  };
  if (p.devFundOwner && p.devFundBps != null) {
    out.devFundOwner = hexBytes(p.devFundOwner);
    out.devFundBps = BigInt(p.devFundBps);
  }
  return out;
}

function curveQuoteState(token, entry) {
  const p = entry.extensions.curveParams;
  const cp = token.cpState || {};
  return {
    realKas: BigInt(cp.realKas || 0),
    tokenReserve: BigInt(cp.tokenReserve || token.tokenReserve || 0),
    vKas: BigInt(p.vKas),
    graduationKas: BigInt(p.graduationKas),
    creatorFeeBps: BigInt(p.creatorFeeBps),
    platformFeeBps: BigInt(p.platformFeeBps),
    devFundBps: p.devFundBps != null ? BigInt(p.devFundBps) : 0n
  };
}

async function kaspaTx(id) {
  const res = await fetch(`${KASPA}/transactions/${id}?resolve_previous_outpoints=no`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Kaspa tx lookup failed');
  return res.json();
}

function txOutValue(tx, index) {
  const outs = tx.outputs || tx.transaction_outputs || [];
  const o = outs[Number(index)];
  if (!o) throw new Error('Pool output missing on chain');
  return BigInt(o.amount ?? o.value ?? 0);
}

function lastPush(hex) {
  const b = hexBytes(hex);
  let i = 0;
  let best = null;
  while (i < b.length) {
    const op = b[i++];
    let n = 0;
    if (op > 0 && op <= 75) n = op;
    else if (op === 76) n = b[i++];
    else if (op === 77) { n = b[i] | (b[i + 1] << 8); i += 2; }
    else if (op === 78) { n = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24); i += 4; }
    else continue;
    const slice = b.slice(i, i + n);
    i += n;
    if (!best || slice.length >= best.length) best = slice;
  }
  return best;
}

function decodeCurveRedeem(redeem) {
  const hits = [];
  for (let s = 0; s + 44 <= redeem.length; s++) {
    if (redeem[s] === 0x01 && redeem[s + 1] <= 1 && redeem[s + 2] === 0x20 && redeem[s + 35] === 0x08) hits.push(s);
  }
  if (hits.length !== 1) throw new Error('Could not read the bonding-curve script from the last trade');
  return { script: redeem.slice(), stateStart: hits[0] };
}

async function poolHead(tick, tokenCovidHex, poolCovidHex) {
  const head = await idx('/token/' + encodeURIComponent(tick) + '/poolhead');
  const tx = await kaspaTx(head.pool.transactionId);
  const res = head.reserves;
  const state = {
    kasReserve: BigInt(res.kasReserve),
    tokenReserve: BigInt(res.tokenReserve),
    tokenCovid: hexBytes(tokenCovidHex),
    totalShares: BigInt(res.totalShares),
    lpCovid: hexBytes(res.lpCovid)
  };
  const poolVal = txOutValue(tx, head.pool.index);
  if (poolVal && poolVal % SCALE === 0n) state.kasReserve = poolVal / SCALE;
  return {
    poolCovid: hexBytes(poolCovidHex),
    utxo: {
      transactionId: head.pool.transactionId,
      index: Number(head.pool.index),
      state,
      tokenUtxo: {
        transactionId: head.poolToken.transactionId,
        index: Number(head.poolToken.index),
        value: txOutValue(tx, head.poolToken.index)
      }
    }
  };
}

async function curveHead(tick, token, entry) {
  const live = await idxToken(tick);
  const tokenReserve = BigInt(live.cpState?.tokenReserve || live.tokenReserve || token.tokenReserve || 0);
  const indexerKas = BigInt(live.cpState?.realKas || 0);
  const trades = await idx('/token/' + encodeURIComponent(tick) + '/trades?limit=2');
  const rows = Array.isArray(trades) ? trades : (trades ? [trades] : []);
  let lastErr = new Error('No curve trades yet — cannot locate the live curve');
  for (const row of rows) {
    if (!row?.txid) continue;
    try {
      const tx = await kaspaTx(row.txid);
      const ins = tx.inputs || tx.transaction_inputs || [];
      const sig = ins[0]?.signature_script || ins[0]?.signatureScript || '';
      const redeem = lastPush(sig);
      if (!redeem || redeem.length < 80) throw new Error('no redeem');
      const tpl = decodeCurveRedeem(redeem);
      tpl.params = curveParams(entry);
      const outs = tx.outputs || tx.transaction_outputs || [];
      const curveOut = outs[0];
      const invOut = outs[1];
      const realKas = BigInt(curveOut?.amount ?? curveOut?.value ?? indexerKas);
      const invVal = BigInt(invOut?.amount ?? invOut?.value ?? DUST);
      const tokenCovid = hexBytes(entry.covenantId || live.covenantId);
      const curveCovid = hexBytes(entry.extensions?.curveCovenantId || live.curveCovenantId);
      return {
        tpl,
        curveCovid,
        utxo: {
          transactionId: row.txid,
          index: 0,
          realKas,
          state: { graduated: false, tokenCovid, tokenReserve }
        },
        inventory: {
          transactionId: row.txid,
          index: 1,
          value: invVal,
          amount: tokenReserve
        }
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function withCost(q) {
  const protocol = BigInt(q.fee || 0n);
  const into = BigInt(q.kasIn || 0n);
  const cell = q.side === 'buy' ? DUST : 0n;
  q.cellDust = cell;
  q.networkEst = NETWORK_EST;
  q.nativeLeave = q.side === 'buy' ? into + protocol + cell + NETWORK_EST : protocol + NETWORK_EST;
  q.youKeepCell = cell;
  q.netGone = q.side === 'buy' ? into + protocol + NETWORK_EST : protocol + NETWORK_EST;
  return q;
}

export function tradeCostLines(q) {
  if (!q || q.side !== 'buy') return '';
  return [
    `Into the market: ${Number(q.kasIn) / 1e8} KAS buys the tokens.`,
    `KRON protocol fees: ${Number(q.fee) / 1e8} KAS — paid to the token creator and KRON (covenant-required, not optional). Curve trades pad each fee output to 0.2 KAS.`,
    `Token cell: 0.5 KAS stays in THIS wallet inside the ${q.tick} cell (not spent).`,
    `Network fee: ~0.4 KAS because a covenant tx is large (~175 KB).`,
    `Native KAS leaving the card: ~${Number(q.nativeLeave) / 1e8} KAS. You still hold 0.5 KAS in the token cell.`
  ].join(' ');
}

function sompiFromKas(human) {
  const t = String(human || '').trim().replace(',', '.');
  if (!t) throw new Error('Enter an amount');
  const [w, f = ''] = t.split('.');
  if (!/^\d+$/.test(w || '0') || (f && !/^\d+$/.test(f))) throw new Error('Invalid amount');
  const frac = (f + '00000000').slice(0, 8);
  const n = BigInt(w || '0') * 100000000n + BigInt(frac);
  if (n <= 0n) throw new Error('Amount must be > 0');
  return n;
}

function tokenRawFromHuman(human, decimals) {
  const d = Math.max(0, Number(decimals) || 0);
  const t = String(human || '').trim().replace(',', '.');
  if (!t) throw new Error('Enter an amount');
  const n0 = Number(t);
  if (!Number.isFinite(n0) || n0 <= 0) throw new Error('Amount must be > 0');
  if (d === 0) {
    const n = BigInt(Math.round(n0));
    if (n <= 0n) throw new Error('This token is whole units only — amount rounds to 0');
    return n;
  }
  const [w, f = ''] = t.split('.');
  if (!/^\d+$/.test(w || '0') || (f && !/^\d+$/.test(f))) throw new Error('Invalid amount');
  const frac = (f + '0'.repeat(d)).slice(0, d);
  const n = BigInt(w || '0') * (10n ** BigInt(d)) + BigInt(frac || '0');
  if (n <= 0n) throw new Error('Amount must be > 0');
  return n;
}

function kronEntryFromIdx(tick, token) {
  const t = String(tick).toUpperCase();
  return findKronEntry(t) || {
    symbol: t,
    decimals: Number(token.dec ?? token.decimals ?? 0),
    covenantId: token.covenantId,
    extensions: {
      graduated: !!token.graduated,
      poolCovenantId: token.poolCovenantId || token.cpState?.poolCovenantId
    }
  };
}

export async function quoteKronTrade({ tick, side, amount }) {
  await kronTokenlist().catch(() => {});
  const token = await idxToken(tick);
  const entry = kronEntryFromIdx(tick, token);
  if (!entry?.covenantId && !token.covenantId) throw new Error(tick + ' is not a KRON KCC20 on idx.kron.technology');
  const graduated = !!(token.graduated || entry.extensions?.graduated);
  const decimals = Number(entry.decimals ?? token.dec ?? token.decimals ?? 0);
  if (side === 'buy') {
    const kasIn = sompiFromKas(amount);
    let q;
    if (graduated) {
      const cp = token.cpState || {};
      const pstate = {
        kasReserve: BigInt(cp.poolKas || 0),
        tokenReserve: BigInt(cp.poolTokenReserve || 0),
        tokenCovid: hexBytes(token.covenantId || entry.covenantId),
        totalShares: BigInt(cp.poolTotalShares || 1),
        lpCovid: hexBytes(cp.poolLpCovid || '00'.repeat(32))
      };
      q = kron.poolCpV3.quotePoolV3Buy(pstate, poolParams(entry), kasIn);
      if (!q && (pstate.kasReserve <= 0n || pstate.tokenReserve <= 0n)) {
        const live = await poolHead(tick, entry.covenantId, entry.extensions.poolCovenantId);
        q = kron.poolCpV3.quotePoolV3Buy(live.utxo.state, poolParams(entry), kasIn);
      }
      if (!q) throw new Error('Amount too small for this pool');
      return withCost({
        tick: String(tick).toUpperCase(),
        side: 'buy',
        graduated: true,
        decimals,
        kasIn: q.kasIn,
        tokenOut: q.tokenOut,
        fee: q.creatorOut + q.platformOut,
        total: q.total,
        price: token.price,
        raw: q
      });
    }
    q = kron.curve.quoteCpBuy(curveQuoteState(token, entry), kasIn);
    if (!q) throw new Error('Amount too small for this curve');
    return withCost({
      tick: String(tick).toUpperCase(),
      side: 'buy',
      graduated: false,
      decimals,
      kasIn: q.kasIn,
      tokenOut: q.tokenOut,
      fee: q.fee,
      total: q.total,
      price: token.price,
      raw: q
    });
  }
  const tokenIn = tokenRawFromHuman(amount, decimals);
  if (graduated) {
    const live = await poolHead(tick, entry.covenantId, entry.extensions.poolCovenantId);
    const q = kron.poolCpV3.quotePoolV3Sell(live.utxo.state, poolParams(entry), tokenIn);
    if (!q) throw new Error('Amount too small to sell — fees would exceed proceeds');
    return {
      tick: String(tick).toUpperCase(),
      side: 'sell',
      graduated: true,
      decimals,
      tokenIn: q.tokenIn,
      kasOut: q.kasOut,
      fee: q.creatorOut + q.platformOut,
      net: q.net,
      price: token.price,
      raw: q
    };
  }
  const q = kron.curve.quoteCpSell(curveQuoteState(token, entry), tokenIn);
  if (!q) throw new Error('Amount too small to sell — fees would exceed proceeds');
  return {
    tick: String(tick).toUpperCase(),
    side: 'sell',
    graduated: false,
    decimals,
    tokenIn: q.tokenIn,
    kasOut: q.kasOut,
    fee: q.fee,
    net: q.net,
    price: token.price,
    raw: q
  };
}

function spkOf(k, v) {
  if (v instanceof k.ScriptPublicKey) return v;
  if (typeof v === 'string') return new k.ScriptPublicKey(0, v);
  if (v && (typeof v.script === 'string' || v.script instanceof Uint8Array)) {
    return new k.ScriptPublicKey(Number(v.version || 0), v.script);
  }
  return v;
}

function inputFromUtxo(k, { txid, index, amount, scriptPublicKey, signatureScript, computeBudget, address, blockDaaScore, isCoinbase }) {
  const id = String(txid);
  const idx = Number(index);
  const spk = spkOf(k, scriptPublicKey);
  const scriptHex = typeof spk.script === 'string'
    ? spk.script
    : Array.from(spk.script || [], b => b.toString(16).padStart(2, '0')).join('');
  const utxo = {
    address: address || undefined,
    outpoint: { transactionId: id, index: idx },
    amount: BigInt(amount),
    scriptPublicKey: { version: Number(spk.version || 0), script: scriptHex },
    blockDaaScore: BigInt(blockDaaScore || 0),
    isCoinbase: !!isCoinbase
  };
  return new k.TransactionInput({
    previousOutpoint: new k.TransactionOutpoint(new k.Hash(id), idx),
    signatureScript: signatureScript || '',
    sequence: 0n,
    sigOpCount: 0,
    computeBudget: Number(computeBudget || 10),
    utxo
  });
}

function restFunding(utxos, address) {
  const list = Array.isArray(utxos) ? utxos : [];
  return list.map(u => {
    const e = u.utxoEntry || u;
    const spk = e.scriptPublicKey || e.script_public_key || {};
    const script = spk.scriptPublicKey || spk.script_public_key || spk.script || '';
    const txid = u.outpoint?.transactionId || u.outpoint?.transaction_id;
    if (!txid || !script) return null;
    return {
      address,
      outpoint: { transactionId: txid, index: Number(u.outpoint.index || 0) },
      amount: BigInt(e.amount),
      scriptPublicKey: { version: Number(spk.version || 0), script },
      blockDaaScore: BigInt(e.blockDaaScore || e.block_daa_score || 0),
      isCoinbase: !!e.isCoinbase
    };
  }).filter(Boolean).sort((a, b) => (a.amount < b.amount ? 1 : -1));
}

function hexish(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.replace(/^0x/i, '');
  if (v instanceof Uint8Array) {
    return Array.from(v, b => b.toString(16).padStart(2, '0')).join('');
  }
  return String(v);
}

/** rusty-kaspa createInputSignature already returns a complete P2PK script (push + sig).
 *  Do NOT wrap it with ScriptBuilder.addData — that double-encodes and the node rejects
 *  "signature invalid: malformed signature". */
function signFundingP2pk(k, tx, priv, indexes) {
  const inputs = [...tx.inputs];
  for (const idx of indexes) {
    const sig = k.createInputSignature(tx, idx, priv, k.SighashType.All);
    const hex = hexish(sig);
    if (!hex || hex.length < 20) throw new Error('Signing failed — empty P2PK signature');
    inputs[idx].signatureScript = hex;
    inputs[idx].sigOpCount = 0;
  }
  tx.inputs = inputs;
}

export function mergeFundingSignatures(original, signed, indexes) {
  const origIns = [...original.inputs];
  const signedIns = signed.inputs || [];
  for (const idx of indexes) {
    const hex = hexish(signedIns[idx]?.signatureScript);
    if (!hex || hex.length < 20) throw new Error('KasWare did not sign funding input ' + idx);
    origIns[idx].signatureScript = hex;
    origIns[idx].sigOpCount = 0;
  }
  original.inputs = origIns;
  return original;
}

export function kronPsktPlan(asm) {
  return kron.spend.toPsktJson(asm, 1);
}

function assembleSpend(k, spend, fundingEntries, changeAddress, networkFee) {
  const covInputs = spend.inputs.map(ci => inputFromUtxo(k, {
    txid: ci.transactionId,
    index: ci.index,
    amount: ci.value,
    scriptPublicKey: ci.scriptPublicKey,
    signatureScript: ci.signatureScript,
    computeBudget: ci.computeBudget ?? (ci.role === 'curve' || ci.role === 'pool' ? 400 : 100)
  }));
  const fundInputs = fundingEntries.map(e => inputFromUtxo(k, {
    txid: e.outpoint.transactionId,
    index: e.outpoint.index,
    amount: e.amount,
    scriptPublicKey: e.scriptPublicKey,
    signatureScript: '',
    computeBudget: 10,
    address: e.address,
    blockDaaScore: e.blockDaaScore,
    isCoinbase: e.isCoinbase
  }));
  const covIn = spend.inputs.reduce((s, ci) => s + ci.value, 0n);
  const fundIn = fundingEntries.reduce((s, e) => s + e.amount, 0n);
  const covOut = spend.outputs.reduce((s, o) => s + o.value, 0n);
  const change = covIn + fundIn - covOut - networkFee;
  if (change < 0n) {
    throw new Error(`Need about ${Number(covOut + networkFee - covIn) / 1e8} more KAS UTXO for this trade (pool fees, 0.5 KAS cell, and network fee).`);
  }
  const outputs = spend.outputs.map(o => (
    o.binding
      ? new k.TransactionOutput(o.value, o.scriptPublicKey, new k.CovenantBinding(o.binding.authorizingInput, new k.Hash(o.binding.covid)))
      : new k.TransactionOutput(o.value, o.scriptPublicKey)
  ));
  outputs.push(new k.TransactionOutput(change, k.payToAddressScript(changeAddress)));
  const transaction = new k.Transaction({
    version: 1,
    inputs: [...covInputs, ...fundInputs],
    outputs,
    lockTime: 0n,
    gas: 0n,
    payload: kron.partnerTag.encodePartnerTag(PARTNER_REF) || '',
    subnetworkId: '0000000000000000000000000000000000000000'
  });
  return {
    transaction,
    fundingInputIndexes: fundInputs.map((_, i) => i + covInputs.length),
    change
  };
}

async function connectTradeNode(k) {
  return connectPublicNode();
}

async function loadUserTokens(tick, address, { limit = 4, withKas = true } = {}) {
  const utxos = await idx(`/token/${encodeURIComponent(tick)}/address/${encodeURIComponent(address)}/utxos`);
  const rows = (Array.isArray(utxos) ? utxos : []).filter(u => u?.redeemScriptHex).slice(0, limit);
  const out = await Promise.all(rows.map(async u => {
    const decoded = kron.kcc20.decodeKcc20Redeem(hexBytes(u.redeemScriptHex));
    const txid = u.outpoint.transactionId;
    const index = Number(u.outpoint.index);
    let value = DUST;
    if (withKas) {
      try { value = await cellKas(txid, index); } catch {}
    }
    return {
      transactionId: txid,
      index,
      value,
      state: decoded.state,
      template: decoded.template
    };
  }));
  return out.sort((a, b) => (a.state.amount < b.state.amount ? 1 : -1));
}

async function cellKas(txid, index) {
  return txOutValue(await kaspaTx(txid), index);
}

function pickTokens(pieces, need, maxN) {
  const picked = [];
  let covered = 0n;
  for (const p of pieces) {
    picked.push(p);
    covered += p.state.amount;
    if (covered >= need) break;
    if (picked.length >= maxN) break;
  }
  if (covered < need) throw new Error('Not enough tokens in this wallet');
  return picked;
}

export async function executeKronTrade({ wallet, tick, side, amount, utxos, onStatus, forceKasware = false }) {
  const k = await loadKaspaSdk();
  await kronTokenlist().catch(() => {});
  const token = await idxToken(tick);
  const entry = kronEntryFromIdx(tick, token);
  if (!entry?.covenantId && !token.covenantId) throw new Error(tick + ' is not a KRON KCC20 on idx.kron.technology');
  const graduated = !!(token.graduated || entry.extensions?.graduated);
  const desc = await descriptor(entry.covenantId || token.covenantId);
  const tokenTpl = templateFromPart(desc.token);
  const buyer = xOnly(wallet);
  onStatus?.('Quoting on KRON…');
  const quoted = await quoteKronTrade({ tick, side, amount });

  let spend;
  let merge = [];
  if (quoted.side === 'buy') {
    try { merge = (await loadUserTokens(tick, wallet.address, { limit: 2, withKas: true })).slice(0, 2); } catch { merge = []; }
  }
  const presence = merge.length ? 2 + merge.length : 0;
  if (quoted.side === 'buy' && quoted.graduated) {
    onStatus?.('Loading pool…');
    const live = await poolHead(tick, entry.covenantId, entry.extensions.poolCovenantId);
    const poolTpl = templateFromPart(desc.pool);
    spend = kron.poolCpV3.buildPoolV3SwapKasForToken(
      k, poolTpl, tokenTpl, poolParams(entry), live.utxo, live.poolCovid, buyer, quoted.raw, merge, presence
    );
  } else if (quoted.side === 'sell' && quoted.graduated) {
    onStatus?.('Loading pool…');
    const [live, held] = await Promise.all([
      poolHead(tick, entry.covenantId, entry.extensions.poolCovenantId),
      loadUserTokens(tick, wallet.address, { limit: 4, withKas: true })
    ]);
    const poolTpl = templateFromPart(desc.pool);
    const picked = pickTokens(held, quoted.tokenIn, 3);
    const presence = 2 + picked.length;
    spend = kron.poolCpV3.buildPoolV3SwapTokenForKas(
      k, poolTpl, tokenTpl, poolParams(entry), live.utxo, live.poolCovid, buyer, picked, quoted.raw, presence
    );
  } else if (quoted.side === 'buy') {
    onStatus?.('Loading curve…');
    const head = await curveHead(tick, token, entry);
    spend = kron.curveCp.buildCpBuy(
      k, head.tpl, tokenTpl, head.utxo, head.inventory, head.curveCovid, buyer, quoted.kasIn, quoted.tokenOut, merge, presence
    );
  } else {
    onStatus?.('Loading curve…');
    const [head, held] = await Promise.all([
      curveHead(tick, token, entry),
      loadUserTokens(tick, wallet.address, { limit: 4, withKas: true })
    ]);
    const picked = pickTokens(held, quoted.tokenIn, 3);
    const presence = 2 + picked.length;
    spend = kron.curveCp.buildCpSell(
      k, head.tpl, tokenTpl, head.utxo, picked, head.inventory, head.curveCovid, buyer, quoted.tokenIn, quoted.kasOut, presence
    );
  }

  onStatus?.('Selecting KAS UTXOs…');
  let rest = utxos?.length ? utxos : [];
  if (kaswareSigning(wallet)) {
    try {
      const kwUtxos = await fetchKaswareUtxos(wallet.address);
      if (kwUtxos.length) rest = kwUtxos;
    } catch {}
  }
  if (!rest.length) rest = await fetchAddressUtxos(wallet.address);
  const fundingAll = restFunding(rest, wallet.address);
  const needGuess = (quoted.total || quoted.fee || 0n) + (merge.length ? 0n : DUST) + 80_000_000n;
  const funding = [];
  let sum = 0n;
  for (const e of fundingAll) {
    funding.push(e);
    sum += e.amount;
    if (sum >= needGuess) break;
  }
  if (sum < needGuess) {
    throw new Error(`Need about ${Number(needGuess) / 1e8} KAS UTXO in this wallet for the swap (trade + 0.5 KAS cell + network fee).`);
  }

  onStatus?.('Connecting to Kaspa…');
  const { rpc } = await connectTradeNode(k);
  let asm = assembleSpend(k, spend, funding, wallet.address, 10_000n);
  const fee = kron.spend.estimateNativeFee(k, 'mainnet', asm, 100);
  asm = assembleSpend(k, spend, funding, wallet.address, fee);
  const external = !!(forceKasware || kaswareSigning(wallet));
  if (external) {
    onStatus?.('Approve in KasWare…');
    let plan;
    try {
      plan = kronPsktPlan(asm);
    } catch (e) {
      throw new Error('Could not export this KCC20 swap for KasWare: ' + errText(e));
    }
    if (!plan?.txJsonString) throw new Error('Could not export this KCC20 swap for KasWare');
    const signedJson = await signPsktWithKasware(plan.txJsonString, plan.signInputs);
    let signedTx;
    try {
      signedTx = k.Transaction.deserializeFromSafeJSON(signedJson);
    } catch (e) {
      throw new Error('KasWare returned a tx this app could not read: ' + errText(e));
    }
    mergeFundingSignatures(asm.transaction, signedTx, asm.fundingInputIndexes);
  } else {
    const hex = String(wallet.privKey || '').replace(/^0x/i, '').trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('No in-app key on this wallet. Import the 64-hex key to sign natively, or turn KasWare on in Settings.');
    }
    wallet.privKey = hex;
    const priv = new k.PrivateKey(wallet.privKey);
    signFundingP2pk(k, asm.transaction, priv, asm.fundingInputIndexes);
  }
  onStatus?.('Broadcasting KRON trade…');
  const submitted = await rpc.submitTransaction({ transaction: asm.transaction, allowOrphan: false });
  const txId = submitted?.transactionId || submitted || asm.transaction.id;
  if (!txId) throw new Error('Node did not return a transaction id');
  return { txId, fee, quote: quoted, signer: external ? 'kasware' : 'local' };
}

export function formatKasSompi(n) {
  return (Number(n || 0n) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function formatTokenRaw(raw, decimals) {
  const d = Math.max(0, Number(decimals) || 0);
  const n = Number(raw || 0) / (10 ** d);
  if (!Number.isFinite(n)) return '0';
  if (d === 0) return String(Math.round(n));
  return n.toLocaleString(undefined, { maximumFractionDigits: Math.min(6, d) });
}

function kasHumanFromSompi(sompi) {
  const n = Number(sompi || 0n) / 1e8;
  if (!Number.isFinite(n) || n <= 0) return '0';
  return n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

function utxoKasSum(utxos) {
  let s = 0n;
  for (const u of utxos || []) {
    const v = u?.utxoEntry?.amount ?? u?.amount ?? 0;
    try { s += BigInt(v); } catch {}
  }
  return s;
}

async function waitKasHop(addr, before, expect, onStatus) {
  let last = { utxos: [], sum: before, delta: 0n };
  for (let i = 0; i < 14; i++) {
    await new Promise(r => setTimeout(r, 900));
    onStatus?.('Oracle wait ' + (i + 1) + '/14 — KRON idx + Kaspa UTXOs…');
    try {
      const utxos = await fetchAddressUtxos(addr);
      const sum = utxoKasSum(utxos);
      last = { utxos, sum, delta: sum > before ? sum - before : 0n };
      if (expect && last.delta >= expect * 80n / 100n) return last;
      if (!expect && last.delta > 0n) return last;
    } catch {}
  }
  return last;
}

/**
 * Canonical KCC20↔KCC20 route: sell FROM for KAS on KRON (curve or pool), then buy TO.
 * Quotes always re-read idx.kron.technology (live curve/pool reserves). Not a price API guess.
 */
export async function quoteKcc20Bridge({ fromTick, toTick, amount }) {
  const from = String(fromTick || '').trim().toUpperCase();
  const to = String(toTick || '').trim().toUpperCase();
  if (!from || !to) throw new Error('Pick FROM and TO tickers');
  if (from === to) throw new Error('Pick two different KCC20 tokens');
  const sell = await quoteKronTrade({ tick: from, side: 'sell', amount });
  const kasGross = BigInt(sell.net || sell.kasOut || 0);
  const hopReserve = 50_000_000n;
  if (kasGross <= hopReserve + 10_000_000n) {
    throw new Error('Sell proceeds are too small to buy the other token after KRON + network fees');
  }
  const kasForBuy = kasGross - hopReserve;
  const buy = await quoteKronTrade({ tick: to, side: 'buy', amount: kasHumanFromSompi(kasForBuy) });
  return {
    fromTick: from,
    toTick: to,
    amount: String(amount),
    sell,
    buy,
    kasGross,
    kasForBuy,
    hopReserve,
    oracle: 'idx.kron.technology live ' + (sell.graduated ? 'pool' : 'curve') + ' → ' + (buy.graduated ? 'pool' : 'curve')
  };
}

export async function executeKcc20Bridge({ wallet, fromTick, toTick, amount, utxos, onStatus, forceKasware = false }) {
  const quoted = await quoteKcc20Bridge({ fromTick, toTick, amount });
  const beforeUtxos = utxos?.length ? utxos : await fetchAddressUtxos(wallet.address).catch(() => []);
  const beforeKas = utxoKasSum(beforeUtxos);
  let beforeTok = 0n;
  try {
    const held = await loadUserTokens(quoted.toTick, wallet.address, { limit: 8, withKas: true });
    beforeTok = held.reduce((a, p) => a + BigInt(p.state?.amount || 0), 0n);
  } catch {}

  onStatus?.('Live oracle: ' + quoted.oracle);
  onStatus?.('Leg 1/2: selling ' + quoted.fromTick + ' for KAS on KRON…');
  const sell = await executeKronTrade({
    wallet, tick: quoted.fromTick, side: 'sell', amount: String(amount),
    utxos: beforeUtxos, onStatus, forceKasware
  });
  const expectKas = BigInt(sell.quote?.net || sell.quote?.kasOut || quoted.kasGross || 0);
  const hop = await waitKasHop(wallet.address, beforeKas, expectKas, onStatus);
  let kasForBuy = quoted.kasForBuy;
  if (hop.delta > quoted.hopReserve + 10_000_000n) kasForBuy = hop.delta - quoted.hopReserve;
  const kasHuman = kasHumanFromSompi(kasForBuy);
  onStatus?.('Re-quoting ' + quoted.toTick + ' from live KRON reserves with ' + kasHuman + ' KAS…');
  const liveBuy = await quoteKronTrade({ tick: quoted.toTick, side: 'buy', amount: kasHuman });
  onStatus?.('Leg 2/2: buying ~' + formatTokenRaw(liveBuy.tokenOut, liveBuy.decimals) + ' ' + quoted.toTick + '…');
  const buy = await executeKronTrade({
    wallet, tick: quoted.toTick, side: 'buy', amount: kasHuman,
    utxos: hop.utxos.length ? hop.utxos : await fetchAddressUtxos(wallet.address),
    onStatus, forceKasware
  });

  let received = BigInt(buy.quote?.tokenOut || liveBuy.tokenOut || 0);
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 800));
    try {
      const held = await loadUserTokens(quoted.toTick, wallet.address, { limit: 8, withKas: true });
      const now = held.reduce((a, p) => a + BigInt(p.state?.amount || 0), 0n);
      if (now > beforeTok) {
        received = now - beforeTok;
        break;
      }
    } catch {}
  }
  return {
    sell, buy,
    quote: { ...quoted, buy: liveBuy, kasForBuy },
    receivedRaw: received,
    receivedHuman: formatTokenRaw(received, liveBuy.decimals)
  };
}

export { errText as kronErr };
