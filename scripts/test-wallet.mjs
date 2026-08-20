import puppeteer from 'file:///C:/Users/mrzek/kaspa-covenant-wallet/kaspa-covenant-wallet/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = 'http://127.0.0.1:4173/';
const fail = [];
const ok = [];
const log = (pass, name, extra = '') => {
  (pass ? ok : fail).push(name);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=430,932']
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));

await page.goto(base, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForSelector('#btn-create', { timeout: 20000 });
log(await page.$('#bg-video'), 'video background present');

await page.click('#btn-create');
await page.waitForFunction(() => document.getElementById('page-home')?.classList.contains('active'), { timeout: 30000 });
const saved = await page.$('#sheet-ok');
if (saved) await saved.click();
await new Promise(r => setTimeout(r, 600));
log(await page.$('#live-pill'), 'live pill on home');
log(await page.$('#card-bal'), 'balance card');

await page.click('#btn-receive');
await page.waitForSelector('#qr-box', { timeout: 15000 });
await new Promise(r => setTimeout(r, 900));
const recv = await page.evaluate(() => ({
  status: document.getElementById('recv-status')?.textContent || '',
  qr: !!document.querySelector('#qr-box canvas, #qr-box img'),
  addr: document.querySelector('#sheet-body .mono')?.textContent || ''
}));
log(recv.qr, 'receive QR rendered');
log(recv.addr.startsWith('kaspa:'), 'receive address is kaspa:', recv.addr.slice(0, 18));
log(/Watching|Received/.test(recv.status), 'receive is watching chain', recv.status);

await page.click('#sheet-ok');
await new Promise(r => setTimeout(r, 300));

await page.click('#btn-send');
await page.waitForSelector('#send-dest', { timeout: 8000 });
await page.evaluate(() => { document.getElementById('send-dest').value = 'not-an-address'; document.getElementById('send-amount').value = '0.2'; });
await page.click('#sheet-ok');
await new Promise(r => setTimeout(r, 500));
const toast1 = await page.evaluate(() => document.querySelector('.toast')?.textContent || '');
log(/Invalid/i.test(toast1), 'send rejects bad address', toast1);

await page.evaluate(() => {
  document.getElementById('send-dest').value = 'kaspa:qzrq7k77rt0qr4atxgufyv9zrx7p0fn57ry74lcwfwz90y3t9jhnkdvkrfjjl';
  document.getElementById('send-amount').value = '0.2';
});
await page.click('#sheet-ok');
await new Promise(r => setTimeout(r, 1200));
const toast2 = await page.evaluate(() => document.querySelector('.toast')?.textContent || '');
log(/UTXO|enough|Need|Invalid/i.test(toast2) || !!document.querySelector('#sheet-title'), 'send handles empty/insufficient UTXOs', toast2);

await page.evaluate(() => document.getElementById('sheet-overlay').classList.remove('open'));

await page.click('.tab[data-tab="vault"]');
await new Promise(r => setTimeout(r, 400));
await page.type('#chat-input', 'Lock .15 KAS for 3 minutes');
await page.click('#chat-send');
await page.waitForFunction(() => !!document.querySelector('[data-build-intent]'), { timeout: 15000 });
const summary = await page.evaluate(() => document.querySelector('#chat-log .bubble.ai:last-child')?.innerText || '');
log(/0\.15/.test(summary) && /3 minute/i.test(summary), 'vault parser lock .15 for 3 minutes', summary.replace(/\s+/g, ' ').slice(0, 120));

await page.click('[data-build-intent]');
await page.waitForFunction(() => (document.getElementById('sheet-title')?.textContent || '').includes('ready'), { timeout: 20000 });
const vaultUi = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#sheet-body .kv')].map(el => el.innerText);
  return { title: document.getElementById('sheet-title')?.textContent, rows };
});
const addrRow = vaultUi.rows.find(r => /kaspa:/i.test(r)) || '';
const vaultAddr = (addrRow.match(/kaspa:[a-z0-9]+/i) || [''])[0];
log(vaultAddr.startsWith('kaspa:'), 'vault built a real P2SH address', vaultAddr.slice(0, 24));
log(!/computed_on_client/.test(vaultAddr), 'vault address is not the backend stub');

const valid = await page.evaluate((a) => window.__kcc.isValidKaspaAddress(a), vaultAddr);
log(valid, 'generated vault address checksums');

await page.click('#sheet-ok');
await new Promise(r => setTimeout(r, 800));
const fundToast = await page.evaluate(() => document.querySelector('.toast')?.textContent || '');
log(/UTXO|enough|Need|Fund/i.test(fundToast) || !!document.getElementById('send-dest') || (document.getElementById('sheet-title')?.textContent || '').includes('Fund'), 'fund vault asks for KAS or opens fund review', fundToast);

const localParse = await page.evaluate(() => {
  const a = window.__kcc.parseIntent('Lock .15 KAS for 3 minutes');
  const b = window.__kcc.parseIntent('.15 kas', a);
  return { a: a.complete && a.params.amountKas === 0.15 && a.params.lockMinutes === 3, b: b.complete };
});
log(localParse.a && localParse.b, 'follow-up .15 kas still parses');

await browser.close();
console.log(`\n${ok.length} passed, ${fail.length} failed`);
if (fail.length) process.exit(1);
