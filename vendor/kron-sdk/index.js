var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/curve/cpCurve.ts
var cpCurve_exports = {};
__export(cpCurve_exports, {
  DEFAULT_SLIPPAGE_BPS: () => DEFAULT_SLIPPAGE_BPS,
  FEE_OUT_MIN: () => FEE_OUT_MIN,
  MAX_KAS: () => MAX_KAS,
  SCALE: () => SCALE,
  cpPrice: () => cpPrice,
  cpProgress: () => cpProgress,
  cpSold: () => cpSold,
  minOutWithSlippage: () => minOutWithSlippage,
  quoteCpBuy: () => quoteCpBuy,
  quoteCpSell: () => quoteCpSell
});
var SCALE = 1000000n;
var FEE_OUT_MIN = 20000000n;
var padFee = (f) => f > FEE_OUT_MIN ? f : FEE_OUT_MIN;
var MAX_KAS = 900000000000000n;
var ceilDiv = (a, b) => (a + b - 1n) / b;
var DEFAULT_SLIPPAGE_BPS = 100;
var minOutWithSlippage = (out, bps) => out - out * BigInt(Math.min(1e4, Math.max(0, Math.round(bps)))) / 10000n;
var devFundFeeOf = (s, base) => s.devFundBps && s.devFundBps > 0n ? padFee(base * s.devFundBps / 10000n) : 0n;
function quoteCpBuy(s, kasInSompi) {
  const ki = kasInSompi / SCALE;
  const kasIn = ki * SCALE;
  if (kasIn <= 0n) return null;
  const newRealKas = s.realKas + kasIn;
  if (newRealKas > MAX_KAS) return null;
  const ru = s.realKas / SCALE;
  const K = (s.vKas + ru) * s.tokenReserve;
  const newToken = ceilDiv(K, s.vKas + ru + ki);
  const tokenOut = s.tokenReserve - newToken;
  if (tokenOut <= 0n) return null;
  const creatorFee = padFee(kasIn * s.creatorFeeBps / 10000n);
  const platformFee = padFee(kasIn * s.platformFeeBps / 10000n);
  const devFundFee = devFundFeeOf(s, kasIn);
  const fee = creatorFee + platformFee + devFundFee;
  return { kasIn, tokenOut, creatorFee, platformFee, devFundFee, fee, total: kasIn + fee, newRealKas, newTokenReserve: newToken };
}
function quoteCpSell(s, tokenIn) {
  if (tokenIn <= 0n) return null;
  const ru = s.realKas / SCALE;
  const K = (s.vKas + ru) * s.tokenReserve;
  const newToken = s.tokenReserve + tokenIn;
  const minKasUnits = ceilDiv(K, newToken) - s.vKas;
  const newKasUnits = minKasUnits < 0n ? 0n : minKasUnits;
  const kasOutUnits = ru - newKasUnits;
  if (kasOutUnits <= 0n) return null;
  const kasOut = kasOutUnits * SCALE;
  const creatorFee = padFee(kasOut * s.creatorFeeBps / 10000n);
  const platformFee = padFee(kasOut * s.platformFeeBps / 10000n);
  const devFundFee = devFundFeeOf(s, kasOut);
  const fee = creatorFee + platformFee + devFundFee;
  if (kasOut - fee <= 0n) return null;
  return { tokenIn, kasOut, creatorFee, platformFee, devFundFee, fee, net: kasOut - fee, newRealKas: s.realKas - kasOut, newTokenReserve: newToken };
}
function cpPrice(s) {
  if (s.tokenReserve <= 0n) return 0;
  const ru = s.realKas / SCALE;
  return Number((s.vKas + ru) * SCALE) / Number(s.tokenReserve);
}
function cpProgress(s) {
  return s.graduationKas > 0n ? Math.min(100, Number(s.realKas) / Number(s.graduationKas) * 100) : 0;
}
var cpSold = (initialInventory, tokenReserve) => initialInventory - tokenReserve;

