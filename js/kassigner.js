/* Scorpion KasSigner mode — QR dual-sign (KasSigner/M5 pattern, no ESP32).
   Desktop: PIN then show QR. Phone: Face ID / PIN, sign, QR the result back.
   Keys stay in each device’s Scorpion. */
import { isDesktopBrowser } from './kasware.js?v=221';
import { safeSetItem } from './storage.js?v=1';

const STORE = 'kcc20_kassigner_v1';
const PREFIX = 'KCC20KS';
const CHUNK = 720;

export function loadKsPref() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; }
}

export function saveKsPref(p) {
  const slim = {
    enabled: !!(p && p.enabled),
    faceId: !!(p && p.faceId),
    credId: String((p && p.credId) || '').slice(0, 512)
  };
  if (!safeSetItem(STORE, JSON.stringify(slim))) {
    throw new Error('Storage full. Open Activity → Notices, then try KasSigner again.');
  }
}

export function kassignerEnabled() {
  return !!loadKsPref().enabled;
}

export function setKassignerEnabled(on) {
  const p = loadKsPref();
  p.enabled = !!on;
  saveKsPref(p);
}

export function kassignerFaceOn() {
  return !!loadKsPref().faceId && !!loadKsPref().credId;
}

export function isIosDevice() {
  try {
    const ua = String(navigator.userAgent || '');
    return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch { return false; }
}

export function kassignerDesktopActive() {
  return kassignerEnabled() && isDesktopBrowser();
}

export function splitKsFrames(text) {
  const id = Math.random().toString(36).slice(2, 8);
  const raw = String(text || '');
  const n = Math.max(1, Math.ceil(raw.length / CHUNK));
  const frames = [];
  for (let i = 0; i < n; i++) {
    frames.push([PREFIX, id, i, n, raw.slice(i * CHUNK, (i + 1) * CHUNK)].join('|'));
  }
  return frames;
}

export function ksFrameFeed() {
  const bags = new Map();
  return function (line) {
    const s = String(line || '');
    if (!s.startsWith(PREFIX + '|')) return null;
    const parts = s.split('|');
    if (parts.length < 5) return null;
    const id = parts[1];
    const i = Number(parts[2]);
    const n = Number(parts[3]);
    const chunk = parts.slice(4).join('|');
    if (!id || !n || i < 0 || i >= n) return null;
    let bag = bags.get(id);
    if (!bag) { bag = { n, parts: Array(n).fill('') }; bags.set(id, bag); }
    bag.parts[i] = chunk;
    if (bag.parts.some(x => x === '')) return { partial: true, have: bag.parts.filter(Boolean).length, n };
    bags.delete(id);
    return { done: true, text: bag.parts.join('') };
  };
}

export function encodeKsRequest({ json, signInputs, summary, address, network }) {
  return JSON.stringify({
    v: 1,
    k: 'req',
    a: String(address || ''),
    n: String(network || ''),
    t: String(summary || 'Sign transaction'),
    i: Array.isArray(signInputs) ? signInputs : [],
    j: String(json || '')
  });
}

export function encodeKsReply({ json, address }) {
  return JSON.stringify({
    v: 1,
    k: 'sig',
    a: String(address || ''),
    j: String(json || '')
  });
}

export function parseKsPayload(text) {
  try {
    const o = JSON.parse(String(text || ''));
    if (!o || o.v !== 1 || (o.k !== 'req' && o.k !== 'sig')) return null;
    return o;
  } catch { return null; }
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function bufToB64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}

export function webauthnOk() {
  try {
    return !!(window.PublicKeyCredential && navigator.credentials?.create);
  } catch { return false; }
}

export async function enrollFaceId(address) {
  if (!webauthnOk()) throw new Error('This browser cannot use Face ID / device unlock.');
  const userId = new TextEncoder().encode(('scorpion:' + (address || 'wallet')).slice(0, 64));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Scorpion KasSigner', id: location.hostname },
      user: { id: userId, name: address || 'scorpion', displayName: 'Scorpion' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 90000
    }
  });
  if (!cred || !cred.rawId) throw new Error('Face ID was not enrolled');
  const p = loadKsPref();
  p.faceId = true;
  p.credId = bufToB64(cred.rawId);
  saveKsPref(p);
  return true;
}

export async function assertFaceId() {
  const p = loadKsPref();
  if (!p.faceId || !p.credId) throw new Error('Turn on Face ID in You → KasSigner first.');
  if (!webauthnOk()) throw new Error('Face ID is not available in this browser.');
  const id = b64ToBuf(p.credId);
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id }],
      userVerification: 'required',
      timeout: 90000
    }
  });
  if (!cred) throw new Error('Face ID cancelled');
  return true;
}
