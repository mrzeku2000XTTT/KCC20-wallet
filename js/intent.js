/* Local vault intent parser — does not depend on the remote LLM. */

const ADDR_RE = /kaspa:[a-z0-9]{20,}/i;
const SKIP_TICK = new Set([
  'KAS', 'KASPA', 'FOR', 'MIN', 'MINS', 'MINUTE', 'MINUTES', 'HOUR', 'HOURS', 'HRS',
  'DAY', 'DAYS', 'SEC', 'SECS', 'SECOND', 'SECONDS', 'WEEK', 'WEEKS',
  'LOCK', 'HOLD', 'SEND', 'PAY', 'THE', 'AND', 'WITH', 'THIS', 'THAT', 'FROM',
  'TIME', 'CAPSULE', 'FREEZE', 'VAULT', 'TOKEN', 'TOKENS',
  'RENT', 'HOUSE', 'CAR', 'NOTE', 'DATE', 'UNTIL', 'DUE', 'SAVE', 'SAVINGS', 'BILL'
]);

const LIFE_LABEL = {
  rent: 'House rent',
  car: 'Car note',
  spend: 'Spending',
  save: 'Savings'
};

const RENT_LABEL = {
  house: 'House rent',
  apartment: 'Apartment rent',
  room: 'Room rent',
  office: 'Office rent',
  storage: 'Storage rent',
  parking: 'Parking rent'
};

export function parseRentKind(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(apartment|apt|flat|condo)\b/.test(t)) return 'apartment';
  if (/\b(room|studio)\b/.test(t)) return 'room';
  if (/\b(office|shop|storefront|retail)\b/.test(t)) return 'office';
  if (/\b(storage|unit|garage)\b/.test(t)) return 'storage';
  if (/\b(parking|car\s*park)\b/.test(t)) return 'parking';
  if (/\b(house|home|housing)\b/.test(t)) return 'house';
  return null;
}

const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4,
  june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
};

export function parseLifeKind(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(rent|lease|landlord|apartment|house\s*rent|housing)\b/.test(t)) return 'rent';
  if (/\b(car\s*note|car\s*payment|auto\s*loan|vehicle|car\s+loan)\b/.test(t)) return 'car';
  if (/\b(sav(e|ing|ings)|emergency\s*fund|rainy\s*day)\b/.test(t)) return 'save';
  if (/\b(spend|spending|grocery|utilities|wifi|electric|bill)\b/.test(t)) return 'spend';
  return null;
}

export function parseUnlockAnytime(text) {
  return /\b(unlock\s+any\s*time|whenever\s+i\s+say|can\s+unlock|no\s+timer|flexible|unlock\s+whenever|i\s+can\s+unlock)\b/i.test(String(text || ''));
}

function parseClock(text) {
  const m = String(text || '').match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return { h: 0, mi: 0, hit: false };
  let h = Number(m[1]);
  const mi = m[2] != null ? Number(m[2]) : 0;
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!ap && h > 23) return { h: 0, mi: 0, hit: false };
  return { h, mi, hit: true };
}

function dueStamp(y, mo, d, h, mi) {
  const dt = new Date(Date.UTC(y, mo, d, h, mi, 0));
  if (Number.isNaN(dt.getTime())) return null;
  const p = n => String(n).padStart(2, '0');
  return { at: dt.getTime(), label: `${y}-${p(mo + 1)}-${p(d)} ${p(h)}:${p(mi)} UTC` };
}

