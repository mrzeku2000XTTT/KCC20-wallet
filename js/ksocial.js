/* K Social / Kaposts — same path as KaChat 4.0 (github.com/vsmirn0v/KaChat).
   Reads: public K indexer get-posts-watching (global feed).
   Writes: Kaspa self-send whose payload is k:1:… (indexer picks it up; it lands on
   k-social.network). Do not iframe the website. Do not prepend U+2060 (KaChat-only filter). */

import { loadKaspaSdk, sendPayloadSelf, fetchAddressUtxos, fetchOwnedUtxos, estimateKsocialFeeKas } from './tx.js?v=204';
import { kaswareSigning, kaswarePublicKey, kaswareEnabled, isKaswareInstalled, liveKaswareAccount, signMessageWithKasware } from './kasware.js?v=204';
import { knsPrimary, knsDomainsFor } from './kns.js?v=89';
import { pubkeyToAddress } from './crypto.js?v=100';

export const KSOCIAL_SITE = 'https://k-social.network';
export const KSOCIAL_INDEXER = 'https://mainnet.kaspatalk.net';
const GUEST_PK = '02218b3732df2353978154ec5323b745bce9520a5ed506a96de4f4e3dad20dc44f';
const PREFIX = 'k:1:';
const MAX_POST = 500;

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function b64decode(s) {
  if (!s) return '';
  try {
    const bin = atob(String(s).replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    try { return atob(s); } catch { return ''; }
  }
}

export function b64encode(s) {
  const bytes = new TextEncoder().encode(String(s ?? ''));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function ago(ts) {
  const n = Number(ts);
  if (!n) return '';
  const ms = n > 1e12 ? n : n * 1000;
  const d = Date.now() - ms;
  const m = Math.floor(d / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 48) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

function stripMarker(text) {
  return String(text || '').replace(/\u2060/g, '');
}

export function ksocialRich(text) {
  const raw = stripMarker(text);
  const re = /(https?:\/\/[^\s<]+)/gi;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(raw))) {
    out += escHtml(raw.slice(last, m.index));
    let url = m[1];
    let trail = '';
    const cut = url.match(/[),.;!?]+$/);
    if (cut) { trail = cut[0]; url = url.slice(0, -trail.length); }
    if (/^https?:\/\//i.test(url) && !/[<>"']/.test(url)) {
      if (/\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(url)) {
        out += `<img class="ksocial-pic" src="${escHtml(url)}" alt="" loading="lazy">`;
      } else {
        out += `<a class="ksocial-link" href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(url)}</a>`;
      }
    } else {
      out += escHtml(m[1]);
      trail = '';
    }
    out += escHtml(trail);
    last = m.index + m[1].length;
  }
  out += escHtml(raw.slice(last));
  return out;
}

const FEED_CACHE_KEY = 'kcc20_kaposts_v1';

function slimIndexerText(text) {
  return String(text || '').replace(
    /"(userProfileImage|referencedProfileImage|userBannerImage)"\s*:\s*"(?:\\.|[^"\\])*"/g,
    '"$1":""'
  );
}

async function fetchSlim(url, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return JSON.parse(slimIndexerText(await r.text()));
  } finally {
    clearTimeout(t);
  }
}

async function getJson(path) {
  const proxy = '/api/ksocial?path=' + encodeURIComponent(path);
  const direct = KSOCIAL_INDEXER + path;
  try {
    return await fetchSlim(proxy, 7000);
  } catch (e1) {
    try {
      return await fetchSlim(direct, 5000);
    } catch {
      throw e1;
    }
  }
}

export function ksocialCachedFeed() {
  try {
    const j = JSON.parse(sessionStorage.getItem(FEED_CACHE_KEY) || 'null');
    if (j?.posts?.length) return j;
  } catch {}
  return null;
}

function saveFeedCache(data) {
  try {
    sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify({
      count: data.count || 0,
      posts: (data.posts || []).slice(0, 40),
      hasMore: !!data.hasMore,
      nextCursor: data.nextCursor || '',
      at: Date.now()
    }));
  } catch {}
}

