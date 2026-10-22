/* Smoke the official @kasparocket/sdk against live mainnet. */
import { KaspaRocket, TOKEN_DECIMALS, RAW_PER_TOKEN } from '../vendor/kasparocket/dist/esm/index.js';

const kr = new KaspaRocket({
  network: 'mainnet',
  apiUrl: 'https://kasparocket.fun/pro-api',
  catalogueUrl: 'https://kasparocket.fun',
  timeoutMs: 15000,
  maxRetries: 1
});

const health = await kr.health();
if (health?.network !== 'mainnet' && health?.status !== 'ok') {
  throw new Error('health not mainnet: ' + JSON.stringify(health));
}

const proto = await kr.protocol();
if (Number(proto?.token?.decimals) !== TOKEN_DECIMALS) {
  throw new Error('protocol decimals ' + proto?.token?.decimals);
}
if (BigInt(proto?.token?.rawPerToken) !== RAW_PER_TOKEN) {
  throw new Error('rawPerToken mismatch');
}

const cat = await kr.catalogue.tokens();
if (!Array.isArray(cat) || !cat.length) throw new Error('empty catalogue');
const then = cat.find(t => t.token_id === 'd8c4356d20712463bbf2da82a5411c3aea18fec024a2b9c014bba1b4524cc8c2');
if (!then) throw new Error('THEN graduate missing from catalogue');

const holder = 'kaspa:qz97dvf3m9uxx8g9u2g934fctashztwjw0442j2gtadq267r556avrcps65y9';
const bag = await kr.holdings(holder);
const rows = bag?.tokens || [];
const thenHold = rows.find(t => t.kcc20_covenant_id === then.token_id);
if (!thenHold || !(Number(thenHold.balance_tokens) > 0)) {
  throw new Error('THEN holder bag missing');
}

console.log('PASS kasparocket sdk 0.1.6 mainnet');
console.log('  health', health.network, health.status);
console.log('  catalogue', cat.length, 'THEN', then.ticker);
console.log('  holdings', rows.length, 'THEN raw', thenHold.balance_tokens);
