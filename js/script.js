/* Local Kaspa redeem-script + P2SH address construction. */
import { hexToBytes, bytesToHex, concatBytes, kaspaAddressFromScriptHash, kaspaCashaddrDecode, validateKaspaAddress } from './crypto.js?v=71';
import { loadCryptoLibs } from './crypto.js?v=71';

export const OP = {
  FALSE: 0x00, IF: 0x63, ELSE: 0x67, ENDIF: 0x68,
  DROP: 0x75, DUP: 0x76,
  EQUAL: 0x87, EQUALVERIFY: 0x88,
  HASH256: 0xaa,
  CHECKSIG: 0xac, CHECKSIGVERIFY: 0xad,
  CLTV: 0xb1, // Bitcoin CLTV is 0xb1; Kaspa Toccata uses 0xb1 as well in some trees
  CLTV_KASPA: 0xb0
};

function scriptNum(n) {
  n = Number(n);
  if (n === 0) return new Uint8Array([]);
  const neg = n < 0;
  let abs = Math.abs(Math.trunc(n));
  const bytes = [];
  while (abs > 0) { bytes.push(abs & 0xff); abs = Math.floor(abs / 256); }
  if (bytes[bytes.length - 1] & 0x80) bytes.push(neg ? 0x80 : 0x00);
  else if (neg) bytes[bytes.length - 1] |= 0x80;
  return new Uint8Array(bytes);
}

export function pushData(buf) {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (data.length === 0) return new Uint8Array([0x00]);
  if (data.length <= 75) return concatBytes(new Uint8Array([data.length]), data);
  if (data.length <= 255) return concatBytes(new Uint8Array([0x4c, data.length]), data);
  const lb = new Uint8Array(2);
  lb[0] = data.length & 0xff;
  lb[1] = (data.length >> 8) & 0xff;
  return concatBytes(new Uint8Array([0x4d]), lb, data);
}

export function p2pkScript(pubkey32) {
  return concatBytes(new Uint8Array([0x20]), pubkey32, new Uint8Array([OP.CHECKSIG]));
}

export function p2shScript(scriptHash32) {
  return concatBytes(new Uint8Array([0xaa, 0x20]), scriptHash32, new Uint8Array([OP.EQUAL]));
}

export async function hashScript(redeem) {
  await loadCryptoLibs();
  const blake2b = window.__nobleHashes.blake2b;
  return blake2b(redeem, { dkLen: 32 });
}

export async function addressFromRedeem(redeem) {
  const hash = await hashScript(redeem);
  return {
    address: kaspaAddressFromScriptHash(hash),
    scriptHash: bytesToHex(hash),
    redeemHex: bytesToHex(redeem),
    spkHex: bytesToHex(p2shScript(hash))
  };
}

export function pubkeyFromWallet(wallet) {
  return hexToBytes(wallet.pubKey);
}

export function payloadFromAddress(addr) {
  const v = validateKaspaAddress(addr, 'mainnet');
  if (!v.isValid) return null;
  const d = kaspaCashaddrDecode(addr);
  return d ? d.payloadBytes : null;
}

/** KasPriv-style P2SH wrap: script hash of `<x-only pubkey> CHECKSIG`. Hides the Schnorr pubkey until spend. */
export async function buildPrivacyAddress(pubkeyHex) {
  const pub = hexToBytes(pubkeyHex);
  const xOnly = pub.length === 33 ? pub.slice(1) : pub;
  if (xOnly.length !== 32) throw new Error('Privacy address needs a 32-byte Schnorr public key');
  return { ...(await addressFromRedeem(p2pkScript(xOnly))), type: 'privacy' };
}

export async function currentDaa() {
  const res = await fetch('https://api.kaspa.org/info/blockdag');
  const info = await res.json();
  return Number(info.virtualDaaScore ?? info.virtual_daa_score ?? 0);
}

export function minutesToDaa(minutes) {
  return Math.max(10, Math.round(Number(minutes) * 60 * 10));
}

export async function buildTimelock({ ownerPub, minutes, lockDays }) {
  const mins = Number(minutes) || Math.round((Number(lockDays) || 0) * 1440);
  const daaNow = await currentDaa();
  const unlockDaa = daaNow + minutesToDaa(mins);
  const redeem = concatBytes(
    pushData(scriptNum(unlockDaa)),
    new Uint8Array([OP.CLTV_KASPA, OP.DROP]),
    p2pkScript(ownerPub)
  );
  const addr = await addressFromRedeem(redeem);
  return { ...addr, unlockDaa, daaNow, minutes: mins, type: 'timelock' };
}

export async function buildEscrow({ ownerPub, buyerPub }) {
  const redeem = concatBytes(
    new Uint8Array([OP.IF]),
    p2pkScript(buyerPub),
    new Uint8Array([OP.ELSE]),
    p2pkScript(ownerPub),
    new Uint8Array([OP.ENDIF])
  );
  const addr = await addressFromRedeem(redeem);
  return { ...addr, type: 'escrow' };
}

export async function buildMultisig({ ownerPub, otherPub }) {
  const redeem = concatBytes(
    new Uint8Array([0x20]), ownerPub, new Uint8Array([OP.CHECKSIGVERIFY]),
    new Uint8Array([0x20]), otherPub, new Uint8Array([OP.CHECKSIG])
  );
  const addr = await addressFromRedeem(redeem);
  return { ...addr, type: 'multisig' };
}

export async function buildVaultScript(type, wallet, params) {
  const ownerPub = pubkeyFromWallet(wallet);
  if (type === 'timelock') {
    return buildTimelock({ ownerPub, minutes: params.lockMinutes, lockDays: params.lockDays });
  }
  if (type === 'escrow') {
    const buyer = payloadFromAddress(params.buyerAddress);
    if (!buyer || buyer.length !== 32) throw new Error('Buyer must be a kaspa: public-key address');
    return buildEscrow({ ownerPub, buyerPub: buyer });
  }
  if (type === 'multisig') {
    const other = payloadFromAddress(params.counterparty);
    if (!other || other.length !== 32) throw new Error('Counterparty must be a kaspa: public-key address');
    return buildMultisig({ ownerPub, otherPub: other });
  }
  throw new Error('Unsupported vault type');
}
