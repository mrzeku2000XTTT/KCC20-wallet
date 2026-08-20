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

export const VAULT_PRODUCTS = [
  {
    id: 'xmss',
    name: 'Quantum Vault',
    type: 'timelock',
    tag: 'XMSS',
    status: 'mainnet',
    blurb: 'Hash-based post-quantum lock. Spend only with an XMSS signature.'
  },
  {
    id: 'timelock',
    name: 'Time Capsule',
    type: 'timelock',
    tag: 'CLTV',
    status: 'mainnet',
    blurb: 'Sends KAS to a capsule until a timer. When it expires, this wallet sweeps it back automatically.'
  },
  {
    id: 'kcc20freeze',
    name: 'KCC20 Freeze',
    type: 'kcc20lock',
    tag: 'CLTV+',
    status: 'mainnet',
    blurb: 'Same CLTV as native KAS, for KCC20. Tokens move to SCRIPT_HASH ownership of the capsule; ~0.2 KAS sits in the P2SH as witness. Auto-sweeps back when the timer ends.'
  },
  {
    id: 'escrow',
    name: 'Escrow',
    type: 'escrow',
    tag: 'KCC',
    status: 'mainnet',
    blurb: 'Buyer, seller, optional arbiter. Release or refund by script.'
  },
  {
    id: 'multisig',
    name: '2-of-2 Multisig',
    type: 'multisig',
    tag: 'XMSS',
    status: 'mainnet',
    blurb: 'Two independent trees. Both must sign to move funds.'
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    type: 'timelock',
    tag: 'DMS',
    status: 'mainnet',
    blurb: 'Dead-man switch. Check in, or the vault releases on timeout.'
  },
  {
    id: 'kcc20',
    name: 'KCC20 Transfer',
    type: 'kcc20',
    tag: 'KCC20',
    status: 'standard',
    blurb: 'Watch and send a KCC20 fungible-token covenant UTXO.'
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
    if (Array.isArray(already)) return;
    const legacy = JSON.parse(localStorage.getItem(VAULTS_KEY) || '[]');
    if (Array.isArray(legacy) && legacy.length) {
      localStorage.setItem(scoped, JSON.stringify(legacy));
    }
  } catch {}
}

function vaultStoreKey() {
  return vaultOwner ? VAULTS_KEY + ':' + vaultOwner : VAULTS_KEY;
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
  try {
    const raw = JSON.parse(localStorage.getItem(vaultStoreKey()) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveVault(vault) {
  const list = loadVaults();
  list.unshift({ ...vault, createdAt: Date.now(), walletAddress: vaultOwner || vault.walletAddress || '' });
  localStorage.setItem(vaultStoreKey(), JSON.stringify(list.slice(0, 40)));
}

export function updateVault(address, patch) {
  const list = loadVaults().map(v => v.address === address ? { ...v, ...patch } : v);
  localStorage.setItem(vaultStoreKey(), JSON.stringify(list));
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
  if (t === 'KAS') return '#49eacb';
  let h = 0;
  for (const c of t) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  const hues = ['#70c7ba', '#7aa2f7', '#bb9af7', '#9ece6a', '#ff9e64', '#f7768e', '#e0af68'];
  return hues[h % hues.length];
}

const KCC20_API = 'https://kcc20.info';
const KASCOV_API = 'https://kascov.io';
const KASPLEX_API = 'https://api.kasplex.org/v1/krc20';

function asList(v) {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.result)) return v.result;
  if (Array.isArray(v?.balances)) return v.balances;
  if (Array.isArray(v?.portfolio)) return v.portfolio;
  return [];
}

function mapKccRow(p) {
  const ticker = String(p.listed_ticker || p.ticker || p.fallback_name || p.name || 'TOKEN').toUpperCase();
  const image = p.listed_image || p.image
    || (p.image_api ? (String(p.image_api).startsWith('http') ? p.image_api : KCC20_API + p.image_api) : '');
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

/** kascov.io is CORS-open (what KasWare-class wallets use for KRON / KCC20). kcc20.info is not. */
export async function fetchKcc20Portfolio(address, pubKey) {
  const keys = [];
  if (address) keys.push(address);
  const pk = String(pubKey || '').replace(/^0x/i, '');
  if (pk && pk.length >= 64) keys.push(pk);

  let lastErr = null;
  for (const key of keys) {
    try {
      const data = await fetchJson(`${KASCOV_API}/data/mainnet/addr/${key}.json`);
      if (data && Array.isArray(data.token_holdings)) {
        return data.token_holdings.filter(p => Number(p.balance) > 0).map(mapKccRow);
      }
    } catch (e) {
      lastErr = e;
    }
  }

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
