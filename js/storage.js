/* Quota-safe localStorage. Activity/ledger/snaps must never block signing. */

function lsGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}

function trimJsonArray(key, max) {
  try {
    const raw = JSON.parse(lsGet(key) || '[]');
    if (!Array.isArray(raw)) {
      localStorage.removeItem(key);
      return;
    }
    const next = raw.slice(0, max).map((row) => {
      if (!row || typeof row !== 'object') return row;
      const image = String(row.image || '');
      if (image.length > 180) row.image = '';
      return row;
    });
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    try { localStorage.removeItem(key); } catch {}
  }
}

function slimSnaps() {
  try {
    const raw = JSON.parse(lsGet('kcc20_snaps_v1') || '{}');
    if (!raw || typeof raw !== 'object') return;
    const next = {};
    for (const [addr, snap] of Object.entries(raw)) {
      if (!snap || typeof snap !== 'object') continue;
      next[addr] = {
        sompi: snap.sompi,
        at: snap.at,
        kcc: (snap.kcc || []).slice(0, 20).map((t) => ({
          ticker: t.ticker, balance: String(t.balance || '0'), decimals: t.decimals, protocol: t.protocol || 'kcc20'
        })),
        krc: (snap.krc || []).slice(0, 12).map((t) => ({
          ticker: t.ticker, balance: String(t.balance || '0'), decimals: t.decimals, protocol: 'krc20'
        })),
        txs: (snap.txs || []).slice(0, 8)
      };
    }
    localStorage.setItem('kcc20_snaps_v1', JSON.stringify(next));
  } catch {
    try { localStorage.removeItem('kcc20_snaps_v1'); } catch {}
  }
}

export function reclaimStorage(keepKey) {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
  } catch { return; }
  for (const k of keys) {
    if (k === keepKey) continue;
    if (k.startsWith('kcc20_txlog_v1')) trimJsonArray(k, 80);
    else if (k.startsWith('kcc20_activity_v1')) trimJsonArray(k, 80);
    else if (k.startsWith('kcc20_notices_v1')) trimJsonArray(k, 40);
  }
  if (keepKey !== 'kcc20_snaps_v1') slimSnaps();
  for (const k of keys) {
    if (k === keepKey) continue;
    if (k.startsWith('kcc20_txlog_v1')) {
      try { localStorage.removeItem(k); } catch {}
    }
  }
}

export function safeSetItem(key, val) {
  try {
    localStorage.setItem(key, val);
    return true;
  } catch {
    reclaimStorage(key);
    try {
      localStorage.setItem(key, val);
      return true;
    } catch {
      try { localStorage.removeItem(key); } catch {}
      try {
        localStorage.setItem(key, val);
        return true;
      } catch {
        return false;
      }
    }
  }
}

export function bootReclaim() {
  try {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      n += ((k || '').length + (lsGet(k) || '').length) * 2;
    }
    if (n > 3_500_000) reclaimStorage('');
  } catch {}
}
