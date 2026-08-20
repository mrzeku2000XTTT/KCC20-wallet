import puppeteer from 'file:///C:/Users/mrzek/kaspa-covenant-wallet/kaspa-covenant-wallet/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(180000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:4173/?v=17', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#btn-create');
await page.click('#btn-create');
await page.waitForFunction(() => document.getElementById('page-home')?.classList.contains('active'));
const ok = await page.$('#sheet-ok');
if (ok) await ok.click();

const result = await page.evaluate(async () => {
  const k = await window.__kccLoad();
  const spk = { version: 0, script: '20' + '11'.repeat(32) + 'ac' };
  const mk = (txid, amount) => ({
    address: 'kaspa:qpkn4aczvuqpmhvzv2lunjudfnda6wlk258w90yptjxv6v2q7dlkq2cm8e58e',
    outpoint: { transactionId: txid, index: 0 },
    amount,
    scriptPublicKey: spk,
    blockDaaScore: 1n,
    isCoinbase: false
  });
  const split30 = window.__kcc.storageMassOk(k, [30_000_000], [15_000_000, 14_800_000]);
  const from50 = window.__kcc.storageMassOk(k, [50_000_000], [15_000_000, 34_800_000]);
  const sendAll30 = window.__kcc.storageMassOk(k, [30_000_000], [29_800_000]);
  const planBad = window.__kcc.planKasPayment(k, [mk('aa'.repeat(32), 30_000_000n)], 15_000_000n, 200_000n);
  const planGood = window.__kcc.planKasPayment(
    k,
    [mk('aa'.repeat(32), 30_000_000n), mk('bb'.repeat(32), 50_000_000n)],
    15_000_000n,
    200_000n
  );
  const dest = 'kaspa:pqdr3tjm2dha8t4p9lqqpqxx44uqpv03y6tzghsxvyfd9ypteept6j6a5xd7w';
  const tx = k.createTransaction(
    planBad.entries,
    [{ address: dest, amount: planBad.amount }],
    0n,
    undefined,
    1
  );
  tx.version = 1;
  const rpcTx = window.__kcc.toRpcTransaction(tx, { version: 1, lockTime: 0, sigOpCount: 0, computeBudget: 10 });
  return {
    max: String(k.maximumStandardTransactionMass()),
    split30,
    from50,
    sendAll30,
    planBadBoosted: !!planBad?.boosted,
    planBadAmt: planBad ? String(planBad.amount) : null,
    planGoodBoosted: !!planGood?.boosted,
    planGoodAmt: planGood ? String(planGood.amount) : null,
    planGoodIn: planGood ? String(planGood.entries.reduce((a, e) => a + e.amount, 0n)) : null,
    absorbOuts: tx.outputs.length,
    rpcSigOp: rpcTx.inputs[0].sigOpCount,
    rpcBudget: rpcTx.inputs[0].computeBudget,
    rpcOuts: rpcTx.outputs.length
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (result.split30 !== false) {
  console.log('FAIL expected 0.15+0.148 from 0.30 to exceed storage mass');
  process.exit(1);
}
if (result.sendAll30 !== true || result.from50 !== true) {
  console.log('FAIL send-all / larger UTXO should be mass-safe');
  process.exit(1);
}
if (!result.planBadBoosted || result.planGoodAmt !== '15000000') {
  console.log('FAIL planner should absorb 0.30 and pick 0.15 from 0.50');
  process.exit(1);
}
if (result.absorbOuts !== 1 || result.rpcOuts !== 1 || result.rpcSigOp !== 0 || result.rpcBudget !== 10) {
  console.log('FAIL absorb tx should be 1-output v1 with sigOp 0 budget 10', result);
  process.exit(1);
}
console.log('PASS storage-mass planner');
