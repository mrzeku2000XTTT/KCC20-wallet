import puppeteer from 'file:///C:/Users/mrzek/kaspa-covenant-wallet/kaspa-covenant-wallet/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(180000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:4173/?v=14', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#btn-create');
await page.click('#btn-create');
await page.waitForFunction(() => document.getElementById('page-home')?.classList.contains('active'));
const okBtn = await page.$('#sheet-ok');
if (okBtn) await okBtn.click();

const result = await page.evaluate(async () => {
  const k = await window.__kccLoad();
  const priv = new k.PrivateKey('b99d75736a0fd0ae2da658959813d680474f5a740a9c970a7da867141596178f');
  const pub = priv.toPublicKey().toString();
  const sb = new k.ScriptBuilder();
  sb.addI64(1n);
  sb.addOp(k.Opcodes.OpCheckLockTimeVerify);
  sb.addOp(k.Opcodes.OpDrop);
  const pubBytes = Uint8Array.from(String(pub).match(/.{2}/g).map(h => parseInt(h, 16)));
  sb.addData(pubBytes);
  sb.addOp(k.Opcodes.OpCheckSig);
  const redeem = sb.toString();
  const p2sh = sb.createPayToScriptHashScript();
  const dest = 'kaspa:qpkn4aczvuqpmhvzv2lunjudfnda6wlk258w90yptjxv6v2q7dlkq2cm8e58e';
  const utxo = {
    address: String(k.addressFromScriptPublicKey(p2sh, 'mainnet')),
    outpoint: { transactionId: '22'.repeat(32), index: 0 },
    amount: 15000000n,
    scriptPublicKey: { version: 0, script: redeem },
    blockDaaScore: 1n,
    isCoinbase: false
  };
  const tx = k.createTransaction([utxo], [{ address: dest, amount: 14500000n }], 0n, undefined, 1);
  tx.version = 1;
  tx.lockTime = 1n;
  tx.inputs[0].sequence = 0n;
  tx.inputs[0].sigOpCount = 0;
  tx.inputs[0].computeBudget = 60;
  const sig = k.createInputSignature(tx, 0, priv, k.SighashType.All);
  const wrapped = k.payToScriptHashSignatureScript(redeem, sig);
  const parsePushes = (hex) => {
    const h = String(hex || '').replace(/^0x/i, '');
    const b = [];
    for (let i = 0; i < h.length; i += 2) b.push(parseInt(h.slice(i, i + 2), 16));
    const pushes = [];
    let i = 0;
    while (i < b.length) {
      const op = b[i];
      if (op > 0 && op <= 75) {
        pushes.push({ op, n: op, dataHex: h.slice((i + 1) * 2, (i + 1 + op) * 2) });
        i += 1 + op;
      } else if (op === 0x4c) {
        const n = b[i + 1];
        pushes.push({ op: 'OP_PUSHDATA1', n, dataHex: h.slice((i + 2) * 2, (i + 2 + n) * 2) });
        i += 2 + n;
      } else {
        pushes.push({ op, rest: true });
        break;
      }
    }
    return pushes;
  };
  return {
    pub: String(pub),
    redeemLen: String(redeem).length,
    redeemHead: String(redeem).slice(0, 40),
    sigType: typeof sig,
    sig: String(sig),
    sigLen: String(sig || '').length,
    wrapped: String(wrapped),
    wrappedLen: String(wrapped || '').length,
    sigPushes: parsePushes(sig),
    wrapPushes: parsePushes(wrapped),
    sighashAll: k.SighashType.All
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
