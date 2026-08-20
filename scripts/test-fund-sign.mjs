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
  const privHex = 'b99d75736a0fd0ae2da658959813d680474f5a740a9c970a7da867141596178f';
  const priv = new k.PrivateKey(privHex);
  const pub = '6d3af70267001ddd8262bfc9cb8d4cdbdd3bf6550ee2bc815c8ccd3140f37f60';
  const srcPub = '20' + pub + 'ac';
  const src = 'kaspa:qpkn4aczvuqpmhvzv2lunjudfnda6wlk258w90yptjxv6v2q7dlkq2cm8e58e';
  const sb = new k.ScriptBuilder();
  sb.addI64(1000n);
  sb.addOp(k.Opcodes.OpCheckLockTimeVerify);
  sb.addOp(k.Opcodes.OpDrop);
  sb.addData(Uint8Array.from(pub.match(/.{2}/g).map(h => parseInt(h, 16))));
  sb.addOp(k.Opcodes.OpCheckSig);
  const dest = String(k.addressFromScriptPublicKey(sb.createPayToScriptHashScript(), 'mainnet'));
  const utxo = {
    address: src,
    outpoint: { transactionId: '11'.repeat(32), index: 0 },
    amount: 40000000n,
    scriptPublicKey: { version: 0, script: srcPub },
    blockDaaScore: 1n,
    isCoinbase: false
  };
  const tx = k.createTransaction([utxo], [{ address: dest, amount: 15000000n }], 0n, undefined, 1);
  tx.version = 1;
  tx.inputs[0].sequence = 0n;
  tx.inputs[0].sigOpCount = 0;
  tx.inputs[0].computeBudget = 10;
  tx.populateGenesisCovenants([new k.GenesisCovenantGroup(0, [0])]);
  const sig = k.createInputSignature(tx, 0, priv, k.SighashType.All);
  const sigHex = String(sig || '').replace(/^0x/i, '');
  tx.inputs[0].signatureScript = sigHex;
  const rpcTx = window.__kcc.toRpcTransaction(tx, { version: 1, lockTime: 0, sigOpCount: 0, computeBudget: 10 });
  rpcTx.inputs[0].signatureScript = sigHex;
  const plain = JSON.parse(JSON.stringify(rpcTx));
  let mass = 0n;
  try { mass = BigInt(k.calculateTransactionMass('mainnet', tx, 1)); } catch { mass = 0n; }
  const need = mass * 100n;
  const paid = 40000000n - BigInt(tx.outputs.reduce((a, o) => a + BigInt(o.value), 0n));
  let feeOk = paid >= need;
  if (!feeOk && tx.outputs.length) {
    const extra = need - paid + need / 10n + 50000n;
    tx.outputs[tx.outputs.length - 1].value = BigInt(tx.outputs[tx.outputs.length - 1].value) - extra;
    const sig2 = k.createInputSignature(tx, 0, priv, k.SighashType.All);
    tx.inputs[0].signatureScript = String(sig2);
    const paid2 = 40000000n - BigInt(tx.outputs.reduce((a, o) => a + BigInt(o.value), 0n));
    feeOk = paid2 >= need;
  }
  return {
    dest,
    sigLen: sigHex.length,
    wasmLen: String(tx.inputs[0].signatureScript || '').length,
    rpcLen: String(rpcTx.inputs[0].signatureScript || '').length,
    plainLen: String(plain.inputs[0].signatureScript || '').length,
    plainEmpty: !plain.inputs[0].signatureScript,
    sigOp: plain.inputs[0].sigOpCount,
    budget: plain.inputs[0].computeBudget,
    hasCov: !!plain.outputs[0].covenant,
    mass: String(mass),
    need: String(need),
    paid: String(paid),
    feeOk,
    sdkFee: String((() => { try { return k.calculateTransactionFee('mainnet', tx, 1); } catch (e) { return e.message; } })())
  };
});
console.log(JSON.stringify(result));
await browser.close();
if (result.plainEmpty || result.plainLen < 20 || result.sigOp !== 0 || result.budget !== 10) {
  console.log('FAIL fund P2PK signature missing on RPC object');
  process.exit(1);
}
if (!result.feeOk) {
  console.log('FAIL fund fee below Toccata 100 sompi/gram');
  process.exit(1);
}
console.log('PASS fund P2PK signature + Toccata fee', result.plainLen, 'mass', result.mass);
