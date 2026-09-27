/* Wallet Forge — presentation only. Keys stay in Scorpion. */
const STORE = 'kcc20_forge_v2';
const KAS_LOGO = new URL('../assets/kas.svg', import.meta.url).href;
const TYPES = ['brand', 'identity', 'kas', 'tokens', 'activity', 'receive', 'send', 'apps', 'network'];

export const FORGE_PRIMS = [
  { id: 'brand', label: 'Kaspa brand', hint: 'Official Kaspa mark' },
  { id: 'identity', label: 'Identity', hint: '.k / name / address' },
  { id: 'kas', label: 'KAS balance', hint: 'Live native balance' },
  { id: 'tokens', label: 'KCC20 tokens', hint: 'Live holdings' },
  { id: 'activity', label: 'Activity', hint: 'Local log' },
  { id: 'receive', label: 'Receive QR', hint: 'QR in this wallet' },
  { id: 'send', label: 'Send', hint: 'Send in this wallet' },
  { id: 'apps', label: 'TTT apps', hint: 'Link row' },
  { id: 'network', label: 'Network', hint: 'mainnet / TN10' }
];

const DEFAULT_THEME = {
  bg: '#07080c', card: '#12141c', accent: '#49eacb', gold: '#c9a36a', text: '#f5f5f7', radius: 16
};

function uid() { return 'b' + Math.random().toString(36).slice(2, 9); }

function spec(type, title, col) {
  return { id: uid(), type, title, col };
}

export const FORGE_PRESETS = [
  {
    id: 'scorpion',
    label: 'Scorpion desk',
    blurb: 'Gold · bag · QR · send · TTT',
    layout: () => ({
      name: 'Scorpion',
      preset: 'scorpion',
      theme: { bg: '#0b0b0c', card: '#16140f', accent: '#d4b07a', gold: '#f3e2bf', text: '#f5f5f7', radius: 18 },
      blocks: [
        spec('brand', 'Kaspa', 'full'),
        spec('identity', '.k / you', 'full'),
        spec('kas', 'KAS', '0'),
        spec('network', 'Network', '1'),
        spec('tokens', 'KCC20', 'full'),
        spec('receive', 'Receive', 'full'),
        spec('send', 'Send', 'full'),
        spec('activity', 'Activity', 'full'),
        spec('apps', 'TTT', 'full')
      ]
    })
  },
  {
    id: 'receive',
    label: 'Pay me',
    blurb: 'QR first · then balance',
    layout: () => ({
      name: 'Pay me',
      preset: 'receive',
      theme: { bg: '#05070a', card: '#101820', accent: '#49eacb', gold: '#49eacb', text: '#e8fff8', radius: 20 },
      blocks: [
        spec('identity', 'Pay', 'full'),
        spec('receive', 'Scan', 'full'),
        spec('kas', 'Balance', 'full'),
        spec('send', 'Send back', 'full')
      ]
    })
  },
  {
    id: 'family',
    label: 'Family',
    blurb: 'Light · large QR · send',
    layout: () => ({
      name: 'Family wallet',
      preset: 'family',
      theme: { bg: '#f3efe6', card: '#ffffff', accent: '#0f766e', gold: '#b45309', text: '#1c1917', radius: 20 },
      blocks: [
        spec('brand', 'Kaspa', 'full'),
        spec('identity', 'This wallet', 'full'),
        spec('kas', 'What we have', 'full'),
        spec('receive', 'Receive', 'full'),
        spec('send', 'Send to family', 'full')
      ]
    })
  },
  {
    id: 'terminal',
    label: 'Terminal',
    blurb: 'Green on black · stacked',
    layout: () => ({
      name: 'kaspa@wallet',
      preset: 'terminal',
      theme: { bg: '#010302', card: '#07140a', accent: '#39ff14', gold: '#39ff14', text: '#c8ffc8', radius: 2 },
      blocks: [
        spec('brand', 'KASPA', 'full'),
        spec('network', 'NET', 'full'),
        spec('identity', 'ADDR', 'full'),
        spec('kas', 'BAL', 'full'),
        spec('tokens', 'BAG', 'full'),
        spec('receive', 'IN', 'full'),
        spec('send', 'OUT', 'full'),
        spec('activity', 'LOG', 'full')
      ]
    })
  },
  {
    id: 'trader',
    label: 'Trader',
    blurb: 'KAS + tokens + tape',
    layout: () => ({
      name: 'Desk',
      preset: 'trader',
      theme: { bg: '#0a0c10', card: '#141820', accent: '#f59e0b', gold: '#fbbf24', text: '#f8fafc', radius: 12 },
      blocks: [
        spec('kas', 'Spot KAS', '0'),
        spec('network', 'Venue', '1'),
        spec('tokens', 'KCC20 book', 'full'),
        spec('activity', 'Tape', 'full'),
        spec('send', 'Ticket', 'full'),
        spec('apps', 'KRON / TTT', 'full')
      ]
    })
  },
  {
    id: 'artist',
    label: 'Artist',
    blurb: 'Gallery · tokens · QR',
    layout: () => ({
      name: 'Studio',
      preset: 'artist',
      theme: { bg: '#140a12', card: '#241018', accent: '#e879f9', gold: '#f0abfc', text: '#fdf4ff', radius: 24 },
      blocks: [
        spec('identity', 'Maker', 'full'),
        spec('tokens', 'Works', 'full'),
        spec('receive', 'Tip jar', 'full'),
        spec('kas', 'Float', '0'),
        spec('apps', 'Show', '1')
      ]
    })
  },
  {
    id: 'dotk',
    label: '.k identity',
    blurb: 'Name hero · then money',
    layout: () => ({
      name: 'alice.k',
      preset: 'dotk',
      theme: { bg: '#0c1220', card: '#152038', accent: '#60a5fa', gold: '#93c5fd', text: '#eff6ff', radius: 16 },
      blocks: [
        spec('identity', '.k', 'full'),
        spec('brand', 'Kaspa', 'full'),
        spec('kas', 'KAS', '0'),
        spec('tokens', 'Assets', '1'),
        spec('receive', 'Pay', 'full'),
        spec('apps', 'Apps', 'full'),
        spec('network', 'Chain', 'full')
      ]
    })
  }
];

