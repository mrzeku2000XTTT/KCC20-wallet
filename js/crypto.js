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

function convertbits(data, frombits, tobits, pad) {
  let acc = 0, bits = 0, ret = [];
  const maxv = (1 << tobits) - 1;
  for (const v of data) {
    acc = (acc << frombits) | v;
    bits += frombits;
    while (bits >= tobits) { bits -= tobits; ret.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits) ret.push((acc << (tobits - bits)) & maxv); }
  else if (bits >= frombits || ((acc << (tobits - bits)) & maxv)) return null;
  return ret;
}

export function kaspaCashaddrEncode(prefix, versionByte, payloadBytes) {
  const data5 = convertbits([versionByte, ...Array.from(payloadBytes)], 8, 5, true);
  const checksumInput = cashaddrPrefixExpand(prefix).concat(data5).concat([0, 0, 0, 0, 0, 0, 0, 0]);
  const chk = cashaddrPolymod(checksumInput);
  const combined = data5.concat(checksumToArray(chk));
  return prefix + ':' + combined.map(d => CHARSET[d]).join('');
}

export function kaspaCashaddrDecode(addrStr) {
  const parts = (addrStr || '').split(':');
  if (parts.length !== 2) return null;
  const prefix = parts[0], body = parts[1];
  const data5 = [];
  for (const ch of body) {
    const idx = CHARSET.indexOf(ch);
    if (idx < 0) return null;
    data5.push(idx);
  }
  const payload = data5.slice(0, -8);
  if (cashaddrPolymod(cashaddrPrefixExpand(prefix).concat(data5)) !== 0n) return null;
  const bytes8 = convertbits(payload, 5, 8, false);
  if (!bytes8) return null;
  return { prefix, versionByte: bytes8[0], payloadBytes: new Uint8Array(bytes8.slice(1)) };
}

export function kaspaAddressFromPubkey(pubkey32) {
  return kaspaCashaddrEncode('kaspa', 0, pubkey32);
}

export function kaspaAddressFromScriptHash(scriptHash32) {
  return kaspaCashaddrEncode('kaspa', 8, scriptHash32);
}

export function isValidKaspaAddress(addrStr) {
  return !!(addrStr && addrStr.startsWith('kaspa:') && kaspaCashaddrDecode(addrStr));
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
  const clean = hex.trim().replace(/^0x/, '');
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) arr[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return arr;
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