// src/native/sigscript.ts
var sigscript_exports = {};
__export(sigscript_exports, {
  SigScriptBuilder: () => SigScriptBuilder,
  int8LE: () => int8LE
});
function int8LE(v) {
  const out = new Uint8Array(8);
  let x = BigInt.asUintN(64, v);
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}
var concat = (parts) => {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
var SigScriptBuilder = class {
  sb;
  constructor(k) {
    this.sb = new k.ScriptBuilder({ flags: { covenantsEnabled: true } });
  }
  /** int scalar (minimal CScriptNum). */
  int(v) {
    this.sb.addI64(v);
    return this;
  }
  /** bool scalar → 1|0 via addI64 (matches push_sigscript_arg Bool). */
  bool(b) {
    this.sb.addI64(b ? 1n : 0n);
    return this;
  }
  /** single byte → addData([b]). */
  byte(b) {
    this.sb.addData(Uint8Array.of(b & 255));
    return this;
  }
  /** raw bytes (byte[N], pubkey, sig, byte[]) → addData. */
  data(bytes) {
    this.sb.addData(bytes);
    return this;
  }
  /** a column of N values pushed as one fixed-width-concatenated array item (encode_array_literal). */
  column(items) {
    this.sb.addData(concat(items));
    return this;
  }
  /** the entrypoint selector (branch index). Omit for single-entrypoint contracts. */
  selector(index) {
    this.sb.addI64(BigInt(index));
    return this;
  }
  /** the P2SH redeem script (pushed last; the VM pops it, hash-checks, then runs it on the arg stack). */
  redeem(script) {
    this.sb.addData(script);
    return this;
  }
  /** finalize → signature-script hex. */
  drain() {
    return this.sb.drain();
  }
};

// src/native/genesis.ts
var genesis_exports = {};
__export(genesis_exports, {
  ZERO_COVID: () => ZERO_COVID,
  bytesToCovid: () => bytesToCovid,
  covidToBytes: () => covidToBytes,
  genesisCovenantId: () => genesisCovenantId
});
var hexToBytes = (h) => Uint8Array.from((h.replace(/^0x/, "").match(/../g) ?? []).map((b) => parseInt(b, 16)));
var bytesToHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
function genesisCovenantId(k, genesisOutpoint, authOutputs) {
  const auth = authOutputs.map((o) => ({
    index: o.index,
    // Normalize to a plain { version, script-hex } object — the form the SDK serializes to match consensus.
    // A bare hex string OR a ScriptPublicKey *instance* both yield a (different) wrong id; only this works.
    output: { value: o.value, scriptPublicKey: { version: o.scriptPublicKey.version ?? 0, script: o.scriptPublicKey.script ?? o.scriptPublicKey } }
  }));
  return k.covenantId(genesisOutpoint, auth).toString();
}
var covidToBytes = (covidHex) => hexToBytes(covidHex);
var bytesToCovid = (u8) => bytesToHex(u8);
var ZERO_COVID = "00".repeat(32);

// src/native/spend.ts
var spend_exports = {};
__export(spend_exports, {
  COVENANT_COMPUTE: () => COVENANT_COMPUTE,
  COVENANT_DUST: () => COVENANT_DUST,
  FUNDING_COMPUTE: () => FUNDING_COMPUTE,
  MIN_RELAY_FEERATE: () => MIN_RELAY_FEERATE,
  TOKEN_COMPUTE: () => TOKEN_COMPUTE,
  TX_VERSION: () => TX_VERSION,
  assembleNativeTx: () => assembleNativeTx,
  estimateNativeFee: () => estimateNativeFee,
  estimatedSerializedSize: () => estimatedSerializedSize,
  signFundingInputs: () => signFundingInputs,
  signPsktWithKey: () => signPsktWithKey,
  toPsktJson: () => toPsktJson
});

// src/native/partnerTag.ts
var partnerTag_exports = {};
__export(partnerTag_exports, {
  REF_RE: () => REF_RE,
  TAG_PREFIX: () => TAG_PREFIX,
  encodePartnerTag: () => encodePartnerTag,
  parsePartnerTag: () => parsePartnerTag
});
var REF_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
var TAG_PREFIX = "kron:r:";
var MAX_TAG_BYTES = TAG_PREFIX.length + 32;
var toHex = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
function encodePartnerTag(ref) {
  const r = String(ref ?? "").trim().toLowerCase();
  if (!REF_RE.test(r)) return "";
  return toHex(`${TAG_PREFIX}${r}`);
}
function parsePartnerTag(payloadHex) {
  const h = String(payloadHex ?? "");
  if (!h || h.length % 2 !== 0 || h.length > MAX_TAG_BYTES * 2 || !/^[0-9a-fA-F]*$/.test(h)) return null;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  if (!s.startsWith(TAG_PREFIX)) return null;
  const ref = s.slice(TAG_PREFIX.length);
  return REF_RE.test(ref) ? ref : null;
}

// src/native/spend.ts
var TX_VERSION = 1;
var FUNDING_COMPUTE = 10;
var TOKEN_COMPUTE = 100;
var COVENANT_COMPUTE = 400;
var COVENANT_DUST = 50000000n;
var MIN_RELAY_FEERATE = 100;
var TRANSIENT_BYTE_TO_MASS_FACTOR = 4n;
var COMPUTE_MASS_LIMIT = 500000n;
var TRANSIENT_MASS_LIMIT = 1000000n;
function estimatedSerializedSize(tx) {
  const hexBytes = (h) => BigInt(Math.ceil(String(h ?? "").length / 2));
  let size = 2n + 8n + 8n + 8n + 20n + 8n + 32n + 8n;
  size += hexBytes(tx.payload);
  for (const inp of tx.inputs ?? []) {
    size += 32n + 4n + 8n + 8n;
    size += hexBytes(inp.signatureScript);
    if (TX_VERSION >= 1) size += 2n;
  }
  for (const out of tx.outputs ?? []) {
    size += 8n + 2n + 8n;
    size += hexBytes(out.scriptPublicKey?.script ?? out.scriptPublicKey);
    if (out.covenant) size += 2n + 32n;
  }
  return size;
}
var SUBNET_ZERO = "0000000000000000000000000000000000000000";
var budgetForRole = (role) => role === "curve" || role === "pool" ? COVENANT_COMPUTE : TOKEN_COMPUTE;
function assembleNativeTx(k, opts) {
  const { spend, fundingEntries, changeAddress, networkFee, ref } = opts;
  const kk = k;
  const covInputs = spend.inputs.map(
    (ci) => new kk.TransactionInput({
      previousOutpoint: { transactionId: ci.transactionId, index: ci.index },
      signatureScript: ci.signatureScript,
      sequence: 0n,
      sigOpCount: 0,
      computeBudget: ci.computeBudget ?? budgetForRole(ci.role),
      utxo: {
        outpoint: { transactionId: ci.transactionId, index: ci.index },
        amount: ci.value,
        scriptPublicKey: ci.scriptPublicKey,
        blockDaaScore: 0n,
        isCoinbase: false
      }
    })
  );
  const fundingInputs = fundingEntries.map(
    (e) => new kk.TransactionInput({ previousOutpoint: e.outpoint, signatureScript: "", sequence: 0n, sigOpCount: 0, computeBudget: FUNDING_COMPUTE, utxo: e })
  );
  const covInValue = spend.inputs.reduce((s, ci) => s + ci.value, 0n);
  const fundingTotal = fundingEntries.reduce((s, e) => s + BigInt(e.amount), 0n);
  const totalIn = covInValue + fundingTotal;
  const covenantOut = spend.outputs.reduce((s, o) => s + o.value, 0n);
  const change = totalIn - covenantOut - networkFee;
  if (change < 0n) throw new Error(`insufficient funding: need ${covenantOut + networkFee} sompi, have ${totalIn}`);
  const outputs = spend.outputs.map(
    (o) => o.binding ? new kk.TransactionOutput(o.value, o.scriptPublicKey, new kk.CovenantBinding(o.binding.authorizingInput, new kk.Hash(o.binding.covid))) : new kk.TransactionOutput(o.value, o.scriptPublicKey)
  );
  outputs.push(new kk.TransactionOutput(change, kk.payToAddressScript(changeAddress)));
  const transaction = new kk.Transaction({
    version: TX_VERSION,
    inputs: [...covInputs, ...fundingInputs],
    outputs,
    lockTime: 0n,
    gas: 0n,
    // Partner attribution rides HERE, in the transaction itself — so it is captured whether the trade goes to
    // the sequencer or straight to a node. Recording it at relay time (the old design) meant a wallet with no
    // contention to sequence submitted direct and earned nothing. Empty string when untagged.
    payload: encodePartnerTag(ref),
    subnetworkId: SUBNET_ZERO
  });
  return {
    transaction,
    fundingInputIndexes: fundingInputs.map((_, i) => i + covInputs.length),
    totalIn,
    covenantOut,
    change
  };
}
function estimateNativeFee(k, networkId, asm, feeRateSompiPerGram) {
  const kk = k;
  const tx = asm.transaction;
  const ins = tx.inputs;
  const saved = asm.fundingInputIndexes.map((i) => ins[i].signatureScript);
  for (const i of asm.fundingInputIndexes) ins[i].signatureScript = "00".repeat(66);
  tx.inputs = ins;
  let byteMass = 2000n;
  try {
    byteMass = BigInt(kk.calculateTransactionMass(networkId, tx));
  } catch {
  }
  const ins2 = tx.inputs;
  asm.fundingInputIndexes.forEach((i, j) => ins2[i].signatureScript = saved[j]);
  tx.inputs = ins2;
  let computeGrams = 0n;
  for (const inp of tx.inputs) computeGrams += BigInt(inp.computeBudget || 0) * 100n;
  const rawTransient = estimatedSerializedSize(tx) * TRANSIENT_BYTE_TO_MASS_FACTOR;
  const normTransient = (rawTransient * COMPUTE_MASS_LIMIT + TRANSIENT_MASS_LIMIT - 1n) / TRANSIENT_MASS_LIMIT;
  const compute = byteMass + computeGrams;
  const billable = compute > normTransient ? compute : normTransient;
  const rate = BigInt(Math.max(Math.ceil(feeRateSompiPerGram), MIN_RELAY_FEERATE));
  const fee = billable * rate * 6n / 5n;
  return fee > 10000n ? fee : 10000n;
}
function signFundingInputs(k, tx, privKey, fundingInputIndexes) {
  const inputs = tx.inputs;
  for (const idx of fundingInputIndexes) {
    const sig = k.createInputSignature(tx, idx, privKey);
    inputs[idx].signatureScript = new k.ScriptBuilder().addData(sig).drain();
  }
  tx.inputs = inputs;
  return tx;
}
function toPsktJson(asm, sighashType = 1) {
  return {
    txJsonString: asm.transaction.serializeToSafeJSON(),
    signInputs: asm.fundingInputIndexes.map((index) => ({ index, sighashType }))
  };
}
function signPsktWithKey(k, txJsonString, signInputs, privKey) {
  const kk = k;
  const tx = kk.Transaction.deserializeFromSafeJSON(txJsonString);
  const inputs = tx.inputs;
  for (const { index } of signInputs) {
    const sig = kk.createInputSignature(tx, index, privKey);
    inputs[index].signatureScript = new kk.ScriptBuilder().addData(sig).drain();
  }
  tx.inputs = inputs;
  return tx.serializeToSafeJSON();
}

// src/native/covenantSelect.ts
var covenantSelect_exports = {};
__export(covenantSelect_exports, {
  COVENANT_DUST: () => COVENANT_DUST,
  carrierOf: () => carrierOf,
  carrierShortfall: () => carrierShortfall,
  continuationValue: () => continuationValue,
  normalizedCovenantId: () => normalizedCovenantId,
  selectCovenantOutpoint: () => selectCovenantOutpoint,
  selectCovenantTokenOutpoint: () => selectCovenantTokenOutpoint,
  selectCovenantTokenUtxo: () => selectCovenantTokenUtxo,
  selectCovenantUtxo: () => selectCovenantUtxo
});
var carrierShortfall = (...inputValues) => inputValues.reduce((sum, v) => sum + (v < COVENANT_DUST ? COVENANT_DUST - v : 0n), 0n);
var carrierOf = (u) => u.value ?? COVENANT_DUST;
var continuationValue = (dust, inputValue) => inputValue > dust ? inputValue : dust;
var normalizedCovenantId = (value) => {
  const text = String(value?.toString?.() ?? value ?? "").trim().toLowerCase().replace(/^0x/, "");
  return /^[0-9a-f]{64}$/.test(text) ? text : null;
};
function selectCovenantUtxo(entries, expectedCovid, expectedAmount) {
  const covid = normalizedCovenantId(expectedCovid);
  if (!covid) return null;
  const matches = entries.filter((e) => e.covenantId === covid && (expectedAmount === null || BigInt(e.amount) === expectedAmount));
  return matches.length === 1 ? matches[0] : null;
}
function selectCovenantOutpoint(entries, expectedOutpoint, expectedCovid, expectedAmount) {
  const txid = normalizedCovenantId(expectedOutpoint.transactionId);
  const covid = normalizedCovenantId(expectedCovid);
  if (!txid || !covid || !Number.isSafeInteger(expectedOutpoint.index) || expectedOutpoint.index < 0) return null;
  const matches = entries.filter((e) => normalizedCovenantId(e.outpoint?.transactionId) === txid && Number(e.outpoint?.index) === expectedOutpoint.index && e.covenantId === covid && (expectedAmount === null || BigInt(e.amount) === expectedAmount));
  return matches.length === 1 ? matches[0] : null;
}
function selectCovenantTokenUtxo(entries, expectedCovid) {
  return selectCovenantUtxo(entries, expectedCovid, null);
}
function selectCovenantTokenOutpoint(entries, expectedOutpoint, expectedCovid) {
  return selectCovenantOutpoint(entries, expectedOutpoint, expectedCovid, null);
}

// src/native/kcc20Tx.ts
var kcc20Tx_exports = {};
__export(kcc20Tx_exports, {
  IDENTIFIER: () => IDENTIFIER,
  addressPresenceOwned: () => addressPresenceOwned,
  buildKcc20Send: () => buildKcc20Send,
  covenantIdOwned: () => covenantIdOwned,
  decodeKcc20Redeem: () => decodeKcc20Redeem,
  kcc20Address: () => kcc20Address,
  kcc20Spk: () => kcc20Spk,
  kcc20SpkForState: () => kcc20SpkForState,
  materializeKcc20Script: () => materializeKcc20Script,
  pubkeyOwned: () => pubkeyOwned,
  pushKcc20StateScalar: () => pushKcc20StateScalar,
  pushKcc20States: () => pushKcc20States,
  scriptHashOwned: () => scriptHashOwned,
  transferSigScript: () => transferSigScript
});
var IDENTIFIER = { PUBKEY: 0, SCRIPT_HASH: 1, COVENANT_ID: 2, ADDRESS: 3 };
var STATE_LEN = 46;
function materializeKcc20Script(tpl, state) {
  const s = tpl.stateStart;
  const t = tpl.script;
  if (t[s] !== 32 || t[s + 33] !== 1 || t[s + 35] !== 8 || t[s + 44] !== 1) {
    throw new Error("kcc20 template has an unexpected state layout (expected push32 owner / push1 type / push8 amount / push1 isMinter)");
  }
  if (state.ownerIdentifier.length !== 32) throw new Error("ownerIdentifier must be 32 bytes");
  if (state.amount < 0n) throw new Error("amount must be non-negative");
  const out = t.slice();
  out[s] = 32;
  out.set(state.ownerIdentifier, s + 1);
  out[s + 33] = 1;
  out[s + 34] = state.identifierType;
  out[s + 35] = 8;
  out.set(int8LE(state.amount), s + 36);
  out[s + 44] = 1;
  out[s + 45] = state.isMinter ? 1 : 0;
  return out;
}
function decodeKcc20Redeem(redeem, opts = {}) {
  const hits = [];
  for (let s2 = 0; s2 + STATE_LEN <= redeem.length; s2++) {
    if (redeem[s2] === 32 && redeem[s2 + 33] === 1 && redeem[s2 + 34] <= 3 && redeem[s2 + 35] === 8 && redeem[s2 + 44] === 1 && redeem[s2 + 45] <= 1) hits.push(s2);
  }
  if (hits.length !== 1) throw new Error(`could not locate the kcc20 state region in the redeem script (${hits.length} candidate offsets) \u2014 is this a kcc20 token UTXO?`);
  const s = hits[0];
  let amount = 0n;
  for (let i = 7; i >= 0; i--) amount = amount << 8n | BigInt(redeem[s + 36 + i]);
  return {
    template: { script: redeem.slice(), stateStart: s, maxIns: opts.maxIns ?? 4, maxOuts: opts.maxOuts ?? 4 },
    state: {
      ownerIdentifier: redeem.slice(s + 1, s + 33),
      identifierType: redeem[s + 34],
      amount,
      isMinter: redeem[s + 45] === 1
    }
  };
}
var kcc20Spk = (k, redeem) => k.payToScriptHashScript(redeem);
var kcc20SpkForState = (k, tpl, state) => kcc20Spk(k, materializeKcc20Script(tpl, state));
function kcc20Address(k, tpl, state, network) {
  return k.addressFromScriptPublicKey(kcc20SpkForState(k, tpl, state), network)?.toString() ?? "";
}
var covenantIdOwned = (covid32, amount, isMinter = false) => ({
  ownerIdentifier: covid32,
  identifierType: IDENTIFIER.COVENANT_ID,
  amount,
  isMinter
});
var pubkeyOwned = (pubkey32, amount) => ({
  ownerIdentifier: pubkey32,
  identifierType: IDENTIFIER.PUBKEY,
  amount,
  isMinter: false
});
var scriptHashOwned = (hash32, amount) => ({
  ownerIdentifier: hash32,
  identifierType: IDENTIFIER.SCRIPT_HASH,
  amount,
  isMinter: false
});
var addressPresenceOwned = (pubkey32, amount) => ({
  ownerIdentifier: pubkey32,
  identifierType: IDENTIFIER.ADDRESS,
  amount,
  isMinter: false
});
function pushKcc20StateScalar(b, st) {
  if (st.ownerIdentifier.length !== 32) throw new Error("ownerIdentifier must be 32 bytes");
  b.data(st.ownerIdentifier).byte(st.identifierType).int(st.amount).bool(st.isMinter);
}
function pushKcc20States(b, states) {
  for (const st of states) if (st.ownerIdentifier.length !== 32) throw new Error("ownerIdentifier must be 32 bytes");
  b.column(states.map((s) => s.ownerIdentifier));
  b.column(states.map((s) => Uint8Array.of(s.identifierType)));
  b.column(states.map((s) => int8LE(s.amount)));
  b.column(states.map((s) => Uint8Array.of(s.isMinter ? 1 : 0)));
}
function transferSigScript(k, redeem, newStates, witnesses, sigs = []) {
  if (newStates.length < 1) throw new Error("transfer requires at least one output state");
  const b = new SigScriptBuilder(k);
  pushKcc20States(b, newStates);
  b.column(sigs);
  b.data(Uint8Array.from(witnesses, (w) => w & 255));
  b.redeem(redeem);
  return b.drain();
}
function buildKcc20Send(k, tpl, senderTokens, recipientPubkey32, sendAmount, presenceWitnessIdx, tokenCovid, opts = {}) {
  if (senderTokens.length < 1) throw new Error("send requires at least one token UTXO");
  if (!tokenCovid) throw new Error("send requires the token covenant id (indexer token info `covenantId`) for the output bindings");
  const total = senderTokens.reduce((s, t) => s + t.state.amount, 0n);
  const change = total - sendAmount;
  if (sendAmount < 1n || change < 0n) throw new Error(`send requires 1 <= sendAmount <= ${total} (the selected UTXOs' total)`);
  const dust = opts.tokenDust ?? 50000000n;
  const owner = senderTokens[0].state.ownerIdentifier;
  const recipientOut = addressPresenceOwned(recipientPubkey32, sendAmount);
  const newStates = change >= 1n ? [recipientOut, addressPresenceOwned(owner, change)] : [recipientOut];
  const witnesses = senderTokens.map(() => presenceWitnessIdx);
  const inputs = senderTokens.map((t) => {
    const r = materializeKcc20Script(tpl, t.state);
    return { transactionId: t.transactionId, index: t.index, value: t.value, scriptPublicKey: kcc20Spk(k, r), signatureScript: transferSigScript(k, r, newStates, witnesses), redeem: r, role: "token" };
  });
  const binding = { covid: tokenCovid, authorizingInput: 0 };
  const outputs = newStates.map((st, i) => ({
    value: dust,
    scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tpl, st)),
    role: i === 0 ? "send" : "change",
    binding
  }));
  return { kind: "transfer", inputs, outputs, economics: { sendAmount, change }, covids: { tokenCovid } };
}

// src/native/curveCpTx.ts
var curveCpTx_exports = {};
__export(curveCpTx_exports, {
  SCALE: () => SCALE2,
  SELECTOR: () => SELECTOR,
  buildConsolidate: () => buildConsolidate,
  buildCpBuy: () => buildCpBuy,
  buildCpGraduate: () => buildCpGraduate,
  buildCpSell: () => buildCpSell,
  buildSplitToken: () => buildSplitToken,
  cpAddress: () => cpAddress,
  cpSpk: () => cpSpk,
  cpSpkForState: () => cpSpkForState,
  materializeCpScript: () => materializeCpScript,
  p2pkSpk: () => p2pkSpk
});