function sameKPub(a, b) {
  const x = String(a || '').replace(/^0x/i, '').toLowerCase();
  const y = String(b || '').replace(/^0x/i, '').toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const xx = x.length === 66 ? x.slice(2) : x;
  const yy = y.length === 66 ? y.slice(2) : y;
  return xx.length === 64 && xx === yy;
}

export function ksocialNickForWallet(wallet, pub, fallback) {
  const kns = String(wallet?.knsDomain || '').trim();
  if (kns && sameKPub(pub, wallet?.pubKey)) return kns;
  return fallback || '';
}

const knsByPub = new Map();

function looksLikeHexNick(s) {
  const t = String(s || '').trim();
  return !t || /^[0-9a-f]{6,}$/i.test(t);
}

export async function detectWalletKns(wallet) {
  if (!wallet?.address) return '';
  let name = '';
  try { name = await knsPrimary(wallet.address); } catch {}
  if (!name) {
    try {
      const rows = await knsDomainsFor(wallet.address);
      name = (rows.find(r => r.verified) || rows[0] || {}).domain || '';
    } catch {}
  }
  if (name && wallet.pubKey) knsByPub.set(String(wallet.pubKey).toLowerCase(), name);
  return name;
}

export async function knsNameForPubkey(pub) {
  const key = String(pub || '').replace(/^0x/i, '').toLowerCase();
  if (!key) return '';
  if (knsByPub.has(key)) return knsByPub.get(key);
  const x = key.length === 66 ? key.slice(2) : key;
  if (knsByPub.has(x)) return knsByPub.get(x);
  let name = '';
  try {
    const addr = pubkeyToAddress(key);
    if (addr) {
      name = await knsPrimary(addr);
      if (!name) {
        const rows = await knsDomainsFor(addr);
        name = (rows.find(r => r.verified) || rows[0] || {}).domain || '';
      }
    }
  } catch {}
  knsByPub.set(key, name || '');
  if (x !== key) knsByPub.set(x, name || '');
  return name || '';
}

export function ksocialPayloadBytes(kind, opts = {}) {
  const dummyPk = '02' + '11'.repeat(32);
  const dummySig = 'aa'.repeat(64);
  const mentions = '[]';
  if (kind === 'vote') {
    return ('k:1:vote:' + dummyPk + ':' + dummySig + ':' + (opts.postId || '') + ':upvote:' + (opts.authorPubkey || dummyPk)).length;
  }
  const b64 = b64encode(String(opts.text || ''));
  if (kind === 'reply') {
    return ('k:1:reply:' + dummyPk + ':' + dummySig + ':' + (opts.postId || '') + ':' + b64 + ':' + mentions).length;
  }
  return ('k:1:post:' + dummyPk + ':' + dummySig + ':' + b64 + ':' + mentions).length;
}

export function ksocialFeeKas(kind, opts = {}) {
  return estimateKsocialFeeKas(ksocialPayloadBytes(kind, opts));
}

function requesterPk(wallet) {
  const p = String(wallet?.pubKey || '').replace(/^0x/i, '');
  if (/^0[23][0-9a-fA-F]{64}$/.test(p)) return p.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(p)) return '02' + p.toLowerCase();
  return GUEST_PK;
}

export function mapKPost(p, wallet) {
  if (!p) return null;
  const pub = String(p.userPublicKey || '');
  const decoded = stripMarker(b64decode(p.userNickname));
  const cached = knsByPub.get(pub.toLowerCase()) || knsByPub.get(pub.slice(2).toLowerCase()) || '';
  const nick = ksocialNickForWallet(wallet, pub, cached || (!looksLikeHexNick(decoded) ? decoded : ''))
    || 'anon';
  const q = p.quote || null;
  return {
    id: String(p.id || ''),
    pub,
    nick,
    text: stripMarker(b64decode(p.postContent)),
    time: ago(p.timestamp),
    ts: Number(p.timestamp || 0),
    up: Number(p.upVotesCount || 0),
    down: Number(p.downVotesCount || 0),
    replies: Number(p.repliesCount || 0),
    quotes: Number(p.quotesCount || 0),
    isUpvoted: !!p.isUpvoted,
    isDownvoted: !!p.isDownvoted,
    parentPostId: p.parentPostId || null,
    isQuote: !!(p.isQuote || q),
    quote: q ? {
      id: String(q.referencedContentId || ''),
      pub: String(q.referencedSenderPubkey || ''),
      nick: stripMarker(b64decode(q.referencedNickname)) || String(q.referencedSenderPubkey || '').slice(0, 8),
      text: stripMarker(b64decode(q.referencedMessage))
    } : null
  };
}

