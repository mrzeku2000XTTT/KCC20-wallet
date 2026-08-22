/* KCC20 token watchlist + covenant catalog for this repo. */

export const NATIVE_KAS = {
  ticker: 'KAS',
  name: 'Kaspa',
  decimals: 8,
  native: true,
  color: '#49eacb',
  image: 'assets/kas.svg',
  note: 'Native L1 coin'
};

export const SEED_TOKENS = [
  {
    ticker: 'KCC20',
    name: 'KCC20 Sample',
    decimals: 8,
    color: '#d4b07a',
    covenantAddress: '',
    scriptHash: '',
    note: 'Fungible token covenant (KCC20). Add a live instance by address.'
  }
];

export const VAULT_GROUPS = [
  { id: 'simple', title: 'Everyday', hint: 'Lock, hold for someone, or freeze tokens. One PIN.' },
  { id: 'alive', title: 'Stay alive', hint: 'Tap Check in before the timer, or coins move to the heir / payee.' },
  { id: 'quantum', title: 'Quantum-safe', hint: 'Hash lock in this app. Full XMSS from this GitHub repo: paste a public kit.' }
];

export const LIFE_KINDS = [
  { id: 'rent', label: 'House rent', tag: '⌂', hint: 'Lock until rent is due. Sweep only after that time.' },
  { id: 'car', label: 'Car note', tag: '🚘', hint: 'Lock until the car payment date.' },
  { id: 'spend', label: 'Spending', tag: '🛒', hint: 'Bills and everyday spend, locked to a date.' },
  { id: 'control', label: 'Control', tag: '🎛', hint: 'Earmarked KAS. Unlock anytime you say.' },
  { id: 'save', label: 'Savings', tag: '🏦', hint: 'Save until a date, or unlock anytime if you say so.' }
];

export function lifeKindMeta(id) {
  return LIFE_KINDS.find(k => k.id === id) || LIFE_KINDS[2];
}

export const VAULT_PRODUCTS = [
  {
    id: 'timelock',
    group: 'simple',
    name: 'Time Capsule',
    type: 'timelock',
    tag: '⏱',
    why: 'Lock KAS. It comes back by itself when time is up.',
    blurb: 'Pick how long. We send KAS into a capsule and sweep it back when the timer ends.'
  },
  {
    id: 'escrow',
    group: 'simple',
    name: 'Hold for buyer',
    type: 'escrow',
    tag: '🤝',
    why: 'You can refund. Buyer can claim if their wallet is imported here.',
    blurb: 'Seller refunds any time. Buyer claims if that kaspa:q wallet is also in this app.'
  },
  {
    id: 'multisig',
    group: 'simple',
    name: 'Two keys',
    type: 'multisig',
    tag: '2',
    why: 'Both wallets on this phone must agree to spend.',
    blurb: 'Import the other person\'s wallet on You first, then lock. Sweep signs both keys.'
  },
  {
    id: 'kcc20freeze',
    group: 'simple',
    name: 'Freeze tokens',
    type: 'kcc20lock',
    tag: '❄',
    why: 'Freeze KCC20 for a while. They return when time is up.',
    blurb: 'Same two steps as Time Capsule: a little KAS witness, then tokens into SCRIPT_HASH.'
  },
  {
    id: 'sentinel',
    group: 'alive',
    name: 'Dead-man switch',
    type: 'sentinel',
    tag: '♥',
    why: 'Check in to prove you are around. Miss it and the heir can take the KAS.',
    blurb: 'Same hop chain as covenants/sentinel. Check-in moves to the next hop. Timeout pays the beneficiary.'
  },
  {
    id: 'recurring',
    group: 'alive',
    name: 'Pay on a timer',
    type: 'recurring',
    tag: '↻',
    why: 'Each check-in pays someone and relocks the rest.',
    blurb: 'Sentinel-x402 style. Miss a window and leftover refunds to you.'
  },
  {
    id: 'hashlock',
    group: 'quantum',
    name: 'Secret lock',
    type: 'hashlock',
    tag: '#',
    why: 'Claim with a secret, or refund when time is up.',
    blurb: 'SHA-256 hash lock (HTLC). Easy in-app quantum-adjacent lock.'
  },
  {
    id: 'xmss',
    group: 'quantum',
    name: 'XMSS vault',
    type: 'xmss',
    tag: '⚛',
    why: 'The real post-quantum vault from this repo. Paste a public kit, fund, spend with a witness.',
    blurb: 'Same deploy/spend as covenants/xmsslock. Keys stay offline (xmss_keygen.py / xmss_sign.py). This wallet only funds the P2SH and broadcasts the witness. Spend needs ~0.32 KAS extra for the large script fee.'
  }
];

