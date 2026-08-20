import puppeteer from 'file:///C:/Users/mrzek/kaspa-covenant-wallet/kaspa-covenant-wallet/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const out = 'C:/Users/mrzek/kaspa-xmss-covenants/wallet/assets';

const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=430,932']
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForSelector('#btn-create', { timeout: 20000 });
await page.screenshot({ path: `${out}/verify-lock.png` });

await page.click('#btn-create');
await page.waitForFunction(() => document.getElementById('page-home')?.classList.contains('active'), { timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));
const saved = await page.$('#sheet-ok');
if (saved) await saved.click();
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: `${out}/verify-home.png` });

await page.click('.tab[data-tab="tokens"]');
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: `${out}/verify-tokens.png` });

await page.click('.tab[data-tab="vault"]');
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: `${out}/verify-vault.png` });

await page.click('.tab[data-tab="home"]');
await new Promise(r => setTimeout(r, 400));
await page.click('#btn-receive');
await page.waitForSelector('#qr-box', { timeout: 15000 });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: `${out}/verify-receive.png` });

const addr = await page.evaluate(() => window.localStorage.getItem('kcc20_wallet_v1'));
console.log('WALLET', addr ? 'created' : 'missing');
console.log('OK screenshots written');
await browser.close();