export async function ksocialCount() {
  const j = await getJson('/get-users-count');
  return Number(j.count || j.users || 0);
}

export async function ksocialFeed({ wallet, limit = 12, before = '' } = {}) {
  const pk = requesterPk(wallet);
  const lim = Math.min(30, Math.max(5, Number(limit) || 12));
  let path = '/get-posts-watching?requesterPubkey=' + encodeURIComponent(pk) + '&limit=' + lim;
  if (before) path += '&before=' + encodeURIComponent(before);
  const j = await getJson(path);
  const raw = j.posts || [];
  const pagination = j.pagination || {};
  const posts = raw.map(p => mapKPost(p, wallet)).filter(p => p && (p.text || p.nick) && !p.parentPostId);
  let count = 0;
  try {
    const cached = ksocialCachedFeed();
    if (cached?.count) count = cached.count;
  } catch {}
  if (!before && !count) {
    ksocialCount().then(n => {
      try {
        const cur = ksocialCachedFeed() || {};
        saveFeedCache({ ...cur, posts: cur.posts || posts, count: n });
      } catch {}
    }).catch(() => {});
  }
  const out = {
    source: 'watching',
    count,
    posts,
    hasMore: !!pagination.hasMore,
    nextCursor: pagination.nextCursor || '',
    pk
  };
  if (!before) saveFeedCache(out);
  return out;
}

export async function ksocialReplies({ wallet, postId, limit = 40 } = {}) {
  const pk = requesterPk(wallet);
  const id = String(postId || '');
  if (!id) return { post: null, replies: [] };
  let post = null;
  try {
    const d = await getJson('/get-post-details?id=' + encodeURIComponent(id) + '&requesterPubkey=' + encodeURIComponent(pk));
    post = mapKPost(d.post || d, wallet);
  } catch {
    try {
      const d = await getJson('/get-post?id=' + encodeURIComponent(id) + '&requesterPubkey=' + encodeURIComponent(pk));
      post = mapKPost(d.post || d, wallet);
    } catch {}
  }
  let replies = [];
  try {
    const r = await getJson(
      '/get-replies?post=' + encodeURIComponent(id)
      + '&requesterPubkey=' + encodeURIComponent(pk)
      + '&limit=' + Math.min(80, Math.max(5, Number(limit) || 40))
    );
    replies = (r.replies || r.posts || []).map(x => mapKPost(x, wallet)).filter(Boolean);
  } catch {}
  return { post, replies };
}

function asCompressed(p) {
  const h = String(p || '').replace(/^0x/i, '');
  if (/^0[23][0-9a-fA-F]{64}$/i.test(h)) return h.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(h)) return '02' + h.toLowerCase();
  return '';
}

async function compressedPubkey(wallet) {
  const hex = String(wallet?.privKey || '').replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    const k = await loadKaspaSdk();
    const pub = new k.PrivateKey(hex.toLowerCase()).toPublicKey().toString();
    return String(pub).replace(/^0x/i, '').toLowerCase();
  }
  if (kaswareEnabled() && isKaswareInstalled()) {
    try {
      const live = await liveKaswareAccount();
      const fromLive = asCompressed(live.pubKey);
      if (fromLive) return fromLive;
    } catch {}
    const fromKw = asCompressed(await kaswarePublicKey());
    if (fromKw) return fromKw;
  }
  if (kaswareSigning(wallet)) {
    const fromKw = asCompressed(await kaswarePublicKey());
    if (fromKw) return fromKw;
  }
  const fromWallet = asCompressed(wallet?.pubKey);
  if (fromWallet) return fromWallet;
  throw new Error('Need a secp256k1 key on this wallet to post on K Social.');
}

