const ROCKET = 'https://kasparocket.fun/pro-api';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  const u = new URL(req.url, 'http://local');
  const path = u.pathname.replace(/^\/api\/rocket/, '') || '/';
  const target = ROCKET + path + u.search;
  const headers = { accept: 'application/json' };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  }
  try {
    const r = await fetch(target, init);
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    res.status(r.status).send(buf);
  } catch (e) {
    res.status(502).json({ error: 'KaspaRocket proxy failed', message: String(e && e.message ? e.message : e) });
  }
}