// src/native/poolCpTx.ts
var poolCpTx_exports = {};
__export(poolCpTx_exports, {
  MAX_SHARES: () => MAX_SHARES,
  POOL_CP_SELECTOR: () => POOL_CP_SELECTOR,
  addMinDKas: () => addMinDKas,
  buildAddLiquidity: () => buildAddLiquidity,
  buildBindLp: () => buildBindLp,
  buildRemoveLiquidity: () => buildRemoveLiquidity,
  materializePoolCpScript: () => materializePoolCpScript,
  poolCpAddress: () => poolCpAddress,
  poolCpSpk: () => poolCpSpk,
  poolCpSpkForState: () => poolCpSpkForState,
  quoteAddLiquidity: () => quoteAddLiquidity,
  quotePoolCpBuy: () => quotePoolCpBuy,
  quotePoolCpSell: () => quotePoolCpSell,
  quoteRemoveLiquidity: () => quoteRemoveLiquidity,
  removeMinDShares: () => removeMinDShares,
  snapAddDKas: () => snapAddDKas,
  snapRemoveDShares: () => snapRemoveDShares
});
var POOL_CP_SELECTOR = { swapKasForToken: 0, swapTokenForKas: 1, addLiquidity: 2, removeLiquidity: 3, bindLp: 4 };
var MAX_SHARES = 10000000n;
var padFee2 = (f) => f > FEE_OUT_MIN ? f : FEE_OUT_MIN;
var ceilDiv2 = (a, b) => (a + b - 1n) / b;
var hexOf = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
function materializePoolCpScript(tpl, state) {
  const s = tpl.stateStart;
  const t = tpl.script;
  if (t[s] !== 8 || t[s + 9] !== 8 || t[s + 18] !== 32 || t[s + 51] !== 8 || t[s + 60] !== 32) {
    throw new Error("pool template has an unexpected state layout (expected kasReserve/tokenReserve/tokenCovid/totalShares/lpCovid)");
  }
  if (state.kasReserve < 0n || state.tokenReserve < 0n || state.totalShares < 0n) throw new Error("reserves/shares must be non-negative");
  if (state.tokenCovid.length !== 32) throw new Error("tokenCovid must be 32 bytes");
  if (state.lpCovid.length !== 32) throw new Error("lpCovid must be 32 bytes");
  const out = t.slice();
  out[s] = 8;
  out.set(int8LE(state.kasReserve), s + 1);
  out[s + 9] = 8;
  out.set(int8LE(state.tokenReserve), s + 10);
  out[s + 18] = 32;
  out.set(state.tokenCovid, s + 19);
  out[s + 51] = 8;
  out.set(int8LE(state.totalShares), s + 52);
  out[s + 60] = 32;
  out.set(state.lpCovid, s + 61);
  return out;
}
var poolCpSpk = (k, redeem) => k.payToScriptHashScript(redeem);
var poolCpSpkForState = (k, tpl, state) => poolCpSpk(k, materializePoolCpScript(tpl, state));
function poolCpAddress(k, tpl, state, network) {
  return k.addressFromScriptPublicKey(poolCpSpkForState(k, tpl, state), network)?.toString() ?? "";
}
function retainKasUnits(kasUnits, state, p) {
  const weight = p.lpFeeBps * (state.totalShares - p.lockedShares);
  if (weight <= 0n) return 0n;
  return ceilDiv2(kasUnits * weight, 10000n * state.totalShares);
}
function quotePoolCpBuy(state, p, kasInSompi) {
  const kasInUnits = kasInSompi / SCALE;
  const kasIn = kasInUnits * SCALE;
  if (kasInUnits <= 0n) return null;
  const newKas = state.kasReserve + kasInUnits;
  const oldK = state.kasReserve * state.tokenReserve;
  const retainKas = retainKasUnits(kasInUnits, state, p);
  const effKas = newKas - retainKas;
  if (effKas <= 0n) return null;
  const newToken = ceilDiv2(oldK, effKas);
  const tokenOut = state.tokenReserve - newToken;
  if (tokenOut <= 0n) return null;
  const creatorFee = kasIn * p.creatorFeeBps / 10000n;
  const platformFee = kasIn * p.platformFeeBps / 10000n;
  const lpFee = kasIn * p.lpFeeBps / 10000n;
  const creatorFloorRent = lpFee * p.lockedShares / state.totalShares;
  const creatorOut = padFee2(creatorFee + creatorFloorRent);
  const platformOut = padFee2(platformFee);
  return { kasInUnits, kasIn, tokenOut, creatorFee, creatorFloorRent, platformFee, lpFee, creatorOut, platformOut, total: kasIn + creatorOut + platformOut, newKas, newToken };
}
function quotePoolCpSell(state, p, tokenIn) {
  if (tokenIn <= 0n) return null;
  const newToken = state.tokenReserve + tokenIn;
  const oldK = state.kasReserve * state.tokenReserve;
  const effMin = ceilDiv2(oldK, newToken);
  const budget = state.kasReserve - effMin;
  if (budget <= 0n) return null;
  const g = (x) => x + retainKasUnits(x, state, p);
  const vol = state.totalShares - p.lockedShares;
  const denom = 10000n * state.totalShares + p.lpFeeBps * vol;
  let kasOutUnits = budget * 10000n * state.totalShares / denom;
  while (kasOutUnits > 0n && g(kasOutUnits) > budget) kasOutUnits -= 1n;
  while (g(kasOutUnits + 1n) <= budget) kasOutUnits += 1n;
  const newKas = state.kasReserve - kasOutUnits;
  if (kasOutUnits <= 0n || newKas < 1n) return null;
  const kasOut = kasOutUnits * SCALE;
  const creatorFee = kasOut * p.creatorFeeBps / 10000n;
  const platformFee = kasOut * p.platformFeeBps / 10000n;
  const lpFee = kasOut * p.lpFeeBps / 10000n;
  const creatorFloorRent = lpFee * p.lockedShares / state.totalShares;
  const creatorOut = padFee2(creatorFee + creatorFloorRent);
  const platformOut = padFee2(platformFee);
  if (kasOut - creatorOut - platformOut <= 0n) return null;
  return { tokenIn, kasOutUnits, kasOut, creatorFee, creatorFloorRent, platformFee, lpFee, creatorOut, platformOut, net: kasOut - creatorOut - platformOut, newKas, newToken };
}
function addMinDKas(state) {
  return (state.kasReserve + state.totalShares - 1n) / state.totalShares;
}
function snapAddDKas(state, desiredDKas) {
  const min = addMinDKas(state);
  if (min <= 0n || desiredDKas < min) return 0n;
  return desiredDKas;
}
function quoteAddLiquidity(state, dKas) {
  if (dKas <= 0n) throw new Error("dKas must be positive");
  const dShares = state.totalShares * dKas / state.kasReserve;
  if (dShares <= 0n) throw new Error("dKas too small to mint an integer LP share (snap with snapAddDKas / addMinDKas first)");
  const dToken = (state.tokenReserve * dShares + state.totalShares - 1n) / state.totalShares;
  return { dKas, dToken, dShares, newKas: state.kasReserve + dKas, newToken: state.tokenReserve + dToken, newShares: state.totalShares + dShares };
}
function removeMinDShares(state) {
  const ceilDiv3 = (a, b) => (a + b - 1n) / b;
  const minKas = ceilDiv3(state.totalShares, state.kasReserve);
  const minTok = ceilDiv3(state.totalShares, state.tokenReserve);
  return minKas < minTok ? minKas : minTok;
}
function snapRemoveDShares(state, desiredDShares) {
  if (desiredDShares <= 0n || desiredDShares < removeMinDShares(state)) return 0n;
  return desiredDShares;
}
function quoteRemoveLiquidity(state, p, dShares) {
  if (dShares <= 0n) throw new Error("dShares must be positive");
  if (state.totalShares - dShares < p.lockedShares) throw new Error("removal would dip below the permanently-locked floor");
  const dKas = state.kasReserve * dShares / state.totalShares;
  const dToken = state.tokenReserve * dShares / state.totalShares;
  if (dKas === 0n && dToken === 0n) throw new Error("withdrawal too small: both payout sides round to zero");
  return { dShares, dKas, dToken, newKas: state.kasReserve - dKas, newToken: state.tokenReserve - dToken, newShares: state.totalShares - dShares };
}
function addLiquiditySig(k, redeem, dKas, dToken, dShares, poolTokenOut, poolLpOut, lpSharesOut) {
  const b = new SigScriptBuilder(k).int(dKas).int(dToken).int(dShares);
  pushKcc20StateScalar(b, poolTokenOut);
  pushKcc20StateScalar(b, poolLpOut);
  pushKcc20StateScalar(b, lpSharesOut);
  return b.selector(POOL_CP_SELECTOR.addLiquidity).redeem(redeem).drain();
}
function removeLiquiditySig(k, redeem, dShares, dKas, dToken, poolTokenOut, lpTokenOut, poolLpOut) {
  const b = new SigScriptBuilder(k).int(dShares).int(dKas).int(dToken);
  pushKcc20StateScalar(b, poolTokenOut);
  pushKcc20StateScalar(b, lpTokenOut);
  pushKcc20StateScalar(b, poolLpOut);
  return b.selector(POOL_CP_SELECTOR.removeLiquidity).redeem(redeem).drain();
}
function buildAddLiquidity(k, tpl, tokenTpl, utxo, lpInventory, poolCovid, lpDepositToken, lpPubkey, q, presenceWitnessIdx, opts) {
  if (opts?.lpBindVerified !== true) {
    throw new Error(`Refusing to build addLiquidity: pool LP-bind integrity is ${opts?.lpBindVerified === false ? "FAILED (counterfeit shares could drain your deposit)" : "UNVERIFIED"}. Await IndexerClient.assertLpBindSafe(tick), then pass the fetched verdict as opts.lpBindVerified.`);
  }
  if (lpDepositToken.state.amount !== q.dToken) throw new Error("LP deposit token UTXO must equal dToken exactly (split first)");
  const dust = opts.tokenDust ?? COVENANT_DUST;
  const { kasReserve, tokenReserve, tokenCovid, lpCovid } = utxo.state;
  const poolCovidHex = hexOf(poolCovid);
  const tokenCovidHex = hexOf(tokenCovid);
  const lpCovidHex = hexOf(lpCovid);
  const poolTokenOut = covenantIdOwned(poolCovid, q.newToken, false);
  const poolLpOut = covenantIdOwned(poolCovid, lpInventory.amount - q.dShares, false);
  const lpSharesOut = addressPresenceOwned(lpPubkey, q.dShares);
  const curRedeem = materializePoolCpScript(tpl, utxo.state);
  const newRedeem = materializePoolCpScript(tpl, { kasReserve: q.newKas, tokenReserve: q.newToken, tokenCovid, totalShares: q.newShares, lpCovid });
  const lpDepositRedeem = materializeKcc20Script(tokenTpl, lpDepositToken.state);
  const poolAResRedeem = materializeKcc20Script(tokenTpl, covenantIdOwned(poolCovid, tokenReserve, false));
  const poolLpInvRedeem = materializeKcc20Script(tokenTpl, covenantIdOwned(poolCovid, lpInventory.amount, false));
  const aStates = [poolTokenOut];
  const aWitnesses = [presenceWitnessIdx, 0];
  const lStates = [poolLpOut, lpSharesOut];
  const lWitnesses = [0];
  const inputs = [
    { transactionId: utxo.transactionId, index: utxo.index, value: kasReserve * SCALE, scriptPublicKey: poolCpSpk(k, curRedeem), signatureScript: addLiquiditySig(k, curRedeem, q.dKas, q.dToken, q.dShares, poolTokenOut, poolLpOut, lpSharesOut), redeem: curRedeem, role: "pool" },
    { transactionId: lpDepositToken.transactionId, index: lpDepositToken.index, value: lpDepositToken.value, scriptPublicKey: kcc20Spk(k, lpDepositRedeem), signatureScript: transferSigScript(k, lpDepositRedeem, aStates, aWitnesses), redeem: lpDepositRedeem, role: "lpDeposit" },
    { transactionId: utxo.tokenUtxo.transactionId, index: utxo.tokenUtxo.index, value: utxo.tokenUtxo.value, scriptPublicKey: kcc20Spk(k, poolAResRedeem), signatureScript: transferSigScript(k, poolAResRedeem, aStates, aWitnesses), redeem: poolAResRedeem, role: "poolToken" },
    { transactionId: lpInventory.transactionId, index: lpInventory.index, value: lpInventory.value, scriptPublicKey: kcc20Spk(k, poolLpInvRedeem), signatureScript: transferSigScript(k, poolLpInvRedeem, lStates, lWitnesses), redeem: poolLpInvRedeem, role: "poolLpInventory" }
  ];
  const outputs = [
    { value: q.newKas * SCALE, scriptPublicKey: poolCpSpk(k, newRedeem), role: "pool", binding: { covid: poolCovidHex, authorizingInput: 0 } },
    { value: continuationValue(dust, utxo.tokenUtxo.value), scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, poolTokenOut)), role: "poolToken", binding: { covid: tokenCovidHex, authorizingInput: 2 } },
    { value: continuationValue(dust, lpInventory.value), scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, poolLpOut)), role: "poolLpInventory", binding: { covid: lpCovidHex, authorizingInput: 3 } },
    { value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, lpSharesOut)), role: "lpShares", binding: { covid: lpCovidHex, authorizingInput: 3 } }
  ];
  return { kind: "addLiquidity", inputs, outputs, economics: { dKas: q.dKas, dToken: q.dToken, dShares: q.dShares, newShares: q.newShares }, covids: { poolCovid: poolCovidHex, tokenCovid: tokenCovidHex } };
}
function buildRemoveLiquidity(k, tpl, tokenTpl, utxo, lpShares, poolCovid, lpPubkey, q, presenceWitnessIdx, opts = {}) {
  if (lpShares.state.amount !== q.dShares) throw new Error("LP shares UTXO must equal dShares exactly (split first)");
  const dust = opts.tokenDust ?? COVENANT_DUST;
  const { kasReserve, tokenReserve, tokenCovid, lpCovid } = utxo.state;
  const poolCovidHex = hexOf(poolCovid);
  const tokenCovidHex = hexOf(tokenCovid);
  const lpCovidHex = hexOf(lpCovid);
  const canonical = !!tpl.canonicalInventoryRequired;
  const lpInventory = opts.lpInventory;
  if (canonical && (!lpInventory || lpInventory.amount !== MAX_SHARES - utxo.state.totalShares)) {
    throw new Error("removeLiquidity requires the canonical pool LP inventory (pass opts.lpInventory equal to MAX_SHARES - totalShares)");
  }
  const poolTokenOut = covenantIdOwned(poolCovid, q.newToken, false);
  const lpTokenOut = addressPresenceOwned(lpPubkey, q.dToken);
  const poolLpOut = covenantIdOwned(poolCovid, canonical ? MAX_SHARES - q.newShares : q.dShares, false);
  const curRedeem = materializePoolCpScript(tpl, utxo.state);
  const newRedeem = materializePoolCpScript(tpl, { kasReserve: q.newKas, tokenReserve: q.newToken, tokenCovid, totalShares: q.newShares, lpCovid });
  const poolAResRedeem = materializeKcc20Script(tokenTpl, covenantIdOwned(poolCovid, tokenReserve, false));
  const lpSharesRedeem = materializeKcc20Script(tokenTpl, lpShares.state);
  const poolLpInvRedeem = canonical ? materializeKcc20Script(tokenTpl, covenantIdOwned(poolCovid, lpInventory.amount, false)) : null;
  const aStates = q.dToken > 0n ? [poolTokenOut, lpTokenOut] : [poolTokenOut];
  const aWitnesses = [0];
  const lStates = [poolLpOut];
  const lWitnesses = canonical ? [0, presenceWitnessIdx] : [presenceWitnessIdx];
  const inputs = [
    { transactionId: utxo.transactionId, index: utxo.index, value: kasReserve * SCALE, scriptPublicKey: poolCpSpk(k, curRedeem), signatureScript: removeLiquiditySig(k, curRedeem, q.dShares, q.dKas, q.dToken, poolTokenOut, lpTokenOut, poolLpOut), redeem: curRedeem, role: "pool" },
    { transactionId: utxo.tokenUtxo.transactionId, index: utxo.tokenUtxo.index, value: utxo.tokenUtxo.value, scriptPublicKey: kcc20Spk(k, poolAResRedeem), signatureScript: transferSigScript(k, poolAResRedeem, aStates, aWitnesses), redeem: poolAResRedeem, role: "poolToken" },
    ...canonical ? [{ transactionId: lpInventory.transactionId, index: lpInventory.index, value: lpInventory.value, scriptPublicKey: kcc20Spk(k, poolLpInvRedeem), signatureScript: transferSigScript(k, poolLpInvRedeem, lStates, lWitnesses), redeem: poolLpInvRedeem, role: "poolLpInventory" }] : [],
    { transactionId: lpShares.transactionId, index: lpShares.index, value: lpShares.value, scriptPublicKey: kcc20Spk(k, lpSharesRedeem), signatureScript: transferSigScript(k, lpSharesRedeem, lStates, lWitnesses), redeem: lpSharesRedeem, role: "lpShares" }
  ];
  const outputs = [
    { value: q.newKas * SCALE, scriptPublicKey: poolCpSpk(k, newRedeem), role: "pool", binding: { covid: poolCovidHex, authorizingInput: 0 } },
    { value: continuationValue(dust, utxo.tokenUtxo.value), scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, poolTokenOut)), role: "poolToken", binding: { covid: tokenCovidHex, authorizingInput: 1 } },
    ...q.dToken > 0n ? [{ value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, lpTokenOut)), role: "lpToken", binding: { covid: tokenCovidHex, authorizingInput: 1 } }] : [],
    { value: canonical ? continuationValue(dust, lpInventory.value) : dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, poolLpOut)), role: "poolLpInventory", binding: { covid: lpCovidHex, authorizingInput: 2 } }
  ];
  return { kind: "removeLiquidity", inputs, outputs, economics: { dShares: q.dShares, dKas: q.dKas, dToken: q.dToken, newShares: q.newShares }, covids: { poolCovid: poolCovidHex, tokenCovid: tokenCovidHex } };
}
function buildBindLp(k, tpl, tokenTpl, utxo, poolCovid, lockedShares, opts = {}) {
  if (utxo.state.lpCovid.length !== 32 || !utxo.state.lpCovid.every((b2) => b2 === 0)) throw new Error("pool lpCovid is already bound \u2014 bindLp is one-time");
  if (lockedShares < 1n || lockedShares >= MAX_SHARES) throw new Error("lockedShares out of range");
  if (utxo.state.totalShares !== lockedShares) throw new Error("bindLp requires totalShares == lockedShares (graduation state)");
  const dust = opts.tokenDust ?? COVENANT_DUST;
  const { kasReserve, tokenReserve, tokenCovid } = utxo.state;
  const inventoryAmount = MAX_SHARES - lockedShares;
  const lpInventory = covenantIdOwned(poolCovid, inventoryAmount, false);
  const invSpk = kcc20Spk(k, materializeKcc20Script(tokenTpl, lpInventory));
  const lpCovidHex = genesisCovenantId(k, { transactionId: utxo.transactionId, index: utxo.index }, [
    { index: 1, value: dust, scriptPublicKey: invSpk }
  ]);
  const boundLp = covidToBytes(lpCovidHex);
  const curRedeem = materializePoolCpScript(tpl, utxo.state);
  const boundRedeem = materializePoolCpScript(tpl, { kasReserve, tokenReserve, tokenCovid, totalShares: lockedShares, lpCovid: boundLp });
  const poolValue = kasReserve * SCALE;
  const b = new SigScriptBuilder(k);
  pushKcc20StateScalar(b, lpInventory);
  const bindSig = b.selector(POOL_CP_SELECTOR.bindLp).redeem(curRedeem).drain();
  const inputs = [
    { transactionId: utxo.transactionId, index: utxo.index, value: poolValue, scriptPublicKey: poolCpSpk(k, curRedeem), signatureScript: bindSig, redeem: curRedeem, role: "pool" }
  ];
  const poolCovidHex = hexOf(poolCovid);
  const outputs = [
    { value: poolValue, scriptPublicKey: poolCpSpk(k, boundRedeem), role: "pool", binding: { covid: poolCovidHex, authorizingInput: 0 } },
    { value: dust, scriptPublicKey: invSpk, role: "lpInventory", binding: { covid: lpCovidHex, authorizingInput: 0 } }
  ];
  return { kind: "bindLp", inputs, outputs, economics: { lockedShares, inventoryAmount }, covids: { poolCovid: poolCovidHex, tokenCovid: hexOf(tokenCovid) }, lpCovidHex, lpInventoryAmount: inventoryAmount };
}

