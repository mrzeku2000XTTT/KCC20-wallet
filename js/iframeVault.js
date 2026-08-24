/* When this PWA is iframed on tttz.xyz, third-party storage is wiped on refresh.
   The parent holds an opaque locker blob (first-party). Signing still happens here. */
const NS = 'kcc20';

const ALLOWED_PARENTS = [
  'https://tttz.xyz',
  'https://www.tttz.xyz'
];

function inIframe() {
  try { return window.self !== window.top; } catch { return true; }
}

function allowedParent(origin) {
  if (!origin) return false;
  if (ALLOWED_PARENTS.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    if (u.hostname.endsWith('.base44.app') && u.protocol === 'https:') return true;
  } catch {}
  return false;
}

function dumpVault() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.slice(0, 5) !== 'kcc20') continue;
      out[k] = localStorage.getItem(k);
    }
  } catch {}
  return out;
}

function applyVault(blob) {
  if (!blob || typeof blob !== 'object') return 0;
  let n = 0;
  for (const [k, v] of Object.entries(blob)) {
    if (!k || k.slice(0, 5) !== 'kcc20') continue;
    if (typeof v !== 'string') continue;
    try { localStorage.setItem(k, v); n += 1; } catch {}
  }
  return n;
}

let parentOrigin = '';
let persistTimer = 0;

function askStorageAccess() {
  try {
    if (typeof document.requestStorageAccess !== 'function') return;
    document.hasStorageAccess?.().then((ok) => {
      if (!ok) document.requestStorageAccess().catch(() => {});
    }).catch(() => {});
  } catch {}
}

export function persistIframeVault() {
  if (!inIframe()) return;
  const target = parentOrigin || '*';
  try {
    window.parent.postMessage({ ns: NS, type: 'vault:save', blob: dumpVault() }, target);
  } catch {}
}

export function schedulePersistIframeVault() {
  if (!inIframe()) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistIframeVault, 80);
}

export function restoreIframeVault() {
  if (!inIframe()) return Promise.resolve(false);
  askStorageAccess();
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
      resolve(v);
    };
    function onMsg(ev) {
      if (!allowedParent(ev.origin)) return;
      const d = ev.data;
      if (!d || d.ns !== NS || d.type !== 'vault:restore') return;
      parentOrigin = ev.origin;
      try { applyVault(d.blob); } catch {}
      finish(true);
    }
    window.addEventListener('message', onMsg);
    const ping = setInterval(() => {
      if (done) { clearInterval(ping); return; }
      try { window.parent.postMessage({ ns: NS, type: 'vault:hello' }, '*'); } catch {}
    }, 200);
    const timer = setTimeout(() => { clearInterval(ping); finish(false); }, 2000);
    try { window.parent.postMessage({ ns: NS, type: 'vault:hello' }, '*'); } catch {}
  });
}

export function bootIframeVaultWatch() {
  if (!inIframe()) return;
  window.addEventListener('message', (ev) => {
    if (!allowedParent(ev.origin)) return;
    if (ev.data?.ns === NS && ev.data?.type === 'vault:restore') {
      parentOrigin = ev.origin;
      try { applyVault(ev.data.blob); } catch {}
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistIframeVault();
  });
  window.addEventListener('pagehide', persistIframeVault);
}
