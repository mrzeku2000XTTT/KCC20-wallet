/* Wallet Forge — AI-safe customizer. UI only. Signing stays in Scorpion core. */
const STORE = 'kcc20_forge_v1';
const KAS_LOGO = new URL('../assets/kas.svg', import.meta.url).href;

export const FORGE_PRIMS = [
  { id: 'brand', label: 'Kaspa brand', hint: 'Official Kaspa mark' },
  { id: 'identity', label: 'Identity', hint: '.k / name / address' },
  { id: 'kas', label: 'KAS balance', hint: 'Live native balance' },
  { id: 'tokens', label: 'KCC20 tokens', hint: 'Live holdings' },
  { id: 'activity', label: 'Activity', hint: 'Local log' },
  { id: 'receive', label: 'Receive QR', hint: 'This address' },
  { id: 'send', label: 'Send', hint: 'Opens Send' },
  { id: 'apps', label: 'TTT apps', hint: 'Opens Apps' },
  { id: 'network', label: 'Network', hint: 'mainnet / TN10' }
];

function loadLayout() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (raw && Array.isArray(raw.blocks) && raw.blocks.length) return raw;
  } catch {}
  return {
    name: 'My Kaspa wallet',
    theme: 'fintech',
    blocks: [
      { id: uid(), type: 'brand', title: 'Kaspa' },
      { id: uid(), type: 'identity', title: 'Identity' },
      { id: uid(), type: 'kas', title: 'Balance' },
      { id: uid(), type: 'receive', title: 'Receive' }
    ]
  };
}

function saveLayout(layout) {
  try { localStorage.setItem(STORE, JSON.stringify(layout)); } catch {}
}

function uid() {
  return 'b' + Math.random().toString(36).slice(2, 9);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function kasFmt(sompi) {
  const n = Number(sompi || 0) / 1e8;
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1 ? 4 : 8 });
}

function shortA(a) {
  const s = String(a || '');
  if (s.length < 16) return s || '—';
  return s.slice(0, 10) + '…' + s.slice(-6);
}

export function forgeStateFromWallet(ctx) {
  const w = ctx.wallet || {};
  const kns = ctx.kns || '';
  const holds = (ctx.holdings || []).filter(t => {
    try { return BigInt(t.balance || '0') > 0n; } catch { return !!t.ticker; }
  });
  const acts = (ctx.activity || []).slice(0, 8);
  return {
    address: w.address || '',
    name: kns || w.name || 'Wallet',
    kns,
    kas: kasFmt(ctx.balanceSompi),
    network: ctx.network || 'mainnet',
    holdings: holds.map(t => ({
      tick: String(t.ticker || '').toUpperCase(),
      bal: String(t.balance || '0'),
      image: t.image || ''
    })),
    activity: acts.map(a => ({
      title: a.title || a.label || a.tick || 'Tx',
      when: a.at || a.ts || ''
    }))
  };
}

