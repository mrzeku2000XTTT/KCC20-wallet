/* Official rusty-kaspa WASM: P2SH covenants + signed send/fund. */
import { hexToBytes } from './crypto.js?v=32';

const API = 'https://api.kaspa.org';

let _sdk = null;
let _sdkLoading = null;

export async function loadKaspaSdk() {
  if (_sdk) return _sdk;
  if (_sdkLoading) return _sdkLoading;
  _sdkLoading = (async () => {
    const mod = await import('../vendor/kaspa/kaspa.js');
    await mod.default();
    try { mod.initConsolePanicHook(); } catch {}
    _sdk = mod;
    return mod;
  })();
  try {
    return await _sdkLoading;
  } catch (e) {
    _sdkLoading = null;
    throw new Error('Kaspa engine failed to load: ' + (e.message || e));
  }
}

function restUtxosToEntries(utxos, address) {
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
  }).filter(Boolean);
}

function errText(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.message || e.toString?.() || String(e);
}

function hexish(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.replace(/^0x/i, '');
  if (v instanceof Uint8Array) {
    return Array.from(v, b => b.toString(16).padStart(2, '0')).join('');
  }
  return String(v);
}

function covenantRpc(cov) {
  if (!cov) return null;
  const id = cov.covenantId != null ? String(cov.covenantId) : '';
  if (!id) return null;
  return {
    authorizingInput: Number(cov.authorizingInput ?? cov.authorizing_input ?? 0),
    covenantId: id.replace(/^0x/i, '')
  };
}

/** Plain RPC tx — same shape as covenants/* scripts that already land on mainnet. */
export function toRpcTransaction(tx, opts = {}) {
  const version = opts.version != null ? Number(opts.version) : Number(tx.version || 0);
  const lockTime = opts.lockTime != null ? Number(opts.lockTime) : Number(tx.lockTime || 0);
  const sigOpCount = opts.sigOpCount != null ? Number(opts.sigOpCount) : 0;
  const computeBudget = opts.computeBudget == null ? null : Number(opts.computeBudget);
  const inputs = [...tx.inputs].map(inp => {
    const prev = inp.previousOutpoint;
    const row = {
      previousOutpoint: {
        transactionId: String(prev.transactionId),
        index: Number(prev.index)
      },
      signatureScript: hexish(inp.signatureScript),
      sequence: Number(inp.sequence ?? 0),
      sigOpCount
    };
    if (computeBudget != null) row.computeBudget = computeBudget;
    return row;
  });
  const outputs = [...tx.outputs].map(o => {
    const spk = o.scriptPublicKey || {};
    const row = {
      value: Number(o.value),
      scriptPublicKey: {
        version: Number(spk.version || 0),
        script: hexish(spk.script || spk.scriptPublicKey)
      }
    };
    const cov = covenantRpc(o.covenant);
    if (cov) row.covenant = cov;
    return row;
  });
  return {
    version,
    inputs,
    outputs,
    lockTime,
    subnetworkId: hexish(tx.subnetworkId) || '0000000000000000000000000000000000000000',
    gas: 0,
    payload: hexish(tx.payload)
  };
}

async function withTimeout(promise, ms, msg) {
  let t;
  try {
    return await Promise.race([
      promise,
      new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); })
    ]);
  } finally { clearTimeout(t); }
}

export async function currentDaa() {
  const res = await fetch(`${API}/info/blockdag`);
  const info = await res.json();
  return Number(info.virtualDaaScore ?? info.virtual_daa_score ?? 0);
}

