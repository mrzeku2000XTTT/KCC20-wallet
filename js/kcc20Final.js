/* Official KCC-20 (kaspanet/kccs kcc-0020.md, Status: Final 2026-10-21).
   112-byte KCC20State, transfer 79c71c23, transfer_delegator fd3ef14a.
   KRON 46-byte cells stay on the KRON builder. Do not mix the two in one tx. */

export const KCC20_FINAL = {
  spec: 'https://github.com/kaspanet/kccs/blob/main/kcc-0020.md',
  status: 'Final',
  stateLen: 112,
  maxIns: 3,
  maxOuts: 3
};

export const TRANSFER_TAG = '79c71c23';
export const DELEGATOR_TAG = 'fd3ef14a';

export const OWNER_SCHEME = {
  P2PK_SCHNORR: 0x00,
  P2PKH_SCHNORR: 0x01,
  P2PKH_ECDSA: 0x02,
  P2SH: 0x03,
  COVENANT_ID: 0x04
};

export const BORROW_SCHEME = {
  DISABLED: 0x00,
  AMOUNT_THRESHOLD: 0x01,
  SCHNORR: 0x02,
  HASH_CHAIN: 0x03
};

const OP_0 = 0x00;
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;

const ZERO32 = new Uint8Array(32);

export function hexToU8(hex) {
  const h = String(hex || '').replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase();
  if (!h) return new Uint8Array(0);
  if (h.length % 2) throw new Error('hex length must be even');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function u8ToHex(u8) {
  const b = u8 instanceof Uint8Array ? u8 : Uint8Array.from(u8 || []);
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] + 256).toString(16).slice(1);
  return s;
}