function loadLayout() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (raw && Array.isArray(raw.blocks) && raw.blocks.length) {
      raw.theme = { ...DEFAULT_THEME, ...(raw.theme || {}) };
      return raw;
    }
  } catch {}
  return FORGE_PRESETS[0].layout();
}

function saveLayout(layout) {
  try { localStorage.setItem(STORE, JSON.stringify(layout)); } catch {}
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
      bal: String(t.balance || '0')
    })),
    activity: acts.map(a => ({ title: a.title || a.label || a.tick || 'Tx' }))
  };
}

function hexOf(r, g, b) {
  return '#' + [r, g, b].map(n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0')).join('');
}

function stampTheme(root, theme) {
  if (!root) return;
  const t = { ...DEFAULT_THEME, ...(theme || {}) };
  root.style.setProperty('--fg-bg', t.bg);
  root.style.setProperty('--fg-card', t.card);
  root.style.setProperty('--fg-accent', t.accent);
  root.style.setProperty('--fg-gold', t.gold);
  root.style.setProperty('--fg-text', t.text);
  root.style.setProperty('--fg-radius', (Number(t.radius) || 16) + 'px');
  if (root.classList.contains('fg-canvas') || root.id === 'fg-canvas' || root.classList.contains('fg-modal-in')) {
    root.style.background = t.bg;
  }
  root.querySelectorAll('.fg-card').forEach((c) => {
    c.style.background = t.card;
    c.style.color = t.text;
    c.style.border = '1px solid ' + t.accent;
    c.style.borderRadius = (Number(t.radius) || 16) + 'px';
  });
  root.querySelectorAll('.fg-cta').forEach((b) => {
    b.style.background = t.accent;
    b.style.color = '#111';
  });
  root.querySelectorAll('.fg-k, .fg-top').forEach((el) => { el.style.color = t.gold || t.accent; });
  root.querySelectorAll('.fg-kas-n, .fg-id').forEach((el) => { el.style.color = t.accent; });
  root.querySelectorAll('.fg-brand em, .fg-empty, .fg-qr-addr, code').forEach((el) => {
    el.style.color = t.text;
    el.style.opacity = '0.7';
  });
}

function blockHtml(b, live, selected, { preview }) {
  const t = b.type;
  const title = esc(b.title || t);
  const sel = !preview && selected === b.id ? ' on' : '';
  const col = b.col === '1' ? ' col1' : (b.col === '0' ? ' col0' : ' full');
  const drag = preview ? '' : ` draggable="true"`;
  const x = preview ? '' : `<button type="button" class="fg-x" data-fg-del="${esc(b.id)}">×</button>`;
  const wrap = (inner) =>
    `<article class="fg-card${sel}${col}" data-fg="${esc(b.id)}" data-fg-type="${t}"${drag}>${x}${inner}</article>`;
  if (t === 'brand') {
    return wrap(`<div class="fg-brand"><img src="${KAS_LOGO}" alt="Kaspa" class="fg-kas"><div><b>${title}</b> <em>Layer 1 · BlockDAG</em></div></div>`);
  }
  if (t === 'identity') {
    return wrap(`<span class="fg-k">${title}</span><strong class="fg-id">${esc(live.kns || live.name)}</strong><code>${esc(shortA(live.address))}</code>`);
  }
  if (t === 'kas') {
    return wrap(`<span class="fg-k">${title}</span><strong class="fg-kas-n">${esc(live.kas)} <small>KAS</small></strong>`);
  }
  if (t === 'tokens') {
    const rows = (live.holdings || []).slice(0, 6).map(h =>
      `<div class="fg-row"><span>${esc(h.tick)}</span><span>${esc(h.bal)}</span></div>`
    ).join('') || '<em class="fg-empty">No KCC20 yet</em>';
    return wrap(`<span class="fg-k">${title}</span>${rows}`);
  }
  if (t === 'activity') {
    const rows = (live.activity || []).slice(0, 5).map(h =>
      `<div class="fg-row"><span>${esc(h.title)}</span></div>`
    ).join('') || '<em class="fg-empty">No activity yet</em>';
    return wrap(`<span class="fg-k">${title}</span>${rows}`);
  }
  if (t === 'receive') {
    return wrap(`<span class="fg-k">${title}</span><div class="fg-qr" data-fg-qr="${esc(live.address || '')}"></div><p class="fg-qr-addr">${esc(live.address || 'Connect to see address')}</p>`);
  }
  if (t === 'send') {
    return wrap(`<span class="fg-k">${title}</span>
      <input class="fg-in" data-fg-dest placeholder="kaspa:q…" spellcheck="false">
      <input class="fg-in" data-fg-amt placeholder="Amount KAS" inputmode="decimal">
      <button type="button" class="fg-cta" data-fg-act="send">Send from this wallet</button>`);
  }
  if (t === 'apps') {
    return wrap(`<span class="fg-k">${title}</span><p class="fg-empty">TTT · KasDistro · K Social</p>`);
  }
  if (t === 'network') {
    return wrap(`<span class="fg-k">${title}</span><strong>${esc(live.network === 'testnet-10' ? 'Testnet-10' : 'Mainnet')}</strong>`);
  }
  return '';
}

async function paintQrs(root, address) {
  if (!address) return;
  const nodes = [...root.querySelectorAll('[data-fg-qr]')];
  if (!nodes.length) return;
  let QR;
  try { QR = await import('https://esm.sh/qrcode@1.5.4'); } catch { return; }
  for (const el of nodes) {
    const addr = el.dataset.fgQr || address;
    if (!addr) continue;
    el.innerHTML = '';
    const canvas = document.createElement('canvas');
    try {
      await QR.toCanvas(canvas, addr, { width: 168, margin: 1, color: { dark: '#111111', light: '#ffffff' } });
      el.appendChild(canvas);
    } catch {}
  }
}

function paletteFromFile(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 64, 64);
      const d = x.getImageData(0, 0, 64, 64).data;
      const px = [];
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
        if (a < 80) continue;
        px.push({ r, g, b, l: (r + g + b) / 3, s: Math.max(r, g, b) - Math.min(r, g, b) });
      }
      URL.revokeObjectURL(url);
      if (!px.length) { resolve(null); return; }
      px.sort((a, b) => a.l - b.l);
      const dark = px[Math.floor(px.length * 0.12)];
      const light = px[Math.floor(px.length * 0.88)];
      const vivid = px.reduce((m, p) => (p.s > m.s ? p : m), px[0]);
      const mean = (a, k) => Math.min(255, a[k] + 22);
      const bg = hexOf(dark.r, dark.g, dark.b);
      const card = hexOf(mean(dark, 'r'), mean(dark, 'g'), mean(dark, 'b'));
      const accent = hexOf(vivid.r, vivid.g, vivid.b);
      const text = light.l > 140 ? hexOf(light.r, light.g, light.b) : '#f5f5f7';
      const gold = accent;
      resolve({ bg, card, accent, text, gold, radius: 16 });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function ensureType(blocks, type, col) {
  let b = blocks.find(x => x.type === type);
  if (!b) {
    const prim = FORGE_PRIMS.find(p => p.id === type);
    b = { id: uid(), type, title: prim.label, col: col || 'full' };
    blocks.push(b);
  }
  return b;
}

