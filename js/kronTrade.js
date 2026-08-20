/* KRON DEX trades via @kronsdk/kron-sdk (v0.17.2). Quotes + builders from the SDK;
   templates from the CORS-open token descriptor; live heads from idx.kron.technology. */
import * as kron from '../vendor/kron-sdk/index.js';
import { loadKaspaSdk, connectPublicNode, fetchAddressUtxos } from './tx.js';

const IDX = 'https://idx.kron.technology/v1/kcc20';
const REG = 'https://api.kron.technology';
const KASPA = 'https://api.kaspa.org';
const SCALE = 1_000_000n;
const DUST = 50_000_000n;

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
    decimals: Number(entry?.decimals ?? token.dec ?? 0),
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
  let last = null;
  while (i < b.length) {
    const op = b[i++];
    let n = 0;
    if (op > 0 && op <= 75) n = op;
    else if (op === 76) n = b[i++];
    else if (op === 77) { n = b[i] | (b[i + 1] << 8); i += 2; }
    else if (op === 78) { n = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24); i += 4; }
    else continue;
    last = b.slice(i, i + n);
    i += n;
  }
  return last;
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
  const trades = await idx('/token/' + encodeURIComponent(tick) + '/trades?limit=1');
  const row = Array.isArray(trades) ? trades[0] : trades;
  if (!row?.txid) throw new Error('No curve trades yet — cannot locate the live curve UTXO');
  const tx = await kaspaTx(row.txid);
  const ins = tx.inputs || tx.transaction_inputs || [];
  const redeem = lastPush(ins[0]?.signature_script || ins[0]?.signatureScript || '');
  if (!redeem || redeem.length < 80) throw new Error('Last curve trade did not reveal a redeem script');
  const tpl = decodeCurveRedeem(redeem);
  tpl.params = curveParams(entry);
  const outs = tx.outputs || tx.transaction_outputs || [];
  const curveOut = outs[0];
  const invOut = outs[1];
  const realKas = BigInt(curveOut?.amount ?? curveOut?.value ?? token.cpState?.realKas ?? 0);
  const invVal = BigInt(invOut?.amount ?? invOut?.value ?? DUST);
  const tokenReserve = BigInt(token.cpState?.tokenReserve || token.tokenReserve || 0);
  const tokenCovid = hexBytes(entry.covenantId);
  return {
    tpl,
    curveCovid: hexBytes(entry.extensions.curveCovenantId),
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

export async function quoteKronTrade({ tick, side, amount }) {
  await kronTokenlist();
  const entry = findKronEntry(tick);
  if (!entry) throw new Error(tick + ' is not a KRON token');
  const token = await idxToken(tick);
  const graduated = !!(token.graduated || entry.extensions?.graduated);
  const decimals = Number(entry.decimals || token.dec || 0);
  if (side === 'buy') {
    const kasIn = sompiFromKas(amount);
    let q;
    if (graduated) {
      const live = await poolHead(tick, entry.covenantId, entry.extensions.poolCovenantId);
      q = kron.poolCpV3.quotePoolV3Buy(live.utxo.state, poolParams(entry), kasIn);
      if (!q) throw new Error('Amount too small for this pool');
      return {
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
      };
    }
    q = kron.curve.quoteCpBuy(curveQuoteState(token, entry), kasIn);
    if (!q) throw new Error('Amount too small for this curve');
    return {
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
    };
  }
  const tokenIn = BigInt(String(amount).trim());
  if (tokenIn <= 0n) throw new Error('Enter a token amount');
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
    payload: '',
    subnetworkId: '0000000000000000000000000000000000000000'
  });
  return {
    transaction,
    fundingInputIndexes: fundInputs.map((_, i) => i + covInputs.length),
    change
  };
}

async function connectTradeNode(k) {
  try {
    const url = 'wss://node.kron.technology';
    const rpc = new k.RpcClient({ url, encoding: k.Encoding.Borsh, networkId: 'mainnet' });
    await rpc.connect();
    await rpc.getServerInfo();
    return { rpc, url };
  } catch {
    return connectPublicNode();
  }
}

