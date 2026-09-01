const INDEXER = 'https://mainnet.kaspatalk.net';

export const config = { api: { bodyParser: false } };

function slimIndexer(text) {
  return String(text || '').replace(
    /"(userProfileImage|referencedProfileImage|userBannerImage)"\s*:\s*"(?:\\.|[^"\\])*"/g,
    '"$1":""'
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const u = new URL(req.url, 'http://local');
  let path = u.searchParams.get('path') || '/get-users-count';
  if (!path.startsWith('/')) path = '/' + path;
  try {
    const r = await fetch(INDEXER + path, { headers: { accept: 'application/json' } });
    const raw = await r.text();
    const body = slimIndexer(raw);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'K indexer proxy failed', message: String(e && e.message ? e.message : e) });
  }
}