export async function buildTimelockCovenant({ pubkeyHex, minutes }) {
  const k = await loadKaspaSdk();
  const daaNow = await currentDaa();
  const unlockDaa = daaNow + Math.max(10, Math.round(Number(minutes) * 60 * 10));
  const sb = new k.ScriptBuilder();
  sb.addI64(BigInt(unlockDaa));
  sb.addOp(k.Opcodes.OpCheckLockTimeVerify);
  sb.addOp(k.Opcodes.OpDrop);
  sb.addData(hexToBytes(pubkeyHex));
  sb.addOp(k.Opcodes.OpCheckSig);
  const redeemHex = sb.toString();
  const p2sh = sb.createPayToScriptHashScript();
  const addr = k.addressFromScriptPublicKey(p2sh, 'mainnet');
  if (!addr) throw new Error('SDK did not produce a P2SH address');
  return {
    address: String(addr),
    redeemHex,
    spkHex: p2sh.script,
    unlockDaa,
    daaNow,
    type: 'timelock'
  };
}

export async function buildEscrowCovenant({ ownerPubHex, buyerPubHex }) {
  const k = await loadKaspaSdk();
  const sb = new k.ScriptBuilder();
  sb.addOp(k.Opcodes.OpIf);
  sb.addData(hexToBytes(buyerPubHex));
  sb.addOp(k.Opcodes.OpCheckSig);
  sb.addOp(k.Opcodes.OpElse);
  sb.addData(hexToBytes(ownerPubHex));
  sb.addOp(k.Opcodes.OpCheckSig);
  sb.addOp(k.Opcodes.OpEndif);
  const redeemHex = sb.toString();
  const p2sh = sb.createPayToScriptHashScript();
  const addr = k.addressFromScriptPublicKey(p2sh, 'mainnet');
  return { address: String(addr), redeemHex, spkHex: p2sh.script, type: 'escrow' };
}

export async function buildMultisigCovenant({ ownerPubHex, otherPubHex }) {
  const k = await loadKaspaSdk();
  const sb = new k.ScriptBuilder();
  sb.addData(hexToBytes(ownerPubHex));
  sb.addOp(k.Opcodes.OpCheckSigVerify);
  sb.addData(hexToBytes(otherPubHex));
  sb.addOp(k.Opcodes.OpCheckSig);
  const redeemHex = sb.toString();
  const p2sh = sb.createPayToScriptHashScript();
  const addr = k.addressFromScriptPublicKey(p2sh, 'mainnet');
  return { address: String(addr), redeemHex, spkHex: p2sh.script, type: 'multisig' };
}

/* Same public nodes this repo uses in covenants/* deploy/spend scripts. */
const PUBLIC_WRPC = [
  'wss://ivy.kaspa.green/kaspa/mainnet/wrpc/borsh',
  'wss://dina.kaspa.green/kaspa/mainnet/wrpc/borsh',
  'wss://kaspa.aspectron.org:443/kaspa/mainnet/wrpc/borsh',
  'wss://mainnet.kaspa.ws/kaspa/mainnet/wrpc/borsh'
];

let _rpc = null;
let _rpcUrl = null;

export async function disconnectRpc() {
  if (!_rpc) return;
  try { await _rpc.disconnect(); } catch {}
  _rpc = null;
  _rpcUrl = null;
}

export async function connectPublicNode() {
  const k = await loadKaspaSdk();
  if (_rpc && _rpc.isConnected) return { rpc: _rpc, url: _rpcUrl, reused: true };

  const encoding = k.Encoding.Borsh;
  const urls = [];
  try {
    const resolver = new k.Resolver();
    const resolved = await withTimeout(resolver.getUrl(encoding, 'mainnet'), 6000, 'resolver timeout');
    if (resolved) urls.push(String(resolved));
  } catch {}
  for (const u of PUBLIC_WRPC) if (!urls.includes(u)) urls.push(u);

  let last = 'no public node responded';
  for (const url of urls) {
    let rpc = null;
    try {
      rpc = new k.RpcClient({ url, encoding, networkId: 'mainnet' });
      await withTimeout(rpc.connect(), 10000, 'connect timeout');
      const info = await withTimeout(rpc.getServerInfo(), 8000, 'getServerInfo timeout');
      if (!info) throw new Error('empty server info');
      _rpc = rpc;
      _rpcUrl = url;
      return { rpc, url, info, reused: false };
    } catch (e) {
      last = `${url} → ${errText(e)}`;
      try { if (rpc) await rpc.disconnect(); } catch {}
    }
  }
  throw new Error('Could not reach a public Kaspa node. Last: ' + last);
}

