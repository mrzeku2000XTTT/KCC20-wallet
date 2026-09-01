const INDEXER = 'https://mainnet.kaspatalk.net';

export const config = { api: { bodyParser: false } };

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
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    res.status(r.status).send(buf);
  } catch (e) {
    res.status(502).json({ error: 'K indexer proxy failed', message: String(e && e.message ? e.message : e) });
  }
}
