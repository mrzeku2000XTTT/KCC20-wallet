/* Wallet Forge restyle. Returns JSON layout only. Never keys. */
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const key = process.env.XAI_API_KEY;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const prompt = String(body.prompt || '').slice(0, 4000);
  const palette = body.palette || {};
  const image = String(body.image || '').slice(0, 3_500_000);
  if (!key) {
    res.status(200).json({ local: true, error: 'no XAI_API_KEY' });
    return;
  }
  const userContent = [{ type: 'text', text: JSON.stringify({ prompt, palette }) }];
  if (image.startsWith('data:image/')) {
    userContent.push({ type: 'image_url', image_url: { url: image } });
  }
  try {
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.XAI_MODEL || 'grok-4.5',
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: 'You restyle a Kaspa wallet FACE only. Never mention seeds, keys, or signing code. Return JSON only: {"name":string,"reply":string,"theme":{"bg":"#hex","card":"#hex","accent":"#hex","text":"#hex","radius":number},"order":[{"type":"brand|identity|kas|tokens|activity|receive|send|apps|network","title":string,"col":"full|0|1"}]}. Match the uploaded screenshot mood if an image is present. Keep Kaspa brand block. Use official Kaspa teal #49eacb as accent if the image is Kaspa-like.'
          },
          { role: 'user', content: userContent }
        ]
      })
    });
    const json = await r.json();
    const text = json.choices?.[0]?.message?.content || '';
    const start = text.indexOf('{');
    const parsed = start >= 0 ? JSON.parse(text.slice(start).replace(/```json|```/g, '')) : null;
    if (!parsed || !Array.isArray(parsed.order)) {
      res.status(200).json({ error: 'bad model json', raw: text.slice(0, 400) });
      return;
    }
    res.status(200).json(parsed);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