function blockHtml(b, live, selected) {
  const t = b.type;
  const title = esc(b.title || t);
  const sel = selected === b.id ? ' on' : '';
  if (t === 'brand') {
    return `<article class="fg-card fg-brand${sel}" data-fg="${esc(b.id)}">
      <img src="${KAS_LOGO}" alt="Kaspa" class="fg-kas">
      <div><b>${title}</b><em>Layer 1 · BlockDAG</em></div>
      <button type="button" class="fg-x" data-fg-del="${esc(b.id)}" aria-label="Remove">×</button>
    </article>`;
  }
  if (t === 'identity') {
    return `<article class="fg-card${sel}" data-fg="${esc(b.id)}">
      <span class="fg-k">${title}</span>
      <strong class="fg-id">${esc(live.kns || live.name)}</strong>
      <code>${esc(shortA(live.address))}</code>
      <button type="button" class="fg-x" data-fg-del="${esc(b.id)}">×</button>
    </article>`;
  }
  if (t === 'kas') {
    return `<article class="fg-card fg-kas-bal${sel}" data-fg="${esc(b.id)}">
      <span class="fg-k">${title}</span>
      <strong>${esc(live.kas)} <small>KAS</small></strong>
      <button type="button" class="fg-x" data-fg-del="${esc(b.id)}">×</button>
    </article>`;
  }
  if (t === 'tokens') {
    const rows = (live.holdings || []).slice(0, 6).map(h =>
      `<div class="fg-row"><span>${esc(h.tick)}</span><span>${esc(h.bal)}</span></div>`
    ).join('') || '<em class="fg-empty">No KCC20 on this address yet</em>';
    return `<article class="fg-card${sel}" data-fg="${esc(b.id)}">
      <span class="fg-k">${title}</span>${rows}
      <button type="button" class="fg-x" data-fg-del="${esc(b.id)}">×</button>
    </article>`;
  }
  if (t === 'activity') {
    const rows = (live.activity || []).slice(0, 5).map(h =>
      `<div class="fg-row"><span>${esc(h.title)}</span></div>`
    ).join('') || '<em class="fg-empty">No local activity yet</em>';
    return `<article class="fg-card${sel}" data-fg="${esc(b.id)}">
      <span class="fg-k">${title}</span>${rows}
      <button type="button" class="fg-x" data-fg-del="${esc(b.id)}">×</button>
    </article>`;
  }
  if (t === 'receive') {
    return `<article class="fg-card fg-recv${sel}" data-fg="${esc(b.id)}">
      <span class="fg-k">${title}</span>
      <button type="button" class="fg-cta" data-fg-act="receive">Show QR</button>
      <button type="button" class="fg-x" data-fg-del="${esc(b.id)}">×</button>
    </article>`;
  }
  if (t === 'send') {
    return `<article class="fg-card${sel}" data-fg="${esc(b.id)}">
      <span class="fg-k">${title}</span>
      <button type="button" class="fg-cta" data-fg-act="send">Send KAS</button>
      <button type="button" class="fg-x" data-fg-del="${esc(b.id)}">×</button>
    </article>`;
  }
  if (t === 'apps') {
    return `<article class="fg-card${sel}" data-fg="${esc(b.id)}">
      <span class="fg-k">${title}</span>
      <button type="button" class="fg-cta" data-fg-act="apps">Open TTT / Apps</button>
      <button type="button" class="fg-x" data-fg-del="${esc(b.id)}">×</button>
    </article>`;
  }
  if (t === 'network') {
    return `<article class="fg-card${sel}" data-fg="${esc(b.id)}">
      <span class="fg-k">${title}</span>
      <strong>${esc(live.network === 'testnet-10' ? 'Testnet-10' : 'Mainnet')}</strong>
      <button type="button" class="fg-x" data-fg-del="${esc(b.id)}">×</button>
    </article>`;
  }
  return '';
}