const WATCH_KEY = 'kcc20_watchlist_v1';
const VAULTS_KEY = 'kcc20_vaults_v1';
let vaultOwner = '';

export function setVaultOwner(addr) {
  vaultOwner = String(addr || '');
  if (!vaultOwner) return;
  const scoped = VAULTS_KEY + ':' + vaultOwner;
  try {
    const already = JSON.parse(localStorage.getItem(scoped) || 'null');
    const legacy = JSON.parse(localStorage.getItem(VAULTS_KEY) || '[]');
    const have = Array.isArray(already) ? already : [];
    if (Array.isArray(legacy) && legacy.length && have.length === 0) {
      localStorage.setItem(scoped, JSON.stringify(legacy));
    }
  } catch {}
}

function vaultStoreKey() {
  return vaultOwner ? VAULTS_KEY + ':' + vaultOwner : VAULTS_KEY;
}

function vaultStoreKeys() {
  const keys = [VAULTS_KEY];
  const a = String(vaultOwner || '');
  if (a) {
    keys.push(VAULTS_KEY + ':' + a);
    const i = a.indexOf(':');
    if (i > 0) {
      const p = a.slice(i + 1);
      keys.push(VAULTS_KEY + ':kaspa:' + p);
      keys.push(VAULTS_KEY + ':kaspatest:' + p);
    }
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(VAULTS_KEY)) keys.push(k);
    }
  } catch {}
  return [...new Set(keys)];
}

/** Human amount → raw integer string (Kasplex / KCC20 units). */
export function toTokenRaw(human, decimals) {
  const d = Math.max(0, Number(decimals) || 0);
  const t = String(human ?? '').trim().replace(',', '.');
  if (!t || t === '.') throw new Error('Enter an amount');
  if (t.startsWith('-')) throw new Error('Amount must be > 0');
  const parts = t.split('.');
  if (parts.length > 2) throw new Error('Invalid amount');
  const w = parts[0] || '0';
  const f = parts[1] || '';
  if (!/^\d+$/.test(w) || (f && !/^\d+$/.test(f))) throw new Error('Invalid amount');
  const frac = (f + '0'.repeat(d)).slice(0, d);
  const raw = BigInt(w) * (10n ** BigInt(d)) + BigInt(frac || '0');
  if (raw <= 0n) throw new Error('Amount must be > 0');
  return raw.toString();
}

export function loadWatchlist() {
  try {
    const raw = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveWatchlist(list) {
  localStorage.setItem(WATCH_KEY, JSON.stringify(list));
}

export function addToken(token) {
  const list = loadWatchlist();
  const ticker = (token.ticker || '').toUpperCase().trim();
  if (!ticker) throw new Error('Ticker required');
  if (ticker === 'KAS') throw new Error('KAS is already native');
  if (list.some(t => t.ticker === ticker)) throw new Error('Token already watched');
  const next = {
    ticker,
    name: token.name || ticker,
    decimals: Number(token.decimals) || 8,
    color: token.color || '#d4b07a',
    covenantAddress: (token.covenantAddress || '').trim(),
    scriptHash: (token.scriptHash || '').trim(),
    note: token.note || 'User-added KCC20'
  };
  list.push(next);
  saveWatchlist(list);
  return next;
}

export function removeToken(ticker) {
  saveWatchlist(loadWatchlist().filter(t => t.ticker !== ticker));
}

export function loadVaults() {
  const seen = new Set();
  const out = [];
  for (const key of vaultStoreKeys()) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      for (const v of Array.isArray(raw) ? raw : []) {
        if (!v?.address || seen.has(v.address)) continue;
        seen.add(v.address);
        out.push(v);
      }
    } catch {}
  }
  return out;
}

