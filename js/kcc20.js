/* KCC20 token watchlist + covenant catalog for this repo. */

export const NATIVE_KAS = {
  ticker: 'KAS',
  name: 'Kaspa',
  decimals: 8,
  native: true,
  color: '#49eacb',
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
    const raw = JSON.parse(localStorage.getItem(VAULTS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveVault(vault) {
  const list = loadVaults();
  list.unshift({ ...vault, createdAt: Date.now() });
  localStorage.setItem(VAULTS_KEY, JSON.stringify(list.slice(0, 40)));
}

export function updateVault(address, patch) {
  const list = loadVaults().map(v => v.address === address ? { ...v, ...patch } : v);
  localStorage.setItem(VAULTS_KEY, JSON.stringify(list));
}

export function formatAmount(sompi, decimals = 8) {
  const n = Number(sompi || 0) / (10 ** decimals);
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0.00';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