export function parseDueAt(text) {
  const t = String(text || '');
  const clock = parseClock(t);
  let m = t.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    const h = m[4] != null ? Number(m[4]) : clock.h;
    const mi = m[5] != null ? Number(m[5]) : clock.mi;
    return dueStamp(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi);
  }
  m = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    const d = Number(m[2]);
    let y = m[3] ? Number(m[3]) : new Date().getUTCFullYear();
    let s = dueStamp(y, mo, d, clock.h, clock.mi);
    if (s && s.at < Date.now() - 3600000 && !m[3]) s = dueStamp(y + 1, mo, d, clock.h, clock.mi);
    return s;
  }
  m = t.match(/\b(?:until|on|by)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (m) {
    const d = Number(m[1]);
    const now = new Date();
    let y = now.getUTCFullYear();
    let mo = now.getUTCMonth();
    let s = dueStamp(y, mo, d, clock.h, clock.mi);
    if (s && s.at < Date.now()) {
      mo += 1;
      if (mo > 11) { mo = 0; y += 1; }
      s = dueStamp(y, mo, d, clock.h, clock.mi);
    }
    return s;
  }
  if (/\btomorrow\b/i.test(t)) {
    const n = new Date(Date.now() + 86400000);
    return dueStamp(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), clock.hit ? clock.h : 12, clock.mi);
  }
  const week = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  m = t.match(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (m) {
    const want = week.indexOf(m[1].toLowerCase());
    const now = new Date();
    let add = (want - now.getUTCDay() + 7) % 7;
    if (add === 0) add = 7;
    const n = new Date(Date.now() + add * 86400000);
    return dueStamp(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), clock.hit ? clock.h : 12, clock.mi);
  }
  if (/\bnext\s+month\b/i.test(t)) {
    const now = new Date();
    let y = now.getUTCFullYear();
    let mo = now.getUTCMonth() + 1;
    if (mo > 11) { mo = 0; y += 1; }
    return dueStamp(y, mo, Math.min(now.getUTCDate(), 28), clock.hit ? clock.h : 12, clock.mi);
  }
  return null;
}

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

const HARD_TYPES = { send: 1, sentinel: 1, escrow: 1, multisig: 1, recurring: 1, hashlock: 1, onramp: 1, xmss: 1, silverscript: 1, kcc20lock: 1 };

