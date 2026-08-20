import puppeteer from 'file:///C:/Users/mrzek/kaspa-covenant-wallet/kaspa-covenant-wallet/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(180000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

await page.goto('http://127.0.0.1:4173/?v=7', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#btn-create');
await page.click('#btn-create');
await page.waitForFunction(() => document.getElementById('page-home')?.classList.contains('active'));
const ok = await page.$('#sheet-ok');
if (ok) await ok.click();

console.log('pinging public node…');
const ping = await page.evaluate(async () => {
  try {
    return await window.__kcc.pingPublicNode();
  } catch (e) {
    return { error: e.message || String(e) };
  }
});
console.log(JSON.stringify(ping, null, 2));
await browser.close();

if (ping.error) {
  console.log('FAIL node connect');
  process.exit(1);
}
if (!String(ping.networkId).includes('mainnet')) {
  console.log('FAIL not mainnet');
  process.exit(1);
}
if (!ping.virtualDaaScore) {
  console.log('FAIL no DAA');
  process.exit(1);
}
console.log('PASS connected to', ping.url, 'synced=', ping.isSynced, 'daa=', ping.virtualDaaScore);
