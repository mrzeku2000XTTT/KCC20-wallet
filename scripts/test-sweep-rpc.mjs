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
const ok = await page.$('#sheet-ok');
if (ok) await ok.click();

const result = await page.evaluate(async () => {
  const k = await window.__kccLoad();
  const ping = await window.__kcc.pingPublicNode();
  const pub = '6d3af70267001ddd8262bfc9cb8d4cdbdd3bf6550ee2bc815c8ccd3140f37f60';
  const sb = new k.ScriptBuilder();
  sb.addI64(1n);
  sb.addOp(k.Opcodes.OpCheckLockTimeVerify);
  sb.addOp(k.Opcodes.OpDrop);
  sb.addData(Uint8Array.from(pub.match(/.{2}/g).map(h => parseInt(h, 16))));
  sb.addOp(k.Opcodes.OpCheckSig);
  const redeem = sb.toString();
  const utxo = {
    address: 'kaspa:pqdr3tjm2dha8t4p9lqqpqxx44uqpv03y6tzghsxvyfd9ypteept6j6a5xd7w',
    outpoint: { transactionId: '22'.repeat(32), index: 0 },
    amount: 15000000n,
    scriptPublicKey: { version: 0, script: redeem },
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
  const priv = new k.PrivateKey('b99d75736a0fd0ae2da658959813d680474f5a740a9c970a7da867141596178f');
  const sig = k.createInputSignature(tx, 0, priv, k.SighashType.All);
  tx.inputs[0].signatureScript = k.payToScriptHashSignatureScript(redeem, sig);
  const obj = window.__kcc.toRpcTransaction(tx, { version: 1, lockTime: 1, sigOpCount: 0, computeBudget: 60 });
  const rpc = new k.RpcClient({ url: ping.url, encoding: k.Encoding.Borsh, networkId: 'mainnet' });
  await rpc.connect();
  let err = null;
  let txId = null;
  try {
    const r = await rpc.submitTransaction({ transaction: obj, allowOrphan: false });
    txId = r?.transactionId || r || null;
  } catch (e) {
    err = e?.message || String(e);
  }
  try { await rpc.disconnect(); } catch {}
  return { url: ping.url, err, txId, sigOp: obj.inputs[0].sigOpCount, budget: obj.inputs[0].computeBudget };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
const msg = String(result.err || '');
if (/sig_op_count/i.test(msg)) {
  console.log('FAIL still rejected for sig_op_count');
  process.exit(1);
}
console.log('PASS node accepted sig_op_count field; reject was:', msg || ('txid ' + result.txId));