function moveType(blocks, type, index) {
  const i = blocks.findIndex(b => b.type === type);
  if (i < 0) return;
  const [x] = blocks.splice(i, 1);
  blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, x);
}

function localRestyle(layout, text, palette) {
  const t = String(text || '').toLowerCase();
  const next = JSON.parse(JSON.stringify(layout));
  if (palette) {
    next.theme = { ...next.theme, ...palette };
    if (/round|soft|pill/.test(t)) next.theme.radius = 22;
  }
  if (/terminal|green on black|matrix/.test(t)) {
    next.theme = { bg: '#020402', card: '#071108', accent: '#39ff14', gold: '#39ff14', text: '#c8ffc8', radius: 4 };
  }
  if (/\bwhite\b|\blight\b|paper/.test(t)) {
    next.theme = { bg: '#f4f1ea', card: '#ffffff', accent: '#111111', gold: '#b45309', text: '#111111', radius: 14 };
  }
  if (/teal|kaspa green/.test(t)) next.theme.accent = '#49eacb';
  if (/\bqr\b|receive/.test(t)) ensureType(next.blocks, 'receive', '1');
  if (/token|kcc/.test(t)) ensureType(next.blocks, 'tokens', 'full');
  if (/activit|history/.test(t)) ensureType(next.blocks, 'activity', 'full');
  if (/\bsend\b/.test(t)) ensureType(next.blocks, 'send', 'full');
  if (/ttt|apps/.test(t)) ensureType(next.blocks, 'apps', 'full');
  if (/\bqr\b/.test(t) && /\btop\b/.test(t)) {
    ensureType(next.blocks, 'receive', 'full');
    const recv = next.blocks.find(b => b.type === 'receive');
    if (recv) recv.col = 'full';
    moveType(next.blocks, 'receive', 1);
  }
  if (/token/.test(t) && /(under|below|after)/.test(t)) {
    const ki = next.blocks.findIndex(b => b.type === 'kas');
    moveType(next.blocks, 'tokens', ki < 0 ? next.blocks.length : ki + 1);
    const tok = next.blocks.find(b => b.type === 'tokens');
    if (tok) tok.col = 'full';
  }
  return next;
}