export async function pingPublicNode() {
  const { rpc, url, info, reused } = await connectPublicNode();
  const live = info || await rpc.getServerInfo();
  return {
    url,
    reused: !!reused,
    networkId: String(live.networkId || ''),
    serverVersion: String(live.serverVersion || ''),
    isSynced: !!live.isSynced,
    virtualDaaScore: String(live.virtualDaaScore ?? '')
  };
}

function isMassError(e) {
  return /storage mass|mass exceeds|transaction mass/i.test(errText(e));
}

function sompiNum(v) {
  return Number(typeof v === 'bigint' ? v : BigInt(v));
}

export function storageMassOk(k, inAmts, outAmts) {
  try {
    const m = k.calculateStorageMass('mainnet', inAmts.map(sompiNum), outAmts.map(sompiNum));
    if (m == null) return false;
    return m <= k.maximumStandardTransactionMass();
  } catch {
    return false;
  }
}

/** KIP-9: splitting a UTXO into two similar outputs (0.15 + 0.15 from 0.30) blows storage mass. */
export function planKasPayment(k, entries, amount, fee, opts = {}) {
  const exact = !!opts.exact;
  const need = amount + fee;
  const usable = (entries || []).filter(e => e.amount > 0n).sort((a, b) => (a.amount < b.amount ? 1 : -1));
  const totalAll = usable.reduce((a, e) => a + e.amount, 0n);
  if (totalAll < need) return null;

  const tries = [];
  for (const e of usable) if (e.amount >= need) tries.push([e]);
  let acc = [], sum = 0n;
  for (const e of usable) {
    acc.push(e); sum += e.amount;
    if (sum >= need) { tries.push([...acc]); break; }
  }
  acc = []; sum = 0n;
  for (const e of [...usable].reverse()) {
    acc.push(e); sum += e.amount;
    if (sum >= need) { tries.push([...acc]); break; }
  }
  if (usable.length) tries.unshift(usable);

  const dust = 200_000n;
  const seen = new Set();
  let absorb = null;
  for (const set of tries) {
    const key = set.map(e => `${e.outpoint.transactionId}:${e.outpoint.index}`).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const total = set.reduce((a, e) => a + e.amount, 0n);
    if (total < need) continue;
    const ins = set.map(e => e.amount);
    const change = total - amount - fee;
    if (change <= dust) {
      // Leftover becomes the fee. Dest stays `amount` — never fold leftover into the vault.
      if (storageMassOk(k, ins, [amount])) {
        return { entries: set, amount, fee: total - amount, change: 0n, boosted: false };
      }
    } else if (storageMassOk(k, ins, [amount, change])) {
      return { entries: set, amount, fee, change, boosted: false };
    }
    if (!exact) {
      const sendAll = total - fee;
      if (sendAll > 0n && storageMassOk(k, ins, [sendAll]) && !absorb) {
        absorb = { entries: set, amount: sendAll, fee, change: 0n, boosted: true };
      }
    }
  }
  return exact ? null : absorb;
}

async function nodeFeeRate(rpc) {
  try {
    const est = await rpc.getFeeEstimate();
    const bucket = est?.estimate?.priorityBucket || est?.estimate?.normalBuckets?.[0];
    const fr = Number(bucket?.feerate || 0);
    if (fr > 0) return Math.max(100, fr);
  } catch {}
  return 100;
}

function prepInputs(tx, { sigOpCount, computeBudget }) {
  for (const inp of tx.inputs) {
    const n = Number(inp.sigOpCount);
    if (!Number.isFinite(n) || n > 255) inp.sigOpCount = sigOpCount;
    inp.sigOpCount = sigOpCount;
    if (computeBudget != null) inp.computeBudget = computeBudget;
  }
}