// src/native/curveCpTx.ts
var SCALE2 = 1000000n;
var padFee3 = (f) => f > FEE_OUT_MIN ? f : FEE_OUT_MIN;
var SELECTOR = { init: 0, buy: 1, sell: 2, graduate: 3, initVested: 4 };
var ZERO32 = new Uint8Array(32);
var devFundLeg = (p) => p.devFundOwner && p.devFundBps != null ? { owner: p.devFundOwner, bps: p.devFundBps } : null;
function materializeCpScript(tpl, state) {
  const s = tpl.stateStart;
  const t = tpl.script;
  if (t[s] !== 1 || t[s + 2] !== 32 || t[s + 35] !== 8) {
    throw new Error("curve_cp template has an unexpected state layout (expected push1 graduated / push32 tokenCovid / push8 tokenReserve)");
  }
  if (state.tokenCovid.length !== 32) throw new Error("tokenCovid must be 32 bytes");
  if (state.tokenReserve < 0n) throw new Error("tokenReserve must be non-negative");
  const out = t.slice();
  out[s] = 1;
  out[s + 1] = state.graduated ? 1 : 0;
  out[s + 2] = 32;
  out.set(state.tokenCovid, s + 3);
  out[s + 35] = 8;
  out.set(int8LE(state.tokenReserve), s + 36);
  return out;
}
var cpSpk = (k, redeem) => k.payToScriptHashScript(redeem);
var cpSpkForState = (k, tpl, state) => cpSpk(k, materializeCpScript(tpl, state));
function cpAddress(k, tpl, state, network) {
  return k.addressFromScriptPublicKey(cpSpkForState(k, tpl, state), network)?.toString() ?? "";
}
function p2pkSpk(k, pubkey) {
  const sb = new k.ScriptBuilder();
  sb.addData(pubkey).addOp(172);
  return new k.ScriptPublicKey(0, sb.drain());
}
function buySig(k, redeem, kasIn, tokenOut, inventoryOut, buyerOut) {
  const b = new SigScriptBuilder(k).int(kasIn).int(tokenOut);
  pushKcc20StateScalar(b, inventoryOut);
  pushKcc20StateScalar(b, buyerOut);
  return b.selector(SELECTOR.buy).redeem(redeem).drain();
}
function sellSig(k, redeem, tokenIn, kasOut, inventoryOut, traderChangeOut) {
  const b = new SigScriptBuilder(k).int(tokenIn).int(kasOut);
  pushKcc20StateScalar(b, inventoryOut);
  pushKcc20StateScalar(b, traderChangeOut);
  return b.selector(SELECTOR.sell).redeem(redeem).drain();
}
function graduateSigV2(k, redeem, pool, poolTokens) {
  const b = new SigScriptBuilder(k).int(pool.kasReserve).int(pool.tokenReserve).data(pool.tokenCovid).int(pool.totalShares).data(pool.lpCovid);
  pushKcc20StateScalar(b, poolTokens);
  return b.selector(SELECTOR.graduate).redeem(redeem).drain();
}
function buildCpBuy(k, tpl, tokenTpl, utxo, inventory, curveCovid, buyerPubkey, kasIn, tokenOut, mergeTokens = [], presenceWitnessIdx = 0, opts = {}) {
  if (utxo.state.graduated) throw new Error("curve has graduated \u2014 buys are locked");
  if (kasIn <= 0n || kasIn % SCALE2 !== 0n) throw new Error("kasIn must be a positive multiple of SCALE (0.01 KAS)");
  if (tokenOut <= 0n || tokenOut >= inventory.amount) throw new Error("invalid tokenOut");
  if (inventory.amount !== utxo.state.tokenReserve) throw new Error("inventory.amount must equal the curve's committed tokenReserve");
  if (mergeTokens.length > 0 && presenceWitnessIdx === 0) throw new Error("presenceWitnessIdx must be set to a co-present signed P2PK funding input when mergeTokens is non-empty (input 0 is the curve covenant and carries no signature)");
  const dust = opts.tokenDust ?? COVENANT_DUST;
  const curveCovidHex = hexOf2(curveCovid);
  const tokenCovidHex = hexOf2(utxo.state.tokenCovid);
  const newKas = utxo.realKas + kasIn;
  if (newKas > MAX_KAS) throw new Error("buy exceeds the curve max raise (9,000,000 TKAS)");
  const newToken = inventory.amount - tokenOut;
  const creatorFee = kasIn * tpl.params.creatorFeeBps / 10000n;
  const platformFee = kasIn * tpl.params.platformFeeBps / 10000n;
  const devFund = devFundLeg(tpl.params);
  const devFundFee = devFund ? kasIn * devFund.bps / 10000n : 0n;
  const mergeSum = mergeTokens.reduce((s, t) => s + t.state.amount, 0n);
  const inventoryOut = covenantIdOwned(curveCovid, newToken, false);
  const buyerOut = addressPresenceOwned(buyerPubkey, tokenOut + mergeSum);
  const curRedeem = materializeCpScript(tpl, utxo.state);
  const newCurveRedeem = materializeCpScript(tpl, { graduated: false, tokenCovid: utxo.state.tokenCovid, tokenReserve: newToken });
  const invRedeem = materializeKcc20Script(tokenTpl, covenantIdOwned(curveCovid, inventory.amount, false));
  const invOutRedeem = materializeKcc20Script(tokenTpl, inventoryOut);
  const buyerRedeem = materializeKcc20Script(tokenTpl, buyerOut);
  const witnesses = [0, ...mergeTokens.map(() => presenceWitnessIdx)];
  const newStates = [inventoryOut, buyerOut];
  const inputs = [
    { transactionId: utxo.transactionId, index: utxo.index, value: utxo.realKas, scriptPublicKey: cpSpk(k, curRedeem), signatureScript: buySig(k, curRedeem, kasIn, tokenOut, inventoryOut, buyerOut), redeem: curRedeem, role: "curve" },
    // inventory (covid A, C-owned) spent via kcc20 transfer; the C-owned input is authorized by the curve (input 0)
    { transactionId: inventory.transactionId, index: inventory.index, value: inventory.value, scriptPublicKey: kcc20Spk(k, invRedeem), signatureScript: transferSigScript(k, invRedeem, newStates, witnesses), redeem: invRedeem, role: "inventory" },
    ...mergeTokens.map((mt) => {
      const r = materializeKcc20Script(tokenTpl, mt.state);
      return { transactionId: mt.transactionId, index: mt.index, value: mt.value, scriptPublicKey: kcc20Spk(k, r), signatureScript: transferSigScript(k, r, newStates, witnesses), redeem: r, role: "buyerToken" };
    })
  ];
  const outputs = [
    { value: newKas, scriptPublicKey: cpSpk(k, newCurveRedeem), role: "curve", binding: { covid: curveCovidHex, authorizingInput: 0 } },
    { value: continuationValue(dust, inventory.value), scriptPublicKey: kcc20Spk(k, invOutRedeem), role: "inventory", binding: { covid: tokenCovidHex, authorizingInput: 1 } },
    { value: dust, scriptPublicKey: kcc20Spk(k, buyerRedeem), role: "recipient", binding: { covid: tokenCovidHex, authorizingInput: 1 } },
    { value: padFee3(creatorFee), scriptPublicKey: p2pkSpk(k, tpl.params.creatorFeeOwner), role: "creatorFee" },
    { value: padFee3(platformFee), scriptPublicKey: p2pkSpk(k, tpl.params.platformFeeOwner), role: "platformFee" }
  ];
  if (devFund) outputs.push({ value: padFee3(devFundFee), scriptPublicKey: p2pkSpk(k, devFund.owner), role: "devFundFee" });
  return { kind: "buy", inputs, outputs, economics: { kasIn, tokenOut, creatorFee, platformFee, devFundFee, newRealKas: newKas, newTokenReserve: newToken, merged: mergeSum }, covids: { tokenCovid: tokenCovidHex } };
}
function buildCpSell(k, tpl, tokenTpl, utxo, sellerTokens, inventory, curveCovid, traderPubkey, tokenIn, kasOut, presenceWitnessIdx, opts = {}) {
  if (utxo.state.graduated) throw new Error("curve has graduated \u2014 sells are locked");
  if (sellerTokens.length < 1) throw new Error("need at least one seller token");
  if (tokenIn <= 0n) throw new Error("tokenIn must be positive");
  if (kasOut <= 0n || kasOut % SCALE2 !== 0n || kasOut > utxo.realKas) throw new Error("invalid kasOut");
  if (inventory.amount !== utxo.state.tokenReserve) throw new Error("inventory.amount must equal the curve's committed tokenReserve");
  const dust = opts.tokenDust ?? COVENANT_DUST;
  const curveCovidHex = hexOf2(curveCovid);
  const tokenCovidHex = hexOf2(utxo.state.tokenCovid);
  const sellerIn = sellerTokens.reduce((s, t) => s + t.state.amount, 0n);
  const change = sellerIn - tokenIn;
  if (change < 0n) throw new Error("seller inputs are less than the sell amount");
  const hasChange = change > 0n;
  const newToken = inventory.amount + tokenIn;
  const creatorFee = kasOut * tpl.params.creatorFeeBps / 10000n;
  const platformFee = kasOut * tpl.params.platformFeeBps / 10000n;
  const devFund = devFundLeg(tpl.params);
  const devFundFee = devFund ? kasOut * devFund.bps / 10000n : 0n;
  const inventoryOut = covenantIdOwned(curveCovid, newToken, false);
  const traderChangeOut = addressPresenceOwned(traderPubkey, hasChange ? change : 1n);
  const curRedeem = materializeCpScript(tpl, utxo.state);
  const newCurveRedeem = materializeCpScript(tpl, { graduated: false, tokenCovid: utxo.state.tokenCovid, tokenReserve: newToken });
  const invRedeem = materializeKcc20Script(tokenTpl, covenantIdOwned(curveCovid, inventory.amount, false));
  const invOutRedeem = materializeKcc20Script(tokenTpl, inventoryOut);
  const witnesses = [0, ...sellerTokens.map(() => presenceWitnessIdx)];
  const newStates = hasChange ? [inventoryOut, traderChangeOut] : [inventoryOut];
  const inputs = [
    { transactionId: utxo.transactionId, index: utxo.index, value: utxo.realKas, scriptPublicKey: cpSpk(k, curRedeem), signatureScript: sellSig(k, curRedeem, tokenIn, kasOut, inventoryOut, traderChangeOut), redeem: curRedeem, role: "curve" },
    { transactionId: inventory.transactionId, index: inventory.index, value: inventory.value, scriptPublicKey: kcc20Spk(k, invRedeem), signatureScript: transferSigScript(k, invRedeem, newStates, witnesses), redeem: invRedeem, role: "inventory" },
    ...sellerTokens.map((st) => {
      const r = materializeKcc20Script(tokenTpl, st.state);
      return { transactionId: st.transactionId, index: st.index, value: st.value, scriptPublicKey: kcc20Spk(k, r), signatureScript: transferSigScript(k, r, newStates, witnesses), redeem: r, role: "sellerToken" };
    })
  ];
  const outputs = [
    { value: utxo.realKas - kasOut, scriptPublicKey: cpSpk(k, newCurveRedeem), role: "curve", binding: { covid: curveCovidHex, authorizingInput: 0 } },
    { value: continuationValue(dust, inventory.value), scriptPublicKey: kcc20Spk(k, invOutRedeem), role: "inventory", binding: { covid: tokenCovidHex, authorizingInput: 1 } },
    { value: padFee3(creatorFee), scriptPublicKey: p2pkSpk(k, tpl.params.creatorFeeOwner), role: "creatorFee" },
    { value: padFee3(platformFee), scriptPublicKey: p2pkSpk(k, tpl.params.platformFeeOwner), role: "platformFee" }
  ];
  if (devFund) outputs.push({ value: padFee3(devFundFee), scriptPublicKey: p2pkSpk(k, devFund.owner), role: "devFundFee" });
  if (hasChange) outputs.push({ value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, traderChangeOut)), role: "seller", binding: { covid: tokenCovidHex, authorizingInput: 1 } });
  return { kind: "sell", inputs, outputs, economics: { tokenIn, kasOut, change, creatorFee, platformFee, devFundFee, newRealKas: utxo.realKas - kasOut, newTokenReserve: newToken }, covids: { tokenCovid: tokenCovidHex } };
}
function buildCpGraduate(k, tpl, tokenTpl, poolTemplate, utxo, inventory, curveCovid, poolLockedShares, opts = {}) {
  if (utxo.state.graduated) throw new Error("already graduated");
  if (utxo.realKas < tpl.params.graduationKas) throw new Error("reserve has not reached the graduation target");
  if (poolLockedShares < 1n) throw new Error("poolLockedShares must be >= 1");
  if (inventory.amount !== utxo.state.tokenReserve) throw new Error("inventory.amount must equal the curve's committed tokenReserve");
  const lockedValue = opts.lockedCurveValue ?? 1000n;
  const dust = opts.tokenDust ?? COVENANT_DUST;
  const targetPoolKas = utxo.realKas * (10000n - tpl.params.graduationFeeBps) / 10000n;
  const poolKasUnits = targetPoolKas / SCALE2;
  const poolKas = poolKasUnits * SCALE2;
  const gradFee = utxo.realKas - poolKas;
  const leftover = inventory.amount;
  const A = utxo.state.tokenCovid;
  const poolState = { kasReserve: poolKasUnits, tokenReserve: leftover, tokenCovid: A, totalShares: poolLockedShares, lpCovid: ZERO32 };
  const poolRedeem = materializePoolCpScript(poolTemplate, poolState);
  const poolSpkV = k.payToScriptHashScript(poolRedeem);
  const poolCovidHex = genesisCovenantId(k, { transactionId: utxo.transactionId, index: utxo.index }, [
    { index: 1, value: poolKas, scriptPublicKey: poolSpkV }
  ]);
  const poolCovid = covidToBytes(poolCovidHex);
  const poolTokens = covenantIdOwned(poolCovid, leftover, false);
  const poolTokenRedeem = materializeKcc20Script(tokenTpl, poolTokens);
  const curRedeem = materializeCpScript(tpl, utxo.state);
  const lockedRedeem = materializeCpScript(tpl, { graduated: true, tokenCovid: A, tokenReserve: inventory.amount });
  const invRedeem = materializeKcc20Script(tokenTpl, covenantIdOwned(curveCovid, inventory.amount, false));
  const inputs = [
    { transactionId: utxo.transactionId, index: utxo.index, value: utxo.realKas, scriptPublicKey: cpSpk(k, curRedeem), signatureScript: graduateSigV2(k, curRedeem, poolState, poolTokens), redeem: curRedeem, role: "curve" },
    { transactionId: inventory.transactionId, index: inventory.index, value: inventory.value, scriptPublicKey: kcc20Spk(k, invRedeem), signatureScript: transferSigScript(k, invRedeem, [poolTokens], [0]), redeem: invRedeem, role: "inventory" }
  ];
  const curveCovidHex = hexOf2(curveCovid);
  const tokenCovidHex = hexOf2(A);
  const outputs = [
    { value: lockedValue, scriptPublicKey: cpSpk(k, lockedRedeem), role: "curve", binding: { covid: curveCovidHex, authorizingInput: 0 } },
    { value: poolKas, scriptPublicKey: poolSpkV, role: "pool", binding: { covid: poolCovidHex, authorizingInput: 0 } },
    { value: continuationValue(dust, inventory.value), scriptPublicKey: kcc20Spk(k, poolTokenRedeem), role: "poolToken", binding: { covid: tokenCovidHex, authorizingInput: 1 } },
    { value: padFee3(gradFee), scriptPublicKey: p2pkSpk(k, tpl.params.platformFeeOwner), role: "gradFee" }
  ];
  return { kind: "graduate", inputs, outputs, economics: { poolKas, gradFee, leftover, poolLockedShares }, covids: { tokenCovid: hexOf2(A), poolCovid: poolCovidHex } };
}
function buildSplitToken(k, tokenTpl, sellerToken, sellAmount, presenceWitnessIdx, opts = {}) {
  if (!opts.tokenCovid) throw new Error("opts.tokenCovid is required (the token covenant id, hex) \u2014 both outputs need the KIP-20 covenant binding or the assembled tx fails on-chain");
  const change = sellerToken.state.amount - sellAmount;
  if (sellAmount <= 0n || change <= 0n) throw new Error("split requires 0 < sellAmount < the UTXO amount");
  const dust = opts.tokenDust ?? COVENANT_DUST;
  const owner = sellerToken.state.ownerIdentifier;
  const out1 = addressPresenceOwned(owner, sellAmount);
  const out2 = addressPresenceOwned(owner, change);
  const redeem = materializeKcc20Script(tokenTpl, sellerToken.state);
  const binding = opts.tokenCovid ? { covid: opts.tokenCovid, authorizingInput: 0 } : void 0;
  const inputs = [
    { transactionId: sellerToken.transactionId, index: sellerToken.index, value: sellerToken.value, scriptPublicKey: kcc20Spk(k, redeem), signatureScript: transferSigScript(k, redeem, [out1, out2], [presenceWitnessIdx]), redeem, role: "sellerToken" }
  ];
  const outputs = [
    { value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, out1)), role: "split", binding },
    { value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, out2)), role: "change", binding }
  ];
  return { kind: "sell", inputs, outputs, economics: { sellAmount, change }, covids: opts.tokenCovid ? { tokenCovid: opts.tokenCovid } : {} };
}
function buildConsolidate(k, tokenTpl, tokens, presenceWitnessIdx, opts = {}) {
  if (!opts.tokenCovid) throw new Error("opts.tokenCovid is required (the token covenant id, hex) \u2014 the merged output needs the KIP-20 covenant binding or the assembled tx fails on-chain");
  if (tokens.length < 2) throw new Error("consolidate needs at least 2 UTXOs");
  const dust = opts.tokenDust ?? COVENANT_DUST;
  const owner = tokens[0].state.ownerIdentifier;
  const total = tokens.reduce((s, t) => s + t.state.amount, 0n);
  const merged = addressPresenceOwned(owner, total);
  const newStates = [merged];
  const witnesses = tokens.map(() => presenceWitnessIdx);
  const inputs = tokens.map((t) => {
    const r = materializeKcc20Script(tokenTpl, t.state);
    return { transactionId: t.transactionId, index: t.index, value: t.value, scriptPublicKey: kcc20Spk(k, r), signatureScript: transferSigScript(k, r, newStates, witnesses), redeem: r, role: "token" };
  });
  const binding = opts.tokenCovid ? { covid: opts.tokenCovid, authorizingInput: 0 } : void 0;
  const outputs = [
    { value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, merged)), role: "merged", binding }
  ];
  return { kind: "sell", inputs, outputs, economics: { total }, covids: opts.tokenCovid ? { tokenCovid: opts.tokenCovid } : {} };
}
var hexOf2 = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");

