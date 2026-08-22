/* Official rusty-kaspa WASM: P2SH covenants + signed send/fund. */
import {
  hexToBytes, kaspaAddressFromScriptHash, validateKaspaAddress,
  validateAndCleanUtxo, deepCloneAndFreeze, kasToSompi,
  kaspaRestBase, networkId
} from './crypto.js?v=90';
import { kaswareSigning, sendKaspaWithKasware, sendKrc20WithKasware } from './kasware.js?v=93';

function API() { return kaspaRestBase(); }

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
    throw new Error('Kaspa engine failed to load: ' + netFail('Kaspa WASM', e));
  }
}

function restUtxosToEntries(utxos, address) {
  const list = Array.isArray(utxos) ? utxos : [];
  return list.map(u => {
    const c = validateAndCleanUtxo(u);
    if (!c) return null;
    return { address, ...c };
  }).filter(Boolean);
}

function errText(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.message || e.toString?.() || String(e);
}

function netFail(label, e) {
  const m = errText(e);
  if (/abort/i.test(m)) return label + ' timed out — tap Send now again';
  if (/failed to fetch|networkerror|load failed|network request/i.test(m)) {
    return 'Could not reach ' + label + '. Check the network and tap Send now again.';
  }
  return m;
}

async function fetchJsonRetry(url, { tries = 3, timeout = 14000, label = 'Network' } = {}) {
  let last = 'Could not reach ' + label;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) {
        last = label + ' HTTP ' + res.status;
        if (res.status >= 500 || res.status === 429) {
          await sleep(400 * (i + 1));
          continue;
        }
        throw new Error(last);
      }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      last = netFail(label, e);
      if (i + 1 < tries) await sleep(400 * (i + 1));
    }
  }
  throw new Error(last);
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
  const res = await fetch(`${API()}/info/blockdag`);
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

function versionedSpk(scriptHex) {
  const s = hexToBytes(hexish(scriptHex));
  const out = new Uint8Array(2 + s.length);
  out[0] = 0;
  out[1] = 0;
  out.set(s, 2);
  return out;
}

function finishP2sh(k, sb, extra = {}) {
  const redeemHex = sb.toString();
  const p2sh = sb.createPayToScriptHashScript();
  const addr = k.addressFromScriptPublicKey(p2sh, 'mainnet');
  if (!addr) throw new Error('SDK did not produce a P2SH address');
  return { address: String(addr), redeemHex, spkHex: hexish(p2sh.script), ...extra };
}

function spkHexFromAddr(k, addr) {
  const spk = k.payToAddressScript(addr);
  return hexish(spk.script);
}

/** Same IF/ELSE + OpTxOutputAmount/Spk tail as covenants/sentinel (Schnorr CHECKSIG in place of XMSS). */
function buildEpochRedeem(k, { ownerPubHex, unlockDaa, nextSpkHex, nextAmt, destSpkHex, destAmt }) {
  const sb = new k.ScriptBuilder();
  sb.addOp(k.Opcodes.OpIf);
  sb.addData(hexToBytes(ownerPubHex));
  sb.addOp(k.Opcodes.OpCheckSigVerify);
  sb.addData(versionedSpk(nextSpkHex));
  sb.addI64(BigInt(nextAmt));
  sb.addOp(k.Opcodes.OpElse);
  sb.addI64(BigInt(unlockDaa));
  sb.addOp(k.Opcodes.OpCheckLockTimeVerify);
  sb.addData(versionedSpk(destSpkHex));
  sb.addI64(BigInt(destAmt));
  sb.addOp(k.Opcodes.OpEndif);
  sb.addI64(0n);
  sb.addOp(k.Opcodes.OpTxOutputAmount);
  sb.addOp(k.Opcodes.OpEqualVerify);
  sb.addI64(0n);
  sb.addOp(k.Opcodes.OpTxOutputSpk);
  sb.addOp(k.Opcodes.OpEqual);
  return finishP2sh(k, sb, { unlockDaa, nextAmt: String(nextAmt), destAmt: String(destAmt) });
}

const HOP_FEE = 1_000_000n;

export async function buildSentinelChain({
  ownerPubHex, beneficiaryAddr, timeoutMinutes, hops: nHops = 6, depositSompi, extraStep = 0n
}) {
  const k = await loadKaspaSdk();
  const n = Math.max(2, Math.min(8, Number(nHops) || 6));
  const deposit = BigInt(depositSompi);
  const step = HOP_FEE + BigInt(extraStep || 0);
  if (deposit < step * BigInt(n) + HOP_FEE + 200_000n) {
    throw new Error(`Need at least ${Number(step * BigInt(n) + HOP_FEE + 200_000n) / 1e8} KAS so each hop can pay the network fee`);
  }
  const daaNow = await currentDaa();
  const window = Math.max(10, Math.round(Number(timeoutMinutes) * 60 * 10));
  const destSpk = spkHexFromAddr(k, beneficiaryAddr);
  const values = [];
  for (let i = 0; i < n; i++) values.push(deposit - step * BigInt(i));
  const hops = new Array(n);
  let nextSpk = destSpk;
  let nextAmt = values[n - 1] - HOP_FEE;
  for (let i = n - 1; i >= 0; i--) {
    const unlockDaa = daaNow + (i + 1) * window;
    const destAmt = values[i] - HOP_FEE;
    const hopNextAmt = i === n - 1 ? destAmt : values[i + 1];
    const hopNextSpk = i === n - 1 ? destSpk : nextSpk;
    const hop = buildEpochRedeem(k, {
      ownerPubHex,
      unlockDaa,
      nextSpkHex: hopNextSpk,
      nextAmt: hopNextAmt,
      destSpkHex: destSpk,
      destAmt
    });
    hops[i] = {
      ...hop,
      hopIndex: i,
      value: String(values[i]),
      nextAmt: String(hopNextAmt),
      destAmt: String(destAmt),
      nextAddress: i === n - 1 ? beneficiaryAddr : ''
    };
    nextSpk = hop.spkHex;
  }
  for (let i = 0; i < n - 1; i++) hops[i].nextAddress = hops[i + 1].address;
  return {
    type: 'sentinel',
    hops,
    hopIndex: 0,
    address: hops[0].address,
    redeemHex: hops[0].redeemHex,
    spkHex: hops[0].spkHex,
    unlockDaa: hops[0].unlockDaa,
    daaNow,
    windowDaa: window
  };
}

export async function buildRecurringChain({
  ownerPubHex, ownerAddr, payeeAddr, paySompi, periods = 4, timeoutMinutes, depositSompi
}) {
  const pay = BigInt(paySompi);
  const n = Math.max(2, Math.min(8, Number(periods) || 4));
  const deposit = BigInt(depositSompi);
  const need = (pay + HOP_FEE) * BigInt(n) + 200_000n;
  if (deposit < need) {
    throw new Error(`Need at least ${Number(need) / 1e8} KAS (${n} × payment + hop fees)`);
  }
  const chain = await buildSentinelChain({
    ownerPubHex,
    beneficiaryAddr: ownerAddr,
    timeoutMinutes,
    hops: n,
    depositSompi: deposit,
    extraStep: pay
  });
  return { ...chain, type: 'recurring', paySompi: String(pay), payeeAddr };
}

export async function buildHashlockCovenant({
  senderPubHex, receiverPubHex, secretHashHex, minutes
}) {
  const k = await loadKaspaSdk();
  const daaNow = await currentDaa();
  const unlockDaa = daaNow + Math.max(10, Math.round(Number(minutes) * 60 * 10));
  const hash = hexToBytes(secretHashHex);
  if (hash.length !== 32) throw new Error('Hash lock needs a 32-byte SHA-256');
  const sb = new k.ScriptBuilder();
  sb.addOp(k.Opcodes.OpIf);
  sb.addOp(k.Opcodes.OpSHA256);
  sb.addData(hash);
  sb.addOp(k.Opcodes.OpEqualVerify);
  sb.addData(hexToBytes(receiverPubHex));
  sb.addOp(k.Opcodes.OpCheckSig);
  sb.addOp(k.Opcodes.OpElse);
  sb.addI64(BigInt(unlockDaa));
  sb.addOp(k.Opcodes.OpCheckLockTimeVerify);
  sb.addOp(k.Opcodes.OpDrop);
  sb.addData(hexToBytes(senderPubHex));
  sb.addOp(k.Opcodes.OpCheckSig);
  sb.addOp(k.Opcodes.OpEndif);
  return finishP2sh(k, sb, { unlockDaa, daaNow, type: 'hashlock', secretHashHex });
}

async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return hexish(new Uint8Array(buf));
}

export async function newHashlockSecret() {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const secretHex = hexish(secret);
  return { secretHex, secretHashHex: await sha256Hex(secret) };
}

/** Same P2SH wrap as covenants/xmsslock/deploy_xmss_generic.mjs */
export async function p2shFromRedeemHex(redeemHex) {
  const k = await loadKaspaSdk();
  const hex = hexish(redeemHex);
  if (!hex || hex.length < 40) throw new Error('Redeem script is too short');
  const sb = k.ScriptBuilder.fromScript(hexToBytes(hex));
  const p2sh = sb.createPayToScriptHashScript();
  const addr = k.addressFromScriptPublicKey(p2sh, 'mainnet');
  if (!addr) throw new Error('SDK did not produce a P2SH address');
  return {
    address: String(addr),
    redeemHex: hex,
    spkHex: hexish(p2sh.script),
    scriptBytes: hex.length / 2,
    type: 'xmss'
  };
}

export function parseXmssKit(raw) {
  const t = String(raw || '').trim();
  if (!t) throw new Error('Paste the PUBLIC kit from xmss_keygen.py');
  if (t.startsWith('{') || t.startsWith('[')) {
    let obj;
    try { obj = JSON.parse(t); } catch { throw new Error('That JSON is not valid'); }
    if (obj?.sec_seed_hex) {
      throw new Error('That is a PRIVATE key file. Never paste it here. Use the .public.json kit.');
    }
    const redeem = obj.redeem_script_hex || obj.redeemScriptHex || obj.scriptHex || obj.script_hex || '';
    if (!redeem) throw new Error('No redeem_script_hex in this JSON. Use the public kit.');
    return {
      redeemHex: hexish(redeem),
      height: obj.height || null,
      masterRoot: obj.master_root_hex || obj.masterRootHex || '',
      scriptBytes: obj.script_bytes || hexish(redeem).length / 2
    };
  }
  const hex = t.replace(/\s+/g, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0 || hex.length < 200) {
    throw new Error('Paste public kit JSON, or a long redeem-script hex');
  }
  return { redeemHex: hex, height: null, masterRoot: '', scriptBytes: hex.length / 2 };
}

export function parseXmssWitness(raw) {
  const t = String(raw || '').trim();
  if (!t) throw new Error('Paste the witness JSON from xmss_sign.py');
  let obj;
  try { obj = JSON.parse(t); } catch { throw new Error('Witness must be JSON from xmss_sign.py'); }
  const list = Array.isArray(obj) ? obj
    : Array.isArray(obj.witness_hex) ? obj.witness_hex
    : Array.isArray(obj.witnessHex) ? obj.witnessHex
    : null;
  if (!list?.length) throw new Error('Witness JSON needs a witness_hex array');
  return list.map(h => hexish(h)).filter(Boolean);
}

