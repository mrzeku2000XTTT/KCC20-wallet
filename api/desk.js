/* Optional Grok fact-check. Key stays on the server (XAI_API_KEY). Never logs wallet keys. */

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const key = process.env.XAI_API_KEY;
  if (!key) {
    res.status(501).json({ error: 'no XAI_API_KEY', local: true });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const report = body.report || {};
  const facts = body.facts || [];
  try {
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.XAI_MODEL || 'grok-4.5',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You are a hostile fact-checker for a Kaspa KCC20 desk. KRON is an on-chain AMM, not a CEX. Never promise profit. Return JSON {summary, trade:"yes"|"no"|"wait", why}.'
          },
          {
            role: 'user',
            content: JSON.stringify({ tick: report.tick, ammPx: report.ammPx, indexPx: report.indexPx, feeBps: report.feeBps, poolKas: report.poolKas, change24h: report.change24h, facts })
          }
        ]
      })
    });
    const json = await r.json();
    const text = json.choices?.[0]?.message?.content || '';
    const start = text.indexOf('{');
    const parsed = start >= 0 ? JSON.parse(text.slice(start)) : { summary: text, trade: 'wait' };
    res.status(200).json(parsed);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
