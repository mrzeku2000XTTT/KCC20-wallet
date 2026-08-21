/* Kaspa Name Service — https://api.knsdomains.org (mainnet indexer). */

const KNS = 'https://api.knsdomains.org/mainnet/api/v1';
const APP = 'https://app.knsdomains.org';

export function knsAppUrl() {
  return APP;
}

export function looksLikeKasDomain(s) {
  const t = String(s || '').trim();
  if (!t || t.startsWith('kaspa:')) return false;
  return /\.kas$/i.test(t) || (/^[^\s:]+$/i.test(t) && !/^kaspa:/i.test(t) && t.includes('.'));
}

export function normalizeKasDomain(s) {
  let d = String(s || '').trim().toLowerCase().replace(/^@/, '');
  if (!d) return '';
  if (!d.endsWith('.kas')) d += '.kas';
  return d;
}

async function knsJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error((j && (j.message || j.error)) || ('KNS HTTP ' + res.status));
  return j;
}

/** Resolve alice.kas → owner kaspa: address. */
export async function knsResolve(domain) {
  const d = normalizeKasDomain(domain);
  if (!d) throw new Error('Enter a .kas domain');
  const j = await knsJson(`${KNS}/${encodeURIComponent(d)}/owner`);
  const row = j?.data || j;
  const owner = row?.owner || '';
  const name = row?.asset || d;
  if (!owner) throw new Error(d + ' is not registered');
  return { domain: name, owner, assetId: row.assetId || '' };
}

export async function knsPrimary(address) {
  if (!address) return '';
  try {
    const j = await knsJson(`${KNS}/primary-name/${encodeURIComponent(address)}`);
    const row = j?.data || j;
    const name = row?.domain || row?.asset || row?.primaryName || row?.name || (typeof row === 'string' ? row : '');
    return name ? normalizeKasDomain(name) : '';
  } catch {
    return '';
  }
}

export async function knsDomainsFor(address) {
  if (!address) return [];
  const j = await knsJson(`${KNS}/assets?owner=${encodeURIComponent(address)}&type=domain&pageSize=50`);
  const list = j?.data?.assets || j?.assets || [];
  return list
    .filter(a => a && (a.isDomain || String(a.asset || '').toLowerCase().endsWith('.kas')))
    .map(a => ({
      domain: normalizeKasDomain(a.asset),
      owner: a.owner || address,
      assetId: a.assetId || '',
      verified: !!a.isVerifiedDomain
    }));
}

export function knsOwnerMatches(owner, wallet) {
  const o = String(owner || '').toLowerCase().replace(/^0x/, '');
  const addr = String(wallet?.address || '').toLowerCase();
  const pk = String(wallet?.pubKey || '').replace(/^0x/i, '').toLowerCase();
  if (o && addr && o === addr) return true;
  if (o && pk && (o === pk || o.endsWith(pk))) return true;
  return false;
}