// src/native/poolCpV3Tx.ts
var poolCpV3Tx_exports = {};
__export(poolCpV3Tx_exports, {
  POOL_V3_SELECTOR: () => POOL_V3_SELECTOR,
  buildPoolV3SwapKasForToken: () => buildPoolV3SwapKasForToken,
  buildPoolV3SwapTokenForKas: () => buildPoolV3SwapTokenForKas,
  materializePoolCpV3Script: () => materializePoolCpV3Script,
  poolCpV3Address: () => poolCpV3Address,
  poolCpV3Spk: () => poolCpV3Spk,
  poolCpV3SpkForState: () => poolCpV3SpkForState,
  quotePoolV3Buy: () => quotePoolV3Buy,
  quotePoolV3Sell: () => quotePoolV3Sell
});
var materializePoolCpV3Script = materializePoolCpScript;
var poolCpV3Spk = poolCpSpk;
var poolCpV3SpkForState = poolCpSpkForState;
var poolCpV3Address = poolCpAddress;
var quotePoolV3Buy = quotePoolCpBuy;
var quotePoolV3Sell = quotePoolCpSell;
var POOL_V3_SELECTOR = { swapKasForToken: 0, swapTokenForKas: 1, addLiquidity: 2, removeLiquidity: 3, bindLp: 4 };
var hexOf3 = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
var p2pkSpk2 = (k, pubkey) => {
  const sb = new k.ScriptBuilder();
  sb.addData(pubkey).addOp(172);
  return new k.ScriptPublicKey(0, sb.drain());
};
function v3SwapBuySig(k, redeem, kasInUnits, tokenOut, poolTokenOut, traderTokenOut) {
  const b = new SigScriptBuilder(k).int(kasInUnits).int(tokenOut);
  pushKcc20StateScalar(b, poolTokenOut);
  pushKcc20StateScalar(b, traderTokenOut);
  return b.selector(POOL_V3_SELECTOR.swapKasForToken).redeem(redeem).drain();
}
function v3SwapSellSig(k, redeem, kasOutUnits, poolTokenOut, traderChangeOut) {
  const b = new SigScriptBuilder(k).int(kasOutUnits);
  pushKcc20StateScalar(b, poolTokenOut);
  pushKcc20StateScalar(b, traderChangeOut);
  return b.selector(POOL_V3_SELECTOR.swapTokenForKas).redeem(redeem).drain();
}
function buildPoolV3SwapKasForToken(k, tpl, tokenTpl, params, utxo, poolCovid, traderPubkey, q, mergeTokens = [], presenceWitnessIdx = 0, opts = {}) {
  if (mergeTokens.length > 0 && presenceWitnessIdx === 0) throw new Error("presenceWitnessIdx must be set to a co-present signed P2PK funding input when mergeTokens is non-empty (input 0 is the pool covenant and carries no signature)");
  const dust = opts.tokenDust ?? COVENANT_DUST;
  const { kasReserve, tokenReserve, tokenCovid, totalShares, lpCovid } = utxo.state;
  const poolCovidHex = hexOf3(poolCovid);
  const tokenCovidHex = hexOf3(tokenCovid);
  const mergeSum = mergeTokens.reduce((s, t) => s + t.state.amount, 0n);
  const poolTokenOut = covenantIdOwned(poolCovid, q.newToken, false);
  const traderTokenOut = addressPresenceOwned(traderPubkey, q.tokenOut + mergeSum);
  const curRedeem = materializePoolCpV3Script(tpl, utxo.state);
  const newRedeem = materializePoolCpV3Script(tpl, { kasReserve: q.newKas, tokenReserve: q.newToken, tokenCovid, totalShares, lpCovid });
  const poolTokInRedeem = materializeKcc20Script(tokenTpl, covenantIdOwned(poolCovid, tokenReserve, false));
  const witnesses = [0, ...mergeTokens.map(() => presenceWitnessIdx)];
  const newStates = [poolTokenOut, traderTokenOut];
  const inputs = [
    { transactionId: utxo.transactionId, index: utxo.index, value: kasReserve * SCALE, scriptPublicKey: poolCpV3Spk(k, curRedeem), signatureScript: v3SwapBuySig(k, curRedeem, q.kasInUnits, q.tokenOut, poolTokenOut, traderTokenOut), redeem: curRedeem, role: "pool" },
    { transactionId: utxo.tokenUtxo.transactionId, index: utxo.tokenUtxo.index, value: utxo.tokenUtxo.value, scriptPublicKey: kcc20Spk(k, poolTokInRedeem), signatureScript: transferSigScript(k, poolTokInRedeem, newStates, witnesses), redeem: poolTokInRedeem, role: "poolToken" },
    ...mergeTokens.map((tt) => {
      const r = materializeKcc20Script(tokenTpl, tt.state);
      return { transactionId: tt.transactionId, index: tt.index, value: tt.value, scriptPublicKey: kcc20Spk(k, r), signatureScript: transferSigScript(k, r, newStates, witnesses), redeem: r, role: "traderToken" };
    })
  ];
  const outputs = [
    { value: q.newKas * SCALE, scriptPublicKey: poolCpV3Spk(k, newRedeem), role: "pool", binding: { covid: poolCovidHex, authorizingInput: 0 } },
    { value: continuationValue(dust, utxo.tokenUtxo.value), scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, poolTokenOut)), role: "poolToken", binding: { covid: tokenCovidHex, authorizingInput: 1 } },
    { value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, traderTokenOut)), role: "trader", binding: { covid: tokenCovidHex, authorizingInput: 1 } },
    { value: q.creatorOut, scriptPublicKey: p2pkSpk2(k, params.creatorFeeOwner), role: "creatorFee" },
    { value: q.platformOut, scriptPublicKey: p2pkSpk2(k, params.platformFeeOwner), role: "platformFee" }
  ];
  return { kind: "swapKasForToken", inputs, outputs, economics: { kasIn: q.kasIn, tokenOut: q.tokenOut }, covids: { poolCovid: poolCovidHex, tokenCovid: tokenCovidHex } };
}
function buildPoolV3SwapTokenForKas(k, tpl, tokenTpl, params, utxo, poolCovid, traderPubkey, traderTokens, q, presenceWitnessIdx, opts = {}) {
  if (traderTokens.length < 1) throw new Error("need at least one trader token");
  const dust = opts.tokenDust ?? COVENANT_DUST;
  const { kasReserve, tokenReserve, tokenCovid, totalShares, lpCovid } = utxo.state;
  const poolCovidHex = hexOf3(poolCovid);
  const tokenCovidHex = hexOf3(tokenCovid);
  const traderIn = traderTokens.reduce((s, t) => s + t.state.amount, 0n);
  const change = traderIn - q.tokenIn;
  if (change < 0n) throw new Error("trader inputs are less than the sell amount");
  const hasChange = change > 0n;
  const poolTokenOut = covenantIdOwned(poolCovid, q.newToken, false);
  const traderChangeOut = addressPresenceOwned(traderPubkey, hasChange ? change : 1n);
  const curRedeem = materializePoolCpV3Script(tpl, utxo.state);
  const newRedeem = materializePoolCpV3Script(tpl, { kasReserve: q.newKas, tokenReserve: q.newToken, tokenCovid, totalShares, lpCovid });
  const poolTokInRedeem = materializeKcc20Script(tokenTpl, covenantIdOwned(poolCovid, tokenReserve, false));
  const witnesses = [0, ...traderTokens.map(() => presenceWitnessIdx)];
  const newStates = hasChange ? [poolTokenOut, traderChangeOut] : [poolTokenOut];
  const inputs = [
    { transactionId: utxo.transactionId, index: utxo.index, value: kasReserve * SCALE, scriptPublicKey: poolCpV3Spk(k, curRedeem), signatureScript: v3SwapSellSig(k, curRedeem, q.kasOutUnits, poolTokenOut, traderChangeOut), redeem: curRedeem, role: "pool" },
    { transactionId: utxo.tokenUtxo.transactionId, index: utxo.tokenUtxo.index, value: utxo.tokenUtxo.value, scriptPublicKey: kcc20Spk(k, poolTokInRedeem), signatureScript: transferSigScript(k, poolTokInRedeem, newStates, witnesses), redeem: poolTokInRedeem, role: "poolToken" },
    ...traderTokens.map((tt) => {
      const r = materializeKcc20Script(tokenTpl, tt.state);
      return { transactionId: tt.transactionId, index: tt.index, value: tt.value, scriptPublicKey: kcc20Spk(k, r), signatureScript: transferSigScript(k, r, newStates, witnesses), redeem: r, role: "traderToken" };
    })
  ];
  const outputs = [
    { value: q.newKas * SCALE, scriptPublicKey: poolCpV3Spk(k, newRedeem), role: "pool", binding: { covid: poolCovidHex, authorizingInput: 0 } },
    { value: continuationValue(dust, utxo.tokenUtxo.value), scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, poolTokenOut)), role: "poolToken", binding: { covid: tokenCovidHex, authorizingInput: 1 } },
    { value: q.creatorOut, scriptPublicKey: p2pkSpk2(k, params.creatorFeeOwner), role: "creatorFee" },
    { value: q.platformOut, scriptPublicKey: p2pkSpk2(k, params.platformFeeOwner), role: "platformFee" }
  ];
  if (hasChange) outputs.push({ value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, traderChangeOut)), role: "trader", binding: { covid: tokenCovidHex, authorizingInput: 1 } });
  return { kind: "swapTokenForKas", inputs, outputs, economics: { kasOut: q.kasOut, tokenIn: q.tokenIn }, covids: { poolCovid: poolCovidHex, tokenCovid: tokenCovidHex } };
}