export function saveVault(vault) {
  const row = { ...vault, createdAt: vault.createdAt || Date.now(), walletAddress: vaultOwner || vault.walletAddress || '' };
  const list = loadVaults().filter(v => v.address !== row.address);
  list.unshift(row);
  localStorage.setItem(vaultStoreKey(), JSON.stringify(list.slice(0, 80)));
}

export function updateVault(address, patch) {
  const list = loadVaults().map(v => v.address === address ? { ...v, ...patch } : v);
  localStorage.setItem(vaultStoreKey(), JSON.stringify(list.slice(0, 80)));
}

export function purgeVaultsWhere(pred) {
  const removed = [];
  const keys = vaultStoreKeys();
  for (const key of keys) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(raw) || !raw.length) continue;
      const next = [];
      for (const v of raw) {
        if (pred(v)) removed.push(v);
        else next.push(v);
      }
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  }
  return removed;
}

export function deleteVault(address) {
  if (!address) return;
  purgeVaultsWhere(v => v && v.address === address);
}

export function formatAmount(sompi, decimals = 8) {
  const n = Number(sompi || 0) / (10 ** decimals);
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0.00';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function formatTokenUnits(raw, decimals = 0) {
  const d = Math.max(0, Number(decimals) || 0);
  const n = Number(raw || 0) / (10 ** d);
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1_000_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (d === 0) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: Math.min(d, 4) });
  return n.toLocaleString(undefined, { maximumFractionDigits: Math.min(d, 8) });
}

export function krc20Logo(tick) {
  const t = String(tick || '').toLowerCase();
  if (!t) return '';
  return `https://krc20data.s3.amazonaws.com/verified/${t}-logo.png`;
}

export function tokenColor(ticker) {
  const t = String(ticker || '').toUpperCase();
  if (t === 'KRON' || t === 'KRONS') return '#d4b07a';
  if (t === 'KKDAG' || t === 'KNGHT') return '#7aa2f7';
  if (t === 'NACHO') return '#e8a54b';
  if (t === 'KASPI') return '#49eacb';
  if (t === 'KAS') return '#49eacb';
  let h = 0;
  for (const c of t) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  const hues = ['#70c7ba', '#7aa2f7', '#bb9af7', '#9ece6a', '#ff9e64', '#f7768e', '#e0af68'];
  return hues[h % hues.length];
}

const KCC20_API = 'https://kcc20.info';
const KASCOV_API = 'https://kascov.io';
const KASPLEX_API = 'https://api.kasplex.org/v1/krc20';
export const KRON_IDX = 'https://idx.kron.technology/v1/kcc20';

function asList(v) {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.result)) return v.result;
  if (Array.isArray(v?.balances)) return v.balances;
  if (Array.isArray(v?.portfolio)) return v.portfolio;
  return [];
}

export function kcc20Identicon(tick) {
  const t = String(tick || '?').toUpperCase();
  let h = 0;
  for (const c of t) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  const c1 = tokenColor(t);
  const c2 = ['#49eacb', '#d4b07a', '#f3e2bf', '#7aa2f7', '#70c7ba'][h % 5];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" rx="18" fill="#101214"/><g transform="rotate(${h % 360} 18 18)"><circle cx="18" cy="12" r="7.2" fill="${c1}"/><circle cx="11.5" cy="22.5" r="6.2" fill="${c2}" opacity=".88"/><circle cx="24.5" cy="22.5" r="6.2" fill="${c1}" opacity=".7"/></g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function firstHttp(...vals) {
  for (const v of vals) {
    const s = String(v || '').trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/') && s.length > 1) return KCC20_API + s;
  }
  return '';
}

