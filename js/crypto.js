/* Kaspa cashaddr + Schnorr key helpers (byte-compatible with Scorpion Wallet). */
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function cashaddrPolymod(values) {
  let c = 1n;
  for (const d of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    if (c0 & 0x01n) c ^= 0x98f2bc8e61n;
    if (c0 & 0x02n) c ^= 0x79b76d99e2n;
    if (c0 & 0x04n) c ^= 0xf33e5fb3c4n;
    if (c0 & 0x08n) c ^= 0xae2eabe2a8n;
    if (c0 & 0x10n) c ^= 0x1e4f43e470n;
  }
  return c ^ 1n;
}

function cashaddrPrefixExpand(prefix) {
  const ret = [];
  for (const c of prefix) ret.push(c.charCodeAt(0) & 0x1f);
  ret.push(0);
  return ret;
}

function checksumToArray(checksum) {
  const result = [];
  for (let i = 0; i < 8; i++) result.push(Number((checksum >> BigInt(5 * (7 - i))) & 0x1fn));
  return result;
}

/** Bech32 5↔8 conversion. pad=false enforces canonical leftover bits (KasPriv / @KodinglsFun). */
export function convertBits(data, frombits, tobits, pad) {
  let acc = 0, bits = 0;
  const ret = [];
  const maxv = (1 << tobits) - 1;
  const maxAcc = (1 << (frombits + tobits - 1)) - 1;
  for (const raw of data) {
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 0 || (v >> frombits) !== 0) return null;
    acc = ((acc << frombits) | v) & maxAcc;
    bits += frombits;
    while (bits >= tobits) {
      bits -= tobits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits) ret.push((acc << (tobits - bits)) & maxv);
  } else {
    if (bits >= frombits) return null;
    if ((acc & ((1 << bits) - 1)) !== 0) return null;
  }
  return ret;
}

function convertbits(data, frombits, tobits, pad) {
  return convertBits(data, frombits, tobits, pad);
}

export function kaspaCashaddrEncode(prefix, versionByte, payloadBytes) {
  const data5 = convertbits([versionByte, ...Array.from(payloadBytes)], 8, 5, true);
  if (!data5) throw new Error('Address encode failed');
  const checksumInput = cashaddrPrefixExpand(prefix).concat(data5).concat([0, 0, 0, 0, 0, 0, 0, 0]);
  const chk = cashaddrPolymod(checksumInput);
  const combined = data5.concat(checksumToArray(chk));
  return prefix + ':' + combined.map(d => CHARSET[d]).join('');
}

export function kaspaCashaddrDecode(addrStr) {
  if (typeof addrStr !== 'string') return null;
  const trimmed = addrStr.trim();
  const parts = trimmed.split(':');
  if (parts.length !== 2) return null;
  const prefix = parts[0].toLowerCase();
  const body = parts[1].toLowerCase();
  if (!body) return null;
  const data5 = [];
  for (const ch of body) {
    const idx = CHARSET.indexOf(ch);
    if (idx < 0) return null;
    data5.push(idx);
  }
  if (data5.length < 9) return null;
  const payload = data5.slice(0, -8);
  if (cashaddrPolymod(cashaddrPrefixExpand(prefix).concat(data5)) !== 0n) return null;
  const bytes8 = convertbits(payload, 5, 8, false);
  if (!bytes8 || bytes8.length < 2) return null;
  return { prefix, versionByte: bytes8[0], payloadBytes: new Uint8Array(bytes8.slice(1)) };
}

export function kaspaAddressFromPubkey(pubkey32) {
  return kaspaCashaddrEncode('kaspa', 0, pubkey32);
}

export function kaspaAddressFromScriptHash(scriptHash32) {
  return kaspaCashaddrEncode('kaspa', 8, scriptHash32);
}

const NETWORK_HRP = {
  mainnet: 'kaspa',
  'testnet-10': 'kaspatest',
  'testnet-11': 'kaspatest',
  testnet: 'kaspatest',
  devnet: 'kaspadev'
};

