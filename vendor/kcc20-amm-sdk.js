/* kcc20-amm-sdk.js — SELF-CONTAINED, DEPENDENCY-FREE browser bundle of the trustless KCC20-AMM SDK (Path B).
 *
 * Runs in a plain <script> (no bundler, no Node, no kaspa-wasm) and in Node (for the self-test).
 * Everything below — a Uint8Array-backed Buffer shim, blake2b-256, script pushes, P2SH spk + cashaddr address,
 * the action-script encoders, the buy/sell/add/remove assemblers, and the PSKT serializer — is pure JS. The bundle
 * BUILDS + SERIALIZES a complete covenant tx entirely client-side; the browser wallet signs only the funding input
 * and a thin relay forwards the finished tx to a covenant node. The relay never sees a key and never builds a
 * witness — it can only validate-then-broadcast a transaction the covenant already permits. Correctness: selftest.js
 * loads THIS file and asserts its output matches a pinned golden vector.
 *
 * Exposes window.KCC20AMM (browser) / module.exports (Node): { quoteBuy, quoteSell, buildBuy, buildSell, buildAdd,
 *   buildRemove, fromAssembled, p2shAddress, poolSpkOf, noteSpkOf, encoders..., _internals }.
 */
(function (global) {
  'use strict';

  // ── Uint8Array-backed Buffer shim (the bundle uses ONLY this — never a host Buffer — so what the Node harness
  //    verifies is exactly what the browser runs). Covers just the surface the SDK touches. ──
  const HEX = [];
  for (let i = 0; i < 256; i++) HEX[i] = i.toString(16).padStart(2, '0');
  class Buf extends Uint8Array {
    static alloc(n) { return new Buf(n); }
    static isBuffer(x) { return x instanceof Buf; }
    static from(src, enc) {
      if (typeof src === 'string') {
        if (enc === 'hex') {
          const n = src.length >> 1, b = new Buf(n);
          for (let i = 0; i < n; i++) b[i] = parseInt(src.substr(i * 2, 2), 16);
          return b;
        }
        // utf8
        const bytes = []; for (let i = 0; i < src.length; i++) {
          let c = src.charCodeAt(i);
          if (c < 0x80) bytes.push(c);
          else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
          else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
        }
        return Buf.from(bytes);
      }
      if (src instanceof Uint8Array) { const b = new Buf(src.length); b.set(src); return b; }
      if (Array.isArray(src)) { const b = new Buf(src.length); for (let i = 0; i < src.length; i++) b[i] = src[i] & 0xff; return b; }
      if (typeof src === 'number') return new Buf(src);
      throw new Error('Buf.from: unsupported source');
    }
    static concat(list) {
      let n = 0; for (const x of list) n += x.length;
      const b = new Buf(n); let o = 0;
      for (const x of list) { b.set(x, o); o += x.length; }
      return b;
    }
    // NOTE: returns a COPY (Node Buffer.slice returns a view). Every SDK slice is read-only (blake2b reads blocks,
    // never writes back through a slice), so this is safe here — but do not add code that slices-then-writes-through.
    slice(a, b) { return Buf.from(super.slice(a, b)); }
    subarray(a, b) { return Buf.from(super.subarray(a, b)); }
    toString(enc) {
      if (enc === 'hex' || enc === undefined) { let s = ''; for (let i = 0; i < this.length; i++) s += HEX[this[i]]; return s; }
      // utf8 (only used incidentally)
      let s = ''; for (let i = 0; i < this.length; i++) s += String.fromCharCode(this[i]); return s;
    }
    writeUInt16LE(v, o) { this[o] = v & 0xff; this[o + 1] = (v >>> 8) & 0xff; return o + 2; }
    writeUInt32LE(v, o) { this[o] = v & 0xff; this[o + 1] = (v >>> 8) & 0xff; this[o + 2] = (v >>> 16) & 0xff; this[o + 3] = (v >>> 24) & 0xff; return o + 4; }
    writeBigUInt64LE(v, o) { o = o || 0; let n = BigInt(v); for (let i = 0; i < 8; i++) { this[o + i] = Number(n & 0xffn); n >>= 8n; } return o + 8; }
    readUInt16LE(o) { return this[o] | (this[o + 1] << 8); }
    readUInt32LE(o) { return (this[o] | (this[o + 1] << 8) | (this[o + 2] << 16) | (this[o + 3] << 24)) >>> 0; }
    readBigUInt64LE(o) { o = o || 0; let n = 0n; for (let i = 7; i >= 0; i--) n = (n << 8n) | BigInt(this[o + i]); return n; }
  }
  const Buffer = Buf;

  // ── blake2b-256 (RFC 7693), byte-identical to @noble/hashes (verified plain + keyed across 19 lengths) ──
  const B2_IV = [0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n];
  const B2_SIGMA = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
    [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4], [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
    [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13], [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
    [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11], [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
    [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5], [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3]];
  const B2_MASK = 0xffffffffffffffffn, rotr = (x, n) => ((x >> n) | (x << (64n - n))) & B2_MASK;
  function blake2b256(input, key) {
    const keylen = key ? key.length : 0;
    const h = B2_IV.slice(); h[0] ^= BigInt(0x01010000 ^ (keylen << 8) ^ 32);
    let buf = Buffer.from(input); if (keylen) { const blk = Buffer.alloc(128); blk.set(Buffer.from(key)); buf = Buffer.concat([blk, buf]); }
    let counter = 0n;
    const compress = (block, byteLen, isLast) => {
      const m = []; for (let i = 0; i < 16; i++) m.push(block.readBigUInt64LE(i * 8));
      const v = h.concat(B2_IV);
      counter = (counter + BigInt(byteLen)) & ((1n << 128n) - 1n);
      v[12] ^= counter & B2_MASK; v[13] ^= (counter >> 64n) & B2_MASK; if (isLast) v[14] ^= B2_MASK;
      const G = (a, b, c, d, x, y) => { v[a] = (v[a] + v[b] + x) & B2_MASK; v[d] = rotr(v[d] ^ v[a], 32n);
        v[c] = (v[c] + v[d]) & B2_MASK; v[b] = rotr(v[b] ^ v[c], 24n);
        v[a] = (v[a] + v[b] + y) & B2_MASK; v[d] = rotr(v[d] ^ v[a], 16n);
        v[c] = (v[c] + v[d]) & B2_MASK; v[b] = rotr(v[b] ^ v[c], 63n); };
      for (let r = 0; r < 12; r++) { const s = B2_SIGMA[r];
        G(0, 4, 8, 12, m[s[0]], m[s[1]]); G(1, 5, 9, 13, m[s[2]], m[s[3]]); G(2, 6, 10, 14, m[s[4]], m[s[5]]); G(3, 7, 11, 15, m[s[6]], m[s[7]]);
        G(0, 5, 10, 15, m[s[8]], m[s[9]]); G(1, 6, 11, 12, m[s[10]], m[s[11]]); G(2, 7, 8, 13, m[s[12]], m[s[13]]); G(3, 4, 9, 14, m[s[14]], m[s[15]]); }
      for (let i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
    };
    let off = 0;
    while (buf.length - off > 128) { compress(buf.slice(off, off + 128), 128, false); off += 128; }
    const last = Buffer.alloc(128); last.set(buf.slice(off));
    compress(last, buf.length - off, true);
    const out = Buffer.alloc(32); for (let i = 0; i < 4; i++) out.writeBigUInt64LE(h[i] & B2_MASK, i * 8);
    return out;
  }

  // ── script pushes ──
  const OP_0 = Buffer.from([0x00]), OP_2 = Buffer.from([0x52]), OP_4 = Buffer.from([0x54]);
  function pushMin(v) {
    if (v === false) v = 0; if (v === true) v = 1;
    let n = BigInt(v);
    if (n === 0n) return Buffer.from([0x00]);
    if (n >= 1n && n <= 16n) return Buffer.from([0x50 + Number(n)]);
    const neg = n < 0n; if (neg) n = -n; const b = []; while (n > 0n) { b.push(Number(n & 0xffn)); n >>= 8n; }
    if (b[b.length - 1] & 0x80) b.push(neg ? 0x80 : 0x00); else if (neg) b[b.length - 1] |= 0x80;
    return Buffer.from([b.length, ...b]);
  }
  function pushByte(v) {
    v = v === true ? 1 : v === false ? 0 : Number(v);
    if (v === 0) return Buffer.from([0x01, 0x00]);
    if (v >= 1 && v <= 16) return Buffer.from([0x50 + v]);
    return Buffer.from([0x01, v & 0xff]);
  }
  function pushRaw(hex) {
    const b = Buffer.isBuffer(hex) ? hex : Buffer.from(hex || '', 'hex');
    if (b.length <= 0x4b) return Buffer.concat([Buffer.from([b.length]), b]);
    if (b.length <= 0xff) return Buffer.concat([Buffer.from([0x4c, b.length]), b]);
    const l = Buffer.alloc(2); l.writeUInt16LE(b.length, 0); return Buffer.concat([Buffer.from([0x4d]), l, b]);
  }
  const le8 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v), 0); return b; };
  const pushLe8 = (v) => Buffer.concat([Buffer.from([0x08]), le8(v)]);
  function pushFor(payload) {
    const n = payload.length;
    if (n <= 0x4b) return Buffer.concat([Buffer.from([n]), payload]);
    if (n <= 0xff) return Buffer.concat([Buffer.from([0x4c, n]), payload]);
    if (n <= 0xffff) { const h = Buffer.alloc(3); h[0] = 0x4d; h.writeUInt16LE(n, 1); return Buffer.concat([h, payload]); }
    const h = Buffer.alloc(5); h[0] = 0x4e; h.writeUInt32LE(n, 1); return Buffer.concat([h, payload]);
  }

  // ── addresses ──
  const p2shSpk = (redeem) => 'aa20' + blake2b256(redeem).toString('hex') + '87';
  const p2pk = (x) => '20' + x + 'ac';
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function _polymod(values) { let c = 1n; for (const d of values) { const c0 = c >> 35n; c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    if (c0 & 0x01n) c ^= 0x98f2bc8e61n; if (c0 & 0x02n) c ^= 0x79b76d99e2n; if (c0 & 0x04n) c ^= 0xf33e5fb3c4n; if (c0 & 0x08n) c ^= 0xae2eabe2a8n; if (c0 & 0x10n) c ^= 0x1e4f43e470n; } return c ^ 1n; }
  function _c8to5(data) { const out = []; let acc = 0, bits = 0; for (const b of data) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 0x1f); } } if (bits > 0) out.push((acc << (5 - bits)) & 0x1f); return out; }
  function p2shAddress(spkHex, prefix) { prefix = prefix || 'kaspatest';
    const hash = Buffer.from(spkHex.slice(4, 68), 'hex'); const payload = Buffer.concat([Buffer.from([8]), hash]); const five = _c8to5(payload);
    const pre = []; for (const ch of prefix) pre.push(ch.charCodeAt(0) & 0x1f); pre.push(0);
    const mod = _polymod(pre.concat(five).concat([0, 0, 0, 0, 0, 0, 0, 0]));
    const cks = []; for (let i = 0; i < 8; i++) cks.push(Number((mod >> BigInt(5 * (7 - i))) & 0x1fn));
    return prefix + ':' + five.concat(cks).map(b => CHARSET[b]).join(''); }

  // ── action-script encoders (byte-identical to the on-chain covenant encoding) ──
  function poolStateRegion(s) { return Buffer.concat([pushLe8(s.kasReserve), pushLe8(s.tokenReserve), pushLe8(s.totalShares), pushRaw(s.tokenId), pushRaw(s.lpTokenId), pushLe8(s.feeBps), pushLe8(s.nonce)]); }
  function noteStateRegion(s) { return Buffer.concat([pushRaw(s.owner), Buffer.from([0x01, Number(s.idType) & 0xff]), pushLe8(s.amount), Buffer.from([0x01, s.isMinter ? 1 : 0])]); }
  const encState = poolStateRegion;
  const encTokMin = (t) => Buffer.concat([pushRaw(t.owner), pushMin(t.idType), pushMin(t.amount), pushMin(t.isMinter ? 1 : 0)]);
  function encodeExecuteSwapV6({ next, outIndex, kcc1OutIdx, amount, isBuy, nextReserve, buyerOut, sellChangeOut }) {
    return Buffer.concat([encState(next), pushMin(outIndex), pushMin(kcc1OutIdx), pushMin(amount), pushMin(isBuy ? 1 : 0),
      encTokMin(nextReserve), encTokMin(buyerOut), encTokMin(sellChangeOut), OP_0]);
  }
  // v8/v9 executeSwap = v6 + protocol_fee_out_idx (the covenant-enforced fee output index). Byte-identical to v6 through
  // sellChangeOut, then pushMin(protocolFeeOutIdx), then the same OP_0. v9 uses the SAME executeSwap ABI as v8.
  function encodeExecuteSwapV8({ next, outIndex, kcc1OutIdx, amount, isBuy, nextReserve, buyerOut, sellChangeOut, protocolFeeOutIdx }) {
    return Buffer.concat([encState(next), pushMin(outIndex), pushMin(kcc1OutIdx), pushMin(amount), pushMin(isBuy ? 1 : 0),
      encTokMin(nextReserve), encTokMin(buyerOut), encTokMin(sellChangeOut), pushMin(protocolFeeOutIdx), OP_0]);
  }
  function encodeAddLiquidityV6({ next, outIndex, kcc1OutIdx, lpInvOutIdx, lpSharesOutIdx, dKas, dToken, dShares, poolTokenOut, poolLpOut, lpSharesOut, tokenChangeOut }) {
    return Buffer.concat([encState(next), pushMin(outIndex), pushMin(kcc1OutIdx), pushMin(lpInvOutIdx), pushMin(lpSharesOutIdx),
      pushMin(dKas), pushMin(dToken), pushMin(dShares),
      encTokMin(poolTokenOut), encTokMin(poolLpOut), encTokMin(lpSharesOut), encTokMin(tokenChangeOut), OP_2]);
  }
  function encodeRemoveLiquidityV6({ next, outIndex, kcc1OutIdx, lpInvOutIdx, dShares, dKas, dToken, poolTokenOut, lpTokenOut, poolLpOut, lpChangeOut }) {
    return Buffer.concat([encState(next), pushMin(outIndex), pushMin(kcc1OutIdx), pushMin(lpInvOutIdx),
      pushMin(dShares), pushMin(dKas), pushMin(dToken),
      encTokMin(poolTokenOut), encTokMin(lpTokenOut), encTokMin(poolLpOut), encTokMin(lpChangeOut), OP_4]);
  }
  function encodeTransfer({ newStates, sigsHex = [], witnessesBytes = [0] }) {
    let body;
    if (newStates.length === 1) { const s = newStates[0];
      body = Buffer.concat([pushRaw(s.owner), pushByte(s.idType), pushLe8(s.amount), pushByte(s.isMinter ? 1 : 0)]);
    } else {
      body = Buffer.concat([
        pushRaw(Buffer.concat(newStates.map(s => Buffer.from(s.owner, 'hex')))),
        pushRaw(Buffer.from(newStates.map(s => s.idType & 0xff))),
        pushRaw(Buffer.concat(newStates.map(s => le8(s.amount)))),
        pushRaw(Buffer.from(newStates.map(s => s.isMinter ? 1 : 0))),
      ]);
    }
    const sigs = sigsHex.length ? pushRaw(Buffer.concat(sigsHex.map(h => Buffer.from(h, 'hex')))) : OP_0;
    return Buffer.concat([body, sigs, pushRaw(Buffer.from(witnessesBytes))]);
  }

  // ── constants + covenant program config (cfg = {poolPrefix, poolSuffix, notePrefix, noteSuffix}, shipped by SDK) ──
  // DUST = pool-note carrier (reserve, LP inventory — genesis'd at 2 KAS, rolls forward). DUST_USER = the smaller carrier
  // on USER notes (buyer tokens, LP shares, change). Spends read each note's REAL on-chain KAS value (nt.kas) so old
  // 2-KAS and new 0.5-KAS notes both spend conservation-exact. Matches the on-chain conservation rules.
  const SCALE = 1000000n, DUST = 200000000n, DUST_USER = 50000000n, TXFEE = 50000000n, MAX_SHARES = 10000000n;
  const noteKas = (nt) => nt && nt.kas != null ? BigInt(nt.kas) : DUST;   // real note KAS value; fall back to DUST
  const ID_COVENANT_ID = 2, ID_ADDRESS = 3;
  const stTok = (owner, idType, amount) => ({ owner, idType, amount: Number(amount), isMinter: false });
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0n);
  function poolSpkOf(cfg, s) { return p2shSpk(Buffer.concat([Buffer.from(cfg.poolPrefix, 'hex'), poolStateRegion(s), Buffer.from(cfg.poolSuffix, 'hex')])); }
  function poolRedeem(cfg, s) { return Buffer.concat([Buffer.from(cfg.poolPrefix, 'hex'), poolStateRegion(s), Buffer.from(cfg.poolSuffix, 'hex')]); }
  function noteSpkOf(cfg, s) { return p2shSpk(Buffer.concat([Buffer.from(cfg.notePrefix, 'hex'), noteStateRegion(s), Buffer.from(cfg.noteSuffix, 'hex')])); }
  function noteRedeem(cfg, s) { return Buffer.concat([Buffer.from(cfg.notePrefix, 'hex'), noteStateRegion(s), Buffer.from(cfg.noteSuffix, 'hex')]); }

  // ── quote math (covenant-exact) ──
  function quoteBuy(state, poolInputSompi) {
    const kU = BigInt(state.kasReserve), tR = BigInt(state.tokenReserve), oldK = kU * tR;
    const grossUnits = BigInt(poolInputSompi) / SCALE; if (grossUnits < 1n) return null;
    const feeIn = (grossUnits * BigInt(state.feeBps) + 9999n) / 10000n, netIn = grossUnits - feeIn;
    let amount = tR - (oldK + (kU + netIn) - 1n) / (kU + netIn);
    if (amount < 1n) return null;
    const capped = amount * 2n > tR;                 // covenant clamps tokens to tR/2 but the buyer still pays full budget
    if (capped) amount = tR / 2n;
    return { amount, grossUnits, newKas: kU + grossUnits, newToken: tR - amount, capped };
  }
  function quoteSell(state, sellAmount) {
    const kU = BigInt(state.kasReserve), tR = BigInt(state.tokenReserve), oldK = kU * tR;
    const amt = BigInt(sellAmount); if (amt < 1n) return null;
    const feeTok = (amt * BigInt(state.feeBps) + 9999n) / 10000n;
    const denom = tR + (amt - feeTok);
    const newKas = (oldK + denom - 1n) / denom;
    if (newKas < 1n || newKas >= kU) return null;
    const kasOut = kU - newKas; if (kasOut < 1n) return null;
    const newToken = tR + amt; if (newToken > 1000000000n) return null;
    return { amt, kasOut, newKas, newToken };
  }
  function poolState(pool) {
    return { kasReserve: BigInt(pool.kasReserve), tokenReserve: BigInt(pool.tokenReserve), totalShares: BigInt(pool.totalShares),
      tokenId: pool.tokenId, lpTokenId: pool.lpTokenId, feeBps: Number(pool.feeBps), nonce: Number(pool.nonce) };
  }

  // ── BUY ──
  function buildBuy({ cfg, pool, userPk, funding, budgetSompi, aggFeeFor, feePk, protoBps }) {
    const total = BigInt(budgetSompi);
    const aggFee = aggFeeFor ? aggFeeFor(total) : 0n;
    // poolInput carves the pool fee, the buyer-vault DUST (KIP-9), and the txfee OUT of the total (byte-for-byte
    // the covenant carve is `total - aggFee - DUST - TXFEE`. Uses DUST — NOT DUST_USER — for the carve.
    const poolInput = total - aggFee - DUST - TXFEE;
    if (poolInput < SCALE) throw new Error('amount too small');
    const q = quoteBuy(pool, poolInput); if (!q) throw new Error('amount too small');
    // half-reserve cap: covenant clamps tokens to tR/2 while charging full budget (silent overpay) → reject; buy less.
    if (q.capped) throw Object.assign(new Error('amount too large for this pool — it would take over half the reserve at a poor price; buy a smaller amount'), { capped: true });
    const { amount, grossUnits, newKas, newToken } = q;
    const st = poolState(pool), st2 = { ...st, kasReserve: newKas, tokenReserve: newToken };
    const poolCovid = pool.poolCovid, tokenCovid = pool.tokenId;
    const resIn = stTok(poolCovid, ID_COVENANT_ID, st.tokenReserve), resOut = stTok(poolCovid, ID_COVENANT_ID, newToken);
    const buyer = stTok(userPk, ID_ADDRESS, amount);
    // v9: the protocol fee is COVENANT-ENFORCED — an output >= ceil(grossUnits·protoBps/10000)·SCALE to feePk at
    // protocol_fee_out_idx. feeOut = max(aggFee policy floor, protoFee) so it satisfies the covenant AND the policy.
    const protoFee = ((grossUnits * BigInt(protoBps || 0) + 9999n) / 10000n) * SCALE;
    const feeOut = aggFee > protoFee ? aggFee : protoFee;
    const inputs = [
      { outpoint: pool.poolOutpoint, amount: BigInt(pool.kasReserveSompi), spk: pool.poolSpk },
      { outpoint: pool.reserveOutpoint, amount: DUST, spk: noteSpkOf(cfg, resIn) },      // reserve = pool note (DUST)
      { outpoint: funding.outpoint, amount: BigInt(funding.amount), spk: p2pk(userPk) },
    ];
    const change = BigInt(funding.amount) - grossUnits * SCALE - feeOut - DUST_USER - TXFEE;
    const outputs = [
      { amount: newKas * SCALE, spk: poolSpkOf(cfg, st2), covenant: { authorizing_input: 0, covenant_id: poolCovid } },
      { amount: DUST, spk: noteSpkOf(cfg, resOut), covenant: { authorizing_input: 1, covenant_id: tokenCovid } },       // reserve (pool)
      { amount: DUST_USER, spk: noteSpkOf(cfg, buyer), covenant: { authorizing_input: 1, covenant_id: tokenCovid } },   // buyer tokens (you)
    ];
    let protocolFeeOutIdx = 0;
    if (feeOut > 0n) { protocolFeeOutIdx = outputs.length; outputs.push({ amount: feeOut, spk: p2pk(feePk), covenant: null }); }
    if (change >= DUST_USER) outputs.push({ amount: change, spk: p2pk(userPk), covenant: null });
    const wPool = Buffer.concat([encodeExecuteSwapV8({ next: st2, outIndex: 0, kcc1OutIdx: 1, amount: Number(amount), isBuy: true,
      nextReserve: resOut, buyerOut: buyer, sellChangeOut: stTok(userPk, ID_ADDRESS, 0), protocolFeeOutIdx }), pushFor(poolRedeem(cfg, st))]);
    const wRes = Buffer.concat([encodeTransfer({ newStates: [resOut, buyer], sigsHex: [], witnessesBytes: [0] }), pushFor(noteRedeem(cfg, resIn))]);
    return { inputs, outputs, sigScripts: [wPool.toString('hex'), wRes.toString('hex'), null], covenantIds: [poolCovid, tokenCovid, null],
      COMPUTE: [1500, 400, 10], fundingIndex: 2, version: 1,
      quote: { tokenOut: String(amount), kasIn: String(grossUnits * SCALE), aggFeeSompi: String(feeOut) },
      roll: { poolCovid, poolSpk: poolSpkOf(cfg, st2), kasReserveSompi: String(newKas * SCALE), tokenReserve: String(newToken) },
      // records = notes the user receives (here the bought token). Relay re-derives each note spk from owner+amount and
      // requires it == the validated output at outIdx, so recorded amounts are spk-bound (no self-balance-inflation).
      records: [{ owner: userPk, tokenId: tokenCovid, amount: String(amount), spk: noteSpkOf(cfg, buyer), outIdx: 2 }] };
  }

  // ── SELL ──
  function buildSell({ cfg, pool, userPk, sellAmount, notes, funding, minKasOutSompi, protoBps, feePk, minAggSompi }) {
    const st = poolState(pool); const q = quoteSell(st, sellAmount); if (!q) throw new Error('amount too small');
    const { amt, kasOut, newKas, newToken } = q;
    // v11: SELL also pays the covenant-enforced protocol fee, carved from the KAS proceeds. Pass protoBps+feePk (from
    // sdk-config) for v11 pools; omit for v9/v10. Fee = max(minAggSompi floor, ceil(kasOut·protoBps/10000)·SCALE).
    const sProto = (protoBps && feePk) ? (function(){ const cov = ((kasOut * BigInt(protoBps) + 9999n) / 10000n) * SCALE; const m = BigInt(minAggSompi || 0); return cov > m ? cov : m; })() : 0n;
    const netOut = kasOut * SCALE - sProto;
    if (minKasOutSompi != null && netOut < BigInt(minKasOutSompi)) { const e = new Error('price moved — re-quote'); e.slippage = true; throw e; }
    const poolCovid = pool.poolCovid, tokenCovid = pool.tokenId;
    const st2 = { ...st, kasReserve: newKas, tokenReserve: newToken };
    const total = sum(notes, n => BigInt(n.amount)); if (total < amt) throw new Error('notes do not cover sell amount');
    const sellChange = total - amt, hasChg = sellChange > 0n;
    const resIn = stTok(poolCovid, ID_COVENANT_ID, st.tokenReserve), resOut = stTok(poolCovid, ID_COVENANT_ID, newToken);
    const sellChg = stTok(userPk, ID_ADDRESS, sellChange);
    const N = notes.length, fundingIndex = 2 + N;
    const inputs = [ { outpoint: pool.poolOutpoint, amount: BigInt(pool.kasReserveSompi), spk: pool.poolSpk }, { outpoint: pool.reserveOutpoint, amount: DUST, spk: noteSpkOf(cfg, resIn) } ];
    for (const nt of notes) inputs.push({ outpoint: nt.outpoint, amount: noteKas(nt), spk: noteSpkOf(cfg, stTok(userPk, ID_ADDRESS, nt.amount)) });   // REAL note KAS value
    inputs.push({ outpoint: funding.outpoint, amount: BigInt(funding.amount), spk: p2pk(userPk) });
    const outputs = [
      { amount: newKas * SCALE, spk: poolSpkOf(cfg, st2), covenant: { authorizing_input: 0, covenant_id: poolCovid } },
      { amount: DUST, spk: noteSpkOf(cfg, resOut), covenant: { authorizing_input: 1, covenant_id: tokenCovid } },       // reserve (pool)
    ];
    if (hasChg) outputs.push({ amount: DUST_USER, spk: noteSpkOf(cfg, sellChg), covenant: { authorizing_input: 2, covenant_id: tokenCovid } });   // token change (you)
    let sFeeIdx = 0;
    if (sProto > 0n) { sFeeIdx = outputs.length; outputs.push({ amount: sProto, spk: p2pk(feePk), covenant: null }); }   // v11 protocol fee → fee wallet (before the seller KAS output so it's carved from proceeds)
    const inKas = sum(inputs, i => BigInt(i.amount)), fixedOut = sum(outputs, o => BigInt(o.amount)), kasBack = inKas - fixedOut - TXFEE;
    if (kasBack < DUST_USER) throw new Error('sell proceeds + funding too small to cover the fee — use a larger KAS UTXO for gas');
    outputs.push({ amount: kasBack, spk: p2pk(userPk), covenant: null });
    const wPool = Buffer.concat([encodeExecuteSwapV8({ next: st2, outIndex: 0, kcc1OutIdx: 1, amount: Number(amt), isBuy: false,
      nextReserve: resOut, buyerOut: stTok(userPk, ID_ADDRESS, 0), sellChangeOut: hasChg ? sellChg : stTok(userPk, ID_ADDRESS, 0), protocolFeeOutIdx: sFeeIdx }), pushFor(poolRedeem(cfg, st))]);
    const resNew = hasChg ? [resOut, sellChg] : [resOut];
    const wb = [0, ...notes.map(() => fundingIndex)];
    const wRes = Buffer.concat([encodeTransfer({ newStates: resNew, sigsHex: [], witnessesBytes: wb }), pushFor(noteRedeem(cfg, resIn))]);
    const sigScripts = [wPool.toString('hex'), wRes.toString('hex')], covenantIds = [poolCovid, tokenCovid], COMPUTE = [1500, 400];
    for (const nt of notes) { const w = Buffer.concat([encodeTransfer({ newStates: resNew, sigsHex: [], witnessesBytes: wb }), pushFor(noteRedeem(cfg, stTok(userPk, ID_ADDRESS, nt.amount)))]); sigScripts.push(w.toString('hex')); covenantIds.push(tokenCovid); COMPUTE.push(400); }
    sigScripts.push(null); covenantIds.push(null); COMPUTE.push(10);
    return { inputs, outputs, sigScripts, covenantIds, COMPUTE, fundingIndex, version: 1,
      quote: { kasOut: String(kasOut * SCALE), sold: String(amt) }, roll: { poolCovid, poolSpk: poolSpkOf(cfg, st2), kasReserveSompi: String(newKas * SCALE), tokenReserve: String(newToken) },
      records: hasChg ? [{ owner: userPk, tokenId: tokenCovid, amount: String(sellChange), spk: noteSpkOf(cfg, sellChg), outIdx: 2 }] : [] };
  }
  // covenant-exact ADD quote (dToken up front so the client can fetch token notes before buildAdd)
  function quoteAdd(pool, kasAmountSompi) {
    const st = poolState(pool); const kU = st.kasReserve, tR = st.tokenReserve, tS = st.totalShares;
    const dKas = (BigInt(kasAmountSompi) - DUST - TXFEE) / SCALE; if (dKas < 1n) return null;
    const dShares = (tS * dKas) / kU; if (dShares < 1n) return null;
    const dToken = (tR * dShares + tS - 1n) / tS;
    return { dKas, dShares, dToken };
  }

  // ── ADD ──
  function buildAdd({ cfg, pool, userPk, kasAmountSompi, notes, funding }) {
    const st = poolState(pool); const kU = st.kasReserve, tR = st.tokenReserve, tS = st.totalShares;
    const total = BigInt(kasAmountSompi);
    const dKas = (total - DUST - TXFEE) / SCALE; if (dKas < 1n) throw new Error('add at least ~2.6 KAS');
    const dShares = (tS * dKas) / kU; if (dShares < 1n) throw new Error('amount too small for a share');
    const dToken = (tR * dShares + tS - 1n) / tS;
    const newKas = kU + dKas, newToken = tR + dToken, newShares = tS + dShares, newInv = MAX_SHARES - newShares;
    const st2 = { ...st, kasReserve: newKas, tokenReserve: newToken, totalShares: newShares };
    const poolCovid = pool.poolCovid, tokenCovid = pool.tokenId, lpCovid = pool.lpTokenId;
    const notesTotal = sum(notes, n => BigInt(n.amount)); if (notesTotal < dToken) throw new Error('notes do not cover dToken');
    const depChange = notesTotal - dToken, hasChg = depChange > 0n;
    const resIn = stTok(poolCovid, ID_COVENANT_ID, tR), resOut = stTok(poolCovid, ID_COVENANT_ID, newToken);
    const invIn = stTok(poolCovid, ID_COVENANT_ID, MAX_SHARES - tS), invOut = stTok(poolCovid, ID_COVENANT_ID, newInv);
    const depChg = stTok(userPk, ID_ADDRESS, depChange), lpShares = stTok(userPk, ID_ADDRESS, dShares);
    const N = notes.length, fundingIndex = 3 + N;
    const lpInvOutIdx = hasChg ? 3 : 2, lpSharesOutIdx = hasChg ? 4 : 3;
    const inputs = [ { outpoint: pool.poolOutpoint, amount: BigInt(pool.kasReserveSompi), spk: pool.poolSpk },
      { outpoint: pool.reserveOutpoint, amount: DUST, spk: noteSpkOf(cfg, resIn) }, { outpoint: pool.lpInvOutpoint, amount: DUST, spk: noteSpkOf(cfg, invIn) } ];
    for (const nt of notes) inputs.push({ outpoint: nt.outpoint, amount: noteKas(nt), spk: noteSpkOf(cfg, stTok(userPk, ID_ADDRESS, nt.amount)) });   // REAL note KAS value
    inputs.push({ outpoint: funding.outpoint, amount: BigInt(funding.amount), spk: p2pk(userPk) });
    const outputs = [ { amount: newKas * SCALE, spk: poolSpkOf(cfg, st2), covenant: { authorizing_input: 0, covenant_id: poolCovid } },
      { amount: DUST, spk: noteSpkOf(cfg, resOut), covenant: { authorizing_input: 1, covenant_id: tokenCovid } } ];   // reserve (pool)
    if (hasChg) outputs.push({ amount: DUST_USER, spk: noteSpkOf(cfg, depChg), covenant: { authorizing_input: 3, covenant_id: tokenCovid } });   // token change (you)
    outputs.push({ amount: DUST, spk: noteSpkOf(cfg, invOut), covenant: { authorizing_input: 2, covenant_id: lpCovid } });        // LP inventory (pool)
    outputs.push({ amount: DUST_USER, spk: noteSpkOf(cfg, lpShares), covenant: { authorizing_input: 2, covenant_id: lpCovid } }); // LP shares (you)
    const inKas = sum(inputs, i => BigInt(i.amount)), fixedOut = sum(outputs, o => BigInt(o.amount)), change = inKas - fixedOut - TXFEE;
    // the `funding` UTXO — NOT kasAmountSompi — pays the dKas added to the pool; clear error on an undersized UTXO.
    if (change < 0n) throw new Error('funding UTXO too small: it must cover the ~' + (Number(dKas * SCALE) / 1e8) + ' KAS deposit + fee, not just gas');
    if (change >= DUST_USER) outputs.push({ amount: change, spk: p2pk(userPk), covenant: null });
    const wPool = Buffer.concat([encodeAddLiquidityV6({ next: st2, outIndex: 0, kcc1OutIdx: 1, lpInvOutIdx, lpSharesOutIdx, dKas: Number(dKas), dToken: Number(dToken), dShares: Number(dShares),
      poolTokenOut: resOut, poolLpOut: invOut, lpSharesOut: lpShares, tokenChangeOut: hasChg ? depChg : stTok(userPk, ID_ADDRESS, 0) }), pushFor(poolRedeem(cfg, st))]);
    const aGroupNew = hasChg ? [resOut, depChg] : [resOut];
    const wb = [0, ...notes.map(() => fundingIndex)];
    const wARes = Buffer.concat([encodeTransfer({ newStates: aGroupNew, sigsHex: [], witnessesBytes: wb }), pushFor(noteRedeem(cfg, resIn))]);
    const wLInv = Buffer.concat([encodeTransfer({ newStates: [invOut, lpShares], sigsHex: [], witnessesBytes: [0] }), pushFor(noteRedeem(cfg, invIn))]);
    const sigScripts = [wPool.toString('hex'), wARes.toString('hex'), wLInv.toString('hex')], covenantIds = [poolCovid, tokenCovid, lpCovid], COMPUTE = [1500, 400, 400];
    for (const nt of notes) { const w = Buffer.concat([encodeTransfer({ newStates: aGroupNew, sigsHex: [], witnessesBytes: wb }), pushFor(noteRedeem(cfg, stTok(userPk, ID_ADDRESS, nt.amount)))]); sigScripts.push(w.toString('hex')); covenantIds.push(tokenCovid); COMPUTE.push(400); }
    sigScripts.push(null); covenantIds.push(null); COMPUTE.push(10);
    return { inputs, outputs, sigScripts, covenantIds, COMPUTE, fundingIndex, version: 1,
      quote: { dShares: String(dShares), dToken: String(dToken), dKas: String(dKas * SCALE) },
      roll: { poolCovid, poolSpk: poolSpkOf(cfg, st2), kasReserveSompi: String(newKas * SCALE), tokenReserve: String(newToken), totalShares: String(newShares), lpInvIdx: lpInvOutIdx },
      records: [{ owner: userPk, tokenId: lpCovid, amount: String(dShares), spk: noteSpkOf(cfg, lpShares), outIdx: lpSharesOutIdx },
        ...(hasChg ? [{ owner: userPk, tokenId: tokenCovid, amount: String(depChange), spk: noteSpkOf(cfg, depChg), outIdx: 2 }] : [])], lpSharesOutIdx };
  }

  // ── REMOVE ──
  function buildRemove({ cfg, pool, userPk, dShares, lpNotes, funding }) {
    const st = poolState(pool); const kU = st.kasReserve, tR = st.tokenReserve, tS = st.totalShares;
    dShares = BigInt(dShares); if (dShares <= 0n || dShares >= tS) throw new Error('invalid share amount');
    const dKas = (kU * dShares) / tS, dToken = (tR * dShares) / tS;
    if (dKas < 1n || dToken < 1n) throw new Error('position too small');
    const newKas = kU - dKas, newToken = tR - dToken, newShares = tS - dShares, newInv = MAX_SHARES - newShares;
    if (newKas < 1n || newToken < 1n || newShares < 1n) throw new Error('cannot drain the pool');
    const st2 = { ...st, kasReserve: newKas, tokenReserve: newToken, totalShares: newShares };
    const poolCovid = pool.poolCovid, tokenCovid = pool.tokenId, lpCovid = pool.lpTokenId;
    const notesTotal = sum(lpNotes, n => BigInt(n.amount)); if (notesTotal < dShares) throw new Error('LP notes do not cover dShares');
    const holderChange = notesTotal - dShares, hasChg = holderChange > 0n;
    const resIn = stTok(poolCovid, ID_COVENANT_ID, tR), resOut = stTok(poolCovid, ID_COVENANT_ID, newToken);
    const invIn = stTok(poolCovid, ID_COVENANT_ID, MAX_SHARES - tS), invOut = stTok(poolCovid, ID_COVENANT_ID, newInv);
    const lpTokOut = stTok(userPk, ID_ADDRESS, dToken), holderChg = stTok(userPk, ID_ADDRESS, holderChange);
    const N = lpNotes.length, fundingIndex = 3 + N;
    const inputs = [ { outpoint: pool.poolOutpoint, amount: BigInt(pool.kasReserveSompi), spk: pool.poolSpk },
      { outpoint: pool.reserveOutpoint, amount: DUST, spk: noteSpkOf(cfg, resIn) }, { outpoint: pool.lpInvOutpoint, amount: DUST, spk: noteSpkOf(cfg, invIn) } ];
    for (const nt of lpNotes) inputs.push({ outpoint: nt.outpoint, amount: noteKas(nt), spk: noteSpkOf(cfg, stTok(userPk, ID_ADDRESS, nt.amount)) });   // REAL LP-note KAS value
    inputs.push({ outpoint: funding.outpoint, amount: BigInt(funding.amount), spk: p2pk(userPk) });
    const outputs = [
      { amount: newKas * SCALE, spk: poolSpkOf(cfg, st2), covenant: { authorizing_input: 0, covenant_id: poolCovid } },
      { amount: DUST, spk: noteSpkOf(cfg, resOut), covenant: { authorizing_input: 1, covenant_id: tokenCovid } },          // reserve (pool)
      { amount: DUST_USER, spk: noteSpkOf(cfg, lpTokOut), covenant: { authorizing_input: 1, covenant_id: tokenCovid } },   // withdrawn tokens (you)
      { amount: DUST, spk: noteSpkOf(cfg, invOut), covenant: { authorizing_input: 2, covenant_id: lpCovid } },             // LP inventory (pool)
    ];
    if (hasChg) outputs.push({ amount: DUST_USER, spk: noteSpkOf(cfg, holderChg), covenant: { authorizing_input: 3, covenant_id: lpCovid } });   // LP-share change (you)
    const inKas = sum(inputs, i => BigInt(i.amount)), fixedOut = sum(outputs, o => BigInt(o.amount)), change = inKas - fixedOut - TXFEE;
    if (change >= DUST_USER) outputs.push({ amount: change, spk: p2pk(userPk), covenant: null });
    const wPool = Buffer.concat([encodeRemoveLiquidityV6({ next: st2, outIndex: 0, kcc1OutIdx: 1, lpInvOutIdx: 3, dShares: Number(dShares), dKas: Number(dKas), dToken: Number(dToken),
      poolTokenOut: resOut, lpTokenOut: lpTokOut, poolLpOut: invOut, lpChangeOut: hasChg ? holderChg : stTok(userPk, ID_ADDRESS, 0) }), pushFor(poolRedeem(cfg, st))]);
    const wARes = Buffer.concat([encodeTransfer({ newStates: [resOut, lpTokOut], sigsHex: [], witnessesBytes: [0] }), pushFor(noteRedeem(cfg, resIn))]);
    const lGroupNew = hasChg ? [invOut, holderChg] : [invOut];
    const wb = [0, ...lpNotes.map(() => fundingIndex)];
    const wLInv = Buffer.concat([encodeTransfer({ newStates: lGroupNew, sigsHex: [], witnessesBytes: wb }), pushFor(noteRedeem(cfg, invIn))]);
    const sigScripts = [wPool.toString('hex'), wARes.toString('hex'), wLInv.toString('hex')], covenantIds = [poolCovid, tokenCovid, lpCovid], COMPUTE = [1500, 400, 400];
    for (const nt of lpNotes) { const w = Buffer.concat([encodeTransfer({ newStates: lGroupNew, sigsHex: [], witnessesBytes: wb }), pushFor(noteRedeem(cfg, stTok(userPk, ID_ADDRESS, nt.amount)))]); sigScripts.push(w.toString('hex')); covenantIds.push(lpCovid); COMPUTE.push(400); }
    sigScripts.push(null); covenantIds.push(null); COMPUTE.push(10);
    return { inputs, outputs, sigScripts, covenantIds, COMPUTE, fundingIndex, version: 1,
      quote: { dKas: String(dKas * SCALE), dToken: String(dToken), dShares: String(dShares) },
      roll: { poolCovid, poolSpk: poolSpkOf(cfg, st2), kasReserveSompi: String(newKas * SCALE), tokenReserve: String(newToken), totalShares: String(newShares), lpInvIdx: 3 },
      records: [{ owner: userPk, tokenId: tokenCovid, amount: String(dToken), spk: noteSpkOf(cfg, lpTokOut), outIdx: 2 },
        ...(hasChg ? [{ owner: userPk, tokenId: lpCovid, amount: String(holderChange), spk: noteSpkOf(cfg, holderChg), outIdx: 4 }] : [])] };
  }

  // ── PSKT serializer (the wallet signs this) ──
  const u64 = v => String(BigInt(v || 0));
  function spkHexV(script, version) { const b = Buffer.alloc(2); b.writeUInt16LE(version || 0, 0); return b.toString('hex') + script; }
  function fromAssembled(a, p2shAddr) {
    p2shAddr = p2shAddr || p2shAddress;
    const fset = new Set(a.fundingIndexes && a.fundingIndexes.length ? a.fundingIndexes : [a.fundingIndex]);
    const inputs = a.inputs.map((inp, i) => ({
      transactionId: inp.outpoint.transactionId, index: inp.outpoint.index,
      sequence: u64(0), sigOpCount: fset.has(i) ? 1 : 0, signatureScript: fset.has(i) ? '' : a.sigScripts[i],
      utxo: { address: fset.has(i) ? a.buyerAddr : p2shAddr(inp.spk), amount: u64(inp.amount), scriptPublicKey: spkHexV(inp.spk, 0), blockDaaScore: u64(0), isCoinbase: false },
    }));
    const outputs = a.outputs.map(o => ({ value: u64(o.amount), scriptPublicKey: spkHexV(o.spk, 0),
      ...(o.covenant ? { covenant: { authorizingInput: o.covenant.authorizing_input, covenantId: o.covenant.covenant_id } } : {}) }));
    return JSON.stringify({ id: '00'.repeat(32), version: a.version || 1, inputs, outputs,
      subnetworkId: '00'.repeat(20), lockTime: u64(a.lockTime || 0), gas: u64(0), mass: '0', payload: '' });
  }

  const API = {
    // quotes + assemblers
    quoteBuy, quoteSell, quoteAdd, buildBuy, buildSell, buildAdd, buildRemove,
    // serialization + addressing
    fromAssembled, p2shAddress, p2shSpk, poolSpkOf, poolRedeem, noteSpkOf, noteRedeem,
    // low-level encoders (parity with the Node SDK)
    encoder: { pushMin, pushByte, pushRaw, pushLe8, le8, poolStateRegion, noteStateRegion, encState, encTokMin,
      encodeExecuteSwapV6, encodeAddLiquidityV6, encodeRemoveLiquidityV6, encodeTransfer },
    constants: { SCALE, DUST, TXFEE, MAX_SHARES, ID_COVENANT_ID, ID_ADDRESS },
    _internals: { Buf, blake2b256, pushFor },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global && global.window) { global.window.KCC20AMM = API; global.window.KCC1AMM = API; }
  if (global && !global.window) { global.KCC20AMM = API; global.KCC1AMM = API; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