export function normalizeVaultType(raw) {
  const s = String(raw || '').toLowerCase().replace(/[_/]+/g, ' ').replace(/['’]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const exact = {
    send: 'send', pay: 'send', transfer: 'send',
    timelock: 'timelock', 'time lock': 'timelock', 'time capsule': 'timelock', capsule: 'timelock', lock: 'timelock',
    life: 'life', rent: 'life',
    escrow: 'escrow', 'hold for buyer': 'escrow',
    multisig: 'multisig', 'multi sig': 'multisig', 'two keys': 'multisig', '2 of 2': 'multisig', '2of2': 'multisig',
    kcc20lock: 'kcc20lock', kcc20freeze: 'kcc20lock', freeze: 'kcc20lock', 'freeze tokens': 'kcc20lock',
    sentinel: 'sentinel', deadman: 'sentinel', 'dead man': 'sentinel', 'dead man switch': 'sentinel',
    'deadmans switch': 'sentinel', dms: 'sentinel', heir: 'sentinel', deadmanswitch: 'sentinel',
    recurring: 'recurring', subscription: 'recurring', x402: 'recurring', 'pay on a timer': 'recurring',
    hashlock: 'hashlock', 'hash lock': 'hashlock', htlc: 'hashlock', 'secret lock': 'hashlock',
    onramp: 'onramp', 'on ramp': 'onramp', 'card sale': 'onramp', cardsale: 'onramp', 'debit card': 'onramp',
    xmss: 'xmss', 'xmss vault': 'xmss',
    silverscript: 'silverscript', silverc: 'silverscript', 'silver script': 'silverscript'
  };
  if (exact[s]) return exact[s];
  if (/dead\s*mans?|deadmanswitch|sentinel|\bdms\b|\bheir\b|check\s*in/.test(s)) return 'sentinel';
  if (/time\s*capsule|time\s*lock/.test(s)) return 'timelock';
  if (/multi\s*sig|2\s*of\s*2/.test(s)) return 'multisig';
  if (/escrow/.test(s)) return 'escrow';
  if (/on\s*ramp|card\s*sale|debit\s*card/.test(s)) return 'onramp';
  if (/hash\s*lock|htlc/.test(s)) return 'hashlock';
  if (/xmss|post\s*quantum/.test(s)) return 'xmss';
  if (/silver\s*script|silverc|\.sil\b/.test(s)) return 'silverscript';
  if (/recurring|x402/.test(s)) return 'recurring';
  if (/kcc20\s*freeze|freeze tokens/.test(s)) return 'kcc20lock';
  return s.replace(/\s+/g, '');
}

function isSentinelTalk(t) {
  t = String(t || '').toLowerCase();
  return /sentinel|dead\s*-?\s*mans?|deadmanswitch|\bdms\b|check-?in|when i die|if i (die|pass)|after i.?m gone|inherit|\bheir\b|beneficiar/.test(t);
}

function detectType(text, prev) {
  const t = text.toLowerCase();
  if (/\b(escrow|buyer|seller|arbiter|arbitrator)\b/.test(t)) return 'escrow';
  if (/\b(multi-?sig|2\s*of\s*2|both must sign)\b/.test(t)) return 'multisig';
  if (isSentinelTalk(t)) return 'sentinel';
  if (/\b(changenow|change\s*now)\b/.test(t) || (/\b(usdc|usdt)\b/.test(t) && /\b(kas|kaspa|swap|buy)\b/.test(t))) return 'changenow';
  if (/\b(on-?ramp|card\s*sale|buy\s+kas(pa)?\s+with\s+(a\s+)?(card|debit|dollar)|debit\s*card)\b/.test(t)) return 'onramp';
  if (/\b(xmss|post-?quantum|public kit)\b/.test(t)) return 'xmss';
  if (/\b(silverscript|silverc|sil\s*abi|\.sil\b|kcc-?01)\b/.test(t) || /"schema_version"\s*:\s*1/.test(t)) return 'silverscript';
  if (/\b(recurring|subscription|x402)\b/.test(t)) return 'recurring';
  if (/\b(hash\s*lock|htlc|hash vault)\b/.test(t)) return 'hashlock';
  if (/\b(send|pay|transfer)\b/.test(t) && parseAddress(t)) return 'send';
  if (/\b(send|pay|transfer)\b/.test(t) && !/\b(lock|hold|freeze|vault|sentinel|heir|dead.?man)\b/.test(t)) return 'send';
  if (parseLifeKind(t) || parseUnlockAnytime(t) || (/\b(lock|hold|save|put\s+aside)\b/.test(t) && parseDueAt(t))) return 'life';
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
  const address = parseAddress(raw) || prev?.params?.buyerAddress || prev?.params?.counterparty || prev?.params?.destination || prev?.params?.beneficiary || prev?.params?.payee || null;
  const lifeKind = parseLifeKind(raw) || prev?.params?.lifeKind || null;
  const due = parseDueAt(raw) || (prev?.params?.dueAt ? { at: prev.params.dueAt, label: prev.params.dueLabel } : null);
  const unlockAnytime = parseUnlockAnytime(raw) || (!!prev?.params?.unlockAnytime && !due);
  let type = detectType(raw, prev);
  if (prev?.type) {
    const prevT = normalizeVaultType(prev.type);
    if (HARD_TYPES[prevT] && !type) type = prevT;
    if (HARD_TYPES[type] && HARD_TYPES[prevT] && type !== prevT && isSentinelTalk(raw)) type = 'sentinel';
  }
  type = normalizeVaultType(type) || type;
  if (!HARD_TYPES[type] && (lifeKind || unlockAnytime || (due && amountKas))) type = 'life';

  if (!type && !amountKas && !tokenAmt && !duration && !address && !lifeKind && !due) {
    return { error: 'unparsed', hint: 'Try: Lock 1000 KAS for rent until September 1 2026 9:00 UTC' };
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
  if (type === 'life') {
    params.lifeKind = lifeKind || (tokenAmt ? 'spend' : null) || prev?.params?.lifeKind || null;
    if (params.lifeKind === 'control') params.lifeKind = 'spend';
    const rentKind = parseRentKind(raw) || prev?.params?.rentKind || null;
    if (rentKind) params.rentKind = rentKind;
    if (params.lifeKind === 'rent' && rentKind) params.lifeLabel = RENT_LABEL[rentKind] || 'House rent';
    else if (params.lifeKind) params.lifeLabel = LIFE_LABEL[params.lifeKind] || 'Real life';
    params.unlockAnytime = !!unlockAnytime;
    if (tokenAmt) {
      params.amountToken = tokenAmt.amount;
      params.tick = tokenAmt.tick;
      delete params.amountKas;
      if (params.unlockAnytime) params.unlockAnytime = false;
    }
    if (due && !params.unlockAnytime) {
      params.dueAt = due.at;
      params.dueLabel = due.label;
      const mins = Math.max(1, Math.round((due.at - Date.now()) / 60000));
      params.lockMinutes = mins;
      params.lockDays = mins / 1440;
      params.durationLabel = 'until ' + due.label;
    }
  }
  if (type === 'escrow' && address) params.buyerAddress = address;
  if (type === 'multisig' && address) params.counterparty = address;
  if (type === 'send' && address) params.destination = address;
  if (type === 'sentinel' && address) params.beneficiary = address;
  if (type === 'sentinel' && !params.beneficiary && params.destination) params.beneficiary = params.destination;
  if (type === 'recurring' && address) params.payee = address;
  if (type === 'hashlock' && address) params.receiver = address;
  if (type === 'onramp') {
    if (address) params.receiver = address;
    if (!params.lockMinutes && !params.lockDays) {
      params.lockMinutes = 5;
      params.lockDays = 5 / 1440;
      params.durationLabel = '5 minutes';
    }
  }
  if (type === 'silverscript') {
    if (prev?.params?.artifact) params.artifact = prev.params.artifact;
    if (!params.artifact) {
      const blob = String(raw || '').match(/\{[\s\S]*"schema_version"\s*:\s*1[\s\S]*\}/);
      if (blob) {
        try {
          const silJson = JSON.parse(blob[0]);
          if (silJson?.contracts) params.artifact = silJson;
        } catch {}
      }
    }
  }

  const missing = [];
  if (!type) missing.push('what to do (lock, escrow, send, freeze, rent, savings)');
  if (type === 'kcc20lock') {
    if (!params.amountToken) missing.push('token amount (e.g. 20 KKDAG)');
    if (!params.tick) missing.push('KCC20 ticker');
    if (!params.lockMinutes && !params.lockDays) missing.push('how long (e.g. 3 minutes)');
  } else if (type === 'life') {
    if (!params.lifeKind) missing.push('which real-life case (house rent, car note, spending, or savings)');
    if (params.lifeKind === 'rent' && !params.rentKind) missing.push('what kind of rent (house, apartment, room, office, storage, parking)');
    if (!(params.amountToken && params.tick) && !params.amountKas) {
      missing.push('amount in KAS or a KCC20 amount like 50 KKDAG');
    }
    if (params.tick && params.amountToken && !params.unlockAnytime && !params.lockMinutes && !params.dueAt) {
      missing.push('when it is due (KCC20 locks until a date)');
    } else if (!params.tick && !params.unlockAnytime && !params.lockMinutes && !params.dueAt) {
      missing.push('when it is due (a date/time, or say unlock anytime)');
    }
    if (params.dueAt && params.dueAt < Date.now() - 60000 && !params.unlockAnytime) {
      missing.push('a future due date');
    }
  } else if (type === 'silverscript') {
    if (!params.amountKas) missing.push('amount in KAS');
    if (!params.artifact) missing.push('silverc JSON artifact (schema_version 1). Compile .sil with silverc — Argent does not compile .sil');
  } else if (type === 'changenow') {
    if (tokenAmt) {
      params.amountToken = tokenAmt.amount;
      params.tick = tokenAmt.tick;
      params.from = tokenAmt.tick;
    }
    if (!params.amountToken && !params.amountKas) missing.push('how much USDC or USDT to send (e.g. 20 USDC)');
  } else {
    if (!params.amountKas) missing.push('amount in KAS');
    if ((type === 'timelock' || type === 'sentinel' || type === 'recurring' || type === 'hashlock') && !params.lockMinutes && !params.lockDays) missing.push('how long (e.g. 3 minutes)');
  }
  if ((type === 'hashlock' || type === 'onramp') && !params.receiver) missing.push('buyer kaspa: address who can claim');
  if (type === 'escrow' && !params.buyerAddress) missing.push('buyer kaspa: address');
  if (type === 'multisig' && !params.counterparty) missing.push('counterparty kaspa: address');
  if (type === 'send' && !params.destination) missing.push('destination kaspa: address');
  if (type === 'sentinel' && !params.beneficiary) missing.push('heir / beneficiary kaspa: address');
  if (type === 'recurring' && !params.payee) missing.push('payee kaspa: address');

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
  const amt = (p.amountToken && p.tick)
    ? `${p.amountToken} ${p.tick}`
    : (p.amountKas != null ? `${p.amountKas} KAS` : 'an amount');
  const tokenAmt = p.amountToken != null ? `${p.amountToken} ${p.tick || 'KCC20'}` : null;
  const dur = p.durationLabel || (p.lockMinutes ? `${p.lockMinutes} minutes` : (p.lockDays ? `${p.lockDays} days` : 'a duration'));
  if (intent.type === 'life') {
    const kind = p.lifeLabel || LIFE_LABEL[p.lifeKind] || 'Real life';
    if (p.unlockAnytime) return `${kind}: lock ${amt}. You can unlock anytime with PIN.`;
    return `${kind}: lock ${amt} until ${p.dueLabel || dur}. Cannot unlock early.`;
  }
  if (intent.type === 'kcc20lock') return `KCC20 freeze: lock ${tokenAmt || ('KCC20' + (p.tick ? ' ' + p.tick : ''))} for ${dur}. Same CLTV as native KAS.`;
  if (intent.type === 'timelock') return `Time capsule: lock ${amt} for ${dur}.`;
  if (intent.type === 'sentinel') return `Sentinel: lock ${amt} for ${dur}, check-in or release to heir.`;
  if (intent.type === 'recurring') return `Recurring: lock ${amt} and pay on each check-in.`;
  if (intent.type === 'hashlock') return `Hash vault: lock ${amt} for ${dur} (secret or refund).`;
  if (intent.type === 'onramp') return `Card sale: lock ${amt} for ${dur} for buyer ${p.receiver || '…'}. They claim after they pay. Unpaid refunds to you.`;
  if (intent.type === 'escrow') return `Escrow ${amt} for buyer ${p.buyerAddress || '…'}.`;
  if (intent.type === 'multisig') return `2-of-2 vault of ${amt} with ${p.counterparty || 'a counterparty'}.`;
  if (intent.type === 'send') return `Send ${amt} to ${p.destination || '…'}.`;
  if (intent.type === 'silverscript') return `SilverScript: lock ${amt} into silverc bytecode (P2SH). Spend with a KCC-01 entry. Argent does not compile .sil.`;
  if (intent.type === 'changenow') return `ChangeNOW floating swap: send ${p.amountToken || p.amountKas || 'an amount'} ${p.from || p.tick || 'USDC'} — KAS pays out to this wallet.`;
  return `${intent.type}: ${amt}`;
}

export function askFor(missing) {
  if (!missing?.length) return '';
  const first = missing[0];
  if (first.includes('what kind of rent')) return 'What kind of rent — house, apartment, room, office, storage, or parking?';
  if (first.includes('which real-life case')) return 'Which case — house rent, car note, spending, or savings?';
  if (first.includes('token amount')) return 'How many tokens? Example: “20 KKDAG”.';
  if (first.includes('KCC20 ticker')) return 'Which KCC20 ticker? Example: KKDAG.';
  if (first.includes('KAS or a KCC20')) return 'How much? Example: “1000 kas” or “50 KKDAG”.';
  if (first.includes('amount')) return 'How much KAS? You can say “.15 kas”.';
  if (first.includes('when it is due') || first.includes('future due')) return 'When is it due? Example: “September 1 2026 9:00 UTC”, or say “unlock anytime”.';
  if (first.includes('how long')) return 'How long should it stay locked? Example: “3 minutes” or “30 days”.';
  if (first.includes('who can claim') || first.includes('buyer kaspa')) return 'Paste the buyer’s kaspa:q. Only that address can claim this sale lock.';
  if (first.includes('buyer')) return 'Paste the buyer’s kaspa: address.';
  if (first.includes('counterparty')) return 'Paste the other signer’s kaspa: address.';
  if (first.includes('destination')) return 'Paste the destination kaspa: address.';
  if (first.includes('heir') || first.includes('beneficiary')) return 'Paste the heir’s kaspa:q address (grandson, etc). Timeout pays that address.';
  if (first.includes('payee')) return 'Paste the payee’s kaspa: address.';
  if (first.includes('silverc') || first.includes('.sil')) return 'Paste the silverc JSON (schema_version 1). Compile with silverc; Argent does not compile .sil.';
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

const KNOWN = ['lock', 'freeze', 'send', 'pay', 'escrow', 'multisig', 'sentinel', 'capsule', 'minutes', 'hours', 'days', 'kas', 'kkdag', 'kron', 'kpulse', 'vault', 'hold', 'rent', 'until', 'due', 'save', 'sale', 'onramp', 'deadman', 'card', 'silverscript', 'silverc'];

export function normalizeChat(text) {
  let t = String(text || '').trim();
  t = t.replace(/(?:^|[^\d])(\.\d+)/g, (m, d) => m.replace(d, '0' + d));
  t = t.replace(/\b([A-Za-z][A-Za-z0-9]{1,11})\b/g, (w, _g, offset, whole) => {
    if (String(whole || '').charAt((offset || 0) + w.length) === ':') return w;
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
      text: 'Tell me in plain words. Examples: “lock 1000 kas for rent until September 1 2026 9:00 UTC”, “save 200 kas, unlock anytime”, “lock 0.15 kas for 3 minutes”.'
    };
  }
  const intent = parseIntent(norm, prev);
  return { kind: 'intent', intent, normalized: norm };
}