export function validateKaspaAddress(addrStr, network = 'mainnet') {
  if (!addrStr || typeof addrStr !== 'string') return { isValid: false, error: 'Address is required' };
  const trimmed = addrStr.trim();
  const parts = trimmed.split(':');
  if (parts.length !== 2) return { isValid: false, error: 'Address must contain exactly one colon' };
  const expected = NETWORK_HRP[network] || 'kaspa';
  const hrp = parts[0].toLowerCase();
  if (hrp !== expected) {
    return { isValid: false, error: `Invalid network prefix. Expected ${expected}, got ${hrp}` };
  }
  const decoded = kaspaCashaddrDecode(trimmed);
  if (!decoded) return { isValid: false, error: 'Address checksum verification failed' };
  if (decoded.prefix !== expected) {
    return { isValid: false, error: `Invalid network prefix. Expected ${expected}` };
  }
  if (decoded.versionByte !== 0 && decoded.versionByte !== 8) {
    return { isValid: false, error: `Unsupported address version 0x${decoded.versionByte.toString(16)}` };
  }
  if (decoded.payloadBytes.length !== 32) {
    return { isValid: false, error: `Invalid payload length (${decoded.payloadBytes.length} bytes, expected 32)` };
  }
  return { isValid: true, versionByte: decoded.versionByte, prefix: decoded.prefix, payloadBytes: decoded.payloadBytes };
}

export function isValidKaspaAddress(addrStr, network = 'mainnet') {
  return validateKaspaAddress(addrStr, network).isValid;
}

/** P2PK = 20 <32-byte x-only> ac. P2SH = aa 20 <32-byte script hash> 87. */
export function addressToScriptPublicKeyBytes(addrStr, network = 'mainnet') {
  const v = validateKaspaAddress(addrStr, network);
  if (!v.isValid) throw new Error(`Invalid address or network mismatch: ${v.error || 'validation failed'}`);
  const payload = v.payloadBytes;
  if (v.versionByte === 8) {
    const script = new Uint8Array(35);
    script[0] = 0xaa;
    script[1] = 0x20;
    script.set(payload, 2);
    script[34] = 0x87;
    return script;
  }
  const script = new Uint8Array(34);
  script[0] = 0x20;
  script.set(payload, 1);
  script[33] = 0xac;
  return script;
}

