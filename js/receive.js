/* KaChing-style fresh receive addresses. Keys stay on-device. */
import { generatePrivateKey, createKeypairFromHex } from './crypto.js?v=62';

function rid() {
  try { return crypto.randomUUID(); } catch { return String(Date.now()) + Math.random().toString(16).slice(2); }
}

export function migrateReceiveBook(wallet) {
  if (!wallet) return wallet;
  if (!Array.isArray(wallet.receiveAddrs)) wallet.receiveAddrs = [];
  const home = wallet.receiveAddrs.find(a => a.role === 'home' || a.address === wallet.address);
  if (!home && wallet.address && wallet.privKey) {
    wallet.receiveAddrs.unshift({
      id: 'home',
      privateKey: wallet.privKey,
      pubKey: wallet.pubKey || '',
      address: wallet.address,
      label: 'Home',
      used: false,
      createdAt: wallet.createdAt || Date.now(),
      role: 'home',
      tick: ''
    });
  }
  return wallet;
}

export function ownedAddresses(wallet) {
  migrateReceiveBook(wallet);
  const seen = new Set();
  const out = [];
  for (const a of wallet.receiveAddrs) {
    if (!a?.address || seen.has(a.address)) continue;
    seen.add(a.address);
    out.push(a);
  }
  return out;
}

export function getPrivateKeyFor(wallet, address) {
  if (!wallet) return '';
  if (address === wallet.address) return wallet.privKey;
  const row = (wallet.receiveAddrs || []).find(a => a.address === address);
  return row?.privateKey || wallet.privKey;
}

export async function deriveFreshReceiveAddress(wallet, opts = {}) {
  migrateReceiveBook(wallet);
  const priv = await generatePrivateKey();
  const kp = await createKeypairFromHex(priv);
  const tick = String(opts.tick || '').toUpperCase();
  const row = {
    id: rid(),
    privateKey: kp.privKey,
    pubKey: kp.pubKey,
    address: kp.address,
    label: opts.label || (tick ? 'Receive ' + tick : 'Receive'),
    used: false,
    createdAt: Date.now(),
    role: tick ? 'kcc20' : (opts.role || 'kas'),
    tick
  };
  wallet.receiveAddrs.push(row);
  return row;
}

export function markAddressUsed(wallet, address, used = true) {
  migrateReceiveBook(wallet);
  const row = wallet.receiveAddrs.find(a => a.address === address);
  if (row && row.role !== 'home') row.used = !!used;
  return row;
}

export function currentReceive(wallet, opts = {}) {
  migrateReceiveBook(wallet);
  const tick = String(opts.tick || '').toUpperCase();
  const extras = wallet.receiveAddrs.filter(a => a.role !== 'home');
  if (tick) {
    const hit = extras.find(a => !a.used && a.tick === tick);
    if (hit) return hit;
  }
  const kas = extras.find(a => !a.used && (a.role === 'kas' || !a.tick));
  if (kas) return kas;
  const any = extras.find(a => !a.used);
  return any || null;
}

export async function ensureFreshReceive(wallet, opts = {}) {
  migrateReceiveBook(wallet);
  const hit = currentReceive(wallet, opts);
  if (hit) return hit;
  return deriveFreshReceiveAddress(wallet, opts);
}

export function keyringFor(wallet) {
  const map = new Map();
  for (const a of ownedAddresses(wallet)) {
    if (a.address && (a.privateKey || a.privKey)) map.set(a.address, a.privateKey || a.privKey);
  }
  if (wallet?.address && wallet?.privKey) map.set(wallet.address, wallet.privKey);
  return map;
}