function pushHex(dataHex) {
  const b = hexToBytes(hexish(dataHex));
  const n = b.length;
  let hdr;
  if (n <= 75) hdr = [n];
  else if (n <= 255) hdr = [0x4c, n];
  else if (n <= 65535) hdr = [0x4d, n & 0xff, (n >> 8) & 0xff];
  else hdr = [0x4e, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  return hexish(new Uint8Array(hdr)) + hexish(b);
}

export function assembleXmssScriptSig(redeemHex, witnessHexes) {
  return (witnessHexes || []).map(h => pushHex(h)).join('') + pushHex(redeemHex);
}

/** Two-input spend: XMSS covenant + Schnorr fee UTXO. Matches spend_xmss_generic.mjs. */
export async function spendXmssVault({ wallet, vault, utxos, feeUtxos, witness, dest }) {
  const k = await loadKaspaSdk();
  const redeemHex = vault?.scriptHex;
  if (!redeemHex) throw new Error('This Quantum Vault has no redeem script');
  const parts = parseXmssWitness(typeof witness === 'string' ? witness : JSON.stringify(witness));
  const cov = restUtxosToEntries(utxos, vault.address);
  if (!cov.length) throw new Error('No coins at this Quantum Vault yet');
  const covAmt = cov.reduce((a, e) => a + e.amount, 0n);
  const fees = restUtxosToEntries(feeUtxos || [], wallet.address)
    .map(e => ({ ...e, privKey: e.privKey || wallet.privKey }))
    .sort((a, b) => (a.amount < b.amount ? 1 : -1));
  const FEE = 32_000_000n;
  const feeEntry = fees.find(e => e.amount >= FEE + 10_000n);
  if (!feeEntry) {
    throw new Error('XMSS spend needs about 0.32 KAS in this wallet for the network fee (the script is large). Receive a bit more KAS first.');
  }
  const destAddr = dest || wallet.address;
  const outAmt = covAmt + feeEntry.amount - FEE;
  if (outAmt <= 0n) throw new Error('Not enough to cover the XMSS spend fee');
  const { rpc, url } = await connectPublicNode();
  const tx = k.createTransaction(
    [...cov, feeEntry],
    [{ address: destAddr, amount: outAmt }],
    0n,
    undefined,
    1
  );
  tx.version = 1;
  const xmssScript = assembleXmssScriptSig(redeemHex, parts);
  tx.inputs[0].signatureScript = xmssScript;
  tx.inputs[0].sigOpCount = 0;
  tx.inputs[0].computeBudget = 1400;
  tx.inputs[0].sequence = 0n;
  const priv = new k.PrivateKey(feeEntry.privKey || wallet.privKey);
  const feeSig = hexish(k.createInputSignature(tx, 1, priv, k.SighashType.All));
  tx.inputs[1].signatureScript = feeSig;
  tx.inputs[1].sigOpCount = 0;
  tx.inputs[1].computeBudget = 10;
  tx.inputs[1].sequence = 0n;
  try { k.updateTransactionMass('mainnet', tx); } catch {}
  const txId = await submitSignedRpc(k, rpc, url, tx, {
    sigOpCount: 0,
    computeBudget: 1400,
    lockTime: 0,
    scripts: [xmssScript, feeSig]
  });
  return {
    txId,
    amountKas: Number(outAmt) / 1e8,
    feeKas: Number(FEE) / 1e8,
    node: url
  };
}

/* Same public nodes this repo uses in covenants/* deploy/spend scripts. */
const PUBLIC_WRPC = {
  mainnet: [
    'wss://ivy.kaspa.green/kaspa/mainnet/wrpc/borsh',
    'wss://dina.kaspa.green/kaspa/mainnet/wrpc/borsh',
    'wss://kaspa.aspectron.org:443/kaspa/mainnet/wrpc/borsh',
    'wss://mainnet.kaspa.ws/kaspa/mainnet/wrpc/borsh'
  ],
  'testnet-10': [
    'wss://kaspa.aspectron.org:443/kaspa/testnet-10/wrpc/borsh',
    'wss://tn10.kaspa.ws/kaspa/testnet-10/wrpc/borsh'
  ]
};

let _rpc = null;
let _rpcUrl = null;
let _rpcNet = null;

export async function disconnectRpc() {
  if (!_rpc) return;
  try { await _rpc.disconnect(); } catch {}
  _rpc = null;
  _rpcUrl = null;
  _rpcNet = null;
}

export async function connectPublicNode() {
  const k = await loadKaspaSdk();
  const net = networkId();
  if (_rpc && _rpc.isConnected && _rpcNet === net) return { rpc: _rpc, url: _rpcUrl, reused: true };
  if (_rpc) await disconnectRpc();

  const encoding = k.Encoding.Borsh;
  const urls = [];
  try {
    const resolver = new k.Resolver();
    const resolved = await withTimeout(resolver.getUrl(encoding, net), 6000, 'resolver timeout');
    if (resolved) urls.push(String(resolved));
  } catch {}
  for (const u of (PUBLIC_WRPC[net] || PUBLIC_WRPC.mainnet)) if (!urls.includes(u)) urls.push(u);

  let last = 'no public node responded';
  for (const url of urls) {
    let rpc = null;
    try {
      rpc = new k.RpcClient({ url, encoding, networkId: net });
      await withTimeout(rpc.connect(), 10000, 'connect timeout');
      const info = await withTimeout(rpc.getServerInfo(), 8000, 'getServerInfo timeout');
      if (!info) throw new Error('empty server info');
      _rpc = rpc;
      _rpcUrl = url;
      _rpcNet = net;
      return { rpc, url, info, reused: false };
    } catch (e) {
      last = `${url} → ${errText(e)}`;
      try { if (rpc) await rpc.disconnect(); } catch {}
    }
  }
  throw new Error('Could not reach a public Kaspa node (' + net + '). Last: ' + last);
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

function isOrphanError(e) {
  return /orphan/i.test(errText(e));
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

function privForInput(k, tx, i, fallbackPriv, entries) {
  try {
    const prev = tx.inputs[i].previousOutpoint;
    const id = String(prev.transactionId);
    const idx = Number(prev.index);
    const hit = (entries || []).find(e =>
      e.outpoint && String(e.outpoint.transactionId) === id && Number(e.outpoint.index) === idx
    );
    if (hit?.privKey) return new k.PrivateKey(hit.privKey);
  } catch {}
  return fallbackPriv;
}

function signP2pkInputs(k, tx, priv, entries) {
  return signWalletInputs(k, tx, priv, entries);
}

function findEntryForInput(tx, i, entries) {
  try {
    const prev = tx.inputs[i].previousOutpoint;
    const id = String(prev.transactionId);
    const idx = Number(prev.index);
    return (entries || []).find(e =>
      e.outpoint && String(e.outpoint.transactionId) === id && Number(e.outpoint.index) === idx
    ) || null;
  } catch {
    return null;
  }
}

function signWalletInputs(k, tx, priv, entries) {
  const scripts = [];
  const n = tx.inputs.length;
  for (let i = 0; i < n; i++) {
    const hit = findEntryForInput(tx, i, entries);
    const use = hit?.privKey ? new k.PrivateKey(hit.privKey) : privForInput(k, tx, i, priv, entries);
    const sig = hexish(k.createInputSignature(tx, i, use, k.SighashType.All));
    if (!sig || sig.length < 20) throw new Error('Signing failed — empty signature');
    if (hit?.redeemHex) {
      const script = p2shWitness(k, hit.redeemHex, { sigs: [sig], flag: null });
      tx.inputs[i].signatureScript = script;
      scripts.push(script);
    } else {
      tx.inputs[i].signatureScript = sig;
      scripts.push(sig);
    }
  }
  return scripts;
}

function assertSimpleSendOutputs(k, tx, destStr, changeAddr, isFinal = true) {
  const outs = [...tx.outputs];
  if (outs.length < 1 || outs.length > 2) {
    throw new Error('Refusing to sign: send must have 1 or 2 outputs (recipient and change)');
  }
  const addrs = [];
  for (const o of outs) {
    if (BigInt(o.value) <= 0n) throw new Error('Refusing to sign: non-positive output');
    let a = '';
    try { a = String(k.addressFromScriptPublicKey(o.scriptPublicKey, 'mainnet')); } catch {}
    if (!a) throw new Error('Refusing to sign: output address could not be decoded');
    addrs.push(a);
  }
  if (!isFinal) {
    for (const a of addrs) {
      if (a !== changeAddr) throw new Error('Refusing to sign: intermediate output is not change');
    }
    return;
  }
  const allowed = new Set([destStr, changeAddr]);
  for (const a of addrs) {
    if (!allowed.has(a)) throw new Error('Refusing to sign: unauthorized output to ' + a);
  }
  if (!addrs.includes(destStr)) throw new Error('Refusing to sign: missing recipient output');
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
    if (version >= 1) inp.computeBudget = Number(live[i].computeBudget ?? computeBudget ?? 10);
  });
  if (obj.inputs.some(inp => !inp.signatureScript || inp.signatureScript.length < 20)) {
    throw new Error('Refusing to broadcast — an input is missing its signature');
  }
  const plain = JSON.parse(JSON.stringify(obj));
  try {
    const txId = await submitRpcTx(rpc, url, plain, false);
    if (txId) return txId;
  } catch (e) {
    try {
      for (const inp of tx.inputs) {
        inp.sigOpCount = opCount;
        if (version >= 1) inp.computeBudget = Number(inp.computeBudget ?? computeBudget ?? 10);
      }
      let last = e;
      for (let i = 0; i < 4; i++) {
        try {
          const submitted = await withTimeout(
            rpc.submitTransaction({ transaction: tx, allowOrphan: i > 0 || isOrphanError(last) }),
            20000,
            'Timed out broadcasting to ' + url
          );
          const txId = submitted?.transactionId || submitted || tx.id;
          if (txId) return txId;
        } catch (e2) {
          last = e2;
          if (isOrphanError(e2) && i < 3) {
            await sleep(1000 * (i + 1));
            continue;
          }
        }
      }
    } catch {}
    throw e;
  }
  throw new Error('Node did not return a transaction id');
}

function nodeEntryToUtxo(e, fallbackAddress) {
  const cleaned = validateAndCleanUtxo(e);
  if (!cleaned) return null;
  return { address: String(e.address || fallbackAddress || ''), ...cleaned };
}

async function fetchNodeUtxos(rpc, address) {
  const res = await rpc.getUtxosByAddresses({ addresses: [address] });
  const entries = res?.entries || [];
  return [...entries].map(e => nodeEntryToUtxo(e, address)).filter(Boolean);
}

async function fetchNodeUtxosMany(rpc, addresses) {
  const addrs = [...new Set((addresses || []).filter(Boolean))];
  if (!addrs.length) return [];
  const res = await rpc.getUtxosByAddresses({ addresses: addrs });
  const entries = res?.entries || [];
  return [...entries].map(e => nodeEntryToUtxo(e, '')).filter(Boolean);
}

async function waitFreshNodeUtxos(rpc, address, spentKeys, needSompi, onStatus) {
  const start = Date.now();
  let last = [];
  while (Date.now() - start < 28000) {
    try {
      const all = await fetchNodeUtxos(rpc, address);
      const fresh = all.filter(e => !spentKeys.has(`${e.outpoint.transactionId}:${e.outpoint.index}`));
      const sum = fresh.reduce((a, e) => a + e.amount, 0n);
      if (fresh.length && sum >= needSompi) return fresh;
      last = fresh;
    } catch {}
    onStatus?.('Waiting for the Time Capsule fund to land on the node…');
    await sleep(800);
  }
  if (last.length) return last;
  throw new Error('Capsule 0.2 KAS is funded, but the node has not shown change yet. Wait 10 seconds and tap Freeze again.');
}

export async function sendKas({ wallet, dest, amountKas, utxos, exact = false }) {
  if (kaswareSigning(wallet)) {
    return sendKaspaWithKasware(dest, amountKas);
  }
  const k = await loadKaspaSdk();
  const destCheck = validateKaspaAddress(String(dest || ''), networkId());
  if (!destCheck.isValid) throw new Error(destCheck.error || 'Invalid destination address');
  let requested;
  try {
    requested = kasToSompi(amountKas);
  } catch {
    requested = k.kaspaToSompi(String(amountKas));
  }
  if (requested == null) throw new Error('Invalid amount');
  const intent = deepCloneAndFreeze({
    dest: String(dest).trim(),
    amountSompi: String(requested),
    change: wallet.address,
    network: 'mainnet',
    exact: !!exact
  });
  let entries;
  if (wallet?.receiveAddrs?.length > 1 && !(utxos && utxos.length && utxos[0]?.privKey)) {
    entries = await fetchOwnedUtxos(wallet);
  } else {
    entries = restUtxosToEntries(utxos || [], wallet.address)
      .map(e => ({ ...e, privKey: e.privKey || wallet.privKey, redeemHex: e.redeemHex || '' }));
  }
  if (!entries.length) throw new Error('No UTXOs yet — receive KAS first');
  entries = [...entries].sort((a, b) => (a.amount < b.amount ? 1 : -1));

  const destStr = intent.dest;
  const changeAddr = intent.change;
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
        changeAddress: changeAddr,
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
    if (plan.change > 0n) outputs.push({ address: changeAddr, amount: plan.change });
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
    const isFinal = p === pendingList.length - 1;
    const p2shBudget = plan.entries.some(e => e.redeemHex) ? 40 : 10;
    prepInputs(tx, { sigOpCount: 0, computeBudget: p2shBudget });
    const protect = (exact || (isCovenantDest && isFinal)) ? destOutputIndex(k, tx, destStr) : -1;
    if (isCovenantDest && isFinal) covenantId = bindCovenantOutputs(k, tx, destStr);
    try { k.updateTransactionMass('mainnet', tx); } catch {}
    assertSimpleSendOutputs(k, tx, destStr, changeAddr, isFinal);
    let scripts = meetToccataFee(k, tx, priv, plan.entries, 0n, protect);
    if (exact) assertExactDest(k, tx, destStr, requested);
    try {
      txId = await submitSignedRpc(k, rpc, url, tx, {
        sigOpCount: 0,
        computeBudget: p2shBudget,
        lockTime: 0,
        scripts
      });
    } catch (e) {
      const need = requiredFeeFromError(e);
      const paid = txInputSum(tx, plan.entries) - txOutputSum(tx);
      if (need && need > paid) {
        shrinkOutputsForFee(tx, need - paid + 50_000n, protect);
        if (exact) assertExactDest(k, tx, destStr, requested);
        assertSimpleSendOutputs(k, tx, destStr, changeAddr, isFinal);
        scripts = signWalletInputs(k, tx, priv, plan.entries);
        txId = await submitSignedRpc(k, rpc, url, tx, {
          sigOpCount: 0,
          computeBudget: p2shBudget,
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
 * Kaspa CLTV pops the locktime (Bitcoin does not). Time-capsule redeem is
 * `<daa> CLTV DROP <pk> CHECKSIG`, so scriptSig is `<sig> <dummy> <redeem>`.
 * Escrow IF/ELSE needs `<sig> <1|0> <redeem>`. 2-of-2 is `<sigOther> <sigOwner> <redeem>`.
 */
export function p2shSpendScript(k, redeemHex, sigHex) {
  return p2shWitness(k, redeemHex, { sigs: [sigHex], flag: redeemHasCltvDrop(redeemHex) ? 'false' : null });
}

function p2shWitness(k, redeemHex, { sigs, flag, extra }) {
  const parts = (sigs || []).map(hexish).filter(Boolean);
  if (extra) {
    const push = hexish(new k.ScriptBuilder().addData(hexToBytes(hexish(extra))).toString());
    if (push) parts.push(push);
  }
  if (flag === 'true') parts.push('51');
  else if (flag === 'false' || (flag == null && redeemHasCltvDrop(redeemHex))) parts.push('00');
  if (!parts.length) throw new Error('Empty signature — cannot sweep');
  const redeemPush = hexish(k.payToScriptHashSignatureScript(redeemHex, new Uint8Array()));
  return parts.join('') + redeemPush;
}

function signP2shInputs(k, tx, priv, redeemHex, opts = {}) {
  const scripts = [];
  const n = tx.inputs.length;
  const extra = opts.extraPriv || null;
  const flag = opts.flag != null ? opts.flag : (redeemHasCltvDrop(redeemHex) ? 'false' : null);
  const noSig = !!opts.noSig;
  for (let i = 0; i < n; i++) {
    let sigs = [];
    if (!noSig && priv) {
      const sigOwner = hexish(k.createInputSignature(tx, i, priv, k.SighashType.All));
      if (extra) {
        const sigOther = hexish(k.createInputSignature(tx, i, extra, k.SighashType.All));
        sigs = [sigOther, sigOwner];
      } else {
        sigs = [sigOwner];
      }
    }
    const script = p2shWitness(k, redeemHex, { sigs, flag, extra: opts.extraHex });
    tx.inputs[i].signatureScript = script;
    scripts.push(script);
  }
  return scripts;
}

async function submitRpcTx(rpc, url, obj, allowOrphan = false) {
  let last = null;
  for (let i = 0; i < 5; i++) {
    try {
      const submitted = await withTimeout(
        rpc.submitTransaction({ transaction: obj, allowOrphan: allowOrphan || i > 0 }),
        20000,
        'Timed out broadcasting to ' + url
      );
      const txId = submitted?.transactionId || submitted || null;
      if (txId) return txId;
    } catch (e) {
      last = e;
      if (isOrphanError(e) && i < 4) {
        await sleep(1000 * (i + 1));
        continue;
      }
      throw e;
    }
  }
  if (last) throw last;
  return null;
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
  let scripts = signP2pkInputs(k, tx, priv, entries);
  for (let round = 0; round < 3; round++) {
    const need = toccataMinFee(k, tx, floor);
    const paid = txInputSum(tx, entries) - txOutputSum(tx);
    if (paid >= need) return scripts;
    shrinkOutputsForFee(tx, need - paid, protectIndex);
    scripts = signP2pkInputs(k, tx, priv, entries);
  }
  return scripts;
}

function ownedSpendRows(wallet) {
  const src = (wallet?.receiveAddrs && wallet.receiveAddrs.length)
    ? wallet.receiveAddrs
    : [{ address: wallet.address, privateKey: wallet.privKey, pubKey: wallet.pubKey }];
  const rows = [];
  const seen = new Set();
  for (const a of src) {
    const key = a.privateKey || a.privKey || wallet.privKey;
    if (a.address && !seen.has(a.address)) {
      seen.add(a.address);
      rows.push({ address: a.address, privKey: key, redeemHex: '' });
    }
    if (a.privacyAddress && a.privacyRedeem && !seen.has(a.privacyAddress)) {
      seen.add(a.privacyAddress);
      rows.push({ address: a.privacyAddress, privKey: key, redeemHex: a.privacyRedeem });
    }
  }
  return rows;
}

function attachSpendMeta(entries, rows) {
  const byAddr = new Map(rows.map(r => [r.address, r]));
  return entries.map(e => {
    const row = byAddr.get(e.address);
    return {
      ...e,
      privKey: row?.privKey || e.privKey || '',
      redeemHex: row?.redeemHex || e.redeemHex || ''
    };
  }).filter(e => e.privKey && e.outpoint?.transactionId && e.amount > 0n);
}

export async function fetchOwnedUtxos(wallet) {
  const rows = ownedSpendRows(wallet);
  if (!rows.length) return [];
  try {
    const { rpc } = await connectPublicNode();
    const raw = await fetchNodeUtxosMany(rpc, rows.map(r => r.address));
    const tagged = attachSpendMeta(raw, rows);
    if (tagged.length || raw.length === 0) return tagged;
  } catch {}
  const bags = [];
  for (let i = 0; i < rows.length; i += 8) {
    const chunk = rows.slice(i, i + 8);
    const part = await Promise.all(chunk.map(async a => {
      try {
        const raw = await fetchAddressUtxos(a.address);
        return restUtxosToEntries(raw, a.address).map(e => ({
          ...e,
          privKey: a.privKey,
          redeemHex: a.redeemHex || ''
        }));
      } catch {
        return [];
      }
    }));
    bags.push(...part.flat());
  }
  return bags;
}

function requiredFeeFromError(e) {
  const m = errText(e).match(/required amount of (\d+)/i);
  return m ? BigInt(m[1]) : null;
}

export async function spendExactP2sh({
  wallet, vault, utxos, dest, amountSompi, extraOutputs = [],
  flag, extraHex, extraPrivKey, noSig = false, lockTime = 0, computeBudget = 80
}) {
  const k = await loadKaspaSdk();
  const redeemHex = vault?.scriptHex;
  if (!redeemHex) throw new Error('This vault has no redeem script saved');
  const entries = restUtxosToEntries(utxos, vault.address);
  if (!entries.length) throw new Error('No coins at this vault address');
  const total = entries.reduce((a, e) => a + e.amount, 0n);
  const exact = BigInt(amountSompi);
  const extraSum = extraOutputs.reduce((a, o) => a + BigInt(o.amount), 0n);
  const fee = total - exact - extraSum;
  if (fee < 400_000n) {
    throw new Error(`Hop fee window too small (${Number(fee) / 1e8} KAS). Fund a larger capsule.`);
  }
  const priv = noSig ? null : new k.PrivateKey(wallet.privKey);
  const extraPriv = extraPrivKey ? new k.PrivateKey(extraPrivKey) : null;
  const { rpc, url } = await connectPublicNode();
  const outputs = [{ address: dest, amount: exact }, ...extraOutputs];
  const tx = k.createTransaction(entries, outputs, 0n, undefined, 1);
  tx.version = 1;
  tx.lockTime = BigInt(lockTime || 0);
  for (const inp of tx.inputs) {
    inp.sequence = 0n;
    inp.sigOpCount = 0;
    inp.computeBudget = computeBudget;
  }
  const scripts = signP2shInputs(k, tx, priv, redeemHex, {
    flag, extraHex, extraPriv, noSig
  });
  for (const inp of tx.inputs) {
    inp.sigOpCount = 0;
    inp.computeBudget = computeBudget;
  }
  try { k.updateTransactionMass('mainnet', tx); } catch {}
  const txId = await submitSignedRpc(k, rpc, url, tx, {
    sigOpCount: 0,
    computeBudget,
    lockTime: Number(lockTime || 0),
    scripts
  });
  return {
    txId,
    amountKas: Number(exact) / 1e8,
    feeKas: Number(fee) / 1e8,
    node: url
  };
}

export function currentHop(vault) {
  const hops = vault?.hops || [];
  const i = Number(vault?.hopIndex || 0);
  return hops[i] || null;
}

export async function checkinHop({ wallet, vault, utxos, extraPayee }) {
  const hop = currentHop(vault);
  if (!hop) throw new Error('No hop chain on this vault');
  const hops = vault.hops;
  const i = Number(vault.hopIndex || 0);
  const next = hops[i + 1];
  if (!next && vault.type === 'sentinel') {
    throw new Error('Last check-in already used. Build a new Sentinel before this hop times out.');
  }
  const dest = next?.address || vault.params?.beneficiary || wallet.address;
  const amount = BigInt(hop.nextAmt || next?.value || 0);
  if (amount <= 0n) throw new Error('Next hop amount missing');
  const extraOutputs = [];
  if (vault.type === 'recurring' && vault.payeeAddr && vault.paySompi) {
    extraOutputs.push({ address: vault.payeeAddr, amount: BigInt(vault.paySompi) });
  }
  if (extraPayee?.address && extraPayee?.amount) {
    extraOutputs.push({ address: extraPayee.address, amount: BigInt(extraPayee.amount) });
  }
  const result = await spendExactP2sh({
    wallet, vault: { ...vault, scriptHex: hop.redeemHex, address: hop.address },
    utxos, dest, amountSompi: amount, extraOutputs,
    flag: 'true', lockTime: 0, computeBudget: 80
  });
  return { ...result, nextHop: next || null, hopIndex: i + 1 };
}

export async function timeoutHop({ wallet, vault, utxos }) {
  const hop = currentHop(vault) || vault;
  const daaNow = await currentDaa();
  const unlock = Number(hop.unlockDaa || vault.unlockDaa || 0);
  if (unlock && daaNow < unlock) {
    const waitSec = Math.ceil((unlock - daaNow) / 10);
    throw new Error(`Still in the check-in window. Unlock DAA ${unlock}, now ${daaNow}. Wait ~${waitSec}s.`);
  }
  const dest = vault.params?.beneficiary || vault.payeeAddr || wallet.address;
  const amount = BigInt(hop.destAmt || hop.nextAmt || 0);
  if (amount <= 0n) throw new Error('Timeout amount missing from hop');
  return spendExactP2sh({
    wallet,
    vault: { ...vault, scriptHex: hop.redeemHex || vault.scriptHex, address: hop.address || vault.address },
    utxos,
    dest,
    amountSompi: amount,
    flag: 'false',
    noSig: true,
    lockTime: Math.max(unlock, daaNow),
    computeBudget: 80
  });
}

export async function sweepVault({ wallet, vault, utxos, extraPrivKey, escrowRelease = false, secretHex = '' }) {
  const type = vault?.type || '';
  if (type === 'sentinel' || type === 'recurring') {
    return timeoutHop({ wallet, vault, utxos });
  }
  const k = await loadKaspaSdk();
  const redeemHex = vault?.scriptHex || await reconstructTimelockRedeem(vault, wallet.pubKey);
  if (!redeemHex) throw new Error('This vault has no redeem script saved — cannot sweep');
  vault = { ...vault, scriptHex: redeemHex };
  const entries = restUtxosToEntries(utxos, vault.address);
  if (!entries.length) throw new Error('No coins at this vault address');
  const total = entries.reduce((a, e) => a + e.amount, 0n);
  const daaNow = await currentDaa();
  const unlock = Number(vault.unlockDaa || 0);
  const isCltv = redeemHasCltvDrop(redeemHex) || unlock > 0;
  if (type !== 'hashlock' && isCltv && unlock && daaNow < unlock) {
    const waitSec = Math.ceil((unlock - daaNow) / 10);
    throw new Error(`Still time-locked. Unlock DAA ${unlock}, now ${daaNow}. Wait ~${waitSec}s then Sweep.`);
  }
  if (type === 'hashlock' && !secretHex && isCltv && unlock && daaNow < unlock) {
    throw new Error('Hash lock: paste the secret to claim now, or wait for the refund timer.');
  }

  const kind = type || (isCltv ? 'timelock' : '');
  if (kind === 'multisig' && !extraPrivKey) {
    throw new Error('2-of-2 needs the counterparty key. Import that wallet on You, then Sweep.');
  }

  const claimHash = kind === 'hashlock' && !!secretHex;
  const lockTime = (!claimHash && isCltv) ? Math.max(unlock || 0, daaNow) : 0;
  const priv = new k.PrivateKey(wallet.privKey);
  const extraPriv = extraPrivKey ? new k.PrivateKey(extraPrivKey) : null;
  const flag = kind === 'escrow'
    ? (escrowRelease ? 'true' : 'false')
    : (claimHash ? 'true' : (isCltv ? 'false' : null));
  const { rpc, url } = await connectPublicNode();

  function assemble(fee) {
    if (total <= fee) throw new Error('Vault balance is too small to cover the network fee');
    const sendAmt = total - fee;
    const payoutAddr = (claimHash && vault.params?.receiver) ? vault.params.receiver : wallet.address;
    const tx = k.createTransaction(
      entries,
      [{ address: payoutAddr, amount: sendAmt }],
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
    const scripts = signP2shInputs(k, tx, priv, redeemHex, {
      flag,
      extraPriv: kind === 'multisig' ? extraPriv : null,
      extraHex: claimHash ? secretHex : ''
    });
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

function spendEntriesFrom(utxos, wallet) {
  const list = Array.isArray(utxos) ? utxos : [];
  return list.map(u => {
    const c = validateAndCleanUtxo(u);
    if (!c) return null;
    return {
      address: u.address || wallet.address,
      privKey: u.privKey || u.privateKey || wallet.privKey,
      redeemHex: u.redeemHex || '',
      ...c
    };
  }).filter(e => e && e.privKey && e.outpoint?.transactionId && e.amount > 0n);
}

export async function compoundUtxos({ wallet, utxos }) {
  const k = await loadKaspaSdk();
  let entries = spendEntriesFrom(utxos, wallet);
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
        scripts = signP2pkInputs(k, tx, priv, entries);
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
  try {
    const data = await fetchJsonRetry(
      `${API()}/addresses/${encodeURIComponent(address)}/utxos`,
      { label: 'Kaspa UTXOs', tries: 2, timeout: 8000 }
    );
    return Array.isArray(data) ? data : [];
  } catch (restErr) {
    try {
      const { rpc } = await connectPublicNode();
      const node = await fetchNodeUtxos(rpc, address);
      if (Array.isArray(node)) return node;
    } catch {}
    throw restErr;
  }
}

export async function fetchAddressBalance(address) {
  const data = await fetchJsonRetry(
    `${API()}/addresses/${encodeURIComponent(address)}/balance`,
    { label: 'Kaspa balance' }
  );
  return Number(data.balance ?? data ?? 0);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitAddressUtxos(address, ms = 90000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const u = await fetchAddressUtxos(address);
      if (Array.isArray(u) && u.length) return u;
    } catch {}
    await sleep(1500);
  }
  throw new Error('Commit UTXO did not land yet. Wait a few seconds and tap Send again — we will finish the reveal.');
}

function buildKrc20Script(k, xonlyHex, json) {
  const sb = new k.ScriptBuilder();
  sb.addData(xonlyHex);
  sb.addOp(k.Opcodes.OpCheckSig);
  sb.addOp(k.Opcodes.OpFalse);
  sb.addOp(k.Opcodes.OpIf);
  sb.addData(new TextEncoder().encode('kasplex'));
  sb.addI64(0n);
  sb.addData(new TextEncoder().encode(json));
  sb.addOp(k.Opcodes.OpEndIf);
  return sb;
}

function krcPendingKey(addr) {
  return 'kcc20_krc20_pending_v1:' + (addr || '');
}

export function loadKrc20Pending(address) {
  try {
    const raw = JSON.parse(localStorage.getItem(krcPendingKey(address)) || 'null');
    return raw && raw.p2shAddr ? raw : null;
  } catch {
    return null;
  }
}

export function clearKrc20Pending(address) {
  localStorage.removeItem(krcPendingKey(address));
}

/**
 * Kasplex KRC-20 transfer (KasWare / coinchimp commit-reveal).
 * JSON: {"p":"krc-20","op":"transfer","tick","amt","to"}
 * Script: <xonly> CHECKSIG FALSE IF "kasplex" 0 <json> ENDIF
 */
export async function sendKrc20({ wallet, dest, tick, amtRaw, utxos, onStatus }) {
  if (!isKrcDest(dest)) throw new Error('Destination must be a kaspa: address');
  const ticker = String(tick || '').toUpperCase().trim();
  if (!ticker) throw new Error('Missing ticker');
  const amt = String(amtRaw || '');
  if (!amt || amt === '0') throw new Error('Missing token amount');
  if (kaswareSigning(wallet)) {
    onStatus?.('Approve the KRC-20 transfer in KasWare…');
    return sendKrc20WithKasware({ dest, tick: ticker, amtRaw: amt });
  }

  const k = await loadKaspaSdk();
  const priv = new k.PrivateKey(wallet.privKey);
  const xonly = priv.toPublicKey().toXOnlyPublicKey().toString();
  const json = JSON.stringify({ p: 'krc-20', op: 'transfer', tick: ticker, amt, to: dest });
  const script = buildKrc20Script(k, xonly, json);
  const p2sh = script.createPayToScriptHashScript();
  const p2shAddr = String(k.addressFromScriptPublicKey(p2sh, 'mainnet'));
  if (!p2shAddr.startsWith('kaspa:p')) throw new Error('Failed to build Kasplex P2SH');

  const pending = loadKrc20Pending(wallet.address);
  let commitTxId = pending && pending.p2shAddr === p2shAddr ? pending.commitTxId : '';
  if (!commitTxId) {
    onStatus?.('Commit: parking the Kasplex inscription…');
    const available = utxos && utxos.length ? utxos : await fetchAddressUtxos(wallet.address);
    const commit = await sendKas({
      wallet,
      dest: p2shAddr,
      amountKas: 0.1,
      utxos: available,
      exact: true
    });
    commitTxId = commit.txId;
    localStorage.setItem(krcPendingKey(wallet.address), JSON.stringify({
      p2shAddr, tick: ticker, amt, dest, commitTxId, json, at: Date.now()
    }));
  }

  onStatus?.('Waiting for the commit UTXO…');
  const revealUtxos = await waitAddressUtxos(p2shAddr, 90000);
  onStatus?.('Reveal: publishing the transfer on-chain…');
  const revealId = await revealKrc20({
    k, wallet, priv, script, p2shAddr, revealUtxos
  });
  clearKrc20Pending(wallet.address);
  return { commitTxId, revealId, txId: revealId, tick: ticker, amt, dest, p2shAddr };
}

function isKrcDest(dest) {
  return typeof dest === 'string' && /^kaspa:[a-z0-9]{20,}$/i.test(dest.trim());
}

async function revealKrc20({ k, wallet, priv, script, p2shAddr, revealUtxos }) {
  const { rpc, url } = await connectPublicNode();
  const feeRate = await nodeFeeRate(rpc);
  const p2shEntries = restUtxosToEntries(revealUtxos, p2shAddr);
  if (!p2shEntries.length) throw new Error('No commit UTXO to reveal');
  const walletUtxos = await fetchAddressUtxos(wallet.address);
  const feeEntries = restUtxosToEntries(walletUtxos, wallet.address);
  const p2shKeys = new Set(p2shEntries.map(e => `${e.outpoint.transactionId}:${e.outpoint.index}`));

  let pendingList = [];
  try {
    const built = await k.createTransactions({
      priorityEntries: p2shEntries,
      entries: feeEntries,
      outputs: [],
      changeAddress: wallet.address,
      priorityFee: 0n,
      feeRate,
      sigOpCount: 1,
      networkId: 'mainnet'
    });
    pendingList = built.transactions || [];
  } catch (e) {
    throw new Error('Could not build reveal: ' + errText(e));
  }
  if (!pendingList.length) throw new Error('Reveal builder returned no transaction');

  let txId = null;
  for (let p = 0; p < pendingList.length; p++) {
    const pending = pendingList[p];
    const tx = pending.transaction;
    tx.version = 1;
    prepInputs(tx, { sigOpCount: 0, computeBudget: 40 });
    try { k.updateTransactionMass('mainnet', tx); } catch {}
    const scripts = [];
    for (let i = 0; i < tx.inputs.length; i++) {
      const prev = tx.inputs[i].previousOutpoint;
      const key = `${prev.transactionId}:${prev.index}`;
      let sig;
      try { sig = pending.createInputSignature(i, priv); }
      catch { sig = k.createInputSignature(tx, i, priv, k.SighashType.All); }
      if (p2shKeys.has(key)) {
        const wrapped = script.encodePayToScriptHashSignatureScript(sig);
        tx.inputs[i].signatureScript = wrapped;
        scripts.push(hexish(wrapped));
      } else {
        tx.inputs[i].signatureScript = hexish(sig);
        scripts.push(hexish(sig));
      }
    }
    txId = await submitSignedRpc(k, rpc, url, tx, {
      sigOpCount: 0,
      computeBudget: 40,
      lockTime: 0,
      scripts
    });
  }
  if (!txId) throw new Error('Reveal did not return a txid');
  return txId;
}

const KRON_IDX = 'https://idx.kron.technology';
const MIN_CELL_KAS = 5_000_000n;
const CHANGE_CELL_KAS = 8_000_000n; // leftover token cell — distinct from the send cell (KIP-9)
const P2PK_RE = /^20([0-9a-f]{64})ac$/i;
const NATIVE_SUBNET = '0000000000000000000000000000000000000000';

function kasNeedError(moreSompi) {
  const n = Number(moreSompi < 0n ? 0n : moreSompi) / 1e8;
  const shown = n <= 0.05 ? '0.05' : (n < 1 ? n.toFixed(2) : n.toFixed(1));
  return new Error(
    `Need about ${shown} more KAS in this wallet as a normal UTXO. ` +
    `Token cells have to carry enough KAS or Kaspa rejects the send (storage mass). ` +
    `Receive a bit of KAS here, then tap Send again.`
  );
}

function massSplitError() {
  return new Error(
    'Kaspa storage mass rejected this token split — not a missing-KAS problem (this wallet has funds). ' +
    'Tap Send now again; leftover tokens will sit in a differently sized KAS cell.'
  );
}

function layoutSendKas(k, inAmts, inCellKas, nTok, feeGuess) {
  const inSum = inAmts.reduce((a, b) => a + b, 0n);
  const keep = inCellKas >= MIN_CELL_KAS ? inCellKas : MIN_CELL_KAS;
  const keepOpts = [keep, keep + 5_000_000n, 50_000_000n];
  const changeOpts = nTok > 1
    ? [CHANGE_CELL_KAS, 12_000_000n, 7_000_000n, 15_000_000n, 9_000_000n, 6_000_000n, 11_000_000n]
    : [0n];
  const dust = 200_000n;
  for (const sendKasAmt of keepOpts) {
    for (const ch of changeOpts) {
      if (nTok > 1 && (ch === sendKasAmt || ch < MIN_CELL_KAS || sendKasAmt < MIN_CELL_KAS)) continue;
      const tokenKas = nTok > 1 ? [sendKasAmt, ch] : [sendKasAmt];
      const tokenOutSum = tokenKas.reduce((a, b) => a + b, 0n);
      const leftover = inSum - tokenOutSum - feeGuess;
      if (leftover < 0n) continue;
      const kasChange = leftover >= dust ? leftover : 0n;
      const outs = kasChange > 0n ? [...tokenKas, kasChange] : tokenKas;
      if (storageMassOk(k, inAmts, outs)) return { tokenKas, kasChange, tokenOutSum };
    }
  }
  return null;
}

function hexToU8(hex) {
  const h = String(hex || '').replace(/^0x/i, '');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function u8ToHex(u8) {
  return Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
}

function int8LE(n) {
  const t = new Uint8Array(8);
  let v = BigInt.asUintN(64, BigInt(n));
  for (let i = 0; i < 8; i++) { t[i] = Number(v & 0xffn); v >>= 8n; }
  return t;
}

function concatU8(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function parseKcc20Redeem(hex) {
  const script = hexToU8(hex);
  const hits = [];
  for (let s = 0; s + 46 <= script.length; s++) {
    if (script[s] === 32 && script[s + 33] === 1 && script[s + 34] <= 3 && script[s + 35] === 8 && script[s + 44] === 1 && script[s + 45] <= 1) {
      hits.push(s);
    }
  }
  if (hits.length !== 1) {
    throw new Error('KCC20 cell redeem is not the KRON state layout (owner/type/amount/isMinter)');
  }
  const n = hits[0];
  let amount = 0n;
  for (let i = 0; i < 8; i++) amount |= BigInt(script[n + 36 + i]) << BigInt(8 * i);
  return {
    script,
    stateStart: n,
    ownerIdentifier: script.slice(n + 1, n + 33),
    identifierType: script[n + 34],
    amount,
    isMinter: script[n + 45] === 1
  };
}

function materializeKcc20Script(tpl, state) {
  const s = tpl.script.slice();
  const n = tpl.stateStart || 0;
  s[n] = 32;
  s.set(state.ownerIdentifier, n + 1);
  s[n + 33] = 1;
  s[n + 34] = state.identifierType;
  s[n + 35] = 8;
  s.set(int8LE(state.amount), n + 36);
  s[n + 44] = 1;
  s[n + 45] = state.isMinter ? 1 : 0;
  return s;
}

function presenceState(owner32, amount) {
  return { ownerIdentifier: owner32, identifierType: 3, amount: BigInt(amount), isMinter: false };
}

function transferSigScript(k, redeemBytes, nextStates, witnesses) {
  const w = Array.isArray(witnesses) ? witnesses : [Number(witnesses ?? 1)];
  const sb = new k.ScriptBuilder({ flags: { covenantsEnabled: true } });
  sb.addData(concatU8(nextStates.map(s => s.ownerIdentifier)));
  sb.addData(concatU8(nextStates.map(s => Uint8Array.of(s.identifierType))));
  sb.addData(concatU8(nextStates.map(s => int8LE(s.amount))));
  sb.addData(concatU8(nextStates.map(s => Uint8Array.of(s.isMinter ? 1 : 0))));
  sb.addData(new Uint8Array(0));
  sb.addData(Uint8Array.from(w, x => x & 255));
  sb.addData(redeemBytes);
  return sb.drain();
}

function destXOnly(k, dest) {
  const n = String(dest || '').trim();
  if (!k.Address.validate(n)) throw new Error('Not a valid Kaspa address');
  let spk;
  try { spk = String(k.payToAddressScript(n).script || ''); }
  catch { throw new Error('Not a valid Kaspa address'); }
  const m = P2PK_RE.exec(spk);
  if (!m) throw new Error('KCC20 can only go to a standard kaspa:q… key address (same as KasWare / KRON)');
  return hexToU8(m[1]);
}

async function kronJson(path) {
  return fetchJsonRetry(KRON_IDX + path, { label: 'KRON indexer', timeout: 16000 });
}

function indexerSompi(c) {
  const v = c?.value ?? c?.kasValue ?? c?.amountSompi ?? c?.utxoEntry?.amount ?? c?.entry?.amount;
  if (v == null || v === '') return null;
  try {
    const n = BigInt(v);
    if (n < MIN_CELL_KAS) return null;
    return n;
  } catch {
    return null;
  }
}

function p2shAddrFromSpk(spk) {
  const h = hexish(spk);
  const m = /^aa20([0-9a-f]{64})87$/i.exec(h);
  if (!m) return '';
  try {
    return kaspaAddressFromScriptHash(hexToU8(m[1]));
  } catch {
    return '';
  }
}

async function cellKasValue(txid, index, hint) {
  const hinted = indexerSompi(hint);
  if (hinted != null) return hinted;
  try {
    const tx = await fetchJsonRetry(`${API()}/transactions/${txid}`, { label: 'Kaspa tx', tries: 3 });
    const o = (tx.outputs || [])[index];
    if (o && o.amount != null) return BigInt(o.amount);
  } catch {}
  const addr = p2shAddrFromSpk(hint?.scriptPublicKey || hint?.spk);
  if (addr) {
    try {
      const utxos = await fetchAddressUtxos(addr);
      const hit = (utxos || []).find(u => {
        const id = u.outpoint?.transactionId || u.outpoint?.transaction_id;
        const idx = Number(u.outpoint?.index ?? -1);
        return id === txid && idx === Number(index);
      });
      const amt = hit?.utxoEntry?.amount ?? hit?.amount;
      if (amt != null) return BigInt(amt);
    } catch {}
  }
  throw new Error('Could not load the KAS sitting in this ' + (hint?.tick || 'token') + ' cell. Tap Send now again.');
}

export async function sendKcc20({ wallet, dest, token, amountHuman, utxos, onStatus }) {
  const tick = String(token?.ticker || '').toUpperCase();
  if (!tick) throw new Error('Missing KCC20 ticker');
  if (!isKrcDest(dest)) throw new Error('Destination must be a kaspa: address');
  const forceKcc = String(token?.protocol || 'kcc20') === 'kcc20';
  if (!forceKcc) {
    try {
      const data = await fetchJsonRetry(`https://api.kasplex.org/v1/krc20/token/${encodeURIComponent(tick)}`, { label: 'Kasplex', tries: 2 });
      const row = Array.isArray(data?.result) ? data.result[0] : data;
      const live = row && String(row.state || '').toLowerCase() !== 'unused' && Number(row.max || 0) > 0;
      if (live) {
        const dec = Number(token.decimals ?? row.dec ?? 8);
        const amtRaw = toRawLocal(amountHuman, dec);
        onStatus?.('This ticker is also on Kasplex — sending as KRC-20…');
        return sendKrc20({ wallet, dest, tick, amtRaw, utxos, onStatus });
      }
    } catch {}
  }

  const k = await loadKaspaSdk();
  const sendAmt = BigInt(toRawLocal(amountHuman, token.decimals ?? 0));
  if (sendAmt <= 0n) throw new Error('Enter an amount greater than 0');
  const destPk = destXOnly(k, dest);
  const priv = new k.PrivateKey(wallet.privKey);
  const selfPk = hexToU8(priv.toPublicKey().toXOnlyPublicKey().toString());
  if (selfPk.length !== 32) throw new Error('Wallet public key is not a 32-byte x-only key');
  if (u8ToHex(destPk) === u8ToHex(selfPk)) throw new Error('That is this wallet’s own address');

  onStatus?.('Loading KRON KCC20 cells…');
  let info;
  try {
    info = await kronJson(`/v1/kcc20/token/${encodeURIComponent(tick)}`);
  } catch (e) {
    if (!/^[0-9a-f]{64}$/i.test(String(token?.tokenId || '').replace(/^0x/i, ''))) throw e;
    info = { result: [{ covenantId: token.tokenId, maxIns: 4 }] };
  }
  const meta = Array.isArray(info?.result) ? info.result[0] : info?.result;
  const tokenCovid = String(meta?.covenantId || token.tokenId || '').replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(tokenCovid)) throw new Error('KRON did not return a covenant id for ' + tick);

  const scanAddrs = (wallet.receiveAddrs && wallet.receiveAddrs.length)
    ? wallet.receiveAddrs.map(a => a.address)
    : [wallet.address];
  const cellBags = await Promise.all(scanAddrs.slice(0, 12).map(async a => {
    try {
      const raw = await kronJson(`/v1/kcc20/token/${encodeURIComponent(tick)}/address/${encodeURIComponent(a)}/utxos`);
      const list = Array.isArray(raw?.result) ? raw.result : [];
      return list.map(c => ({ ...c, scanAddr: a }));
    } catch { return []; }
  }));
  const cells = cellBags.flat();
  if (!cells.length) throw new Error('No ' + tick + ' cells on this address (KRON indexer)');

  const loaded = await Promise.all(cells.map(async c => {
    const txid = c.outpoint?.transactionId;
    const index = Number(c.outpoint?.index ?? 0);
    const redeem = c.redeemScriptHex || c.redeem;
    if (!txid || !redeem) return null;
    try {
      const parsed = parseKcc20Redeem(redeem);
      if (parsed.identifierType === 1) return null;
      const kasValue = await cellKasValue(txid, index, c);
      return {
        transactionId: txid,
        index,
        tokenAmount: BigInt(c.amount ?? parsed.amount),
        value: kasValue,
        redeem: parsed,
        spk: c.scriptPublicKey
      };
    } catch {
      return null;
    }
  }));
  const pieces = loaded.filter(Boolean);
  if (!pieces.length) {
    throw new Error('Found ' + tick + ' on the indexer but could not load the cell UTXOs. Tap Send now again.');
  }
  pieces.sort((a, b) => (a.tokenAmount < b.tokenAmount ? 1 : -1));
  const totalTok = pieces.reduce((a, p) => a + p.tokenAmount, 0n);
  if (totalTok < sendAmt) throw new Error(`You only hold ${totalTok} ${tick}`);
  const maxIns = Math.max(1, Math.min(4, Number(meta?.maxIns || 4)));
  let selected = pieces.filter(p => p.tokenAmount >= sendAmt).slice(0, 1);
  if (!selected.length) {
    selected = [];
    let covered = 0n;
    for (const p of pieces) {
      selected.push(p);
      covered += p.tokenAmount;
      if (covered >= sendAmt) break;
      if (selected.length >= maxIns) break;
    }
    const have = selected.reduce((a, p) => a + p.tokenAmount, 0n);
    if (have < sendAmt) {
      throw new Error(`${tick} is split across ${pieces.length} cells. This send needs ${sendAmt} but the largest ${selected.length} cells only hold ${have}. Send ${have} now, then the rest.`);
    }
  }
  onStatus?.(`Sending ${sendAmt} ${tick} from ${selected.length} cell${selected.length === 1 ? '' : 's'}…`);

  const inTok = selected.reduce((a, p) => a + p.tokenAmount, 0n);
  const changeTok = inTok - sendAmt;
  const tpl = { script: selected[0].redeem.script, stateStart: selected[0].redeem.stateStart || 0 };
  const ownerId = selected[0].redeem.ownerIdentifier;
  const next = [presenceState(destPk, sendAmt)];
  if (changeTok > 0n) next.push(presenceState(ownerId, changeTok));
  const presenceIdx = selected.length;
  const witnesses = selected.map(() => presenceIdx);
  const inCellKas = selected.reduce((a, p) => a + p.value, 0n);
  const nTok = next.length;
  const feeGuess = 500_000n;
  // Keep the send cell's own KAS (cancels in KIP-9). Leftover tokens get a
  // differently sized cell from wallet KAS — never 0.2/0.2 or 0.05/0.05 splits.
  const walletNeed = (nTok > 1 ? CHANGE_CELL_KAS : 0n) + feeGuess + 200_000n;

  onStatus?.('Connecting to Kaspa…');
  const { rpc, url } = await connectPublicNode();
  const walletUtxos = utxos && utxos.length ? utxos : await fetchAddressUtxos(wallet.address);
  const feeEntries = restUtxosToEntries(walletUtxos, wallet.address)
    .sort((a, b) => (a.amount < b.amount ? 1 : -1));
  const picked = [];
  let feeSum = 0n;
  for (const e of feeEntries) {
    picked.push(e);
    feeSum += e.amount;
    if (feeSum >= walletNeed) break;
  }
  if (!picked.length) throw kasNeedError(walletNeed);
  if (feeSum < walletNeed) throw kasNeedError(walletNeed - feeSum);

  const inAmts = [...selected.map(p => p.value), ...picked.map(e => e.amount)];
  let layout = layoutSendKas(k, inAmts, inCellKas, nTok, feeGuess);
  if (!layout) {
    const keep = inCellKas >= MIN_CELL_KAS ? inCellKas : MIN_CELL_KAS;
    const tokenKasFallback = nTok > 1 ? [keep, CHANGE_CELL_KAS] : [keep];
    const tokenOutSumFb = tokenKasFallback.reduce((a, b) => a + b, 0n);
    let kasChangeFb = inCellKas + feeSum - tokenOutSumFb - feeGuess;
    if (kasChangeFb < 200_000n) kasChangeFb = 0n;
    layout = { tokenKas: tokenKasFallback, kasChange: kasChangeFb, tokenOutSum: tokenOutSumFb };
  }
  const tokenKas = layout.tokenKas;
  const kasChange = layout.kasChange;
  const tokenOutSum = layout.tokenOutSum;
  const tokenOuts = next.map((st, i) => ({
    value: tokenKas[i],
    spk: k.payToScriptHashScript(materializeKcc20Script(tpl, st))
  }));

  function spkOf(v) {
    if (v instanceof k.ScriptPublicKey) return v;
    if (typeof v === 'string') return new k.ScriptPublicKey(0, v);
    if (v && (typeof v.script === 'string' || v.script instanceof Uint8Array)) {
      return new k.ScriptPublicKey(Number(v.version || 0), v.script);
    }
    throw new Error('Missing script for a KCC20 input');
  }
  function inputFromUtxo({ txid, index, amount, scriptPublicKey, address, blockDaaScore, isCoinbase, signatureScript, computeBudget }) {
    const id = String(txid);
    const idx = Number(index);
    const spk = spkOf(scriptPublicKey);
    const utxo = {
      address: address || undefined,
      outpoint: { transactionId: id, index: idx },
      amount: BigInt(amount),
      scriptPublicKey: { version: Number(spk.version || 0), script: hexish(spk.script) },
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
  let tx;
  let scripts;
  let signKasInputs;
  let inSum;
  try {
  const tokenIns = selected.map(p => {
    const redeem = p.redeem.script;
    const spk = k.payToScriptHashScript(redeem);
    return inputFromUtxo({
      txid: p.transactionId,
      index: p.index,
      amount: p.value,
      scriptPublicKey: spk,
      address: String(k.addressFromScriptPublicKey(spk, 'mainnet') || ''),
      signatureScript: transferSigScript(k, redeem, next, witnesses),
      computeBudget: 100
    });
  });
  const tokenScripts = tokenIns.map(inp => hexish(inp.signatureScript));
  const kasIns = picked.map(e => inputFromUtxo({
    txid: e.outpoint.transactionId,
    index: e.outpoint.index,
    amount: e.amount,
    scriptPublicKey: e.scriptPublicKey,
    address: wallet.address,
    blockDaaScore: e.blockDaaScore,
    isCoinbase: e.isCoinbase,
    computeBudget: 10
  }));
  const covOutputs = tokenOuts.map(o =>
    new k.TransactionOutput(o.value, o.spk, new k.CovenantBinding(0, new k.Hash(tokenCovid)))
  );
  inSum = inCellKas + feeSum;
  const changeSpk = k.payToAddressScript(wallet.address);
  const outputs = kasChange > 0n
    ? [...covOutputs, new k.TransactionOutput(kasChange, changeSpk)]
    : covOutputs;

  tx = new k.Transaction({
    version: 1,
    inputs: [...tokenIns, ...kasIns],
    outputs,
    lockTime: 0n,
    gas: 0n,
    payload: '',
    subnetworkId: NATIVE_SUBNET
  });
  prepInputs(tx, { sigOpCount: 0, computeBudget: 10 });
  const tokenN = tokenIns.length;
  for (let i = 0; i < tokenN; i++) {
    tx.inputs[i].computeBudget = 100;
    tx.inputs[i].signatureScript = tokenScripts[i];
  }
  try { k.updateTransactionMass('mainnet', tx); } catch {}

  signKasInputs = function signKasInputs() {
    const signed = tokenScripts.slice();
    for (let i = tokenN; i < tx.inputs.length; i++) {
      const sig = k.createInputSignature(tx, i, priv, k.SighashType.All);
      tx.inputs[i].signatureScript = hexish(sig);
      signed.push(hexish(sig));
    }
    return signed;
  };
  scripts = signKasInputs();
  } catch (e) {
    const m = errText(e);
    if (/null pointer/i.test(m)) throw new Error('KCC20 send failed in the Kaspa engine while building the tx. Hard-refresh and try 20 KKDAG again.');
    throw e;
  }
  onStatus?.('Broadcasting KCC20 send…');
  let txId;
  try {
    txId = await submitSignedRpc(k, rpc, url, tx, {
      sigOpCount: 0,
      computeBudget: 100,
      lockTime: 0,
      scripts
    });
  } catch (e) {
    if (isMassError(e)) throw massSplitError();
    const need = requiredFeeFromError(e);
    if (!need) throw e;
    const paid = inSum - [...tx.outputs].reduce((a, o) => a + BigInt(o.value), 0n);
    if (need <= paid) throw e;
    const last = tx.outputs.length - 1;
    const extra = need - paid + 50_000n;
    if (kasChange <= extra) throw e;
    tx.outputs[last].value = BigInt(tx.outputs[last].value) - extra;
    const scripts2 = signKasInputs();
    txId = await submitSignedRpc(k, rpc, url, tx, {
      sigOpCount: 0,
      computeBudget: 100,
      lockTime: 0,
      scripts: scripts2
    });
  }
  return {
    txId,
    revealId: txId,
    tick,
    amt: sendAmt.toString(),
    dest,
    change: changeTok.toString()
  };
}

const WITNESS_KAS = 20_000_000n; // 0.2 KAS co-present CLTV UTXO — SCRIPT_HASH witness + sweep fee

function layoutFreezeKas(k, inAmts, inCellKas, nTok, feeGuess) {
  const inSum = inAmts.reduce((a, b) => a + b, 0n);
  const lockedKeep = inCellKas >= MIN_CELL_KAS ? inCellKas : MIN_CELL_KAS;
  const lockedOpts = nTok === 1
    ? [lockedKeep, lockedKeep + 5_000_000n]
    : [lockedKeep, lockedKeep + 5_000_000n, 50_000_000n];
  const changeOpts = nTok > 1
    ? [CHANGE_CELL_KAS, 12_000_000n, 7_000_000n, 15_000_000n, 6_000_000n, MIN_CELL_KAS]
    : [0n];
  const witnessOpts = [WITNESS_KAS, 21_000_000n, 25_000_000n, 18_000_000n, 30_000_000n, 15_000_000n];
  const dust = 200_000n;
  for (const locked of lockedOpts) {
    for (const ch of changeOpts) {
      for (const wit of witnessOpts) {
        if (nTok > 1 && (ch === locked || ch === wit || locked === wit)) continue;
        const tokenKas = nTok > 1 ? [locked, ch] : [locked];
        if (tokenKas.some(v => v < MIN_CELL_KAS)) continue;
        const tokenOutSum = tokenKas.reduce((a, b) => a + b, 0n);
        const leftover = inSum - tokenOutSum - wit - feeGuess;
        if (leftover < 0n) continue;
        const kasChange = leftover >= dust ? leftover : 0n;
        const outs = kasChange > 0n ? [...tokenKas, wit, kasChange] : [...tokenKas, wit];
        if (storageMassOk(k, inAmts, outs)) {
          return { tokenKas, witness: wit, kasChange, tokenOutSum };
        }
      }
    }
  }
  return null;
}

function scriptHashState(hash32, amount) {
  return { ownerIdentifier: hash32, identifierType: 1, amount: BigInt(amount), isMinter: false };
}

function p2shHash32(k, redeem) {
  const bytes = typeof redeem === 'string' ? hexToU8(redeem) : redeem;
  const p2sh = k.payToScriptHashScript(bytes);
  const h = hexish(p2sh.script);
  const m = /^aa20([0-9a-f]{64})87$/i.exec(h);
  if (!m) throw new Error('Could not derive P2SH script hash from the time-capsule redeem');
  return hexToU8(m[1]);
}

function kccSpkOf(k, v) {
  if (v instanceof k.ScriptPublicKey) return v;
  if (typeof v === 'string') return new k.ScriptPublicKey(0, v);
  if (v && (typeof v.script === 'string' || v.script instanceof Uint8Array)) {
    return new k.ScriptPublicKey(Number(v.version || 0), v.script);
  }
  throw new Error('Missing script for a KCC20 input');
}

function kccInputFromUtxo(k, {
  txid, index, amount, scriptPublicKey, address, blockDaaScore, isCoinbase, signatureScript, computeBudget
}) {
  const id = String(txid);
  const idx = Number(index);
  const spk = kccSpkOf(k, scriptPublicKey);
  const utxo = {
    address: address || undefined,
    outpoint: { transactionId: id, index: idx },
    amount: BigInt(amount),
    scriptPublicKey: { version: Number(spk.version || 0), script: hexish(spk.script) },
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

function pickKcc20Pieces(pieces, sendAmt, maxIns) {
  let selected = pieces.filter(p => p.tokenAmount >= sendAmt).slice(0, 1);
  if (!selected.length) {
    selected = [];
    let covered = 0n;
    for (const p of pieces) {
      selected.push(p);
      covered += p.tokenAmount;
      if (covered >= sendAmt) break;
      if (selected.length >= maxIns) break;
    }
  }
  return selected;
}

async function loadKcc20Pieces(wallet, tick) {
  const info = await kronJson(`/v1/kcc20/token/${encodeURIComponent(tick)}`);
  const meta = Array.isArray(info?.result) ? info.result[0] : info?.result;
  const tokenCovid = String(meta?.covenantId || '').replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(tokenCovid)) throw new Error('KRON did not return a covenant id for ' + tick);
  const scanAddrs = (wallet.receiveAddrs && wallet.receiveAddrs.length)
    ? wallet.receiveAddrs.map(a => a.address)
    : [wallet.address];
  const cellBags = await Promise.all(scanAddrs.slice(0, 12).map(async a => {
    try {
      const raw = await kronJson(`/v1/kcc20/token/${encodeURIComponent(tick)}/address/${encodeURIComponent(a)}/utxos`);
      return Array.isArray(raw?.result) ? raw.result : [];
    } catch { return []; }
  }));
  const cells = cellBags.flat();
  const pieces = [];
  await Promise.all((cells || []).map(async c => {
    const txid = c.outpoint?.transactionId;
    const index = Number(c.outpoint?.index ?? 0);
    const redeem = c.redeemScriptHex || c.redeem;
    if (!txid || !redeem) return;
    try {
      const parsed = parseKcc20Redeem(redeem);
      if (parsed.identifierType === 1) return;
      const kasValue = await cellKasValue(txid, index);
      pieces.push({
        transactionId: txid,
        index,
        tokenAmount: BigInt(c.amount ?? parsed.amount),
        value: kasValue,
        redeem: parsed
      });
    } catch {}
  }));
  pieces.sort((a, b) => (a.tokenAmount < b.tokenAmount ? 1 : -1));
  return {
    pieces,
    tokenCovid,
    maxIns: Math.max(1, Math.min(4, Number(meta?.maxIns || 4))),
    decimals: Number(meta?.decimals ?? meta?.dec ?? 0)
  };
}

async function loadLockedKcc20Pieces(vault) {
  const tick = String(vault.tick || '').toUpperCase();
  const addr = vault.tokenScriptAddress;
  if (tick && addr) {
    try {
      const raw = await kronJson(`/v1/kcc20/token/${encodeURIComponent(tick)}/address/${encodeURIComponent(addr)}/utxos`);
      const cells = Array.isArray(raw?.result) ? raw.result : [];
      const pieces = [];
      for (const c of cells) {
        const txid = c.outpoint?.transactionId;
        const index = Number(c.outpoint?.index ?? 0);
        const redeem = c.redeemScriptHex || c.redeem || vault.tokenRedeemHex;
        if (!txid || !redeem) continue;
        const parsed = parseKcc20Redeem(redeem);
        const kasValue = await cellKasValue(txid, index);
        pieces.push({
          transactionId: txid,
          index,
          tokenAmount: BigInt(c.amount ?? parsed.amount),
          value: kasValue,
          redeem: parsed
        });
      }
      if (pieces.length) return pieces;
    } catch {}
  }
  if (!addr || !vault.tokenRedeemHex) return [];
  const utxos = await fetchAddressUtxos(addr);
  const parsed = parseKcc20Redeem(vault.tokenRedeemHex);
  return restUtxosToEntries(utxos, addr).map(e => ({
    transactionId: e.outpoint.transactionId,
    index: e.outpoint.index,
    tokenAmount: parsed.amount,
    value: e.amount,
    redeem: parsed
  }));
}

/**
 * Freeze KCC20 the same way native KAS freezes: CLTV P2SH capsule + SCRIPT_HASH
 * ownership. One tx transfers tokens to scriptHashOwned(blake2b(timelockRedeem))
 * and funds ~0.2 KAS to that kaspa:p as the co-present witness. Unlock spends
 * the P2SH after DAA (witness) and transfers back to ADDRESS presence.
 */
export async function lockKcc20Timelock({ wallet, tick, amountHuman, decimals, minutes, utxos, onStatus }) {
  const ticker = String(tick || '').toUpperCase().trim();
  if (!ticker) throw new Error('Missing KCC20 ticker');
  const k = await loadKaspaSdk();
  const loaded = await loadKcc20Pieces(wallet, ticker);
  const dec = decimals != null && decimals !== '' ? Number(decimals) : loaded.decimals;
  const sendAmt = BigInt(toRawLocal(amountHuman, dec));
  if (sendAmt <= 0n) throw new Error('Enter an amount greater than 0');
  if (!loaded.pieces.length) throw new Error('No spendable ' + ticker + ' cells on this address (SCRIPT_HASH frozen cells stay in the capsule)');
  const totalTok = loaded.pieces.reduce((a, p) => a + p.tokenAmount, 0n);
  if (totalTok < sendAmt) throw new Error(`You only hold ${totalTok} spendable ${ticker}`);
  const selected = pickKcc20Pieces(loaded.pieces, sendAmt, loaded.maxIns);
  const have = selected.reduce((a, p) => a + p.tokenAmount, 0n);
  if (have < sendAmt) {
    throw new Error(`${ticker} is split across ${loaded.pieces.length} cells. The largest ${selected.length} only hold ${have}.`);
  }

  onStatus?.('Building CLTV time capsule for ' + ticker + '…');
  const capsule = await buildTimelockCovenant({ pubkeyHex: wallet.pubKey, minutes });
  const hash32 = p2shHash32(k, capsule.redeemHex);

  // Same as Vault → Time Capsule: fund the kaspa:p CLTV with a normal exact KAS send
  // first. Putting the 0.2 KAS witness in the token tx is what blows storage mass.
  onStatus?.('Funding capsule (same as Time Capsule)…');
  const { rpc, url } = await connectPublicNode();
  let fund = null;
  let lastFundErr = '';
  let spentKeys = new Set();
  for (const amt of [0.2, 0.25, 0.15, 0.3]) {
    try {
      const fundUtxos = utxos && utxos.length && !fund
        ? utxos
        : await fetchAddressUtxos(wallet.address);
      spentKeys = new Set(
        restUtxosToEntries(fundUtxos, wallet.address)
          .map(e => `${e.outpoint.transactionId}:${e.outpoint.index}`)
      );
      fund = await sendKas({ wallet, dest: capsule.address, amountKas: amt, utxos: fundUtxos, exact: true });
      break;
    } catch (e) {
      lastFundErr = errText(e);
      if (!isMassError(e) && !/capsule would have received|storage mass|Aborted:/i.test(lastFundErr)) throw e;
    }
  }
  if (!fund) {
    throw new Error(lastFundErr || 'Could not fund the freeze capsule. Try a Time Capsule of 0.2 KAS first.');
  }
  const witnessKas = Math.round(Number(fund.amountKas || 0.2) * 1e8);

  const inTok = have;
  const changeTok = inTok - sendAmt;
  const tpl = { script: selected[0].redeem.script, stateStart: selected[0].redeem.stateStart || 0 };
  const ownerId = selected[0].redeem.ownerIdentifier;
  const next = [scriptHashState(hash32, sendAmt)];
  if (changeTok > 0n) next.push(presenceState(ownerId, changeTok));
  const presenceIdx = selected.length;
  const witnesses = selected.map(() => presenceIdx);
  const inCellKas = selected.reduce((a, p) => a + p.value, 0n);
  const nTok = next.length;
  const feeGuess = 500_000n;
  const walletNeed = (nTok > 1 ? CHANGE_CELL_KAS : 0n) + feeGuess + 200_000n;

  onStatus?.('Waiting for capsule fund to land on the node…');
  const priv = new k.PrivateKey(wallet.privKey);
  let feeEntries = [];
  try {
    feeEntries = await waitFreshNodeUtxos(rpc, wallet.address, spentKeys, walletNeed, onStatus);
  } catch (e) {
    onStatus?.(errText(e));
    const rest = await fetchAddressUtxos(wallet.address);
    feeEntries = restUtxosToEntries(rest, wallet.address)
      .filter(e => !spentKeys.has(`${e.outpoint.transactionId}:${e.outpoint.index}`))
      .sort((a, b) => (a.amount < b.amount ? 1 : -1));
  }
  onStatus?.('Moving ' + ticker + ' into the capsule…');
  feeEntries = [...feeEntries].sort((a, b) => (a.amount < b.amount ? 1 : -1));
  const picked = [];
  let feeSum = 0n;
  for (const e of feeEntries) {
    picked.push(e);
    feeSum += e.amount;
    if (feeSum >= walletNeed) break;
  }
  if (!picked.length || feeSum < walletNeed) throw kasNeedError(walletNeed - feeSum);

  const inAmts = [...selected.map(p => p.value), ...picked.map(e => e.amount)];
  let layout = layoutSendKas(k, inAmts, inCellKas, nTok, feeGuess);
  if (!layout) {
    const keep = inCellKas >= MIN_CELL_KAS ? inCellKas : MIN_CELL_KAS;
    const tokenKasFb = nTok > 1 ? [keep, CHANGE_CELL_KAS] : [keep];
    const tokenOutSumFb = tokenKasFb.reduce((a, b) => a + b, 0n);
    let kasChangeFb = inCellKas + feeSum - tokenOutSumFb - feeGuess;
    if (kasChangeFb < 200_000n) kasChangeFb = 0n;
    layout = { tokenKas: tokenKasFb, kasChange: kasChangeFb, tokenOutSum: tokenOutSumFb };
  }
  const tokenKas = layout.tokenKas;
  const kasChange = layout.kasChange;
  const tokenOutSum = layout.tokenOutSum;

  const lockedRedeem = materializeKcc20Script(tpl, next[0]);
  const tokenScriptAddress = String(k.addressFromScriptPublicKey(k.payToScriptHashScript(lockedRedeem), 'mainnet') || '');
  const tokenOuts = next.map((st, i) => ({
    value: tokenKas[i],
    spk: k.payToScriptHashScript(materializeKcc20Script(tpl, st))
  }));

  const tokenIns = selected.map(p => {
    const redeem = p.redeem.script;
    const spk = k.payToScriptHashScript(redeem);
    return kccInputFromUtxo(k, {
      txid: p.transactionId,
      index: p.index,
      amount: p.value,
      scriptPublicKey: spk,
      address: String(k.addressFromScriptPublicKey(spk, 'mainnet') || ''),
      signatureScript: transferSigScript(k, redeem, next, witnesses),
      computeBudget: 100
    });
  });
  const tokenScripts = tokenIns.map(inp => hexish(inp.signatureScript));
  const kasIns = picked.map(e => kccInputFromUtxo(k, {
    txid: e.outpoint.transactionId,
    index: e.outpoint.index,
    amount: e.amount,
    scriptPublicKey: e.scriptPublicKey,
    address: wallet.address,
    blockDaaScore: e.blockDaaScore,
    isCoinbase: e.isCoinbase,
    computeBudget: 10
  }));
  const covOutputs = tokenOuts.map(o =>
    new k.TransactionOutput(o.value, o.spk, new k.CovenantBinding(0, new k.Hash(loaded.tokenCovid)))
  );
  const changeSpk = k.payToAddressScript(wallet.address);
  const outputs = kasChange > 0n
    ? [...covOutputs, new k.TransactionOutput(kasChange, changeSpk)]
    : covOutputs;

  const tx = new k.Transaction({
    version: 1,
    inputs: [...tokenIns, ...kasIns],
    outputs,
    lockTime: 0n,
    gas: 0n,
    payload: '',
    subnetworkId: NATIVE_SUBNET
  });
  prepInputs(tx, { sigOpCount: 0, computeBudget: 10 });
  const tokenN = tokenIns.length;
  for (let i = 0; i < tokenN; i++) {
    tx.inputs[i].computeBudget = 100;
    tx.inputs[i].signatureScript = tokenScripts[i];
  }
  try { k.updateTransactionMass('mainnet', tx); } catch {}

  function signKasInputs() {
    const signed = tokenScripts.slice();
    for (let i = tokenN; i < tx.inputs.length; i++) {
      const sig = k.createInputSignature(tx, i, priv, k.SighashType.All);
      tx.inputs[i].signatureScript = hexish(sig);
      signed.push(hexish(sig));
    }
    return signed;
  }
  let scripts = signKasInputs();
  const inSum = inCellKas + feeSum;
  onStatus?.('Broadcasting token freeze…');
  let txId;
  try {
    txId = await submitSignedRpc(k, rpc, url, tx, {
      sigOpCount: 0,
      computeBudget: 100,
      lockTime: 0,
      scripts
    });
  } catch (e) {
    if (isMassError(e)) throw massSplitError();
    const need = requiredFeeFromError(e);
    if (!need) throw e;
    const paid = inSum - [...tx.outputs].reduce((a, o) => a + BigInt(o.value), 0n);
    if (need <= paid) throw e;
    const last = tx.outputs.length - 1;
    const extra = need - paid + 50_000n;
    if (kasChange <= extra) throw e;
    tx.outputs[last].value = BigInt(tx.outputs[last].value) - extra;
    scripts = signKasInputs();
    txId = await submitSignedRpc(k, rpc, url, tx, {
      sigOpCount: 0,
      computeBudget: 100,
      lockTime: 0,
      scripts
    });
  }

  const paidFee = inSum - [...tx.outputs].reduce((a, o) => a + BigInt(o.value), 0n);
  return {
    txId,
    tick: ticker,
    tokenAmount: sendAmt.toString(),
    decimals: dec,
    feeKas: Number(paidFee) / 1e8 + Number(fund.feeKas || 0),
    witnessKas: Number(fund.amountKas || 0.2),
    node: url,
    vault: {
      type: 'kcc20lock',
      name: ticker + ' Freeze',
      address: capsule.address,
      scriptHex: capsule.redeemHex,
      spkHex: capsule.spkHex,
      unlockDaa: capsule.unlockDaa,
      tick: ticker,
      tokenAmount: sendAmt.toString(),
      decimals: dec,
      tokenCovid: loaded.tokenCovid,
      tokenRedeemHex: u8ToHex(lockedRedeem),
      tokenScriptAddress,
      tokenOutpoint: { transactionId: txId, index: 0 },
      lockTxId: txId,
      fundTxId: fund.txId,
      status: 'locked',
      fundedSompi: witnessKas,
      fundFeeKas: Number(fund.feeKas || 0) + Number(paidFee) / 1e8,
      params: {
        amountKas: Number(fund.amountKas || 0.2),
        amountToken: Number(amountHuman),
        tick: ticker,
        duration: `${minutes} minutes`,
        lockMinutes: Number(minutes)
      },
      unlockAt: Date.now() + Math.max(1, Number(minutes) || 0) * 60 * 1000
    }
  };
}

export async function sweepKcc20Capsule({ wallet, vault, utxos, onStatus }) {
  if (!vault?.address) throw new Error('Missing freeze address');
  const k = await loadKaspaSdk();
  const redeemHex = vault.scriptHex || await reconstructTimelockRedeem(vault, wallet.pubKey);
  if (!redeemHex) throw new Error('This freeze has no redeem script saved — cannot sweep');
  const daaNow = await currentDaa();
  const unlock = Number(vault.unlockDaa || 0);
  if (unlock && daaNow < unlock) {
    const waitSec = Math.ceil((unlock - daaNow) / 10);
    throw new Error(`Still time-locked. Unlock DAA ${unlock}, now ${daaNow}. Wait ~${waitSec}s then Sweep.`);
  }
  const lockTime = Math.max(unlock || 0, daaNow);
  const p2shUtxos = utxos && utxos.length ? utxos : await fetchAddressUtxos(vault.address);
  const p2shEntries = restUtxosToEntries(p2shUtxos, vault.address);
  if (!p2shEntries.length) throw new Error('Witness capsule is empty — nothing to unlock with');
  onStatus?.('Loading frozen ' + (vault.tick || 'KCC20') + ' cells…');
  const selected = await loadLockedKcc20Pieces({ ...vault, scriptHex: redeemHex });
  if (!selected.length) {
    onStatus?.('No frozen token cells — sweeping witness KAS only…');
    return sweepVault({ wallet, vault: { ...vault, scriptHex: redeemHex }, utxos: p2shUtxos });
  }

  const priv = new k.PrivateKey(wallet.privKey);
  const selfPk = hexToU8(priv.toPublicKey().toXOnlyPublicKey().toString());
  const sendAmt = selected.reduce((a, p) => a + p.tokenAmount, 0n);
  const tpl = { script: selected[0].redeem.script, stateStart: selected[0].redeem.stateStart || 0 };
  const next = [presenceState(selfPk, sendAmt)];
  const tokenN = selected.length;
  const p2shIdx = tokenN;
  const witnesses = selected.map(() => p2shIdx);
  const inCellKas = selected.reduce((a, p) => a + p.value, 0n);
  const tokenKas = [inCellKas >= MIN_CELL_KAS ? inCellKas : MIN_CELL_KAS];
  const extraForCells = tokenKas[0] > inCellKas ? tokenKas[0] - inCellKas : 0n;
  const p2shSum = p2shEntries.reduce((a, e) => a + e.amount, 0n);
  const feeGuess = 600_000n;
  const { rpc, url } = await connectPublicNode();

  let extra = [];
  let extraSum = 0n;
  if (p2shSum + (inCellKas - tokenKas[0]) < feeGuess + extraForCells + 200_000n) {
    const walletUtxos = await fetchAddressUtxos(wallet.address);
    const feeEntries = restUtxosToEntries(walletUtxos, wallet.address)
      .sort((a, b) => (a.amount < b.amount ? 1 : -1));
    const need = extraForCells + feeGuess + 200_000n - p2shSum;
    for (const e of feeEntries) {
      extra.push(e);
      extraSum += e.amount;
      if (extraSum >= need) break;
    }
  }

  let kasChange = p2shSum + extraSum + inCellKas - tokenKas[0] - feeGuess;
  if (kasChange < 200_000n) kasChange = 0n;
  const tokenCovid = String(vault.tokenCovid || '').replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(tokenCovid)) throw new Error('Missing token covenant id on this freeze');

  const tokenIns = selected.map(p => {
    const redeem = p.redeem.script;
    const spk = k.payToScriptHashScript(redeem);
    return kccInputFromUtxo(k, {
      txid: p.transactionId,
      index: p.index,
      amount: p.value,
      scriptPublicKey: spk,
      address: String(k.addressFromScriptPublicKey(spk, 'mainnet') || ''),
      signatureScript: transferSigScript(k, redeem, next, witnesses),
      computeBudget: 100
    });
  });
  const tokenScripts = tokenIns.map(inp => hexish(inp.signatureScript));
  const p2shSpk = k.payToScriptHashScript(hexToU8(redeemHex));
  const p2shIns = p2shEntries.map(e => kccInputFromUtxo(k, {
    txid: e.outpoint.transactionId,
    index: e.outpoint.index,
    amount: e.amount,
    scriptPublicKey: e.scriptPublicKey || p2shSpk,
    address: vault.address,
    blockDaaScore: e.blockDaaScore,
    isCoinbase: e.isCoinbase,
    computeBudget: 60
  }));
  const kasIns = extra.map(e => kccInputFromUtxo(k, {
    txid: e.outpoint.transactionId,
    index: e.outpoint.index,
    amount: e.amount,
    scriptPublicKey: e.scriptPublicKey,
    address: wallet.address,
    blockDaaScore: e.blockDaaScore,
    isCoinbase: e.isCoinbase,
    computeBudget: 10
  }));

  const tokenOut = new k.TransactionOutput(
    tokenKas[0],
    k.payToScriptHashScript(materializeKcc20Script(tpl, next[0])),
    new k.CovenantBinding(0, new k.Hash(tokenCovid))
  );
  const changeSpk = k.payToAddressScript(wallet.address);
  const outputs = kasChange > 0n
    ? [tokenOut, new k.TransactionOutput(kasChange, changeSpk)]
    : [tokenOut];

  const tx = new k.Transaction({
    version: 1,
    inputs: [...tokenIns, ...p2shIns, ...kasIns],
    outputs,
    lockTime: BigInt(lockTime),
    gas: 0n,
    payload: '',
    subnetworkId: NATIVE_SUBNET
  });
  prepInputs(tx, { sigOpCount: 0, computeBudget: 10 });
  for (let i = 0; i < tokenN; i++) {
    tx.inputs[i].computeBudget = 100;
    tx.inputs[i].signatureScript = tokenScripts[i];
  }
  const p2shEnd = tokenN + p2shIns.length;
  for (let i = tokenN; i < p2shEnd; i++) tx.inputs[i].computeBudget = 60;
  try { k.updateTransactionMass('mainnet', tx); } catch {}

  function signMixed() {
    const signed = tokenScripts.slice();
    for (let i = tokenN; i < p2shEnd; i++) {
      const sig = k.createInputSignature(tx, i, priv, k.SighashType.All);
      const script = p2shSpendScript(k, redeemHex, sig);
      tx.inputs[i].signatureScript = script;
      signed.push(script);
    }
    for (let i = p2shEnd; i < tx.inputs.length; i++) {
      const sig = k.createInputSignature(tx, i, priv, k.SighashType.All);
      tx.inputs[i].signatureScript = hexish(sig);
      signed.push(hexish(sig));
    }
    return signed;
  }
  let scripts = signMixed();
  const inSum = inCellKas + p2shSum + extraSum;
  onStatus?.('Broadcasting KCC20 unfreeze…');
  let txId;
  try {
    txId = await submitSignedRpc(k, rpc, url, tx, {
      sigOpCount: 0,
      computeBudget: 100,
      lockTime,
      scripts
    });
  } catch (e) {
    if (isMassError(e)) throw massSplitError();
    const need = requiredFeeFromError(e);
    if (!need) throw e;
    const paid = inSum - [...tx.outputs].reduce((a, o) => a + BigInt(o.value), 0n);
    if (need <= paid) throw e;
    const last = tx.outputs.length - 1;
    const extraFee = need - paid + 50_000n;
    if (kasChange <= extraFee) throw e;
    tx.outputs[last].value = BigInt(tx.outputs[last].value) - extraFee;
    scripts = signMixed();
    txId = await submitSignedRpc(k, rpc, url, tx, {
      sigOpCount: 0,
      computeBudget: 100,
      lockTime,
      scripts
    });
  }
  const paidFee = inSum - [...tx.outputs].reduce((a, o) => a + BigInt(o.value), 0n);
  return {
    txId,
    tick: vault.tick,
    tokenAmount: sendAmt.toString(),
    amountKas: Number(kasChange) / 1e8,
    feeKas: Number(paidFee) / 1e8,
    node: url
  };
}

function toRawLocal(human, decimals) {
  const d = Math.max(0, Number(decimals) || 0);
  const t = String(human ?? '').trim().replace(',', '.');
  if (!t) throw new Error('Enter an amount');
  const [w, f = ''] = t.split('.');
  const frac = (f + '0'.repeat(d)).slice(0, d);
  const raw = BigInt(w || '0') * (10n ** BigInt(d)) + BigInt(frac || '0');
  if (raw <= 0n) throw new Error('Amount must be > 0');
  return raw.toString();
}