function bindCovenantOutputs(k, tx, destStr) {
  const idxs = [];
  const outs = tx.outputs;
  for (let i = 0; i < outs.length; i++) {
    try {
      const a = k.addressFromScriptPublicKey(outs[i].scriptPublicKey, 'mainnet');
      if (String(a) === destStr) idxs.push(i);
    } catch {}
  }
  if (!idxs.length) idxs.push(0);
  tx.populateGenesisCovenants([new k.GenesisCovenantGroup(0, idxs)]);
  let covenantId = '';
  try { covenantId = String(tx.outputs[idxs[0]].covenant?.covenantId || ''); } catch {}
  if (!covenantId) {
    const cid = k.covenantId(tx.inputs[0].previousOutpoint, idxs.map(i => ({ index: i, output: tx.outputs[i] })));
    for (const i of idxs) tx.outputs[i].covenant = new k.CovenantBinding(0, cid);
    covenantId = String(cid);
  }
  return covenantId;
}

function signP2pkInputs(k, tx, priv) {
  const scripts = [];
  const n = tx.inputs.length;
  for (let i = 0; i < n; i++) {
    const sig = k.createInputSignature(tx, i, priv, k.SighashType.All);
    const hex = hexish(sig);
    if (!hex || hex.length < 20) throw new Error('Signing failed — empty P2PK signature');
    tx.inputs[i].signatureScript = hex;
    scripts.push(hex);
  }
  return scripts;
}

async function submitSignedRpc(k, rpc, url, tx, { sigOpCount, computeBudget, lockTime, scripts }) {
  const version = Number(tx.version || 1);
  // v1 forbids a non-zero sig_op_count; compute_budget carries the mass.
  const opCount = version >= 1 ? 0 : Number(sigOpCount ?? 1);
  const obj = toRpcTransaction(tx, {
    version,
    lockTime: lockTime != null ? Number(lockTime) : Number(tx.lockTime || 0),
    sigOpCount: opCount,
    computeBudget: version >= 1 ? Number(computeBudget ?? 10) : null
  });
  const live = tx.inputs;
  obj.inputs.forEach((inp, i) => {
    inp.signatureScript = hexish(scripts?.[i] || live[i].signatureScript);
    inp.sequence = Number(live[i].sequence ?? inp.sequence ?? 0);
    inp.sigOpCount = opCount;
    if (version >= 1) inp.computeBudget = Number(computeBudget ?? 10);
  });
  if (obj.inputs.some(inp => !inp.signatureScript || inp.signatureScript.length < 20)) {
    throw new Error('Refusing to broadcast — an input is missing its signature');
  }
  const plain = JSON.parse(JSON.stringify(obj));
  try {
    const txId = await submitRpcTx(rpc, url, plain);
    if (txId) return txId;
  } catch (e) {
    try {
      for (const inp of tx.inputs) {
        inp.sigOpCount = opCount;
        if (version >= 1) inp.computeBudget = Number(computeBudget ?? 10);
      }
      const submitted = await withTimeout(rpc.submitTransaction({ transaction: tx, allowOrphan: false }), 20000, 'Timed out broadcasting to ' + url);
      const txId = submitted?.transactionId || submitted || tx.id;
      if (txId) return txId;
    } catch {}
    throw e;
  }
  throw new Error('Node did not return a transaction id');
}

