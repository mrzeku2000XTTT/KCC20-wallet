const COOK = 'https://dev-api-kcc20.kaspa.com';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  const u = new URL(req.url, 'http://local');
  let path = u.searchParams.get('path') || '/health';
  if (!path.startsWith('/')) path = '/' + path;
  const target = COOK + path;
  const headers = { accept: 'application/json' };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  }
  try {
    const r = await fetch(target, init);
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', ct);
    res.status(r.status).send(buf);
  } catch (e) {
    res.status(502).json({ error: 'Cook proxy failed', message: String(e && e.message ? e.message : e) });
  }
}