function applyLlm(layout, parsed) {
  const next = JSON.parse(JSON.stringify(layout));
  if (parsed.name) next.name = String(parsed.name).slice(0, 40);
  if (parsed.theme && typeof parsed.theme === 'object') {
    next.theme = { ...next.theme };
    for (const k of ['bg', 'card', 'accent', 'text', 'gold']) {
      const v = String(parsed.theme[k] || '');
      if (/^#[0-9a-fA-F]{3,8}$/.test(v)) next.theme[k] = v;
    }
    if (Number(parsed.theme.radius) > 0) next.theme.radius = Math.min(32, Number(parsed.theme.radius));
  }
  if (Array.isArray(parsed.order) && parsed.order.length) {
    const blocks = [];
    for (const row of parsed.order) {
      const type = String(row.type || row);
      if (!TYPES.includes(type)) continue;
      const col = row.col === 1 || row.col === '1' ? '1' : (row.col === 0 || row.col === '0' ? '0' : 'full');
      blocks.push({
        id: uid(),
        type,
        title: String(row.title || FORGE_PRIMS.find(p => p.id === type)?.label || type).slice(0, 32),
        col
      });
    }
    if (blocks.length) next.blocks = blocks;
  }
  return next;
}

export function bootWalletForge(root, hooks) {
  if (!root) return { destroy() {} };
  let layout = loadLayout();
  let selected = layout.blocks[0]?.id || '';
  let chat = [];
  let pendingImage = null;
  const live = () => forgeStateFromWallet(hooks.getLive?.() || {});

  root.innerHTML = `
    <div class="fg-presets" id="fg-presets">
      ${FORGE_PRESETS.map(p => `<button type="button" class="fg-preset" data-fg-preset="${esc(p.id)}"><b>${esc(p.label)}</b><i>${esc(p.blurb)}</i></button>`).join('')}
    </div>
    <div class="fg-shell fg-pro">
      <aside class="fg-pal">
        <b>Primitives</b>
        ${FORGE_PRIMS.map(p => `<button type="button" class="fg-chip" draggable="true" data-fg-add="${p.id}">${esc(p.label)}<i>${esc(p.hint)}</i></button>`).join('')}
        <p class="fg-hint">Drag onto the phone. Drag a card onto another card to move it.</p>
      </aside>
      <section class="fg-canvas" id="fg-canvas">
        <div class="fg-phone" id="fg-phone"></div>
      </section>
      <aside class="fg-side">
        <div class="fg-insp" id="fg-insp"></div>
        <div class="fg-chat">
          <b>Agent</b>
          <div class="fg-log" id="fg-log"></div>
          <label class="fg-up">Upload a wallet screenshot
            <input type="file" id="fg-img" accept="image/*">
          </label>
          <p class="fg-img-name" id="fg-img-name"></p>
          <textarea id="fg-ask" rows="2" maxlength="500" placeholder="Restyle from my screenshot. QR on top, tokens under KAS."></textarea>
          <button type="button" class="fg-cta" id="fg-go">Restyle</button>
        </div>
      </aside>
    </div>
    <div class="vprog-acts">
      <button type="button" class="btn btn-gold" id="fg-test">Test this wallet</button>
      <button type="button" class="btn btn-glass" id="fg-export">Export HTML</button>
      <button type="button" class="btn btn-glass" id="fg-reset">Reset</button>
    </div>
    <div class="fg-modal hidden" id="fg-modal" aria-hidden="true">
      <div class="fg-modal-in">
        <button type="button" class="fg-modal-x" id="fg-modal-x">Close</button>
        <div id="fg-live"></div>
      </div>
    </div>
  `;

  const phone = root.querySelector('#fg-phone');
  const canvas = root.querySelector('#fg-canvas');
  const insp = root.querySelector('#fg-insp');
  const log = root.querySelector('#fg-log');
  const modal = root.querySelector('#fg-modal');
  const liveBox = root.querySelector('#fg-live');

  function logLine(who, text) {
    chat.push({ who, text });
    log.innerHTML = chat.slice(-8).map(m =>
      `<p class="fg-msg ${m.who}"><b>${m.who === 'you' ? 'You' : 'Forge'}</b> ${esc(m.text)}</p>`
    ).join('');
    log.scrollTop = log.scrollHeight;
  }

  function paint(previewRoot, preview) {
    const host = previewRoot || phone;
    const L = live();
    host.innerHTML = `<header class="fg-top">${esc(layout.name)}</header>`
      + `<div class="fg-grid">${layout.blocks.map(b => blockHtml(b, L, selected, { preview: !!preview })).join('')}</div>`;
    stampTheme(canvas, layout.theme);
    stampTheme(host, layout.theme);
    stampTheme(modal, layout.theme);
    paintQrs(host, L.address);
    if (preview) return;
    saveLayout(layout);
    const b = layout.blocks.find(x => x.id === selected);
    insp.innerHTML = b ? `
      <b>Edit</b>
      <label class="field"><span>Label</span><input id="fg-title" value="${esc(b.title || '')}" maxlength="32"></label>
      <label class="field"><span>Column</span>
        <select id="fg-col">
          <option value="full"${b.col === 'full' || !b.col ? ' selected' : ''}>Full width</option>
          <option value="0"${b.col === '0' ? ' selected' : ''}>Left</option>
          <option value="1"${b.col === '1' ? ' selected' : ''}>Right</option>
        </select>
      </label>
      <button type="button" class="btn btn-glass" id="fg-up">Move up</button>
      <button type="button" class="btn btn-glass" id="fg-dn">Move down</button>
      <button type="button" class="btn btn-glass" id="fg-del-insp">Delete</button>
    ` : `<p class="muted">Tap a block. Drag it onto another to place it.</p>`;
    insp.querySelector('#fg-title')?.addEventListener('input', (e) => {
      if (!b) return;
      b.title = e.target.value;
      paint();
    });
    insp.querySelector('#fg-col')?.addEventListener('change', (e) => {
      if (!b) return;
      b.col = e.target.value;
      paint();
    });
    insp.querySelector('#fg-up')?.addEventListener('click', () => move(selected, -1));
    insp.querySelector('#fg-dn')?.addEventListener('click', () => move(selected, 1));
    insp.querySelector('#fg-del-insp')?.addEventListener('click', () => del(selected));
  }

  function add(type, col) {
    const prim = FORGE_PRIMS.find(p => p.id === type);
    if (!prim) return;
    const block = { id: uid(), type, title: prim.label, col: col || 'full' };
    layout.blocks.push(block);
    selected = block.id;
    paint();
  }

  function del(id) {
    layout.blocks = layout.blocks.filter(b => b.id !== id);
    if (selected === id) selected = layout.blocks[0]?.id || '';
    paint();
  }

  function move(id, dir) {
    const i = layout.blocks.findIndex(b => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layout.blocks.length) return;
    const [x] = layout.blocks.splice(i, 1);
    layout.blocks.splice(j, 0, x);
    paint();
  }

  function insertBefore(srcId, destId) {
    if (!srcId || srcId === destId) return;
    const i = layout.blocks.findIndex(b => b.id === srcId);
    if (i < 0) return;
    const [x] = layout.blocks.splice(i, 1);
    const j = layout.blocks.findIndex(b => b.id === destId);
    layout.blocks.splice(j < 0 ? layout.blocks.length : j, 0, x);
    selected = x.id;
    paint();
  }

  function applyPreset(id) {
    const p = FORGE_PRESETS.find(x => x.id === id);
    if (!p) return;
    layout = p.layout();
    selected = layout.blocks[0]?.id || '';
    paint();
    logLine('ai', 'Loaded template: ' + p.label);
    hooks.toast?.(p.label);
  }
  root.querySelectorAll('[data-fg-preset]').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.fgPreset));
  });
  root.querySelectorAll('[data-fg-add]').forEach(btn => {
    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', 'add:' + btn.dataset.fgAdd);
      e.dataTransfer.effectAllowed = 'copy';
    });
    btn.addEventListener('click', () => add(btn.dataset.fgAdd));
  });
  canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('over'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('over'));
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.classList.remove('over');
    const raw = e.dataTransfer.getData('text/plain');
    const card = e.target.closest('[data-fg]');
    if (raw.startsWith('add:')) {
      add(raw.slice(4), card?.classList.contains('col1') ? '1' : (card ? 'full' : 'full'));
      if (card) insertBefore(selected, card.dataset.fg);
      return;
    }
    if (raw.startsWith('move:') && card) insertBefore(raw.slice(5), card.dataset.fg);
  });
  phone.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-fg]');
    if (!card) return;
    e.dataTransfer.setData('text/plain', 'move:' + card.dataset.fg);
    e.dataTransfer.effectAllowed = 'move';
  });
  phone.addEventListener('click', (e) => {
    const kill = e.target.closest('[data-fg-del]');
    if (kill) { e.stopPropagation(); del(kill.dataset.fgDel); return; }
    const act = e.target.closest('[data-fg-act]');
    if (act && act.dataset.fgAct === 'send') {
      const card = act.closest('[data-fg]');
      const dest = card?.querySelector('[data-fg-dest]')?.value || '';
      const amt = card?.querySelector('[data-fg-amt]')?.value || '';
      hooks.sendKas?.(dest, amt);
      return;
    }
    const card = e.target.closest('[data-fg]');
    if (card) { selected = card.dataset.fg; paint(); }
  });

  root.querySelector('#fg-img')?.addEventListener('change', (e) => {
    pendingImage = e.target.files && e.target.files[0];
    root.querySelector('#fg-img-name').textContent = pendingImage ? pendingImage.name : '';
  });

  root.querySelector('#fg-go')?.addEventListener('click', async () => {
    const ask = String(root.querySelector('#fg-ask')?.value || '').trim();
    if (!ask && !pendingImage) { hooks.toast?.('Type a restyle or upload a screenshot'); return; }
    logLine('you', ask || '(screenshot)');
    let palette = null;
    let dataUrl = '';
    if (pendingImage) {
      palette = await paletteFromFile(pendingImage);
      try { dataUrl = await fileToDataUrl(pendingImage); } catch {}
    }
    layout = localRestyle(layout, ask || 'qr on top tokens under kas', palette);
    paint();
    stampTheme(canvas, layout.theme);
    stampTheme(phone, layout.theme);
    logLine('ai', 'Applied ' + (layout.theme.bg || '') + ' / ' + (layout.theme.accent || '') + '. QR and tokens follow your prompt.');
    const origin = (hooks.apiOrigin || 'https://kcc-20-wallet.vercel.app').replace(/\/$/, '');
    try {
      const res = await fetch(origin + '/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: ask, palette, image: dataUrl.slice(0, 1_200_000) })
      });
      const j = await res.json();
      if (j && Array.isArray(j.order)) {
        layout = applyLlm(layout, j);
        paint();
        logLine('ai', j.reply || 'Restyled from your prompt and screenshot.');
      } else if (j && j.local) {
        logLine('ai', 'Applied local restyle (palette + layout). Server Grok key not set.');
      } else {
        logLine('ai', j?.error ? ('Local restyle only: ' + j.error) : 'Applied palette and layout from your text.');
      }
    } catch {
      logLine('ai', 'Offline restyle: palette from the image, layout from your words.');
    }
  });

  function openTest() {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    paint(liveBox, true);
    liveBox.querySelectorAll('[data-fg-act="send"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('[data-fg]');
        const dest = card?.querySelector('[data-fg-dest]')?.value || '';
        const amt = card?.querySelector('[data-fg-amt]')?.value || '';
        hooks.sendKas?.(dest, amt);
      });
    });
  }
  root.querySelector('#fg-test')?.addEventListener('click', openTest);
  root.querySelector('#fg-modal-x')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  });
  root.querySelector('#fg-reset')?.addEventListener('click', () => {
    localStorage.removeItem(STORE);
    layout = FORGE_PRESETS[0].layout();
    selected = layout.blocks[0]?.id || '';
    paint();
  });
  root.querySelector('#fg-export')?.addEventListener('click', () => {
    const html = exportHtml(layout);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kaspa-wallet.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    hooks.toast?.('Downloaded kaspa-wallet.html');
  });
  logLine('ai', 'Drop primitives. Upload a wallet screenshot and tell me how to restyle. Test opens YOUR wallet, not Scorpion chrome.');
  paint();
  return { refresh: paint, destroy() { saveLayout(layout); } };
}