export function bootWalletForge(root, hooks) {
  if (!root) return { destroy() {} };
  let layout = loadLayout();
  let selected = layout.blocks[0]?.id || '';
  const live = () => forgeStateFromWallet(hooks.getLive?.() || {});

  root.innerHTML = `
    <p class="build-lede">Wallet Forge. Drag a primitive onto the canvas. Dropped blocks are live against this Scorpion core — balance, tokens, QR, send. AI never writes keys. Export a skin you can host.</p>
    <div class="fg-shell">
      <aside class="fg-pal">
        <b>Primitives</b>
        ${FORGE_PRIMS.map(p => `<button type="button" class="fg-chip" draggable="true" data-fg-add="${p.id}">${esc(p.label)}<i>${esc(p.hint)}</i></button>`).join('')}
      </aside>
      <section class="fg-canvas" id="fg-canvas" tabindex="0">
        <div class="fg-phone" id="fg-phone"></div>
      </section>
      <aside class="fg-insp" id="fg-insp"></aside>
    </div>
    <div class="vprog-acts">
      <button type="button" class="btn btn-gold" id="fg-test">Test live</button>
      <button type="button" class="btn btn-glass" id="fg-export">Export HTML</button>
      <button type="button" class="btn btn-glass" id="fg-reset">Reset layout</button>
    </div>
  `;

  const phone = root.querySelector('#fg-phone');
  const insp = root.querySelector('#fg-insp');
  const canvas = root.querySelector('#fg-canvas');

  function paint() {
    saveLayout(layout);
    const L = live();
    phone.innerHTML = `<header class="fg-top">${esc(layout.name)}</header>`
      + layout.blocks.map(b => blockHtml(b, L, selected)).join('');
    const b = layout.blocks.find(x => x.id === selected);
    insp.innerHTML = b ? `
      <b>Edit</b>
      <label class="field"><span>Label</span>
        <input id="fg-title" value="${esc(b.title || '')}" maxlength="32">
      </label>
      <p class="muted">Type: ${esc(b.type)}. This block reads the real wallet core.</p>
      <button type="button" class="btn btn-glass" id="fg-del-insp">Delete</button>
    ` : `<p class="muted">Tap a block to edit. Drag primitives in.</p>`;
    insp.querySelector('#fg-title')?.addEventListener('input', (e) => {
      if (!b) return;
      b.title = e.target.value;
      saveLayout(layout);
      const lab = phone.querySelector(`[data-fg="${b.id}"] .fg-k, [data-fg="${b.id}"] b`);
      if (lab) lab.textContent = b.title || b.type;
    });
    insp.querySelector('#fg-del-insp')?.addEventListener('click', () => del(selected));
  }

  function add(type) {
    const prim = FORGE_PRIMS.find(p => p.id === type);
    if (!prim) return;
    const block = { id: uid(), type, title: prim.label };
    layout.blocks.push(block);
    selected = block.id;
    paint();
    hooks.toast?.('Live: ' + prim.label);
  }

  function del(id) {
    layout.blocks = layout.blocks.filter(b => b.id !== id);
    if (selected === id) selected = layout.blocks[0]?.id || '';
    paint();
  }

  root.querySelectorAll('[data-fg-add]').forEach(btn => {
    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', btn.dataset.fgAdd);
      e.dataTransfer.effectAllowed = 'copy';
    });
    btn.addEventListener('click', () => add(btn.dataset.fgAdd));
  });
  canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('over'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('over'));
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.classList.remove('over');
    add(e.dataTransfer.getData('text/plain'));
  });
  phone.addEventListener('click', (e) => {
    const kill = e.target.closest('[data-fg-del]');
    if (kill) { e.stopPropagation(); del(kill.dataset.fgDel); return; }
    const act = e.target.closest('[data-fg-act]');
    if (act) {
      const a = act.dataset.fgAct;
      if (a === 'send') hooks.onSend?.();
      if (a === 'receive') hooks.onReceive?.();
      if (a === 'apps') hooks.onApps?.();
      return;
    }
    const card = e.target.closest('[data-fg]');
    if (card) { selected = card.dataset.fg; paint(); }
  });
  root.querySelector('#fg-reset')?.addEventListener('click', () => {
    localStorage.removeItem(STORE);
    layout = loadLayout();
    selected = layout.blocks[0]?.id || '';
    paint();
  });
  root.querySelector('#fg-test')?.addEventListener('click', () => {
    paint();
    hooks.toast?.('Preview is live on this wallet');
  });
  root.querySelector('#fg-export')?.addEventListener('click', () => {
    const html = exportHtml(layout);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kaspa-wallet.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    hooks.toast?.('Downloaded kaspa-wallet.html — host it, then Connect');
  });
  paint();
  return {
    refresh: paint,
    destroy() { saveLayout(layout); }
  };
}

function exportHtml(layout) {
  const blocks = JSON.stringify(layout);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(layout.name)} — Kaspa</title>
