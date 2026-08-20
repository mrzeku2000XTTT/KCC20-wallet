import puppeteer from 'file:///C:/Users/mrzek/kaspa-covenant-wallet/kaspa-covenant-wallet/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(180000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:4173/?v=25', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#btn-create');
await page.click('#btn-create');
await page.waitForFunction(() => document.getElementById('page-home')?.classList.contains('active'));
const ok = await page.$('#sheet-ok');
if (ok) await ok.click();

const result = await page.evaluate(async () => {
  const k = await window.__kccLoad();
  const priv = new k.PrivateKey('b99d75736a0fd0ae2da658959813d680474f5a740a9c970a7da867141596178f');
  const pub = '6d3af70267001ddd8262bfc9cb8d4cdbdd3bf6550ee2bc815c8ccd3140f37f60';
  const sb = new k.ScriptBuilder();
  sb.addI64(1n);
  sb.addOp(k.Opcodes.OpCheckLockTimeVerify);
  sb.addOp(k.Opcodes.OpDrop);
  sb.addData(Uint8Array.from(pub.match(/.{2}/g).map(h => parseInt(h, 16))));
  sb.addOp(k.Opcodes.OpCheckSig);
  const redeem = sb.toString();
  const p2sh = sb.createPayToScriptHashScript();
  const vaultAddr = String(k.addressFromScriptPublicKey(p2sh, 'mainnet'));
  const utxo = {
    address: vaultAddr,
    outpoint: { transactionId: '22'.repeat(32), index: 0 },
    amount: 15000000n,
    scriptPublicKey: p2sh,
    blockDaaScore: 1n,
    isCoinbase: false
  };
  const dest = 'kaspa:qpkn4aczvuqpmhvzv2lunjudfnda6wlk258w90yptjxv6v2q7dlkq2cm8e58e';
  const tx = k.createTransaction([utxo], [{ address: dest, amount: 14500000n }], 0n, undefined, 1);
  tx.version = 1;
  tx.lockTime = 1n;
  tx.inputs[0].sequence = 0n;
  tx.inputs[0].sigOpCount = 0;
  tx.inputs[0].computeBudget = 60;
  const sig = k.createInputSignature(tx, 0, priv, k.SighashType.All);
  const script = window.__kcc.p2shSpendScript(k, redeem, sig);
  const parse = (hex) => {
    const h = String(hex || '');
    const b = [];
    for (let i = 0; i < h.length; i += 2) b.push(parseInt(h.slice(i, i + 2), 16));
    const items = [];
    let i = 0;
    while (i < b.length) {
      const op = b[i];
      if (op === 0) { items.push('OP_0'); i += 1; continue; }
      if (op > 0 && op <= 75) { items.push('push' + op); i += 1 + op; continue; }
      items.push('op' + op.toString(16));
      break;
    }
    return items;
  };
  return {
    vaultAddr,
    redeemHasCltv: redeem.includes('b0') || redeem.includes('B0'),
    items: parse(script),
    scriptLen: script.length,
    startsWithSigPush: script.startsWith('41') || script.startsWith('40')
  };
});
console.log(JSON.stringify(result));
await browser.close();
const okShape = Array.isArray(result.items)
  && result.items[0]?.startsWith('push')
  && result.items[1] === 'OP_0'
  && result.items[2]?.startsWith('push')
  && result.items.length === 3;
if (!okShape) {
  console.log('FAIL expected <sig> OP_0 <redeem>, got', result.items);
  process.exit(1);
}
console.log('PASS sweep scriptSig is <sig> OP_0 <redeem> so Kaspa CLTV+DROP leaves the signature');
