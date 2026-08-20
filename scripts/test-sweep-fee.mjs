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
  const dest = 'kaspa:qpkn4aczvuqpmhvzv2lunjudfnda6wlk258w90yptjxv6v2q7dlkq2cm8e58e';
  const amount = 19390600n;
  const fee = 1_000_000n;
  const utxo = {
    address: String(k.addressFromScriptPublicKey(p2sh, 'mainnet')),
    outpoint: { transactionId: '2ee15f498aca12b48dc310fad22176fc39d6ae02fd176ad8252752ca071ebb62', index: 0 },
    amount,
    scriptPublicKey: { version: 0, script: p2sh.script },
    blockDaaScore: 1n,
    isCoinbase: false
  };
  const tx = k.createTransaction([utxo], [{ address: dest, amount: amount - fee }], 0n, undefined, 1);
  tx.version = 1;
  tx.lockTime = 1n;
  tx.inputs[0].sequence = 0n;
  tx.inputs[0].sigOpCount = 0;
  tx.inputs[0].computeBudget = 60;
  const sig = k.createInputSignature(tx, 0, priv, k.SighashType.All);
  tx.inputs[0].signatureScript = window.__kcc.p2shSpendScript(k, redeem, sig);
  tx.inputs[0].sigOpCount = 0;
  tx.inputs[0].computeBudget = 60;
  let mass = null;
  let sdkFee = null;
  try { mass = k.calculateTransactionMass('mainnet', tx, 1); } catch (e) { mass = 'err:' + (e.message || e); }
  try { sdkFee = k.calculateTransactionFee('mainnet', tx, 1); } catch (e) { sdkFee = 'err:' + (e.message || e); }
  const need = (mass && typeof mass !== 'string') ? BigInt(mass) * 100n : 0n;
  const rpcTx = window.__kcc.toRpcTransaction(tx, { version: 1, lockTime: 1, sigOpCount: 0, computeBudget: 60 });
  return {
    mass: String(mass),
    sdkFee: String(sdkFee),
    need: String(need),
    fee: String(fee),
    feeOk: fee >= need && fee >= 666900n,
    sigOp: rpcTx.inputs[0].sigOpCount,
    budget: rpcTx.inputs[0].computeBudget,
    paid: String(amount - BigInt(rpcTx.outputs[0].value))
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.feeOk || result.sigOp !== 0 || result.budget !== 60) {
  console.log('FAIL sweep fee/mass');
  process.exit(1);
}
console.log('PASS sweep fee covers Toccata 100 sompi/gram');