export function concatU8(parts) {
  const n = parts.reduce((a, p) => a + (p?.length || 0), 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    if (!p || !p.length) continue;
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function bytesEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function encodeInt8(n) {
  const v = BigInt(n);
  const neg = v < 0n;
  const mag = neg ? -v : v;
  if (mag > 0x7fffffffffffffffn) throw new Error('KCC-20 int does not fit in 63 bits');
  const t = new Uint8Array(8);
  let x = mag;
  for (let i = 0; i < 8; i++) {
    t[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  if (neg) t[7] |= 0x80;
  return t;
}

export function decodeInt8(bytes, offset = 0) {
  const b = bytes instanceof Uint8Array ? bytes : hexToU8(bytes);
  let mag = 0n;
  for (let i = 0; i < 8; i++) mag |= BigInt(b[offset + i]) << BigInt(8 * i);
  const neg = (b[offset + 7] & 0x80) !== 0;
  if (neg) mag &= (1n << 63n) - 1n;
  return neg ? -mag : mag;
}

export function pushData(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  if (b.length === 0) return new Uint8Array([OP_0]);
  if (b.length <= 75) return concatU8([Uint8Array.of(b.length), b]);
  if (b.length <= 255) return concatU8([Uint8Array.of(OP_PUSHDATA1, b.length), b]);
  if (b.length <= 65535) {
    return concatU8([Uint8Array.of(OP_PUSHDATA2, b.length & 255, b.length >> 8), b]);
  }
  throw new Error('KCC-20 push exceeds 65535 bytes');
}

function need32(v, name) {
  const b = v instanceof Uint8Array ? v : hexToU8(v);
  if (b.length !== 32) throw new Error(name + ' must be 32 bytes');
  return b;
}

function needByte(v) {
  return Number(v) & 255;
}

export function normalizeState(s) {
  return {
    amount: BigInt(s.amount ?? 0),
    owner: need32(s.owner ?? s.owner_hex ?? ZERO32, 'owner'),
    ownerScheme: needByte(s.ownerScheme ?? s.owner_scheme ?? (s.owner_scheme_hex != null ? parseInt(s.owner_scheme_hex, 16) : 0)),
    borrowScheme: needByte(s.borrowScheme ?? s.borrow_scheme ?? (s.borrow_scheme_hex != null ? parseInt(s.borrow_scheme_hex, 16) : 0)),
    borrowGuard: need32(s.borrowGuard ?? s.borrow_guard_hex ?? ZERO32, 'borrow_guard'),
    extension: need32(s.extension ?? s.extension_commitment ?? s.extension_commitment_hex ?? ZERO32, 'extension_commitment')
  };
}

/** KCC-1 EncodeState of KCC20State — always OP_DATA framed, 112 bytes. */
export function encodeState(raw) {
  const s = normalizeState(raw);
  return concatU8([
    pushData(encodeInt8(s.amount)),
    pushData(s.owner),
    pushData(Uint8Array.of(s.ownerScheme)),
    pushData(Uint8Array.of(s.borrowScheme)),
    pushData(s.borrowGuard),
    pushData(s.extension)
  ]);
}

export function decodeState(bytes, offset = 0) {
  const b = bytes instanceof Uint8Array ? bytes : hexToU8(bytes);
  let i = offset;
  function takePush(expectLen) {
    const op = b[i++];
    if (op !== expectLen) throw new Error('KCC20State field push is not OP_DATA_' + expectLen);
    const slice = b.slice(i, i + expectLen);
    i += expectLen;
    return slice;
  }
  const amount = decodeInt8(takePush(8), 0);
  const owner = takePush(32);
  const ownerScheme = takePush(1)[0];
  const borrowScheme = takePush(1)[0];
  const borrowGuard = takePush(32);
  const extension = takePush(32);
  return {
    amount,
    owner,
    ownerScheme,
    borrowScheme,
    borrowGuard,
    extension,
    encodedLength: i - offset
  };
}

export function isOfficialStateAt(script, s) {
  const b = script instanceof Uint8Array ? script : hexToU8(script);
  if (s < 0 || s + 112 > b.length) return false;
  if (b[s] !== 8 || b[s + 9] !== 32 || b[s + 42] !== 1 || b[s + 44] !== 1 || b[s + 46] !== 32 || b[s + 79] !== 32) {
    return false;
  }
  try {
    const st = decodeState(b, s);
    if (st.encodedLength !== 112) return false;
    if (st.ownerScheme > 4) return false;
    if (st.borrowScheme > 3) return false;
    return true;
  } catch {
    return false;
  }
}

export function isKronStateAt(script, s) {
  const b = script instanceof Uint8Array ? script : hexToU8(script);
  if (s < 0 || s + 46 > b.length) return false;
  return b[s] === 32 && b[s + 33] === 1 && b[s + 34] <= 3 && b[s + 35] === 8 && b[s + 44] === 1 && b[s + 45] <= 1;
}

export function findOfficialState(script) {
  const b = script instanceof Uint8Array ? script : hexToU8(script);
  const hits = [];
  for (let s = 0; s + 112 <= b.length; s++) {
    if (isOfficialStateAt(b, s)) hits.push(s);
  }
  return hits;
}

export function findKronState(script) {
  const b = script instanceof Uint8Array ? script : hexToU8(script);
  const hits = [];
  for (let s = 0; s + 46 <= b.length; s++) {
    if (isKronStateAt(b, s)) hits.push(s);
  }
  return hits;
}

function kronFrom(script, n) {
  let amount = 0n;
  for (let i = 0; i < 8; i++) amount |= BigInt(script[n + 36 + i]) << BigInt(8 * i);
  return {
    layout: 'kron',
    script,
    stateStart: n,
    ownerIdentifier: script.slice(n + 1, n + 33),
    identifierType: script[n + 34],
    amount,
    isMinter: script[n + 45] === 1
  };
}

export function classifyRedeem(hex) {
  const script = hex instanceof Uint8Array ? hex : hexToU8(hex);
  const officialHits = findOfficialState(script);
  const kronHits = findKronState(script);
  if (officialHits.length === 1 && (kronHits.length === 0 || officialHits[0] <= kronHits[0])) {
    const n = officialHits[0];
    const st = decodeState(script, n);
    return {
      layout: 'final',
      script,
      stateStart: n,
      amount: st.amount,
      owner: st.owner,
      ownerScheme: st.ownerScheme,
      borrowScheme: st.borrowScheme,
      borrowGuard: st.borrowGuard,
      extension: st.extension
    };
  }
  if (kronHits.length === 1) return kronFrom(script, kronHits[0]);
  if (officialHits.length === 1) {
    const n = officialHits[0];
    const st = decodeState(script, n);
    return {
      layout: 'final',
      script,
      stateStart: n,
      amount: st.amount,
      owner: st.owner,
      ownerScheme: st.ownerScheme,
      borrowScheme: st.borrowScheme,
      borrowGuard: st.borrowGuard,
      extension: st.extension
    };
  }
  return { layout: 'unknown', script };
}

export function materializeOfficialScript(tpl, state) {
  const s = tpl.script.slice();
  const n = tpl.stateStart || 0;
  const framed = encodeState(state);
  if (framed.length !== 112) throw new Error('EncodeState must be 112 bytes');
  s.set(framed, n);
  return s;
}

export function groupedFieldPushes(states) {
  const rows = (states || []).map(normalizeState);
  if (!rows.length) throw new Error('transfer next_states is empty');
  if (rows.length > KCC20_FINAL.maxOuts) throw new Error('Final KCC-20 allows at most ' + KCC20_FINAL.maxOuts + ' outputs');
  return concatU8([
    pushData(concatU8(rows.map(s => encodeInt8(s.amount)))),
    pushData(concatU8(rows.map(s => s.owner))),
    pushData(Uint8Array.from(rows.map(s => s.ownerScheme))),
    pushData(Uint8Array.from(rows.map(s => s.borrowScheme))),
    pushData(concatU8(rows.map(s => s.borrowGuard))),
    pushData(concatU8(rows.map(s => s.extension)))
  ]);
}

export function encodeWitnessNormal(scheme, parts = {}) {
  const path = Uint8Array.of(0x00);
  const sch = needByte(scheme);
  if (sch === OWNER_SCHEME.P2PK_SCHNORR) {
    const sig = parts.sig instanceof Uint8Array ? parts.sig : hexToU8(parts.sig);
    if (sig.length !== 65) throw new Error('p2pk-schnorr witness needs a 65-byte sig');
    return concatU8([path, sig]);
  }
  if (sch === OWNER_SCHEME.P2PKH_SCHNORR) {
    const pk = need32(parts.pubkey, 'p2pkh pubkey');
    const sig = parts.sig instanceof Uint8Array ? parts.sig : hexToU8(parts.sig);
    if (sig.length !== 65) throw new Error('p2pkh-schnorr witness needs a 65-byte sig');
    return concatU8([path, pk, sig]);
  }
  if (sch === OWNER_SCHEME.P2PKH_ECDSA) {
    const pk = parts.pubkey instanceof Uint8Array ? parts.pubkey : hexToU8(parts.pubkey);
    if (pk.length !== 33) throw new Error('p2pkh-ecdsa witness needs a 33-byte compressed pubkey');
    const sig = parts.sig instanceof Uint8Array ? parts.sig : hexToU8(parts.sig);
    if (sig.length !== 65) throw new Error('p2pkh-ecdsa witness needs a 65-byte sig');
    return concatU8([path, pk, sig]);
  }
  if (sch === OWNER_SCHEME.P2SH) {
    return concatU8([path, Uint8Array.of(Number(parts.inputIndex ?? 0) & 255)]);
  }
  if (sch === OWNER_SCHEME.COVENANT_ID) return path;
  throw new Error('Unsupported KCC-20 owner_scheme 0x' + sch.toString(16));
}

export function encodeWitnessDelegator(scheme, parts = {}) {
  const sch = needByte(scheme);
  if (sch === OWNER_SCHEME.P2PK_SCHNORR) {
    const sig = parts.sig instanceof Uint8Array ? parts.sig : hexToU8(parts.sig);
    if (sig.length !== 65) throw new Error('delegator p2pk-schnorr witness needs a 65-byte sig');
    return sig;
  }
  if (sch === OWNER_SCHEME.P2PKH_SCHNORR) {
    const pk = need32(parts.pubkey, 'p2pkh pubkey');
    const sig = parts.sig instanceof Uint8Array ? parts.sig : hexToU8(parts.sig);
    if (sig.length !== 65) throw new Error('delegator p2pkh-schnorr witness needs a 65-byte sig');
    return concatU8([pk, sig]);
  }
  if (sch === OWNER_SCHEME.P2SH) {
    return Uint8Array.of(Number(parts.inputIndex ?? 0) & 255);
  }
  if (sch === OWNER_SCHEME.COVENANT_ID) return new Uint8Array(0);
  throw new Error('Unsupported KCC-20 delegator owner_scheme 0x' + sch.toString(16));
}

function tagPush(tagHex) {
  const tag = hexToU8(tagHex);
  if (tag.length !== 4) throw new Error('dispatch tag must be 4 bytes');
  return concatU8([Uint8Array.of(0x04), tag]);
}

export function encodeTransferArgs(nextStates, witness) {
  const w = witness instanceof Uint8Array ? witness : hexToU8(witness);
  return concatU8([groupedFieldPushes(nextStates), pushData(w), tagPush(TRANSFER_TAG)]);
}

export function encodeDelegatorArgs(witness) {
  const w = witness instanceof Uint8Array ? witness : hexToU8(witness);
  return concatU8([pushData(w), tagPush(DELEGATOR_TAG)]);
}

export function transferSigScript(nextStates, witness, redeem) {
  const r = redeem instanceof Uint8Array ? redeem : hexToU8(redeem);
  return concatU8([encodeTransferArgs(nextStates, witness), pushData(r)]);
}

export function delegatorSigScript(witness, redeem) {
  const r = redeem instanceof Uint8Array ? redeem : hexToU8(redeem);
  return concatU8([encodeDelegatorArgs(witness), pushData(r)]);
}

export function dummyWitness(scheme, leader) {
  if (leader) {
    if (scheme === OWNER_SCHEME.P2PK_SCHNORR) return concatU8([Uint8Array.of(0x00), new Uint8Array(65)]);
    if (scheme === OWNER_SCHEME.P2PKH_SCHNORR) return concatU8([Uint8Array.of(0x00), new Uint8Array(32), new Uint8Array(65)]);
    if (scheme === OWNER_SCHEME.P2SH) return Uint8Array.of(0x00, 0x00);
    if (scheme === OWNER_SCHEME.COVENANT_ID) return Uint8Array.of(0x00);
  } else {
    if (scheme === OWNER_SCHEME.P2PK_SCHNORR) return new Uint8Array(65);
    if (scheme === OWNER_SCHEME.P2PKH_SCHNORR) return concatU8([new Uint8Array(32), new Uint8Array(65)]);
    if (scheme === OWNER_SCHEME.P2SH) return Uint8Array.of(0x00);
    if (scheme === OWNER_SCHEME.COVENANT_ID) return new Uint8Array(0);
  }
  return leader ? concatU8([Uint8Array.of(0x00), new Uint8Array(65)]) : new Uint8Array(65);
}

export function toSig65(sigHex) {
  let h = sigHex;
  if (h instanceof Uint8Array) h = u8ToHex(h);
  h = String(h || '').replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase();
  if (h.length === 132 && h.slice(0, 2) === '41') h = h.slice(2);
  if (h.length === 134 && h.slice(0, 4) === '4c41') h = h.slice(4);
  if (h.length === 132) {
    const op = parseInt(h.slice(0, 2), 16);
    if (op > 0 && op <= 75) h = h.slice(2);
  }
  if (h.length === 128) h += '01';
  if (h.length !== 130) throw new Error('Schnorr sig for KCC-20 must be 65 bytes (got ' + (h.length / 2) + ')');
  return hexToU8(h);
}

export function ownerSchemeName(n) {
  return ['p2pk-schnorr/v1', 'p2pkh-schnorr/v1', 'p2pkh-ecdsa/v1', 'p2sh/v1', 'covenant-id/v1'][needByte(n)] || 'unknown';
}

export function canWalletSpendScheme(scheme) {
  const s = needByte(scheme);
  return s === OWNER_SCHEME.P2PK_SCHNORR || s === OWNER_SCHEME.P2PKH_SCHNORR;
}

export function validateStandardTransfer(inputs, nextStates, { maxIns = KCC20_FINAL.maxIns } = {}) {
  const ins = (inputs || []).map(normalizeState);
  const outs = (nextStates || []).map(normalizeState);
  if (!ins.length || !outs.length) throw new Error('A standard transfer needs inputs and outputs');
  if (ins.length > maxIns) throw new Error(ins.length + ' token inputs exceed max_token_inputs ' + maxIns);
  if (outs.length > KCC20_FINAL.maxOuts) throw new Error(outs.length + ' token outputs exceed max_token_outputs ' + KCC20_FINAL.maxOuts);
  const ext = u8ToHex(ins[0].extension);
  let inn = 0n;
  let out = 0n;
  for (const row of ins) {
    if (row.amount < 0n) throw new Error('A token amount stays non-negative');
    if (u8ToHex(row.extension) !== ext) throw new Error('A standard transfer keeps one extension commitment');
    inn += row.amount;
  }
  for (const row of outs) {
    if (row.amount < 0n) throw new Error('A token amount stays non-negative');
    if (row.ownerScheme > 4) throw new Error('owner_scheme is not supported by the configuration');
    if (u8ToHex(row.extension) !== ext) throw new Error('successor extension_commitment differs from the inputs');
    out += row.amount;
  }
  if (inn !== out) throw new Error('total successor amount ' + out + ' does not equal total input amount ' + inn);
  return { inAmount: inn, outAmount: out, extension: ext };
}

export function layoutLabel(layout, standard) {
  const s = String(standard || '').toLowerCase();
  const L = String(layout || '').toLowerCase();
  if (L === 'final' || s === 'kcc-20' || s === 'kcc20' || s === 'final' || s === 'kcc-0020') return 'KCC-20';
  if (L === 'kron' || s === 'kron-native' || s === 'kron') return 'KRON';
  if (L === 'legacy' || s === 'legacy-kcc20') return 'KCC-20';
  return 'KCC20';
}

export function isFinalLayout(token) {
  const L = String(token?.layout || '').toLowerCase();
  const s = String(token?.standard || '').toLowerCase();
  return L === 'final' || s === 'kcc-20' || s === 'kcc20' || s === 'final' || s === 'kcc-0020';
}

export function isKronLayout(token) {
  const L = String(token?.layout || '').toLowerCase();
  const s = String(token?.standard || '').toLowerCase();
  if (isFinalLayout(token)) return false;
  return L === 'kron' || s === 'kron-native' || s === 'kron' || (!L && !s);
}

export function buildOfficialSend({
  k,
  tpl,
  senderTokens,
  destOwner,
  sendAmount,
  tokenCovid,
  tokenDust = 50_000_000n,
  selfOwner,
  selfScheme
}) {
  if (!senderTokens?.length) throw new Error('send requires at least one Final KCC-20 UTXO');
  if (senderTokens.length > KCC20_FINAL.maxIns) {
    throw new Error('Final KCC-20 allows at most ' + KCC20_FINAL.maxIns + ' token inputs');
  }
  if (!tokenCovid) throw new Error('send requires the token covenant id for the output bindings');
  const destPk = need32(destOwner, 'destination owner');
  const total = senderTokens.reduce((s, t) => s + BigInt(t.state.amount), 0n);
  const change = total - BigInt(sendAmount);
  if (sendAmount < 1n || change < 0n) {
    throw new Error('send requires 1 <= sendAmount <= ' + total);
  }
  const leader = normalizeState(senderTokens[0].state);
  validateStandardTransfer(
    senderTokens.map(t => t.state),
    change >= 1n
      ? [
          { amount: sendAmount, owner: destPk, ownerScheme: 0, borrowScheme: 0, borrowGuard: ZERO32, extension: leader.extension },
          {
            amount: change,
            owner: selfOwner || leader.owner,
            ownerScheme: selfScheme ?? leader.ownerScheme,
            borrowScheme: leader.borrowScheme,
            borrowGuard: leader.borrowGuard,
            extension: leader.extension
          }
        ]
      : [
          { amount: sendAmount, owner: destPk, ownerScheme: 0, borrowScheme: 0, borrowGuard: ZERO32, extension: leader.extension }
        ]
  );
  const destState = {
    amount: BigInt(sendAmount),
    owner: destPk,
    ownerScheme: OWNER_SCHEME.P2PK_SCHNORR,
    borrowScheme: BORROW_SCHEME.DISABLED,
    borrowGuard: ZERO32,
    extension: leader.extension
  };
  const changeState = change >= 1n
    ? {
        amount: change,
        owner: selfOwner || leader.owner,
        ownerScheme: selfScheme ?? leader.ownerScheme,
        borrowScheme: leader.borrowScheme,
        borrowGuard: leader.borrowGuard,
        extension: leader.extension
      }
    : null;
  const nextStates = changeState ? [destState, changeState] : [destState];
  const binding = { covid: String(tokenCovid).replace(/^0x/i, '').toLowerCase(), authorizingInput: 0 };
  const spkOf = (redeem) => k.payToScriptHashScript(redeem);
  const inputs = senderTokens.map((t, i) => {
    const st = normalizeState(t.state);
    if (!canWalletSpendScheme(st.ownerScheme)) {
      throw new Error('This Final KCC-20 cell uses ' + ownerSchemeName(st.ownerScheme) + '. Scorpion sends p2pk-schnorr and p2pkh-schnorr cells.');
    }
    const redeem = materializeOfficialScript(tpl, st);
    const witness = dummyWitness(st.ownerScheme, i === 0);
    const signatureScript = i === 0
      ? transferSigScript(nextStates, witness, redeem)
      : delegatorSigScript(witness, redeem);
    return {
      transactionId: t.transactionId,
      index: t.index,
      value: t.value,
      scriptPublicKey: t.scriptPublicKey || spkOf(redeem),
      signatureScript,
      redeem,
      role: 'token',
      ownerScheme: st.ownerScheme,
      state: st
    };
  });
  const outputs = nextStates.map((st, i) => ({
    value: BigInt(tokenDust),
    scriptPublicKey: spkOf(materializeOfficialScript(tpl, st)),
    role: i === 0 ? 'send' : 'change',
    binding
  }));
  return {
    kind: 'transfer',
    layout: 'final',
    inputs,
    outputs,
    nextStates,
    economics: { sendAmount: BigInt(sendAmount), change },
    covids: { tokenCovid: binding.covid }
  };
}

export function fillOfficialWitnesses(spend, sigs, pubkey32) {
  const pk = pubkey32 ? need32(pubkey32, 'wallet pubkey') : null;
  spend.inputs.forEach((inp, i) => {
    const sig = toSig65(sigs[i]);
    const witness = i === 0
      ? encodeWitnessNormal(inp.ownerScheme, { sig, pubkey: pk })
      : encodeWitnessDelegator(inp.ownerScheme, { sig, pubkey: pk });
    inp.signatureScript = i === 0
      ? transferSigScript(spend.nextStates, witness, inp.redeem)
      : delegatorSigScript(witness, inp.redeem);
  });
  return spend;
}

const VEC_STATE_HEX = '08e8030000000000002011111111111111111111111111111111111111111111111111111111111111110101010120f401000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000';
const VEC_GROUPED = [
  '1058020000000000009001000000000000',
  '4022222222222222222222222222222222222222222222222222222222222222223333333333333333333333333333333333333333333333333333333333333333',
  '020001',
  '020001',
  '4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  '4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
];
const VEC_WITNESS = '004444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444';
const VEC_WITNESS_PUSH = '42004444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444';
const VEC_TAG_PUSH = '0479c71c23';

function sameHex(a, b, label) {
  const x = String(a || '').toLowerCase();
  const y = String(b || '').toLowerCase();
  if (x !== y) throw new Error('KCC-20 vector mismatch (' + label + ')');
}

export function selfTest() {
  const encoded = encodeState({
    amount: 1000,
    owner: '11'.repeat(32),
    ownerScheme: 0x01,
    borrowScheme: 0x01,
    borrowGuard: 'f401000000000000' + '00'.repeat(24),
    extension: '00'.repeat(32)
  });
  if (encoded.length !== 112) throw new Error('EncodeState length ' + encoded.length);
  sameHex(u8ToHex(encoded), VEC_STATE_HEX, 'EncodeState');
  const back = decodeState(encoded);
  if (back.amount !== 1000n) throw new Error('decode amount');
  sameHex(u8ToHex(back.owner), '11'.repeat(32), 'owner');
  if (back.ownerScheme !== 0x01 || back.borrowScheme !== 0x01) throw new Error('schemes');

  const next = [
    {
      amount: 600,
      owner: '22'.repeat(32),
      ownerScheme: 0x00,
      borrowScheme: 0x00,
      borrowGuard: '00'.repeat(32),
      extension: '00'.repeat(32)
    },
    {
      amount: 400,
      owner: '33'.repeat(32),
      ownerScheme: 0x01,
      borrowScheme: 0x01,
      borrowGuard: '00'.repeat(32),
      extension: '00'.repeat(32)
    }
  ];
  sameHex(u8ToHex(groupedFieldPushes(next)), VEC_GROUPED.join(''), 'grouped fields');
  sameHex(u8ToHex(pushData(hexToU8(VEC_WITNESS))), VEC_WITNESS_PUSH, 'witness push');
  sameHex(u8ToHex(tagPush(TRANSFER_TAG)), VEC_TAG_PUSH, 'dispatch tag');
  sameHex(
    u8ToHex(encodeTransferArgs(next, VEC_WITNESS)),
    VEC_GROUPED.join('') + VEC_WITNESS_PUSH + VEC_TAG_PUSH,
    'transfer args'
  );

  const p2pk = encodeWitnessNormal(0x00, { sig: '44'.repeat(65) });
  sameHex(u8ToHex(p2pk), VEC_WITNESS, 'p2pk witness');
  const p2pkh = encodeWitnessNormal(0x01, { pubkey: '22'.repeat(32), sig: '44'.repeat(65) });
  if (p2pkh.length !== 98) throw new Error('p2pkh witness length');
  const p2sh = encodeWitnessNormal(0x03, { inputIndex: 2 });
  sameHex(u8ToHex(p2sh), '0002', 'p2sh witness');
  const cov = encodeWitnessNormal(0x04, {});
  sameHex(u8ToHex(cov), '00', 'covenant-id witness');

  const classified = classifyRedeem(encoded);
  if (classified.layout !== 'final') throw new Error('classify EncodeState as final');

  const kronLike = concatU8([
    Uint8Array.of(32), new Uint8Array(32), Uint8Array.of(1, 0, 8), encodeInt8(5), Uint8Array.of(1, 0)
  ]);
  if (classifyRedeem(kronLike).layout !== 'kron') throw new Error('classify KRON 46-byte as kron');

  validateStandardTransfer(
    [{ amount: 1000, owner: '11'.repeat(32), ownerScheme: 0, borrowScheme: 0, borrowGuard: ZERO32, extension: ZERO32 }],
    next
  );
  let rejected = false;
  try {
    validateStandardTransfer(
      [{ amount: 1000, owner: '11'.repeat(32), ownerScheme: 0, borrowScheme: 0, borrowGuard: ZERO32, extension: ZERO32 }],
      [{ ...next[0], amount: 600 }, { ...next[1], amount: 500 }]
    );
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('amount-not-preserved must reject');
  return true;
}