export function privKeyToHex(key) {
  return Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function hexToBytes(hex) {
  if (hex instanceof Uint8Array) return hex;
  if (typeof hex !== 'string') throw new Error('Invalid hex string');
  const clean = hex.trim().replace(/^0x/i, '');
  if (!clean) return new Uint8Array();
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error('Invalid hex string: contains non-hexadecimal characters');
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string: must have an even length');
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) arr[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return arr;
}

/** Parse a KAS decimal string with BigInt only — never IEEE-754 floats. */
export function kasToSompi(kas) {
  const s = String(kas ?? '').trim().replace(/,/g, '').replace(/^\./, '0.');
  if (!s) throw new Error('Invalid amount');
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('Invalid amount');
  const [w, f = ''] = s.split('.');
  if (f.length > 8) throw new Error('Too many decimal places');
  const frac = (f + '00000000').slice(0, 8);
  return BigInt(w || '0') * 100000000n + BigInt(frac);
}

export function sompiToKasString(sompi) {
  const n = BigInt(sompi || 0n);
  const neg = n < 0n;
  const a = neg ? -n : n;
  const w = a / 100000000n;
  const f = (a % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + (f ? `${w}.${f}` : String(w));
}

export function deepCloneAndFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (typeof obj === 'bigint') return obj;
  if (Array.isArray(obj)) return Object.freeze(obj.map(item => deepCloneAndFreeze(item)));
  if (obj instanceof Uint8Array) {
    const copy = new Uint8Array(obj);
    Object.freeze(copy);
    return copy;
  }
  if (obj instanceof Date) return Object.freeze(new Date(obj.getTime()));
  const copy = {};
  for (const key of Object.keys(obj)) copy[key] = deepCloneAndFreeze(obj[key]);
  return Object.freeze(copy);
}

function asTxidHex(v) {
  if (v == null) return '';
  try {
    const s = typeof v === 'string' ? v : (typeof v.toString === 'function' ? v.toString() : String(v));
    return s.replace(/^0x/i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function validateAndCleanUtxo(u) {
  if (!u || typeof u !== 'object') return null;
  const e = u.utxoEntry || u.entry || u;
  const out = u.outpoint || e.outpoint || {};
  const txid = asTxidHex(out.transactionId || out.transaction_id);
  if (!/^[0-9a-f]{64}$/.test(txid)) return null;
  const index = Number(out.index ?? 0);
  if (!Number.isInteger(index) || index < 0 || index > 1_000_000) return null;
  let amount;
  try { amount = BigInt(e.amount ?? u.amount); } catch { return null; }
  if (amount <= 0n) return null;
  const spk = e.scriptPublicKey || e.script_public_key || u.scriptPublicKey || {};
  let script = '';
  if (typeof spk === 'string') script = spk;
  else if (spk?.script instanceof Uint8Array) script = bytesToHex(spk.script);
  else if (spk?.scriptPublicKey instanceof Uint8Array) script = bytesToHex(spk.scriptPublicKey);
  else script = String(spk.scriptPublicKey || spk.script_public_key || spk.script || '');
  script = script.replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(script) || script.length < 20 || script.length % 2 !== 0) return null;
  const version = Number((typeof spk === 'object' && spk && spk.version) || 0);
  if (!Number.isFinite(version) || version < 0 || version > 255) return null;
  let blockDaa = 0n;
  try { blockDaa = BigInt(e.blockDaaScore || e.block_daa_score || 0); } catch { blockDaa = 0n; }
  return {
    outpoint: { transactionId: txid, index },
    amount,
    scriptPublicKey: { version, script: script.toLowerCase() },
    blockDaaScore: blockDaa,
    isCoinbase: !!(e.isCoinbase || e.is_coinbase)
  };
}

export function shortAddr(addr, head = 10, tail = 6) {
  if (!addr) return '';
  if (addr.length <= head + tail + 1) return addr;
  return addr.slice(0, head) + '…' + addr.slice(-tail);
}

let __libsReady = null;

export async function loadCryptoLibs() {
  if (__libsReady) return __libsReady;
  __libsReady = (async () => {
    let lastErr = null;
    const curvesUrls = [
      'https://esm.sh/@noble/curves@2.2.0/secp256k1',
      'https://cdn.jsdelivr.net/npm/@noble/curves@2.2.0/+esm'
    ];
    const hashesUrls = [
      'https://esm.sh/@noble/hashes@1.3.3/blake2b',
      'https://cdn.jsdelivr.net/npm/@noble/hashes@1.3.3/blake2b/+esm'
    ];
    for (const url of curvesUrls) {
      try { window.__nobleCurves = await import(url); break; }
      catch (e) { lastErr = e; }
    }
    for (const url of hashesUrls) {
      try { window.__nobleHashes = await import(url); break; }
      catch (e) { lastErr = e; }
    }
    if (!window.__nobleCurves || !window.__nobleCurves.schnorr) {
      throw lastErr || new Error('Signing library failed to load');
    }
  })();
  return __libsReady;
}

export async function generatePrivateKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function derivePublicKey(privKey) {
  await loadCryptoLibs();
  if (!window.__nobleCurves?.schnorr) throw new Error('Signing library not loaded');
  return window.__nobleCurves.schnorr.getPublicKey(privKey);
}

export async function createKeypairFromHex(hex) {
  await loadCryptoLibs();
  const privKey = typeof hex === 'string' ? hexToBytes(hex) : hex;
  const pubKey = await derivePublicKey(privKey);
  return {
    privKey: privKeyToHex(privKey),
    pubKey: privKeyToHex(pubKey),
    address: kaspaAddressFromPubkey(pubKey)
  };
}