function asSchnorrHex(sig) {
  const s = String(sig || '').replace(/^0x/i, '').trim();
  if (/^[0-9a-fA-F]{128}$/.test(s)) return s.toLowerCase();
  try {
    const bin = atob(s.replace(/\s/g, ''));
    if (bin.length === 64) {
      let hex = '';
      for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
      return hex;
    }
  } catch {}
  return '';
}

async function signK(wallet, message) {
  const hex = String(wallet?.privKey || '').replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    const k = await loadKaspaSdk();
    const sig = k.signMessage({ message, privateKey: hex.toLowerCase() });
    return String(sig).replace(/^0x/i, '').toLowerCase();
  }
  if (kaswareEnabled() && isKaswareInstalled()) {
    const raw = await signMessageWithKasware(String(message || ''), { type: 'schnorr' });
    const sig = asSchnorrHex(raw);
    if (sig) return sig;
  }
  throw new Error('This KasWare account’s hex key is not on this device. Import it on You, or Approve a Schnorr message in KasWare. The KAS self-send still pops after that.');
}

async function utxosFor(wallet) {
  if (kaswareEnabled() && isKaswareInstalled()) return fetchAddressUtxos(wallet.address);
  if (wallet?.receiveAddrs?.length > 1) return fetchOwnedUtxos(wallet);
  return fetchAddressUtxos(wallet.address);
}

async function broadcastK(wallet, payload) {
  const utxos = await utxosFor(wallet);
  return sendPayloadSelf({ wallet, payload, utxos });
}

export async function ksocialSubmitPost({ wallet, text }) {
  const body = String(text || '').trim();
  if (!body) throw new Error('Type something to post');
  if (body.length > MAX_POST) throw new Error('Keep it under ' + MAX_POST + ' characters');
  const pubkey = await compressedPubkey(wallet);
  const b64 = b64encode(body);
  const mentions = '[]';
  const signature = await signK(wallet, b64 + ':' + mentions);
  const payload = PREFIX + 'post:' + pubkey + ':' + signature + ':' + b64 + ':' + mentions;
  return broadcastK(wallet, payload);
}

export async function ksocialSubmitReply({ wallet, text, postId, parentPubkey }) {
  const body = String(text || '').trim();
  if (!body) throw new Error('Type a reply');
  if (body.length > MAX_POST) throw new Error('Keep it under ' + MAX_POST + ' characters');
  const id = String(postId || '');
  if (!/^[0-9a-f]{64}$/i.test(id)) throw new Error('Missing post id');
  const pubkey = await compressedPubkey(wallet);
  const b64 = b64encode(body);
  const mentions = parentPubkey && /^0[23][0-9a-fA-F]{64}$/.test(parentPubkey)
    ? '["' + parentPubkey.toLowerCase() + '"]'
    : '[]';
  const signature = await signK(wallet, id + ':' + b64 + ':' + mentions);
  const payload = PREFIX + 'reply:' + pubkey + ':' + signature + ':' + id + ':' + b64 + ':' + mentions;
  return broadcastK(wallet, payload);
}

export async function ksocialSubmitVote({ wallet, postId, authorPubkey, upvote = true }) {
  const id = String(postId || '');
  const author = String(authorPubkey || '');
  if (!/^[0-9a-f]{64}$/i.test(id)) throw new Error('Missing post id');
  if (!/^0[23][0-9a-fA-F]{64}$/i.test(author)) throw new Error('Missing author');
  const vote = upvote ? 'upvote' : 'downvote';
  const pubkey = await compressedPubkey(wallet);
  const signature = await signK(wallet, id + ':' + vote + ':' + author.toLowerCase());
  const payload = PREFIX + 'vote:' + pubkey + ':' + signature + ':' + id + ':' + vote + ':' + author.toLowerCase();
  return broadcastK(wallet, payload);
}

export { MAX_POST as KSOCIAL_MAX };