// src/native/vestingTx.ts
var vestingTx_exports = {};
__export(vestingTx_exports, {
  VEST_SELECTOR: () => VEST_SELECTOR,
  buildVestingClaim: () => buildVestingClaim,
  buildVestingClaimFinal: () => buildVestingClaimFinal,
  materializeVestingScript: () => materializeVestingScript,
  vestedAmount: () => vestedAmount,
  vestingSpk: () => vestingSpk,
  vestingSpkForState: () => vestingSpkForState
});
var VEST_SELECTOR = { claim: 0, claimFinal: 1 };
var hexOf4 = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
function vestedAmount(total, startScore, durationScore, daaScore) {
  if (daaScore <= startScore) return 0n;
  const elapsed = BigInt(daaScore - startScore);
  const dur = BigInt(durationScore);
  if (elapsed >= dur) return total;
  return total * elapsed / dur;
}
function materializeVestingScript(tpl, claimed) {
  const s = tpl.stateStart;
  const t = tpl.script;
  if (t[s] !== 8) throw new Error("vesting template has an unexpected state layout (expected push8 claimed)");
  if (claimed < 0n) throw new Error("claimed must be non-negative");
  const out = t.slice();
  out[s] = 8;
  out.set(int8LE(claimed), s + 1);
  return out;
}
var vestingSpk = (k, redeem) => k.payToScriptHashScript(redeem);
var vestingSpkForState = (k, tpl, claimed) => vestingSpk(k, materializeVestingScript(tpl, claimed));
function buildVestingClaim(k, vestTpl, tokenTpl, vestingUtxo, lockedToken, vestingCovid, creatorPubkey, claimed, release, opts = {}) {
  if (!opts.tokenCovid) throw new Error("opts.tokenCovid is required (the vested token covenant id, hex) \u2014 the relock + recipient outputs need the KIP-20 covenant binding or the tx fails on-chain");
  const total = BigInt(vestTpl.params.total);
  if (claimed < 0n || claimed >= total) throw new Error("nothing left to claim");
  const remaining = total - claimed;
  if (release <= 0n || release >= remaining) throw new Error("partial claim must be > 0 and < remaining (use claimFinal to drain)");
  const dust = opts.tokenDust ?? 1000n;
  const vestingCovidHex = hexOf4(vestingCovid);
  const tokenBinding = opts.tokenCovid ? { covid: opts.tokenCovid, authorizingInput: 1 } : void 0;
  const newClaimed = claimed + release, newRemaining = remaining - release;
  const curRedeem = materializeVestingScript(vestTpl, claimed);
  const newRedeem = materializeVestingScript(vestTpl, newClaimed);
  const lockedState = covenantIdOwned(vestingCovid, remaining, false);
  const relockState = covenantIdOwned(vestingCovid, newRemaining, false);
  const recipientState = addressPresenceOwned(creatorPubkey, release);
  const lockedRedeem = materializeKcc20Script(tokenTpl, lockedState);
  const b = new SigScriptBuilder(k).int(release);
  pushKcc20StateScalar(b, relockState);
  pushKcc20StateScalar(b, recipientState);
  const claimSig = b.selector(VEST_SELECTOR.claim).redeem(curRedeem).drain();
  const inputs = [
    { transactionId: vestingUtxo.transactionId, index: vestingUtxo.index, value: vestingUtxo.value, scriptPublicKey: vestingSpk(k, curRedeem), signatureScript: claimSig, redeem: curRedeem, role: "vesting" },
    { transactionId: lockedToken.transactionId, index: lockedToken.index, value: lockedToken.value, scriptPublicKey: kcc20Spk(k, lockedRedeem), signatureScript: transferSigScript(k, lockedRedeem, [relockState, recipientState], [0]), redeem: lockedRedeem, role: "lockedToken" }
  ];
  const outputs = [
    { value: vestingUtxo.value, scriptPublicKey: vestingSpk(k, newRedeem), role: "vesting", binding: { covid: vestingCovidHex, authorizingInput: 0 } },
    // V continuation (claimed bumped)
    { value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, relockState)), role: "relock", binding: tokenBinding },
    // re-locked (A, V-owned)
    { value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, recipientState)), role: "recipient", binding: tokenBinding }
    // to creator (A, presence)
  ];
  return { kind: "claim", inputs, outputs, economics: { release, newClaimed }, covids: opts.tokenCovid ? { tokenCovid: opts.tokenCovid } : {} };
}
function buildVestingClaimFinal(k, vestTpl, tokenTpl, vestingUtxo, lockedToken, vestingCovid, creatorPubkey, claimed, opts = {}) {
  if (!opts.tokenCovid) throw new Error("opts.tokenCovid is required (the vested token covenant id, hex) \u2014 the recipient output needs the KIP-20 covenant binding or the tx fails on-chain");
  const total = BigInt(vestTpl.params.total);
  if (claimed < 0n || claimed >= total) throw new Error("nothing left to claim");
  const remaining = total - claimed;
  const dust = opts.tokenDust ?? 1000n;
  const vestingCovidHex = hexOf4(vestingCovid);
  const tokenBinding = opts.tokenCovid ? { covid: opts.tokenCovid, authorizingInput: 1 } : void 0;
  const curRedeem = materializeVestingScript(vestTpl, claimed);
  const newRedeem = materializeVestingScript(vestTpl, total);
  const lockedState = covenantIdOwned(vestingCovid, remaining, false);
  const recipientState = addressPresenceOwned(creatorPubkey, remaining);
  const lockedRedeem = materializeKcc20Script(tokenTpl, lockedState);
  const b = new SigScriptBuilder(k);
  pushKcc20StateScalar(b, recipientState);
  const claimSig = b.selector(VEST_SELECTOR.claimFinal).redeem(curRedeem).drain();
  const inputs = [
    { transactionId: vestingUtxo.transactionId, index: vestingUtxo.index, value: vestingUtxo.value, scriptPublicKey: vestingSpk(k, curRedeem), signatureScript: claimSig, redeem: curRedeem, role: "vesting" },
    { transactionId: lockedToken.transactionId, index: lockedToken.index, value: lockedToken.value, scriptPublicKey: kcc20Spk(k, lockedRedeem), signatureScript: transferSigScript(k, lockedRedeem, [recipientState], [0]), redeem: lockedRedeem, role: "lockedToken" }
  ];
  const outputs = [
    { value: vestingUtxo.value, scriptPublicKey: vestingSpk(k, newRedeem), role: "vesting", binding: { covid: vestingCovidHex, authorizingInput: 0 } },
    { value: dust, scriptPublicKey: kcc20Spk(k, materializeKcc20Script(tokenTpl, recipientState)), role: "recipient", binding: tokenBinding }
  ];
  return { kind: "claimFinal", inputs, outputs, economics: { release: remaining }, covids: opts.tokenCovid ? { tokenCovid: opts.tokenCovid } : {} };
}