export async function sendKas({ wallet, dest, amountKas, utxos, exact = false }) {
  const k = await loadKaspaSdk();
  const requested = k.kaspaToSompi(String(amountKas));
  if (requested == null) throw new Error('Invalid amount');
  let entries = restUtxosToEntries(utxos, wallet.address);
  if (!entries.length) throw new Error('No UTXOs yet — receive KAS first');
  entries = [...entries].sort((a, b) => (a.amount < b.amount ? 1 : -1));

  const destStr = String(dest);
  const isCovenantDest = destStr.startsWith('kaspa:p');
  const { rpc, url } = await connectPublicNode();
  const feeRate = await nodeFeeRate(rpc);
  const feeGuess = 500_000n;
  let plan = planKasPayment(k, entries, requested, feeGuess, { exact });
  if (exact && plan?.boosted) plan = null;
  if (!plan) {
    const have = entries.reduce((a, e) => a + e.amount, 0n);
    if (exact) {
      if (have < requested + feeGuess) {
        throw new Error(`Need ${Number(requested + feeGuess) / 1e8} KAS (lock + fee), you have ${Number(have) / 1e8} KAS.`);
      }
      throw new Error(
        `Cannot lock exactly ${Number(requested) / 1e8} KAS from your UTXOs. ` +
        `Kaspa rejects a near-even split (storage mass). You have ${Number(have) / 1e8} KAS. ` +
        `Receive a bit more KAS first, or lock a different amount.`
      );
    }
    throw new Error(`Have ${Number(have) / 1e8} KAS in UTXOs but cannot place ${Number(requested) / 1e8} KAS without breaking storage-mass.`);
  }

  const amount = exact ? requested : plan.amount;
  const boosted = exact ? false : !!plan.boosted;
  let pendingList = [];
  let lastErr = '';

  // Exact vault locks must not go through createTransactions — it silently
  // absorbs leftover UTXOs into the destination when change is awkward.
  if (!exact) {
    try {
      const built = await k.createTransactions({
        entries: plan.entries,
        outputs: [{ address: destStr, amount }],
        changeAddress: wallet.address,
        priorityFee: 0n,
        feeRate,
        sigOpCount: 1,
        networkId: 'mainnet'
      });
      pendingList = built.transactions || [];
    } catch (e) {
      lastErr = errText(e);
    }
  }
  if (!pendingList.length) {
    const outputs = [{ address: destStr, amount }];
    if (plan.change > 0n) outputs.push({ address: wallet.address, amount: plan.change });
    const tx = k.createTransaction(plan.entries, outputs, 0n, undefined, 1);
    pendingList = [{ transaction: tx }];
  }

  const priv = new k.PrivateKey(wallet.privKey);
  let txId = null;
  let covenantId = null;
  let paidFee = 0n;
  let locked = amount;
  for (let p = 0; p < pendingList.length; p++) {
    const pending = pendingList[p];
    const tx = pending.transaction;
    tx.version = 1;
    prepInputs(tx, { sigOpCount: 0, computeBudget: 10 });
    const isFinal = p === pendingList.length - 1;
    const protect = (exact || (isCovenantDest && isFinal)) ? destOutputIndex(k, tx, destStr) : -1;
    if (isCovenantDest && isFinal) covenantId = bindCovenantOutputs(k, tx, destStr);
    try { k.updateTransactionMass('mainnet', tx); } catch {}
    let scripts = meetToccataFee(k, tx, priv, plan.entries, 0n, protect);
    if (exact) assertExactDest(k, tx, destStr, requested);
    try {
      txId = await submitSignedRpc(k, rpc, url, tx, {
        sigOpCount: 0,
        computeBudget: 10,
        lockTime: 0,
        scripts
      });
    } catch (e) {
      const need = requiredFeeFromError(e);
      const paid = txInputSum(tx, plan.entries) - txOutputSum(tx);
      if (need && need > paid) {
        shrinkOutputsForFee(tx, need - paid + 50_000n, protect);
        if (exact) assertExactDest(k, tx, destStr, requested);
        scripts = signP2pkInputs(k, tx, priv);
        txId = await submitSignedRpc(k, rpc, url, tx, {
          sigOpCount: 0,
          computeBudget: 10,
          lockTime: 0,
          scripts
        });
      } else {
        throw e;
      }
    }
    paidFee = txInputSum(tx, plan.entries) - txOutputSum(tx);
    if (protect >= 0) locked = BigInt(tx.outputs[protect].value);
  }
  if (!txId) throw new Error(lastErr || 'Node did not return a transaction id');
  return {
    txId,
    feeKas: Number(paidFee) / 1e8,
    node: url,
    covenantId,
    amountKas: Number(locked) / 1e8,
    boosted
  };
}