function mapKccRow(p) {
  const ticker = String(p.listed_ticker || p.ticker || p.fallback_name || p.name || 'TOKEN').toUpperCase();
  const listing = p.listing || p.listed || {};
  const image = firstHttp(
    p.listed_image, p.claimed_image, p.image, p.logoURI, p.logo, p.icon, p.image_url,
    listing.image, listing.logoURI, listing.logo,
    p.image_api
  );
  return {
    protocol: 'kcc20',
    tokenId: p.token_id || p.tokenId || '',
    ticker,
    name: p.listed_name || p.display_name || p.name || ticker,
    decimals: Number(p.listed_decimals ?? p.decimals ?? 0),
    balance: String(p.balance || '0'),
    cells: Number(p.cells || 0),
    image,
    standard: p.standard || 'kcc20',
    priceKas: p.price_kas != null ? Number(p.price_kas) : null
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Indexer HTTP ' + res.status);
  return res.json();
}

function mapKronHold(r) {
  const ticker = String(r.tick || r.ticker || r.symbol || '').toUpperCase();
  const bal = r.balance ?? r.amount ?? r.tokenAmount ?? r.holding;
  if (!ticker || !(Number(bal) > 0)) return null;
  return {
    protocol: 'kcc20',
    ticker,
    name: r.name || ticker,
    balance: String(bal),
    decimals: Number(r.dec ?? r.decimals ?? 0),
    tokenId: r.covenantId || r.tokenId || '',
    cells: Number(r.utxoCount || r.cells || 0),
    image: r.logoURI || r.logo || ''
  };
}

function withTimeout(promise, ms, fallback) {
  let t;
  return Promise.race([
    promise,
    new Promise(resolve => { t = setTimeout(() => resolve(fallback), ms); })
  ]).finally(() => clearTimeout(t));
}

/** KRON indexer: CORS-open, live KCC20 balances. Path is /address/{addr}/tokenlist. */
export async function fetchKronAddrHoldings(address) {
  if (!address) return [];
  try {
    const body = await fetchJson(KRON_IDX + '/address/' + encodeURIComponent(address) + '/tokenlist');
    const rows = Array.isArray(body?.result) ? body.result
      : Array.isArray(body) ? body : [];
    return rows.map(mapKronHold).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchKronAddrTrades(address, limit = 24) {
  if (!address) return [];
  try {
    const body = await fetchJson(
      KRON_IDX + '/address/' + encodeURIComponent(address) + '/trades?limit=' + (Number(limit) || 24)
    );
    const rows = Array.isArray(body?.result) ? body.result
      : Array.isArray(body) ? body : [];
    return rows.filter(r => r && (r.tick || r.ticker) && (r.txid || r.txId));
  } catch {
    return [];
  }
}

export async function fetchKronTokenUtxos(tick, address) {
  if (!tick || !address) return [];
  try {
    const body = await fetchJson(
      KRON_IDX + '/token/' + encodeURIComponent(tick) + '/address/' + encodeURIComponent(address) + '/utxos'
    );
    return Array.isArray(body?.result) ? body.result : [];
  } catch {
    return [];
  }
}

async function fetchKascovHoldings(address, pubKey) {
  const keys = [];
  if (address) keys.push(address);
  const pk = String(pubKey || '').replace(/^0x/i, '');
  if (pk && pk.length >= 64) keys.push(pk);
  let lastErr = null;
  for (const key of keys) {
    try {
      const data = await fetchJson(`${KASCOV_API}/data/mainnet/addr/${key}.json`);
      if (data && Array.isArray(data.token_holdings)) {
        return { list: data.token_holdings.filter(p => Number(p.balance) > 0).map(mapKccRow), err: null };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  return { list: [], err: lastErr };
}

function mergeHoldings(kron, kascov) {
  const map = new Map();
  for (const t of [...kron, ...kascov]) {
    const key = String(t.ticker || '').toUpperCase();
    if (!key) continue;
    const cur = map.get(key);
    if (!cur) map.set(key, t);
    else {
      try {
        if (BigInt(t.balance || '0') > BigInt(cur.balance || '0')) map.set(key, { ...cur, ...t });
      } catch {}
    }
  }
  return [...map.values()];
}

export async function fetchKcc20Portfolio(address, pubKey) {
  const kronP = address ? fetchKronAddrHoldings(address) : Promise.resolve([]);
  const kascovP = fetchKascovHoldings(address, pubKey);

  const kron = await kronP;
  const kascovBag = kron.length
    ? await withTimeout(kascovP, 450, { list: [], err: null })
    : await kascovP;
  const kascov = kascovBag?.list || [];
  let lastErr = kascovBag?.err || null;
  if (kascov.length || kron.length) return mergeHoldings(kron, kascov);

  if (address) {
    try {
      const data = await fetchJson(`${KCC20_API}/v1/addresses/${address}/analysis?activity_limit=1&counterparty_limit=1`);
      if (data) return asList(data.portfolio || data).filter(p => Number(p.balance) > 0).map(mapKccRow);
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr) throw lastErr;
  return [];
}

export async function fetchKcc20PortfolioMany(addrs) {
  const bags = await Promise.all((addrs || []).slice(0, 12).map(a =>
    fetchKcc20Portfolio(a.address, a.pubKey).catch(() => [])
  ));
  const map = new Map();
  for (const list of bags) {
    for (const t of list) {
      const key = String(t.ticker || '').toUpperCase();
      const cur = map.get(key);
      if (!cur) map.set(key, { ...t, balance: String(t.balance || '0') });
      else {
        try { cur.balance = (BigInt(cur.balance || '0') + BigInt(t.balance || '0')).toString(); }
        catch {}
        cur.cells = Number(cur.cells || 0) + Number(t.cells || 0);
      }
    }
  }
  return [...map.values()];
}

export async function fetchKrc20PortfolioMany(addrs) {
  const bags = await Promise.all((addrs || []).slice(0, 12).map(a =>
    fetchKrc20Portfolio(a.address).catch(() => [])
  ));
  const map = new Map();
  for (const list of bags) {
    for (const t of list) {
      const key = String(t.ticker || '').toUpperCase();
      const cur = map.get(key);
      if (!cur) map.set(key, { ...t, balance: String(t.balance || '0') });
      else {
        try { cur.balance = (BigInt(cur.balance || '0') + BigInt(t.balance || '0')).toString(); }
        catch {}
      }
    }
  }
  return [...map.values()];
}

export async function fetchKrc20Portfolio(address) {
  if (!address) return [];
  const out = [];
  let next = '';
  for (let page = 0; page < 8; page++) {
    const q = next ? `?next=${encodeURIComponent(next)}` : '';
    const res = await fetch(`${KASPLEX_API}/address/${address}/tokenlist${q}`);
    if (res.status === 404) break;
    if (!res.ok) break;
    const data = await res.json();
    const rows = asList(data);
    for (const r of rows) {
      if (!(Number(r.balance) > 0)) continue;
      const ticker = String(r.tick || r.ticker || '').toUpperCase();
      if (!ticker) continue;
      out.push({
        protocol: 'krc20',
        tokenId: ticker,
        ticker,
        name: ticker,
        decimals: Number(r.dec || r.decimal || 8),
        balance: String(r.balance || '0'),
        cells: 0,
        image: krc20Logo(ticker),
        standard: 'krc-20',
        priceKas: null
      });
    }
    if (!data.next || data.next === next || !rows.length) break;
    next = data.next;
  }
  return out;
}
