import puppeteer from 'file:///C:/Users/mrzek/kaspa-covenant-wallet/kaspa-covenant-wallet/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});
const page = await browser.newPage();
page.setDefaultTimeout(120000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('#btn-create');
await page.click('#btn-create');
await page.waitForFunction(() => document.getElementById('page-home')?.classList.contains('active'));
const ok = await page.$('#sheet-ok');
if (ok) await ok.click();

const result = await page.evaluate(async () => {
  const out = {};
  try {
    const k = await window.__kccLoad();
    out.loaded = !!(k && k.createTransactions && k.PrivateKey && k.RpcClient);
    out.sompi = String(k.kaspaToSompi('0.1'));
  } catch (e) {
    out.error = e.message || String(e);
  }
  return out;
});
console.log('SDK', JSON.stringify(result));
if (!result.loaded) {
  console.log('FAIL wasm/sdk');
  await browser.close();
  process.exit(1);
}
console.log('PASS official Kaspa engine loaded, 0.1 KAS =', result.sompi, 'sompi');
await browser.close();