export async function reconstructTimelockRedeem(vault, pubkeyHex) {
  if (vault?.scriptHex) return vault.scriptHex;
  if (!vault?.unlockDaa || !pubkeyHex) return null;
  const k = await loadKaspaSdk();
  const sb = new k.ScriptBuilder();
  sb.addI64(BigInt(vault.unlockDaa));
  sb.addOp(k.Opcodes.OpCheckLockTimeVerify);
  sb.addOp(k.Opcodes.OpDrop);
  sb.addData(hexToBytes(pubkeyHex));
  sb.addOp(k.Opcodes.OpCheckSig);
  const redeem = sb.toString();
  const addr = String(k.addressFromScriptPublicKey(sb.createPayToScriptHashScript(), 'mainnet'));
  if (addr !== vault.address) return null;
  return redeem;
}

function redeemHasCltvDrop(redeemHex) {
  const h = hexish(redeemHex);
  if (h.length < 4) return false;
  const bytes = [];
  for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
  return bytes.includes(0xb0) && bytes.includes(0x75);
}

/**
 * Kaspa CLTV pops the locktime (Bitcoin does not). Our time-capsule redeem is
 * `<daa> CLTV DROP <pk> CHECKSIG`, so DROP would eat the signature unless
 * scriptSig is `<sig> <dummy> <redeem>`.
 */
export function p2shSpendScript(k, redeemHex, sigHex) {
  const sigPart = hexish(sigHex);
  if (!sigPart) throw new Error('Empty signature — cannot sweep');
  const redeemPush = hexish(k.payToScriptHashSignatureScript(redeemHex, new Uint8Array()));
  const pad = redeemHasCltvDrop(redeemHex) ? '00' : '';
  return sigPart + pad + redeemPush;
}

function signP2shInputs(k, tx, priv, redeemHex) {
  const scripts = [];
  const n = tx.inputs.length;
  for (let i = 0; i < n; i++) {
    const sig = k.createInputSignature(tx, i, priv, k.SighashType.All);
    const script = p2shSpendScript(k, redeemHex, sig);
    tx.inputs[i].signatureScript = script;
    scripts.push(script);
  }
  return scripts;
}

async function submitRpcTx(rpc, url, obj) {
  const submitted = await withTimeout(
    rpc.submitTransaction({ transaction: obj, allowOrphan: false }),
    20000,
    'Timed out sweeping via ' + url
  );
  return submitted?.transactionId || submitted || null;
}

function toccataMinFee(k, tx, floor = 0n) {
  // Fee is 100 sompi * compute mass. calculateTransactionMass is max(compute, storage);
  // multiplying storage mass by 100 asks for absurd fees (e.g. 0.24 KAS) and blocks a 0.15 lock.
  let need = 0n;
  try {
    const f = k.calculateTransactionFee('mainnet', tx, 1);
    if (f != null) need = BigInt(f);
  } catch {}
  if (need < 400_000n) need = 400_000n;
  if (need < floor) need = floor;
  if (need > 2_000_000n) need = 2_000_000n;
  return need + 50_000n;
}

function txOutputSum(tx) {
  return [...tx.outputs].reduce((a, o) => a + BigInt(o.value), 0n);
}

function txInputSum(tx, entries) {
  let s = 0n;
  for (const inp of tx.inputs) {
    try {
      const a = inp.utxo?.amount;
      if (a != null) s += BigInt(a);
    } catch {}
  }
  if (s > 0n) return s;
  return (entries || []).reduce((a, e) => a + BigInt(e.amount), 0n);
}

function shrinkOutputsForFee(tx, extra, protectIndex = -1) {
  const outs = tx.outputs;
  for (let i = outs.length - 1; i >= 0; i--) {
    if (i === protectIndex) continue;
    const v = BigInt(outs[i].value);
    if (v > extra + 10_000n) {
      outs[i].value = v - extra;
      return;
    }
  }
  throw new Error('Not enough leftover to cover the network fee');
}