async function loadUserTokens(tick, address) {
  const utxos = await idx(`/token/${encodeURIComponent(tick)}/address/${encodeURIComponent(address)}/utxos`);
  const rows = Array.isArray(utxos) ? utxos : [];
  const out = [];
  for (const u of rows) {
    if (!u?.redeemScriptHex) continue;
    const decoded = kron.kcc20.decodeKcc20Redeem(hexBytes(u.redeemScriptHex));
    const txid = u.outpoint.transactionId;
    const index = Number(u.outpoint.index);
    let value = DUST;
    try { value = await cellKas(txid, index); } catch {}
    out.push({
      transactionId: txid,
      index,
      value,
      state: decoded.state,
      template: decoded.template
    });
  }
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

export async function executeKronTrade({ wallet, tick, side, amount, utxos, onStatus }) {
  const k = await loadKaspaSdk();
  await kronTokenlist();
  const entry = findKronEntry(tick);
  if (!entry) throw new Error(tick + ' is not a KRON token');
  const token = await idxToken(tick);
  const graduated = !!(token.graduated || entry.extensions?.graduated);
  const desc = await descriptor(entry.covenantId);
  const tokenTpl = templateFromPart(desc.token);
  const buyer = xOnly(wallet);
  onStatus?.('Quoting on KRON…');
  const quoted = await quoteKronTrade({ tick, side, amount });

  let spend;
  if (quoted.side === 'buy' && quoted.graduated) {
    const live = await poolHead(tick, entry.covenantId, entry.extensions.poolCovenantId);
    const poolTpl = templateFromPart(desc.pool);
    const held = await loadUserTokens(tick, wallet.address).catch(() => []);
    const merge = held.slice(0, 3);
    const presence = merge.length ? 2 + merge.length : 0;
    spend = kron.poolCpV3.buildPoolV3SwapKasForToken(
      k, poolTpl, tokenTpl, poolParams(entry), live.utxo, live.poolCovid, buyer, quoted.raw, merge, presence
    );
  } else if (quoted.side === 'sell' && quoted.graduated) {
    const live = await poolHead(tick, entry.covenantId, entry.extensions.poolCovenantId);
    const poolTpl = templateFromPart(desc.pool);
    const held = await loadUserTokens(tick, wallet.address);
    const picked = pickTokens(held, quoted.tokenIn, 3);
    const presence = 2 + picked.length;
    spend = kron.poolCpV3.buildPoolV3SwapTokenForKas(
      k, poolTpl, tokenTpl, poolParams(entry), live.utxo, live.poolCovid, buyer, picked, quoted.raw, presence
    );
  } else if (quoted.side === 'buy') {
    const head = await curveHead(tick, token, entry);
    spend = kron.curveCp.buildCpBuy(
      k, head.tpl, tokenTpl, head.utxo, head.inventory, head.curveCovid, buyer, quoted.kasIn, quoted.tokenOut
    );
  } else {
    const head = await curveHead(tick, token, entry);
    const held = await loadUserTokens(tick, wallet.address);
    const picked = pickTokens(held, quoted.tokenIn, 3);
    const presence = 2 + picked.length;
    spend = kron.curveCp.buildCpSell(
      k, head.tpl, tokenTpl, head.utxo, picked, head.inventory, head.curveCovid, buyer, quoted.tokenIn, quoted.kasOut, presence
    );
  }

  onStatus?.('Selecting KAS UTXOs…');
  const rest = utxos?.length ? utxos : await fetchAddressUtxos(wallet.address);
  const fundingAll = restFunding(rest, wallet.address);
  const needGuess = (quoted.total || quoted.fee || 0n) + DUST + 80_000_000n;
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
  const priv = new k.PrivateKey(wallet.privKey);
  kron.spend.signFundingInputs(k, asm.transaction, priv, asm.fundingInputIndexes);
  onStatus?.('Broadcasting KRON trade…');
  const submitted = await rpc.submitTransaction({ transaction: asm.transaction, allowOrphan: false });
  const txId = submitted?.transactionId || submitted || asm.transaction.id;
  if (!txId) throw new Error('Node did not return a transaction id');
  return { txId, fee, quote: quoted };
}

export function formatKasSompi(n) {
  return (Number(n || 0n) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export { errText as kronErr };