// src/wallet/index.ts
var wallet_exports = {};
__export(wallet_exports, {
  ExampleWalletAdapter: () => ExampleWalletAdapter,
  KASPA_ANNOUNCE_PROVIDER_EVENT: () => KASPA_ANNOUNCE_PROVIDER_EVENT,
  KASPA_NETWORKS: () => KASPA_NETWORKS,
  KASPA_REQUEST_PROVIDER_EVENT: () => KASPA_REQUEST_PROVIDER_EVENT,
  WalletCapabilityError: () => WalletCapabilityError,
  announceKaspaWallet: () => announceKaspaWallet,
  normalizeKaspaNetworkId: () => normalizeKaspaNetworkId,
  requestKaspaWallets: () => requestKaspaWallets
});

// src/wallet/types.ts
var WalletCapabilityError = class extends Error {
  constructor(provider2, method, hint) {
    super(`${provider2} does not implement ${method}()${hint ? ` \u2014 ${hint}` : ""}`);
    this.provider = provider2;
    this.method = method;
    this.name = "WalletCapabilityError";
  }
  provider;
  method;
};

// src/wallet/discovery.ts
var KASPA_NETWORKS = {
  MAINNET: "mainnet",
  TESTNET_10: "testnet-10",
  TESTNET_11: "testnet-11",
  DEVNET: "devnet"
};
var normalizeKaspaNetworkId = (id) => id.startsWith("kaspa_") ? id.slice("kaspa_".length).replace(/_/g, "-") : id;
var KASPA_REQUEST_PROVIDER_EVENT = "kaspa:requestProvider";
var KASPA_ANNOUNCE_PROVIDER_EVENT = "kaspa:provider";
function announceKaspaWallet(info, provider2) {
  if (typeof window === "undefined") return () => {
  };
  const detail = Object.freeze({ info: Object.freeze({ ...info }), provider: provider2 });
  const announce = () => window.dispatchEvent(new CustomEvent(KASPA_ANNOUNCE_PROVIDER_EVENT, { detail }));
  window.addEventListener(KASPA_REQUEST_PROVIDER_EVENT, announce);
  announce();
  return () => window.removeEventListener(KASPA_REQUEST_PROVIDER_EVENT, announce);
}
var isSafeIcon = (icon) => typeof icon === "string" && /^data:/i.test(icon.trim());
function requestKaspaWallets(onAnnounce) {
  if (typeof window === "undefined") return () => {
  };
  const listener = (e) => {
    const detail = e.detail;
    if (!detail?.info?.uuid || !detail?.info?.name) return;
    if (typeof detail.provider?.requestAccounts !== "function") return;
    if (detail.info.icon != null && !isSafeIcon(detail.info.icon)) {
      onAnnounce({ info: { ...detail.info, icon: "" }, provider: detail.provider });
      return;
    }
    onAnnounce(detail);
  };
  window.addEventListener(KASPA_ANNOUNCE_PROVIDER_EVENT, listener);
  window.dispatchEvent(new Event(KASPA_REQUEST_PROVIDER_EVENT));
  return () => window.removeEventListener(KASPA_ANNOUNCE_PROVIDER_EVENT, listener);
}

// src/wallet/example.ts
var GLOBAL_NAME = "exampleWallet";
var provider = () => {
  const p = globalThis[GLOBAL_NAME];
  if (!p) throw new Error(`${GLOBAL_NAME} not installed`);
  return p;
};
var ExampleWalletAdapter = class {
  provider = GLOBAL_NAME;
  label = "Example Wallet (template)";
  address = null;
  isAvailable() {
    return typeof globalThis[GLOBAL_NAME] !== "undefined";
  }
  capabilities() {
    return { signPskt: true, getXOnlyPublicKey: true, signMessage: true, reconnect: true };
  }
  async connect() {
    const p = provider();
    const accounts = await p.requestAccounts();
    this.address = accounts?.[0] ?? null;
    if (!this.address) throw new Error("No account authorized");
    return this.address;
  }
  async reconnect() {
    const p = globalThis[GLOBAL_NAME];
    if (!p) return null;
    try {
      const accounts = await p.getAccounts?.() ?? [];
      if (!accounts.length) return null;
      this.address = accounts[0];
      return this.address;
    } catch {
      return null;
    }
  }
  getAddress() {
    return this.address;
  }
  async signPskt(txJsonString, signInputs) {
    const p = provider();
    const options = { signInputs: signInputs.map((s) => ({ index: s.index, sighashType: s.sighashType ?? 1 })) };
    const res = await p.signPskt({ txJsonString, options });
    return typeof res === "string" ? res : res?.txJsonString ?? res?.signedTx ?? res?.tx ?? JSON.stringify(res);
  }
  async getXOnlyPublicKey() {
    const p = provider();
    const pub = await p.getPublicKey?.();
    if (!pub) return null;
    const hex = pub.replace(/^0x/, "").toLowerCase();
    if (hex.length === 64) return hex;
    if (hex.length === 66 && /^0[23]/.test(hex)) return hex.slice(2);
    if (hex.length === 130 && hex.startsWith("04")) return hex.slice(2, 66);
    return null;
  }
  async signMessage(message) {
    const p = provider();
    const publicKey = await this.getXOnlyPublicKey();
    if (!publicKey) return null;
    const signature = await p.signMessage(message);
    return { signature, publicKey };
  }
  disconnect() {
    this.address = null;
  }
};

// src/client/index.ts
var client_exports = {};
__export(client_exports, {
  IndexerClient: () => IndexerClient,
  RegistryClient: () => RegistryClient,
  SequencerClient: () => SequencerClient
});