function destOutputIndex(k, tx, destStr) {
  const outs = tx.outputs;
  for (let i = 0; i < outs.length; i++) {
    try {
      const a = String(k.addressFromScriptPublicKey(outs[i].scriptPublicKey, 'mainnet'));
      if (a === destStr) return i;
    } catch {}
  }
  return 0;
}

function assertExactDest(k, tx, destStr, requested) {
  const got = BigInt(tx.outputs[destOutputIndex(k, tx, destStr)].value);
  if (got !== requested) {
    throw new Error(
      `Aborted: capsule would have received ${Number(got) / 1e8} KAS instead of the ${Number(requested) / 1e8} KAS you asked to lock.`
    );
  }
}

function meetToccataFee(k, tx, priv, entries, floor = 0n, protectIndex = -1) {
  let scripts = signP2pkInputs(k, tx, priv);
  for (let round = 0; round < 3; round++) {
    const need = toccataMinFee(k, tx, floor);
    const paid = txInputSum(tx, entries) - txOutputSum(tx);
    if (paid >= need) return scripts;
    shrinkOutputsForFee(tx, need - paid, protectIndex);
    scripts = signP2pkInputs(k, tx, priv);
  }
  return scripts;
}

function requiredFeeFromError(e) {
  const m = errText(e).match(/required amount of (\d+)/i);
  return m ? BigInt(m[1]) : null;
}

export async function sweepVault({ wallet, vault, utxos }) {
  const k = await loadKaspaSdk();
  const redeemHex = vault?.scriptHex || await reconstructTimelockRedeem(vault, wallet.pubKey);
  if (!redeemHex) throw new Error('This vault has no redeem script saved — cannot sweep');
  vault = { ...vault, scriptHex: redeemHex };
  const entries = restUtxosToEntries(utxos, vault.address);
  if (!entries.length) throw new Error('No coins at this vault address');
  const total = entries.reduce((a, e) => a + e.amount, 0n);
  const daaNow = await currentDaa();
  const unlock = Number(vault.unlockDaa || 0);
  if (unlock && daaNow < unlock) {
    const waitSec = Math.ceil((unlock - daaNow) / 10);
    throw new Error(`Still time-locked. Unlock DAA ${unlock}, now ${daaNow}. Wait ~${waitSec}s then Sweep.`);
  }

  const lockTime = Math.max(unlock || 0, daaNow);
  const priv = new k.PrivateKey(wallet.privKey);
  const { rpc, url } = await connectPublicNode();

  function assemble(fee) {
    if (total <= fee) throw new Error('Vault balance is too small to cover the network fee');
    const sendAmt = total - fee;
    const tx = k.createTransaction(
      entries,
      [{ address: wallet.address, amount: sendAmt }],
      0n,
      undefined,
      1
    );
    tx.version = 1;
    tx.lockTime = BigInt(lockTime);
    for (const inp of tx.inputs) {
      inp.sequence = 0n;
      inp.sigOpCount = 0;
      inp.computeBudget = 60;
    }
    const scripts = signP2shInputs(k, tx, priv, redeemHex);
    for (const inp of tx.inputs) {
      inp.sigOpCount = 0;
      inp.computeBudget = 60;
    }
    try { k.updateTransactionMass('mainnet', tx); } catch {}
    return { tx, sendAmt, fee, scripts };
  }

  let fee = 450_000n;
  let built = assemble(fee);
  const measured = toccataMinFee(k, built.tx, 400_000n);
  if (measured > fee) {
    fee = measured;
    built = assemble(fee);
  }

  let lastErr = 'Sweep broadcast failed';
  for (let i = 0; i < 4; i++) {
    try {
      const txId = await submitSignedRpc(k, rpc, url, built.tx, {
        sigOpCount: 0,
        computeBudget: 60,
        lockTime,
        scripts: built.scripts
      });
      if (txId) return { txId, amountKas: Number(built.sendAmt) / 1e8, node: url, feeKas: Number(built.fee) / 1e8 };
    } catch (e) {
      lastErr = errText(e);
      const need = requiredFeeFromError(e);
      if (need && need > built.fee) {
        fee = need + need / 10n;
        built = assemble(fee);
        continue;
      }
      throw e;
    }
  }
  throw new Error(lastErr);
}