<link rel="icon" href="https://kcc-20-wallet.vercel.app/assets/kas.svg">
<script src="https://kcc-20-wallet.vercel.app/sdk.js?v=175"><\/script>
<style>
:root{color-scheme:dark;--gold:#c9a36a;--bg:#07080c;--card:#12141c;--line:rgba(255,255,255,.08);--txt:#f5f5f7;--mut:rgba(235,235,245,.62)}
*{box-sizing:border-box}body{margin:0;font:16px/1.45 -apple-system,sans-serif;background:radial-gradient(1200px 600px at 20% -10%,#1a2233,var(--bg));color:var(--txt)}
.wrap{max-width:420px;margin:0 auto;padding:22px 16px 48px}
.fg-top{font-weight:800;letter-spacing:-.3px;margin:0 0 14px}
.fg-card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin:0 0 10px}
.fg-k{display:block;font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.fg-brand{display:flex;gap:12px;align-items:center}.fg-kas{width:36px;height:36px}
.fg-id{display:block;font-size:20px}code{font-size:12px;color:var(--mut)}
.fg-cta{height:44px;border:0;border-radius:12px;background:linear-gradient(180deg,#e8c98a,#c9a36a);color:#1a1408;font-weight:700;width:100%}
.fg-row{display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--line);font-size:14px}
.bar{display:flex;gap:8px;margin:0 0 16px}.bar button{flex:1;height:40px;border-radius:12px;border:1px solid var(--line);background:#0e1016;color:var(--txt)}
</style>
</head>
<body>
<div class="wrap">
  <div class="bar"><button id="go">Connect Scorpion</button><button id="net">Network</button></div>
  <div id="app"></div>
</div>
<script>
const LAYOUT = ${blocks};
const LOGO = 'https://kcc-20-wallet.vercel.app/assets/kas.svg';
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));}
function shortA(a){const s=String(a||'');return s.length<16?s||'—':s.slice(0,10)+'…'+s.slice(-6);}
async function live(){
  const kcc = window.kcc20;
  if (!kcc) return { address:'', name:'Connect', kns:'', kas:'—', network:'', holdings:[], activity:[] };
  const st = await kcc.getState().catch(()=>null);
  const holds = (st && st.holdings) || [];
  const kas = st && st.balance && st.balance.confirmed != null ? (Number(st.balance.confirmed)/1e8).toLocaleString() : '—';
  return {
    address: (st && st.address) || (kcc.getAccounts && (await kcc.getAccounts())[0]) || '',
    name: (st && st.name) || 'Wallet', kns:'', kas, network: (st && st.network) || '',
    holdings: holds.map(t => ({ tick: t.ticker || t.tick, bal: t.balance || t.amount || '0' })),
    activity: []
  };
}
function render(L){
  const app = document.getElementById('app');
  app.innerHTML = '<div class="fg-top">'+esc(LAYOUT.name)+'</div>' + LAYOUT.blocks.map(b => {
    if (b.type==='brand') return '<article class="fg-card fg-brand"><img class="fg-kas" src="'+LOGO+'" alt="Kaspa"><div><b>'+esc(b.title||'Kaspa')+'</b><em>Layer 1</em></div></article>';
    if (b.type==='identity') return '<article class="fg-card"><span class="fg-k">'+esc(b.title)+'</span><strong class="fg-id">'+esc(L.kns||L.name)+'</strong><code>'+esc(shortA(L.address))+'</code></article>';
    if (b.type==='kas') return '<article class="fg-card"><span class="fg-k">'+esc(b.title)+'</span><strong>'+esc(L.kas)+' KAS</strong></article>';
    if (b.type==='tokens') return '<article class="fg-card"><span class="fg-k">'+esc(b.title)+'</span>'+(L.holdings.map(h=>'<div class="fg-row"><span>'+esc(h.tick)+'</span><span>'+esc(h.bal)+'</span></div>').join('')||'<em>No tokens</em>')+'</article>';
    if (b.type==='receive') return '<article class="fg-card"><span class="fg-k">'+esc(b.title)+'</span><button class="fg-cta" id="recv">Receive</button></article>';
    if (b.type==='send') return '<article class="fg-card"><span class="fg-k">'+esc(b.title)+'</span><button class="fg-cta" id="send">Send</button></article>';
    if (b.type==='apps') return '<article class="fg-card"><span class="fg-k">'+esc(b.title)+'</span><p>TTT · Apps via Scorpion</p></article>';
    if (b.type==='network') return '<article class="fg-card"><span class="fg-k">'+esc(b.title)+'</span><strong>'+esc(L.network||'—')+'</strong></article>';
    if (b.type==='activity') return '<article class="fg-card"><span class="fg-k">'+esc(b.title)+'</span><em>Activity lives in Scorpion</em></article>';
    return '';
  }).join('');
  document.getElementById('recv')?.addEventListener('click', () => window.kcc20?.openWallet({ screen:'home' }));
  document.getElementById('send')?.addEventListener('click', () => window.kcc20?.openWallet({ screen:'send' }));
}
document.getElementById('go').onclick = async () => {
  await window.kcc20.connect();
  render(await live());
};
document.getElementById('net').onclick = async () => {
  const n = await window.kcc20.getNetwork();
  alert(n);
};
window.addEventListener('kcc20#initialized', async () => {
  try { render(await live()); } catch(e) { render({ kas:'—', holdings:[], name:'Connect', address:'' }); }
});
</script>
</body></html>`;
}
