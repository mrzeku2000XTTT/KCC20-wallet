/* Local vault intent parser — does not depend on the remote LLM. */

const ADDR_RE = /kaspa:[a-z0-9]{20,}/i;
const SKIP_TICK = new Set([
  'KAS', 'KASPA', 'FOR', 'MIN', 'MINS', 'MINUTE', 'MINUTES', 'HOUR', 'HOURS', 'HRS',
  'DAY', 'DAYS', 'SEC', 'SECS', 'SECOND', 'SECONDS', 'WEEK', 'WEEKS',
  'LOCK', 'HOLD', 'SEND', 'PAY', 'THE', 'AND', 'WITH', 'THIS', 'THAT', 'FROM',
  'TIME', 'CAPSULE', 'FREEZE', 'VAULT', 'TOKEN', 'TOKENS'
]);

const UNIT_TO_DAYS = {
  s: 1 / 86400, sec: 1 / 86400, secs: 1 / 86400, second: 1 / 86400, seconds: 1 / 86400,
  m: 1 / 1440, min: 1 / 1440, mins: 1 / 1440, minute: 1 / 1440, minutes: 1 / 1440,
  h: 1 / 24, hr: 1 / 24, hrs: 1 / 24, hour: 1 / 24, hours: 1 / 24,
  d: 1, day: 1, days: 1,
  w: 7, week: 7, weeks: 7
};