export async function compoundUtxos({ wallet, utxos }) {
  const k = await loadKaspaSdk();
  let entries = restUtxosToEntries(utxos, wallet.address);
  if (entries.length < 2) throw new Error('Already one UTXO — nothing to compound');
  entries = [...entries].sort((a, b) => (a.amount < b.amount ? 1 : -1));
  const total = entries.reduce((a, e) => a + e.amount, 0n);
  const { rpc, url } = await connectPublicNode();
  const feeRate = await nodeFeeRate(rpc);
  const feeGuess = BigInt(Math.min(2_000_000, 450_000 + entries.length * 15_000));
  if (total <= feeGuess + 10_000n) throw new Error('Balance too small to cover the compound fee');

  let pendingList = [];
  let lastErr = '';
  try {
    const built = await k.createTransactions({
      entries,
      outputs: [{ address: wallet.address, amount: total - feeGuess }],
      changeAddress: wallet.address,
      priorityFee: 0n,
      feeRate,
      sigOpCount: 1,
      networkId: 'mainnet'
    });
    pendingList = built.transactions || [];
  } catch (e) {
    lastErr = errText(e);
  }
  if (!pendingList.length) {
    const tx = k.createTransaction(
      entries,
      [{ address: wallet.address, amount: total - feeGuess }],
      0n,
      undefined,
      1
    );
    pendingList = [{ transaction: tx }];
  }

  const priv = new k.PrivateKey(wallet.privKey);
  let txId = null;
  let paidFee = 0n;
  let kept = 0n;
  for (let p = 0; p < pendingList.length; p++) {
    const tx = pendingList[p].transaction;
    tx.version = 1;
    prepInputs(tx, { sigOpCount: 0, computeBudget: 10 });
    try { k.updateTransactionMass('mainnet', tx); } catch {}
    let scripts = meetToccataFee(k, tx, priv, entries, 0n, -1);
    try {
      txId = await submitSignedRpc(k, rpc, url, tx, {
        sigOpCount: 0,
        computeBudget: 10,
        lockTime: 0,
        scripts
      });
    } catch (e) {
      const need = requiredFeeFromError(e);
      const paid = txInputSum(tx, entries) - txOutputSum(tx);
      if (need && need > paid) {
        shrinkOutputsForFee(tx, need - paid + 50_000n, -1);
        scripts = signP2pkInputs(k, tx, priv);
        txId = await submitSignedRpc(k, rpc, url, tx, {
          sigOpCount: 0,
          computeBudget: 10,
          lockTime: 0,
          scripts
        });
      } else {
        throw e;
      }
    }
    paidFee = txInputSum(tx, entries) - txOutputSum(tx);
    kept = txOutputSum(tx);
  }
  if (!txId) throw new Error(lastErr || 'Compound broadcast failed');
  return {
    txId,
    feeKas: Number(paidFee) / 1e8,
    amountKas: Number(kept) / 1e8,
    inputs: entries.length,
    txs: pendingList.length,
    node: url
  };
}

export async function fetchAddressUtxos(address) {
  const res = await fetch(`${API}/addresses/${encodeURIComponent(address)}/utxos`);
  if (!res.ok) throw new Error('UTXO fetch failed');
  return res.json();
}

export async function fetchAddressBalance(address) {
  const res = await fetch(`${API}/addresses/${encodeURIComponent(address)}/balance`);
  if (!res.ok) throw new Error('Balance fetch failed');
  const data = await res.json();
  return Number(data.balance ?? data ?? 0);
}
