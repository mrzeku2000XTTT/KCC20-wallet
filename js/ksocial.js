/* K Social / Kaposts — same path as KaChat 4.0 (github.com/vsmirn0v/KaChat).
   Reads: public K indexer get-posts-watching (global feed).
   Writes: Kaspa self-send whose payload is k:1:… (indexer picks it up; it lands on
   k-social.network). Do not iframe the website. Do not prepend U+2060 (KaChat-only filter). */

import { loadKaspaSdk, sendPayloadSelf, fetchAddressUtxos, fetchOwnedUtxos } from './tx.js?v=193';
import { kaswareSigning, signMessageWithKasware } from './kasware.js?v=193';

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
        out += `<img class="ksocial-pic" src="${escHtml(url)}" alt="">`;
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

async function getJson(path) {
  const urls = [
    KSOCIAL_INDEXER + path,
    '/api/ksocial?path=' + encodeURIComponent(path)
  ];
  let last = null;
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { accept: 'application/json' } });
      if (!r.ok) { last = new Error('HTTP ' + r.status); continue; }
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last || new Error('K indexer unreachable');
}

function requesterPk(wallet) {
  const p = String(wallet?.pubKey || '').replace(/^0x/i, '');
  if (/^0[23][0-9a-fA-F]{64}$/.test(p)) return p.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(p)) return '02' + p.toLowerCase();
  return GUEST_PK;
}

export function mapKPost(p) {
  if (!p) return null;
  const nick = stripMarker(b64decode(p.userNickname)) || String(p.userPublicKey || '').slice(0, 8);
  const q = p.quote || null;
  return {
    id: String(p.id || ''),
    pub: String(p.userPublicKey || ''),
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

export async function ksocialFeed({ wallet, limit = 24, before = '' } = {}) {
  const pk = requesterPk(wallet);
  const lim = Math.min(50, Math.max(5, Number(limit) || 24));
  let path = '/get-posts-watching?requesterPubkey=' + encodeURIComponent(pk) + '&limit=' + lim;
  if (before) path += '&before=' + encodeURIComponent(before);
  const j = await getJson(path);
  const raw = j.posts || [];
  const pagination = j.pagination || {};
  const posts = raw.map(mapKPost).filter(p => p && (p.text || p.nick) && !p.parentPostId);
  let count = 0;
  try { if (!before) count = await ksocialCount(); } catch {}
  return {
    source: 'watching',
    count,
    posts,
    hasMore: !!pagination.hasMore,
    nextCursor: pagination.nextCursor || '',
    pk
  };
}

export async function ksocialReplies({ wallet, postId, limit = 40 } = {}) {
  const pk = requesterPk(wallet);
  const id = String(postId || '');
  if (!id) return { post: null, replies: [] };
  let post = null;
  try {
    const d = await getJson('/get-post-details?id=' + encodeURIComponent(id) + '&requesterPubkey=' + encodeURIComponent(pk));
    post = mapKPost(d.post || d);
  } catch {
    try {
      const d = await getJson('/get-post?id=' + encodeURIComponent(id) + '&requesterPubkey=' + encodeURIComponent(pk));
      post = mapKPost(d.post || d);
    } catch {}
  }
  let replies = [];
  try {
    const r = await getJson(
      '/get-replies?post=' + encodeURIComponent(id)
      + '&requesterPubkey=' + encodeURIComponent(pk)
      + '&limit=' + Math.min(80, Math.max(5, Number(limit) || 40))
    );
    replies = (r.replies || r.posts || []).map(mapKPost).filter(Boolean);
  } catch {}
  return { post, replies };
}

async function compressedPubkey(wallet) {
  const k = await loadKaspaSdk();
  const hex = String(wallet?.privKey || '').replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    const pub = new k.PrivateKey(hex.toLowerCase()).toPublicKey().toString();
    return String(pub).replace(/^0x/i, '').toLowerCase();
  }
  const p = String(wallet?.pubKey || '').replace(/^0x/i, '');
  if (/^0[23][0-9a-fA-F]{64}$/i.test(p)) return p.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(p)) return '02' + p.toLowerCase();
  throw new Error('Need a secp256k1 key on this wallet to post on K Social.');
}

async function signK(wallet, message) {
  const k = await loadKaspaSdk();
  const hex = String(wallet?.privKey || '').replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    const sig = k.signMessage({ message, privateKey: hex.toLowerCase() });
    return String(sig).replace(/^0x/i, '').toLowerCase();
  }
  if (kaswareSigning(wallet)) {
    const sig = await signMessageWithKasware(message);
    return String(sig).replace(/^0x/i, '').toLowerCase();
  }
  throw new Error('Need a native PIN wallet to sign a K post. KasWare-only chips cannot attach the k:1 payload.');
}

async function utxosFor(wallet) {
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
