import puppeteer from 'file:///C:/Users/mrzek/kaspa-covenant-wallet/kaspa-covenant-wallet/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import fs from 'node:fs';

const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const edge = candidates.find(p => fs.existsSync(p));
if (!edge) {
  console.error('Edge not found');
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://127.0.0.1:4173/?v=31', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#btn-create');
const lockTitle = await page.$eval('#nav-title', el => el.textContent);
await page.click('#btn-create');
await page.waitForFunction(() => document.getElementById('page-home')?.classList.contains('active'));
const ok = await page.$('#sheet-ok');
if (ok) await ok.click();
await page.waitForSelector('#card-bal');

const home = await page.evaluate(() => ({
  title: document.getElementById('nav-title')?.textContent,
  bal: document.getElementById('card-bal')?.textContent,
  tabs: !!document.getElementById('tabbar')?.classList.contains('show'),
  kasLogo: !!document.querySelector('[data-token-key="native:KAS"] img, [data-ticker="KAS"] img'),
  utxo: document.getElementById('utxo-count')?.textContent,
  compound: !!document.getElementById('btn-compound')
}));

await page.click('.tab[data-tab="tokens"]');
await page.waitForSelector('#page-tokens.active');
await page.click('#at-tokens-btn');
const tokens = await page.evaluate(() => ({
  native: (document.getElementById('token-native')?.innerText || '').slice(0, 80),
  kcc: (document.getElementById('token-list')?.innerText || '').slice(0, 120),
  krc: (document.getElementById('token-krc20')?.innerText || '').slice(0, 80),
  kasImg: !!document.querySelector('#token-native img'),
  book: !!document.getElementById('at-book'),
  launch: !!document.getElementById('at-launch-go'),
  agent: !!document.getElementById('ag-toggle')
}));

await page.click('.tab[data-tab="vault"]');
await page.waitForSelector('#page-vault.active');
const vault = await page.evaluate(() => ({
  create: !document.getElementById('vault-create')?.classList.contains('hidden'),
  products: document.querySelectorAll('#vault-products [data-product]').length,
  mineHidden: document.getElementById('vault-mine-wrap')?.classList.contains('hidden'),
  chat: !!document.getElementById('chat-input')
}));

await page.click('#vault-seg [data-vtab="mine"]');
const mine = await page.evaluate(() => ({
  mineHidden: document.getElementById('vault-mine-wrap')?.classList.contains('hidden'),
  sweep: !!document.getElementById('btn-sweep-now'),
  createHidden: document.getElementById('vault-create')?.classList.contains('hidden')
}));

await page.click('.tab[data-tab="activity"]');
const act = await page.evaluate(() => document.getElementById('page-activity')?.classList.contains('active'));

await page.click('.tab[data-tab="home"]');
await page.click('#btn-send');
await page.waitForSelector('#send-dest');
const sendSheet = await page.evaluate(() => !!document.getElementById('send-dest'));

console.log(JSON.stringify({ lockTitle, home, tokens, vault, mine, act, sendSheet, errors }, null, 2));
await browser.close();

const fail = [];
if (!home.tabs) fail.push('tabbar hidden');
if (!home.kasLogo) fail.push('kas logo missing');
if (vault.products < 4) fail.push('vault products missing');
if (!mine.sweep) fail.push('sweep button missing');
if (!mine.createHidden) fail.push('create tab did not hide');
if (!sendSheet) fail.push('send sheet missing');
if (errors.some(e => /is not defined|Cannot read|SyntaxError/i.test(e))) fail.push('js crash');
if (fail.length) {
  console.error('FAIL', fail);
  process.exit(1);
}
console.log('PASS smoke ui');
