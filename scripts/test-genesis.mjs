import puppeteer from 'file:///C:/Users/mrzek/kaspa-covenant-wallet/kaspa-covenant-wallet/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(180000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:4173/?v=8', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#btn-create');
await page.click('#btn-create');
await page.waitForFunction(() => document.getElementById('page-home')?.classList.contains('active'));
const ok = await page.$('#sheet-ok');
if (ok) await ok.click();

const result = await page.evaluate(async () => {
  const k = await window.__kccLoad();
  const pub = '6d3af70267001ddd8262bfc9cb8d4cdbdd3bf6550ee2bc815c8ccd3140f37f60';
  const sb = new k.ScriptBuilder();
  sb.addI64(1000n);
  sb.addOp(k.Opcodes.OpCheckLockTimeVerify);
  sb.addOp(k.Opcodes.OpDrop);
  sb.addData(Uint8Array.from(pub.match(/.{2}/g).map(h => parseInt(h, 16))));
  sb.addOp(k.Opcodes.OpCheckSig);
  const p2sh = sb.createPayToScriptHashScript();
  const dest = String(k.addressFromScriptPublicKey(p2sh, 'mainnet'));
  const srcPub = '20' + pub + 'ac';
  const utxo = {
    address: 'kaspa:qpkn4aczvuqpmhvzv2lunjudfnda6wlk258w90yptjxv6v2q7dlkq2cm8e58e',
    outpoint: { transactionId: '11'.repeat(32), index: 0 },
    amount: 40000000n,
    scriptPublicKey: { version: 0, script: srcPub },
    blockDaaScore: 1n,
    isCoinbase: false
  };
  const tx = k.createTransaction([utxo], [{ address: dest, amount: 15000000n }], 0n);
  tx.version = 1;
  tx.populateGenesisCovenants([new k.GenesisCovenantGroup(0, [0])]);
  const cov = tx.outputs[0].covenant;
  let objCovenant = null;
  try {
    const obj = tx.serializeToObject ? tx.serializeToObject() : null;
    objCovenant = obj?.outputs?.[0]?.covenant || obj?.outputs?.[0]?.Covenant || null;
  } catch (e) {
    objCovenant = String(e.message || e);
  }
  return {
    dest,
    version: tx.version,
    hasCovenant: !!cov,
    covenantId: cov ? String(cov.covenantId) : null,
    authorizingInput: cov ? cov.authorizingInput : null,
    serialized: objCovenant
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (result.version !== 1 || !result.hasCovenant || !result.covenantId) {
  console.log('FAIL genesis binding');
  process.exit(1);
}
console.log('PASS v1 covenant genesis binding', result.covenantId);