function exportHtml(layout) {
  const blocks = JSON.stringify(layout);
  const th = layout.theme || DEFAULT_THEME;
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(layout.name)}</title>
<link rel="icon" href="https://kcc-20-wallet.vercel.app/assets/kas.svg">
<script src="https://kcc-20-wallet.vercel.app/sdk.js?v=176"><\/script>
<style>
:root{--bg:${th.bg};--card:${th.card};--accent:${th.accent};--gold:${th.gold};--txt:${th.text};--radius:${th.radius}px}
*{box-sizing:border-box}body{margin:0;font:16px/1.45 -apple-system,sans-serif;background:var(--bg);color:var(--txt)}
.wrap{max-width:420px;margin:0 auto;padding:22px 16px 48px}
.fg-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fg-card{background:var(--card);border-radius:var(--radius);padding:14px}
.full{grid-column:1/-1}.col0{grid-column:1}.col1{grid-column:2}
.fg-k{font-size:11px;color:var(--gold);letter-spacing:.08em;text-transform:uppercase}
.fg-cta{height:44px;border:0;border-radius:12px;background:var(--accent);color:#111;font-weight:700;width:100%}
.fg-in{width:100%;margin:6px 0;height:36px;border-radius:10px;border:0;padding:0 8px}
</style></head><body>
<div class="wrap"><div id="app"></div></div>
<script>
const LAYOUT=${blocks};
const LOGO='https://kcc-20-wallet.vercel.app/assets/kas.svg';
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));}
async function live(){
  const kcc=window.kcc20; if(!kcc) return {address:'',name:'Connect',kas:'—',holdings:[],network:''};
  const st=await kcc.getState().catch(()=>null)||{};
  const kas=st.balance&&st.balance.confirmed!=null?(Number(st.balance.confirmed)/1e8).toLocaleString():'—';
  return {address:st.address||'',name:'Wallet',kas,network:st.network||'',holdings:(st.holdings||[]).map(t=>({tick:t.ticker,bal:t.balance}))};
}
function render(L){
  document.getElementById('app').innerHTML='<h2>'+esc(LAYOUT.name)+'</h2><div class="fg-grid">'+LAYOUT.blocks.map(b=>{
    const col=b.col==='1'?'col1':(b.col==='0'?'col0':'full');
    if(b.type==='brand') return '<article class="fg-card '+col+'"><img src="'+LOGO+'" width="36" alt="Kaspa"> <b>'+esc(b.title)+'</b></article>';
    if(b.type==='identity') return '<article class="fg-card '+col+'"><span class="fg-k">'+esc(b.title)+'</span><div>'+esc(L.name)+'</div><code>'+esc(L.address)+'</code></article>';
    if(b.type==='kas') return '<article class="fg-card '+col+'"><span class="fg-k">'+esc(b.title)+'</span><strong>'+esc(L.kas)+' KAS</strong></article>';
    if(b.type==='tokens') return '<article class="fg-card '+col+'"><span class="fg-k">'+esc(b.title)+'</span>'+(L.holdings.map(h=>'<div>'+esc(h.tick)+' '+esc(h.bal)+'</div>').join('')||'—')+'</article>';
    if(b.type==='receive') return '<article class="fg-card '+col+'"><span class="fg-k">'+esc(b.title)+'</span><canvas id="qr"></canvas><p>'+esc(L.address)+'</p></article>';
    if(b.type==='send') return '<article class="fg-card '+col+'"><span class="fg-k">'+esc(b.title)+'</span><p>Connect Scorpion to sign. This skin never holds keys.</p></article>';
    return '<article class="fg-card '+col+'"><span class="fg-k">'+esc(b.title||b.type)+'</span></article>';
  }).join('')+'</div>';
  if(L.address) import('https://esm.sh/qrcode@1.5.4').then(QR=>QR.toCanvas(document.getElementById('qr'), L.address, {width:168}).catch(()=>{}));
}
window.addEventListener('kcc20#initialized', async()=>{
  try { if(!(window.kcc20.accounts||[]).length) await window.kcc20.connect(); } catch(e) {}
  render(await live());
});
</script></body></html>`;
}