function num(raw) {
  if (raw == null) return null;
  const n = parseFloat(String(raw).replace(',', '.').replace(/^\./, '0.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseAmount(text) {
  const t = String(text || '');
  const labeled = t.match(/(?:^|[\s:])(\.\d+|\d+\.\d+|\d+)\s*(?:kaspa|kas)\b/i);
  if (labeled) return num(labeled[1]);
  if (parseTicker(t)) return null;
  const afterVerb = t.match(/\b(?:lock|timelock|escrow|send|pay|hold|freeze|vault|stake|deposit)\s+(?:for\s+)?(\.\d+|\d+\.\d+|\d+)/i);
  if (afterVerb) return num(afterVerb[1]);
  const bare = t.match(/^(?:[\s]*)(\.\d+|\d+\.\d+|\d+)\s*(?:k)?\s*$/i);
  if (bare) return num(bare[1]);
  return null;
}

export function parseTicker(text) {
  const t = String(text || '');
  const labeled = t.match(/(?:^|[\s:])(\.\d+|\d+\.\d+|\d+)\s*([A-Za-z][A-Za-z0-9]{2,9})\b/);
  if (!labeled) return null;
  const tick = labeled[2].toUpperCase();
  if (SKIP_TICK.has(tick)) return null;
  return tick;
}

export function parseTokenAmount(text) {
  const t = String(text || '');
  const labeled = t.match(/(?:^|[\s:])(\.\d+|\d+\.\d+|\d+)\s*([A-Za-z][A-Za-z0-9]{2,9})\b/);
  if (!labeled) return null;
  const tick = labeled[2].toUpperCase();
  if (SKIP_TICK.has(tick)) return null;
  const amount = num(labeled[1]);
  return amount ? { amount, tick } : null;
}

export function parseDuration(text) {
  const t = String(text || '');
  const m = t.match(/(\.\d+|\d+\.\d+|\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|s|m|h|d|w)\b/i);
  if (!m) return null;
  const value = num(m[1]);
  if (!value) return null;
  const unit = m[2].toLowerCase();
  const days = value * (UNIT_TO_DAYS[unit] ?? 1);
  const minutes = Math.max(1, Math.round(days * 1440));
  const label = `${value} ${unit}`;
  return { value, unit, days, minutes, label };
}

export function parseAddress(text) {
  const m = String(text || '').match(ADDR_RE);
  if (!m) return null;
  const a = m[0].toLowerCase();
  const parts = a.split(':');
  if (parts.length !== 2 || parts[0] !== 'kaspa') return null;
  if (!/^[qpz][a-z0-9]{20,}$/.test(parts[1])) return null;
  return a;
}

function detectType(text, prev) {
  const t = text.toLowerCase();
  if (/\b(escrow|buyer|seller|arbiter|arbitrator)\b/.test(t)) return 'escrow';
  if (/\b(multi-?sig|2\s*of\s*2|both must sign)\b/.test(t)) return 'multisig';
  if (/\b(sentinel|dead.?man|check-?in)\b/.test(t)) return 'timelock';
  if (/\b(send|pay|transfer)\b/.test(t) && parseAddress(t)) return 'send';
  if (/\b(lock|timelock|time\s*capsule|hold|freeze|vault)\b/.test(t) && parseTicker(t)) return 'kcc20lock';
  if (/\b(lock|timelock|time\s*capsule|hold|freeze|vault)\b/.test(t)) return 'timelock';
  if (parseDuration(t) && !parseAddress(t) && parseTicker(t)) return 'kcc20lock';
  if (parseDuration(t) && !parseAddress(t)) return 'timelock';
  return prev?.type || null;
}

export function parseIntent(text, prev = null) {
  const raw = normalizeChat(String(text || '').trim());
  if (!raw) return { error: 'empty' };

  const tokenAmt = parseTokenAmount(raw);
  const amountKas = parseAmount(raw) ?? prev?.params?.amountKas ?? null;
  const duration = parseDuration(raw) || (prev?.params?.lockMinutes || prev?.params?.lockDays
    ? {
        days: prev.params.lockDays,
        minutes: prev.params.lockMinutes,
        label: prev.params.durationLabel
      }
    : null);
  const address = parseAddress(raw) || prev?.params?.buyerAddress || prev?.params?.counterparty || prev?.params?.destination || null;
  const type = detectType(raw, prev);

  if (!type && !amountKas && !tokenAmt && !duration && !address) {
    return { error: 'unparsed', hint: 'Try: Lock 0.15 KAS for 3 minutes — or Lock 20 KKDAG for 3 minutes' };
  }

  const params = {};
  if (amountKas) params.amountKas = amountKas;
  if (tokenAmt) {
    params.amountToken = tokenAmt.amount;
    params.tick = tokenAmt.tick;
  } else if (prev?.params?.amountToken) {
    params.amountToken = prev.params.amountToken;
    if (prev.params.tick) params.tick = prev.params.tick;
  }
  const tickOnly = parseTicker(raw);
  if (tickOnly) params.tick = tickOnly;
  if (duration) {
    params.lockDays = duration.days;
    params.lockMinutes = duration.minutes;
    params.durationLabel = duration.label;
  }
  if (type === 'escrow' && address) params.buyerAddress = address;
  if (type === 'multisig' && address) params.counterparty = address;
  if (type === 'send' && address) params.destination = address;

  const missing = [];
  if (!type) missing.push('what to do (lock, escrow, send, freeze, multisig)');
  if (type === 'kcc20lock') {
    if (!params.amountToken) missing.push('token amount (e.g. 20 KKDAG)');
    if (!params.tick) missing.push('KCC20 ticker');
    if (!params.lockMinutes && !params.lockDays) missing.push('how long (e.g. 3 minutes)');
  } else {
    if (!params.amountKas) missing.push('amount in KAS');
    if (type === 'timelock' && !params.lockMinutes && !params.lockDays) missing.push('how long (e.g. 3 minutes)');
  }
  if (type === 'escrow' && !params.buyerAddress) missing.push('buyer kaspa: address');
  if (type === 'multisig' && !params.counterparty) missing.push('counterparty kaspa: address');
  if (type === 'send' && !params.destination) missing.push('destination kaspa: address');

  return {
    type: type || 'timelock',
    params,
    missing,
    complete: missing.length === 0,
    source: 'local'
  };
}

export function describeIntent(intent) {
  if (!intent) return '';
  const p = intent.params || {};
  const amt = p.amountKas != null ? `${p.amountKas} KAS` : 'an amount';
  const tokenAmt = p.amountToken != null ? `${p.amountToken} ${p.tick || 'KCC20'}` : null;
  const dur = p.durationLabel || (p.lockMinutes ? `${p.lockMinutes} minutes` : (p.lockDays ? `${p.lockDays} days` : 'a duration'));
  if (intent.type === 'kcc20lock') return `KCC20 freeze: lock ${tokenAmt || ('KCC20' + (p.tick ? ' ' + p.tick : ''))} for ${dur}. Same CLTV as native KAS.`;
  if (intent.type === 'timelock') return `Time capsule: lock ${amt} for ${dur}.`;
  if (intent.type === 'escrow') return `Escrow ${amt} for buyer ${p.buyerAddress || '…'}.`;
  if (intent.type === 'multisig') return `2-of-2 vault of ${amt} with ${p.counterparty || 'a counterparty'}.`;
  if (intent.type === 'send') return `Send ${amt} to ${p.destination || '…'}.`;
  return `${intent.type}: ${amt}`;
}

export function askFor(missing) {
  if (!missing?.length) return '';
  const first = missing[0];
  if (first.includes('token amount')) return 'How many tokens? Example: “20 KKDAG”.';
  if (first.includes('KCC20 ticker')) return 'Which KCC20 ticker? Example: KKDAG.';
  if (first.includes('amount')) return 'How much KAS? You can say “.15 kas”.';
  if (first.includes('how long')) return 'How long should it stay locked? Example: “3 minutes” or “30 days”.';
  if (first.includes('buyer')) return 'Paste the buyer’s kaspa: address.';
  if (first.includes('counterparty')) return 'Paste the other signer’s kaspa: address.';
  if (first.includes('destination')) return 'Paste the destination kaspa: address.';
  return `I still need ${first}.`;
}

export function parseDurationField(raw) {
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(String(raw).trim())) {
    const days = num(raw);
    return days ? { days, minutes: Math.max(1, Math.round(days * 1440)), label: `${days} days` } : null;
  }
  return parseDuration(raw);
}

const WORD_FIX = {
  loc: 'lock', lok: 'lock', locck: 'lock', lokc: 'lock',
  freezee: 'freeze', freze: 'freeze', frreze: 'freeze', frze: 'freeze',
  capusle: 'capsule', capsle: 'capsule', capsul: 'capsule',
  minuts: 'minutes', minuite: 'minutes', minuets: 'minutes', mins: 'minutes',
  ours: 'hours', hr: 'hours', hrs: 'hours',
  escroww: 'escrow', escro: 'escrow',
  sentinal: 'sentinel',
  mutlisig: 'multisig', multisgn: 'multisig',
  kdag: 'KKDAG', kkdag: 'KKDAG', kasnight: 'KKDAG', kknight: 'KKDAG',
  kronn: 'KRON',
  kaspa: 'KAS',
  transfert: 'transfer'
};

function editDist(a, b) {
  a = String(a); b = String(b);
  if (Math.abs(a.length - b.length) > 2) return 9;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array(b.length + 1);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

const KNOWN = ['lock', 'freeze', 'send', 'pay', 'escrow', 'multisig', 'sentinel', 'capsule', 'minutes', 'hours', 'days', 'kas', 'kkdag', 'kron', 'kpulse', 'vault', 'hold'];

export function normalizeChat(text) {
  let t = String(text || '').trim();
  t = t.replace(/(?:^|[^\d])(\.\d+)/g, (m, d) => m.replace(d, '0' + d));
  t = t.replace(/\b([A-Za-z][A-Za-z0-9]{1,11})\b/g, (w) => {
    const k = w.toLowerCase();
    if (WORD_FIX[k]) return WORD_FIX[k];
    if (k.length < 4) return w;
    let best = null, bestD = 2;
    for (const n of KNOWN) {
      const d = editDist(k, n);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best && bestD <= 1) return best === 'kkdag' ? 'KKDAG' : best;
    return w;
  });
  t = t.replace(/\bwallet\s*([12]|one|two)\b/ig, (_, n) => {
    const i = /2|two/i.test(n) ? 2 : 1;
    return 'wallet ' + i;
  });
  return t;
}

export function interpretVaultChat(text, prev = null) {
  const raw = String(text || '').trim();
  const norm = normalizeChat(raw);
  const low = norm.toLowerCase();
  if (/\b(dag.?knight|argent|covenant\+\+|getting ready|michael sutton|kip-?2)\b/i.test(low)) {
    return {
      kind: 'talk',
      text: 'Argent — vault agent for this wallet, getting ready for DAGKnight. I turn messy English into covenant actions this app can actually fund on mainnet: Time Capsule (KAS CLTV), KCC20 Freeze (SCRIPT_HASH + CLTV), escrow, 2-of-2. XMSS / Sentinel tiles use the same CLTV path today. Say what to lock.'
    };
  }
  if (/^(hi|hey|hello|yo|sup|help|what can you do|\?)\b/i.test(low) || low.length < 3) {
    return {
      kind: 'talk',
      text: 'Tell me in plain words. Examples: “lock 0.15 kas for 3 minutes”, “freeze 10 kdag 1 min”, “send 2 kas to wallet 2”. I fix typos.'
    };
  }
  const intent = parseIntent(norm, prev);
  return { kind: 'intent', intent, normalized: norm };
}
