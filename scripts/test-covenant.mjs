import puppeteer from 'file:///C:/Users/mrzek/kaspa-covenant-wallet/kaspa-covenant-wallet/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(120000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:4173/?v=5', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('#btn-create');
await page.click('#btn-create');
await page.waitForFunction(() => document.getElementById('page-home')?.classList.contains('active'));
const ok = await page.$('#sheet-ok');
if (ok) await ok.click();

const built = await page.evaluate(async () => {
  const k = await window.__kccLoad();
  const pub = '6d3af70267001ddd8262bfc9cb8d4cdbdd3bf6550ee2bc815c8ccd3140f37f60';
  const sb = new k.ScriptBuilder();
  sb.addI64(1000n);
  sb.addOp(k.Opcodes.OpCheckLockTimeVerify);
  sb.addOp(k.Opcodes.OpDrop);
  const bytes = pub.match(/.{2}/g).map(h => parseInt(h, 16));
  sb.addData(new Uint8Array(bytes));
  sb.addOp(k.Opcodes.OpCheckSig);
  const redeem = sb.toString();
  const p2sh = sb.createPayToScriptHashScript();
  const addr = String(k.addressFromScriptPublicKey(p2sh, 'mainnet'));
  return { addr, redeem: String(redeem).slice(0, 40), p2sh: p2sh.script?.slice?.(0, 20) || String(p2sh.script) };
});
console.log(JSON.stringify(built, null, 2));
const pass = built.addr.startsWith('kaspa:p');
console.log(pass ? 'PASS P2SH covenant address' : 'FAIL not p-address: ' + built.addr);
await browser.close();
if (!pass) process.exit(1);