// src/client/indexerClient.ts
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const body = await res.json();
  return body.result;
}
var qs = (params) => {
  const parts = Object.entries(params).filter(([, v]) => v !== void 0).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
};
var IndexerClient = class {
  /** @param baseUrl e.g. 'https://idx.kron.technology/v1/kcc20' (TN10) — no default baked in; pass the
   *  network-appropriate URL explicitly (mainnet endpoints publish separately at launch). */
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  baseUrl;
  info() {
    return fetchJson(`${this.baseUrl}/info`);
  }
  markets(opts = {}) {
    return fetchJson(`${this.baseUrl}/markets${qs(opts)}`);
  }
  topTraders() {
    return fetchJson(`${this.baseUrl}/top-traders`);
  }
  token(tick) {
    return fetchJson(`${this.baseUrl}/token/${encodeURIComponent(tick)}`);
  }
  balance(tick, address) {
    return fetchJson(`${this.baseUrl}/token/${encodeURIComponent(tick)}/address/${encodeURIComponent(address)}`);
  }
  tokenlist(address) {
    return fetchJson(`${this.baseUrl}/address/${encodeURIComponent(address)}/tokenlist`);
  }
  tokenUtxos(tick, address) {
    return fetchJson(`${this.baseUrl}/token/${encodeURIComponent(tick)}/address/${encodeURIComponent(address)}/utxos`);
  }
  holders(tick) {
    return fetchJson(`${this.baseUrl}/token/${encodeURIComponent(tick)}/holders`);
  }
  trades(tick, opts = {}) {
    return fetchJson(`${this.baseUrl}/token/${encodeURIComponent(tick)}/trades${qs(opts)}`);
  }
  ohlc(tick, opts) {
    return fetchJson(`${this.baseUrl}/token/${encodeURIComponent(tick)}/ohlc${qs(opts)}`);
  }
  addressTrades(address, opts = {}) {
    return fetchJson(`${this.baseUrl}/address/${encodeURIComponent(address)}/trades${qs(opts)}`);
  }
  /** One address's trade history on ONE token (a wallet's per-token history view). */
  tokenAddressTrades(tick, address, opts = {}) {
    return fetchJson(`${this.baseUrl}/token/${encodeURIComponent(tick)}/address/${encodeURIComponent(address)}/trades${qs(opts)}`);
  }
  poolhead(tick) {
    return fetchJson(`${this.baseUrl}/token/${encodeURIComponent(tick)}/poolhead`);
  }
  /** LP-bind integrity for `tick`'s pool: `true` safe, `false` counterfeit, `null` not-yet-verifiable. See
   *  `CpState.lpBindVerified`. Returns `null` (fail-safe) when the field is absent (indexer predates it). */
  async lpBindVerified(tick) {
    const info = await this.token(tick);
    const row = Array.isArray(info) ? info[0] : info;
    const v = row?.cpState?.lpBindVerified;
    return v === true ? true : v === false ? false : null;
  }
  /** MANDATORY gate before `poolCp.buildAddLiquidity`: throws unless the pool's LP shares are provably honest.
   *  A pre-`e5469a7ad482` pool can be counterfeit-bound so that added liquidity is drained by counterfeit shares;
   *  only an exact L-supply match clears it. Fail-safe: an unverifiable (`null`) pool also throws. Removing
   *  liquidity does not need this. */
  async assertLpBindSafe(tick) {
    const v = await this.lpBindVerified(tick);
    if (v !== true) {
      throw new Error(v === false ? `Refusing to add liquidity to ${tick}: the pool's LP shares failed an on-chain integrity check (its bindLp was not a genuine genesis \u2014 counterfeit shares could drain your deposit).` : `Refusing to add liquidity to ${tick}: the pool's LP-share integrity is not confirmed yet (retry shortly).`);
    }
  }
  lpUtxos(tick, address) {
    return fetchJson(`${this.baseUrl}/token/${encodeURIComponent(tick)}/lp/${encodeURIComponent(address)}/utxos`);
  }
  lpEarnings(tick, address) {
    return fetchJson(`${this.baseUrl}/token/${encodeURIComponent(tick)}/lp/${encodeURIComponent(address)}/earnings`);
  }
  /**
   * Subscribe to the SSE update stream (all tokens, or one if `tick` is given). Returns an unsubscribe
   * function. Browser: uses the native EventSource. Node: pass an EventSource-compatible constructor (e.g.
   * the `eventsource` npm package) via `EventSourceImpl` — Node has no built-in EventSource on most
   * supported versions.
   */
  stream(onUpdate, opts = {}) {
    const ES = opts.EventSourceImpl ?? globalThis.EventSource;
    if (!ES) throw new Error('No EventSource available \u2014 in Node, pass EventSourceImpl (e.g. from the "eventsource" package)');
    const es = new ES(`${this.baseUrl}/stream${qs({ tick: opts.tick })}`);
    es.addEventListener("update", (ev) => {
      try {
        onUpdate(JSON.parse(ev.data));
      } catch {
      }
    });
    return () => es.close();
  }
};

// src/client/registryClient.ts
var RegistryClient = class {
  /** @param baseUrl e.g. 'https://api.kron.technology' (TN10) */
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  baseUrl;
  async tokens() {
    const res = await fetch(`${this.baseUrl}/api/registry/tokens`);
    if (!res.ok) throw new Error(`registry tokens -> HTTP ${res.status}`);
    const body = await res.json();
    return body.tokens;
  }
  /** Fetch the public token list — a tokenlists.org-shaped index of KRON tokens for wallets/explorers/
   *  aggregators. Default = chain-verified tokens only (anti-phishing); `{ all: true }` adds unverified ones
   *  (each tagged `extensions.chainVerified:false`). Verify any entry against the chain with
   *  verify.verifyTokenListEntry before trusting it. */
  async tokenlist(opts) {
    const q = opts?.all ? "?all=1" : "";
    const res = await fetch(`${this.baseUrl}/api/registry/tokenlist${q}`);
    if (!res.ok) throw new Error(`registry tokenlist -> HTTP ${res.status}`);
    return await res.json();
  }
};

// src/client/sequencerClient.ts
var SequencerClient = class {
  /** @param baseUrl e.g. 'https://seq.kron.technology' (TN10) */
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  baseUrl;
  async health() {
    const res = await fetch(`${this.baseUrl}/health`);
    return res.json();
  }
  /** The in-flight head + queue depth for a pool — use this instead of the indexer's confirmed `poolhead`
   *  when the pool is busy, so you build on the latest unconfirmed state.
   *  `tick` is the token TICK (e.g. 'pepe'), NOT the pool P2SH — earlier releases named this parameter
   *  `poolP2sh`, but the deployed sequencer has always keyed pools by tick; a P2SH gets an unknown-pool gate. */
  async head(tick) {
    const res = await fetch(`${this.baseUrl}/head?pool=${encodeURIComponent(tick)}`);
    if (!res.ok) throw new Error(`sequencer head -> HTTP ${res.status}`);
    return res.json();
  }
  /** Enqueue a signed swap tx built against a `head()` snapshot. A 409-shaped `{ok:false, retry:true}`
   *  means `prevHead` is stale — re-fetch `head()` and rebuild.
   *
   *  `ref` (optional) — your partner tag (kron.technology/wallets): 2–32 chars of `a-z 0-9 - _`,
   *  case-insensitive. A malformed tag is rejected with 400 so a misconfigured integration fails on the
   *  first submit rather than silently at settlement. NOTE: the canonical attribution path is the ON-CHAIN
   *  payload tag (`encodePartnerTag` — UTF-8 `kron:r:<ref>` hex-encoded in `tx.payload`), which is credited
   *  route-independently (sequencer or direct submission); this field is the legacy sequencer-side record. */
  async submit(body) {
    const res = await fetch(`${this.baseUrl}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.json();
  }
  /** The in-flight curve head + queue depth for a pre-graduation token, keyed by its curve covenant id
   *  (hex). `head: null` with `ok: true` means no chain is in flight — build against the confirmed state
   *  from the node/indexer instead. A `{ok:false}` gate (unknown/full/unreachable) → submit direct. */
  async curveHead(curveCovid) {
    const res = await fetch(`${this.baseUrl}/curve/head?covid=${encodeURIComponent(curveCovid)}`);
    if (!res.ok && res.status !== 409) throw new Error(`sequencer curve head -> HTTP ${res.status}`);
    return res.json();
  }
  /** Enqueue a signed pre-graduation buy/sell built against a `curveHead()` snapshot. A 409-shaped
   *  `{ok:false, retry:true}` means `prevHead` is stale — re-fetch `curveHead()` and rebuild.
   *  `ref` — optional partner tag, same contract as `submit()`. */
  async curveSubmit(body) {
    const res = await fetch(`${this.baseUrl}/curve/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.json();
  }
  /** The sequencer's view of a submitted tx: `state` is one of `broadcasting`, `accepted`, `rejected`,
   *  `broadcast-ambiguous`, `confirmed`, `dropped` (chain evicted), or `unknown` (never seen / aged out).
   *  On-chain acceptance is the settlement truth; poll this (or subscribe to `events()`) after `submit()`.
   *  `broadcast-ambiguous` means the tx may already be in the mempool — do NOT re-submit a REBUILT tx
   *  (new txid) on a timeout without checking here first, or you can double-spend your own funding inputs. */
  async status(tick, txid) {
    const res = await fetch(`${this.baseUrl}/status?pool=${encodeURIComponent(tick)}&txid=${encodeURIComponent(txid)}`);
    if (!res.ok) throw new Error(`sequencer status -> HTTP ${res.status}`);
    return res.json();
  }
  /** SSE: head changes for a pool (`tick`, same key as `head()`). Same Node-EventSource caveat as
   *  IndexerClient.stream. */
  events(tick, onEvent, EventSourceImpl) {
    const ES = EventSourceImpl ?? globalThis.EventSource;
    if (!ES) throw new Error('No EventSource available \u2014 in Node, pass EventSourceImpl (e.g. from the "eventsource" package)');
    const es = new ES(`${this.baseUrl}/events?pool=${encodeURIComponent(tick)}`);
    es.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data));
      } catch {
      }
    };
    return () => es.close();
  }
};

// src/verify/index.ts
var verify_exports = {};
__export(verify_exports, {
  canonicalTokenListMsg: () => canonicalTokenListMsg,
  kaspaRestFetchTx: () => kaspaRestFetchTx,
  verifyTokenListEntry: () => verifyTokenListEntry,
  verifyTokenListSignature: () => verifyTokenListSignature
});

// src/verify/tokenList.ts
var lc = (s) => String(s ?? "").toLowerCase();
async function verifyTokenListEntry(entry, fetchTx) {
  const covid = lc(entry?.covenantId);
  const txid = entry?.extensions?.genesisTxid ?? null;
  if (!covid) return { ok: false, covenantIdPresent: false, reason: "entry has no covenantId" };
  if (!txid) return { ok: false, covenantIdPresent: false, reason: "entry has no genesisTxid to verify against" };
  let tx;
  try {
    tx = await fetchTx(txid);
  } catch (e) {
    return { ok: false, covenantIdPresent: false, reason: `fetchTx failed for ${txid}: ${e?.message ?? e}` };
  }
  const outs = Array.isArray(tx?.outputs) ? tx.outputs : [];
  const present = outs.some((o) => lc(o?.covenant_id ?? o?.covenantId) === covid);
  return present ? { ok: true, covenantIdPresent: true } : { ok: false, covenantIdPresent: false, reason: `covenantId ${entry.covenantId} not found on any output of genesis tx ${txid}` };
}
function kaspaRestFetchTx(baseUrl) {
  const base = baseUrl.replace(/\/+$/, "");
  return async (txid) => {
    const res = await fetch(`${base}/transactions/${encodeURIComponent(txid)}?outputs=true`);
    if (!res.ok) throw new Error(`kaspa REST tx ${txid} -> HTTP ${res.status}`);
    return await res.json();
  };
}
var canonicalTokenListMsg = (doc) => JSON.stringify({
  v: "KRON-TOKENLIST-1",
  network: lc(doc.network),
  variant: { all: !!doc.variant?.all, tier: doc.variant?.tier ?? null },
  version: { major: Number(doc.version?.major ?? 0), minor: Number(doc.version?.minor ?? 0), patch: Number(doc.version?.patch ?? 0) },
  tokens: doc.tokens ?? []
});
var xOnly = (key) => {
  let h = lc(key).replace(/^0x/, "");
  if (h.length === 66 && (h.startsWith("02") || h.startsWith("03"))) h = h.slice(2);
  else if (h.length === 130 && h.startsWith("04")) h = h.slice(2, 66);
  return h;
};
function verifyTokenListSignature(kaspa, list, opts = {}) {
  if (!list?.signature) return { ok: false, signed: false, reason: "list is unsigned (older backend or signing key not configured)" };
  const pinned = xOnly(opts.pinnedPublicKey);
  const fromResponse = xOnly(list.publicKey);
  let keySource;
  let publicKey;
  if (pinned) {
    if (fromResponse && fromResponse !== pinned) {
      return { ok: false, signed: true, keySource: "pinned", reason: `signer mismatch: response publicKey ${fromResponse} != pinned ${pinned}` };
    }
    keySource = "pinned";
    publicKey = pinned;
  } else if (fromResponse) {
    keySource = "response";
    publicKey = fromResponse;
  } else {
    return { ok: false, signed: true, reason: "signed list carries no publicKey and no pinnedPublicKey was provided" };
  }
  if (!list.variant) return { ok: false, signed: true, keySource, reason: "signed list has no variant field (cannot rule out cross-variant replay)" };
  const expected = { all: false, tier: null, ...opts.expectedVariant };
  const got = { all: !!list.variant.all, tier: list.variant.tier ?? null };
  if (got.all !== expected.all || got.tier !== expected.tier) {
    return { ok: false, signed: true, keySource, reason: `variant mismatch: document is signed for ${JSON.stringify(got)} but ${JSON.stringify(expected)} was expected (possible replay)` };
  }
  let valid = false;
  try {
    valid = kaspa.verifyMessage({ message: canonicalTokenListMsg(list), signature: String(list.signature), publicKey }) === true;
  } catch (e) {
    return { ok: false, signed: true, keySource, reason: `verifyMessage failed: ${e?.message ?? e}` };
  }
  return valid ? { ok: true, signed: true, keySource } : { ok: false, signed: true, keySource, reason: "signature verification failed (document was modified, or signed by a different key)" };
}
export {
  client_exports as client,
  covenantSelect_exports as covenantSelect,
  cpCurve_exports as curve,
  curveCpTx_exports as curveCp,
  genesis_exports as genesis,
  kcc20Tx_exports as kcc20,
  partnerTag_exports as partnerTag,
  poolCpTx_exports as poolCp,
  poolCpV3Tx_exports as poolCpV3,
  sigscript_exports as sigscript,
  spend_exports as spend,
  verify_exports as verify,
  vestingTx_exports as vesting,
  wallet_exports as wallet
};
//# sourceMappingURL=index.js.map