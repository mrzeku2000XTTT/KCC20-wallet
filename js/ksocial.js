/* K Social (k-social.network) — read-only feed from the public K-indexer. */

export const KSOCIAL_SITE = 'https://k-social.network';
export const KSOCIAL_INDEXER = 'https://mainnet.kaspatalk.net';
const GUEST_PK = '02218b3732df2353978154ec5323b745bce9520a5ed506a96de4f4e3dad20dc44f';

function b64(s) {
  if (!s) return '';
  try {
    const bin = atob(String(s).replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    try { return atob(s); } catch { return ''; }
  }
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

export async function ksocialCount() {
  const j = await getJson('/get-users-count');
  return Number(j.count || j.users || 0);
}

export async function ksocialFeed({ requesterPubkey, limit = 24 } = {}) {
  const pk = String(requesterPubkey || '').replace(/^0x/i, '') || GUEST_PK;
  const lim = Math.min(40, Math.max(5, Number(limit) || 24));
  let raw = [];
  let source = 'users';
  try {
    const active = await getJson(
      '/get-most-active-users?requesterPubkey=' + encodeURIComponent(pk)
      + '&limit=' + lim + '&timeWindow=24h'
    );
    raw = active.posts || active.users || [];
    if (raw.length) source = 'active-24h';
  } catch {}
  if (!raw.length) {
    const users = await getJson(
      '/get-users?requesterPubkey=' + encodeURIComponent(pk) + '&limit=' + lim
    );
    raw = users.posts || users.users || [];
    source = 'intros';
  }
  const posts = raw.map(p => {
    const nick = b64(p.userNickname) || String(p.userPublicKey || '').slice(0, 10);
    const text = b64(p.postContent) || '';
    const pub = String(p.userPublicKey || '');
    return {
      id: p.id || '',
      pub,
      nick,
      text: text.slice(0, 480),
      time: ago(p.timestamp),
      contents: Number(p.contentsCount || 0),
      up: Number(p.upVotesCount || 0),
      replies: Number(p.repliesCount || 0),
      href: pub ? (KSOCIAL_SITE + '/user/' + pub) : KSOCIAL_SITE
    };
  }).filter(p => p.text || p.nick);
  let count = 0;
  try { count = await ksocialCount(); } catch {}
  return { source, count, posts };
}
