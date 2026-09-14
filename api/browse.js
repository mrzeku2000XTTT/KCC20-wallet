/** Same-origin browse proxy so Kaspa Browser can iframe sites that send X-Frame-Options. GET only. */
export const config = { maxDuration: 25, api: { bodyParser: false } };

function badHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = m.slice(1).map(Number);
    if (a[0] === 10 || a[0] === 127 || a[0] === 0) return true;
    if (a[0] === 192 && a[1] === 168) return true;
    if (a[0] === 169 && a[1] === 254) return true;
    if (a[0] === 172 && a[1] >= 16 && a[1] <= 31) return true;
  }
  return false;
}

function absUrl(href, base) {
  try { return new URL(href, base).href; } catch { return ''; }
}

function wrapNav(abs) {
  if (!abs || /^(javascript:|data:|mailto:|#)/i.test(abs)) return abs;
  if (abs.includes('/api/browse?url=')) return abs;
  return '/api/browse?url=' + encodeURIComponent(abs);
}

function rewriteHtml(html, pageUrl) {
  html = html.replace(/\s(href|action)=["']([^"']+)["']/gi, (_, attr, u) => {
    if (/^(#|javascript:|mailto:|tel:|data:)/i.test(u)) return ` ${attr}="${u}"`;
    const abs = absUrl(u, pageUrl);
    if (!abs) return ` ${attr}="${u}"`;
    if (/\.(css|js|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf)(\?|$)/i.test(abs)) {
      return ` ${attr}="${abs}"`;
    }
    return ` ${attr}="${wrapNav(abs)}"`;
  });
  html = html.replace(/\s(src)=["']([^"']+)["']/gi, (_, attr, u) => {
    if (/^(#|data:|javascript:|blob:)/i.test(u)) return ` ${attr}="${u}"`;
    const abs = absUrl(u, pageUrl);
    return ` ${attr}="${abs || u}"`;
  });
  const boot = `<script>
(function(){
  var P='/api/browse?url=';
  function wrap(u){
    try {
      var abs=new URL(u, ${JSON.stringify(pageUrl)}).href;
      if (abs.indexOf(P)>=0) return abs;
      if (!/^https?:/i.test(abs)) return u;
      return P+encodeURIComponent(abs);
    } catch(e){ return u; }
  }
  document.addEventListener('click', function(e){
    var a=e.target.closest && e.target.closest('a');
    if(!a) return;
    var raw=a.getAttribute('href'); if(!raw) return;
    if (/^(#|javascript:|mailto:)/i.test(raw)) return;
    e.preventDefault();
    e.stopPropagation();
    location.href=wrap(raw);
  }, true);
  try { parent.postMessage({type:'kb-nav', url:${JSON.stringify(pageUrl)}}, '*'); } catch(e){}
})();
</script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + boot);
  return boot + html;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).end('GET only'); return; }
  const raw = String(req.query?.url || '');
  let target;
  try { target = new URL(raw); } catch {
    res.status(400).end('bad url');
    return;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    res.status(400).end('http(s) only');
    return;
  }
  if (badHost(target.hostname)) {
    res.status(400).end('host not allowed');
    return;
  }
  try {
    const up = await fetch(target.href, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) KaspaBrowser/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const ct = (up.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
    const finalUrl = up.url || target.href;
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.setHeader('X-Browse-Url', finalUrl);
    if (ct.includes('text/html') || ct.includes('application/xhtml')) {
      let html = await up.text();
      if (html.length > 1_500_000) html = html.slice(0, 1_500_000);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(up.ok ? 200 : up.status).send(rewriteHtml(html, finalUrl));
      return;
    }
    const buf = Buffer.from(await up.arrayBuffer());
    if (buf.length > 6_000_000) {
      res.status(413).end('too large');
      return;
    }
    res.setHeader('Content-Type', up.headers.get('content-type') || 'application/octet-stream');
    res.status(up.status).send(buf);
  } catch (e) {
    res.status(502).end('browse failed');
  }
}
