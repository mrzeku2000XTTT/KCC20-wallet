/* Node checks for KasWare KRON trade signing — no live extension required. */
import assert from 'node:assert/strict';
import { spend } from '../vendor/kron-sdk/index.js';
import {
  kaswareSigning, saveKaswarePref, loadKaswarePref, parseKaswareTx,
  signPsktWithKasware, fetchKaswareUtxos
} from '../js/kasware.js';

const store = {};
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
globalThis.window = globalThis;

function hexish(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.replace(/^0x/i, '');
  return String(v);
}

function mergeFundingSignatures(original, signed, indexes) {
  const origIns = [...original.inputs];
  const signedIns = signed.inputs || [];
  for (const idx of indexes) {
    const hex = hexish(signedIns[idx]?.signatureScript);
    if (!hex || hex.length < 20) throw new Error('KasWare did not sign funding input ' + idx);
    origIns[idx].signatureScript = hex;
    origIns[idx].sigOpCount = 0;
  }
  original.inputs = origIns;
  return original;
}

const ADDR = 'kaspa:qrtfjhxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

saveKaswarePref({ enabled: true, address: ADDR });
assert.equal(loadKaswarePref().enabled, true);
assert.equal(kaswareSigning({ address: ADDR }), false, 'no provider → not signing');

globalThis.kasware = { signPskt: async () => '{}' };
assert.equal(kaswareSigning({ address: ADDR }), true, 'provider + matching address → signing');
assert.equal(kaswareSigning({ address: ADDR.toUpperCase() }), true, 'address compare is case-insensitive');
assert.equal(kaswareSigning({ address: 'kaspa:qother' }), false, 'wrong address → not signing');

saveKaswarePref({ enabled: false, address: ADDR });
assert.equal(kaswareSigning({ address: ADDR }), true, 'KasWare-named chip still signs when the Settings toggle is off');
assert.equal(kaswareSigning({ address: 'kaspa:qother' }), false, 'toggle off + other address → not signing');
saveKaswarePref({ enabled: true, address: ADDR });

const asm = {
  transaction: { serializeToSafeJSON: () => '{"id":"abc","inputs":[{},{},{"signatureScript":""}]}' },
  fundingInputIndexes: [2, 3]
};
const plan = spend.toPsktJson(asm, 1);
assert.equal(typeof plan.txJsonString, 'string');
assert.deepEqual(plan.signInputs, [
  { index: 2, sighashType: 1 },
  { index: 3, sighashType: 1 }
], 'only funding inputs are asked of KasWare, not covenant inputs');

let captured = null;
globalThis.kasware.signPskt = async (arg) => {
  captured = arg;
  return '{"id":"signed-by-kasware"}';
};
const signed = await signPsktWithKasware(plan.txJsonString, plan.signInputs);
assert.equal(signed, '{"id":"signed-by-kasware"}');
assert.equal(captured.txJsonString, plan.txJsonString);
assert.deepEqual(captured.options.signInputs, plan.signInputs);
assert.equal(captured.options.broadcast, false, 'KasWare must sign only — we broadcast KRON ourselves');

globalThis.kasware.signPskt = async () => ({ txJsonString: '{"id":"obj"}' });
assert.equal(await signPsktWithKasware('{}', [{ index: 1 }]), '{"id":"obj"}');

let rejected = false;
globalThis.kasware.signPskt = async () => { throw new Error('User rejected the request'); };
try { await signPsktWithKasware('{}', []); } catch (e) {
  rejected = e.message === 'cancelled';
}
assert.equal(rejected, true, 'user reject → cancelled');

const parsed = parseKaswareTx('{"id":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"}');
assert.equal(parsed.txId.length, 64);

const original = {
  inputs: [
    { signatureScript: 'covenant-pre-signed-aaaaaaaaaaaaaaaa', sigOpCount: 0 },
    { signatureScript: '', sigOpCount: 0 },
    { signatureScript: '', sigOpCount: 0 }
  ]
};
const fromWallet = {
  inputs: [
    { signatureScript: 'should-not-overwrite-covenant' },
    { signatureScript: '11'.repeat(32) },
    { signatureScript: '22'.repeat(32) }
  ]
};
mergeFundingSignatures(original, fromWallet, [1, 2]);
assert.equal(original.inputs[0].signatureScript, 'covenant-pre-signed-aaaaaaaaaaaaaaaa');
assert.equal(original.inputs[1].signatureScript, '11'.repeat(32));
assert.equal(original.inputs[2].signatureScript, '22'.repeat(32));
assert.equal(original.inputs[1].sigOpCount, 0);

let mergeFailed = false;
try {
  mergeFundingSignatures({ inputs: [{ signatureScript: '' }] }, { inputs: [{ signatureScript: '' }] }, [0]);
} catch { mergeFailed = true; }
assert.equal(mergeFailed, true, 'unsigned funding input is refused');

globalThis.kasware.getUtxoEntries = async () => ([{
  outpoint: { transactionId: 'aa'.repeat(32), index: 0 },
  amount: 6754810000,
  scriptPublicKey: { version: 0, script: '20' + 'ab'.repeat(32) + 'ac' },
  blockDaaScore: 1,
  isCoinbase: false
}]);
const utxos = await fetchKaswareUtxos(ADDR);
assert.equal(utxos.length, 1);
assert.equal(utxos[0].outpoint.transactionId.length, 64);
assert.ok(utxos[0].utxoEntry.scriptPublicKey.script);

delete globalThis.kasware.signPskt;
let missing = '';
try { await signPsktWithKasware('{}', []); } catch (e) { missing = e.message; }
assert.match(missing, /PSKT|Update KasWare/i);

function attachKronPsktUtxos(json, asm, address) {
  const o = JSON.parse(String(json || '{}'));
  const tx = o.transaction || o;
  const ins = tx.inputs || [];
  const live = [...(asm?.transaction?.inputs || [])];
  const fund = new Set(asm?.fundingInputIndexes || []);
  for (let i = 0; i < ins.length; i++) {
    if (!fund.has(i)) continue;
    const src = live[i]?.utxo;
    if (!src) throw new Error('missing funding utxo ' + i);
    ins[i].utxo = {
      address: src.address || address,
      amount: String(src.amount),
      scriptPublicKey: { version: 0, script: src.scriptPublicKey.script },
      blockDaaScore: String(src.blockDaaScore || 0),
      isCoinbase: !!src.isCoinbase
    };
  }
  return JSON.stringify(o);
}

const pskt = {
  inputs: [
    { previousOutpoint: { transactionId: 'aa', index: 0 }, signatureScript: 'cov' },
    { previousOutpoint: { transactionId: 'bb', index: 0 }, signatureScript: '' }
  ]
};
const asmLive = {
  transaction: {
    inputs: [
      { utxo: { amount: 1, scriptPublicKey: { script: 'aa20' + '00'.repeat(32) + '87' } } },
      { utxo: { address: ADDR, amount: 1000, scriptPublicKey: { version: 0, script: '20' + 'ab'.repeat(32) + 'ac' }, blockDaaScore: 1 } }
    ]
  },
  fundingInputIndexes: [1]
};
const attached = JSON.parse(attachKronPsktUtxos(JSON.stringify(pskt), asmLive, ADDR));
assert.equal(attached.inputs[0].utxo, undefined, 'do not attach covenant utxo for KasWare');
assert.equal(attached.inputs[1].utxo.scriptPublicKey.script, '20' + 'ab'.repeat(32) + 'ac');
assert.equal(attached.inputs[1].utxo.address, ADDR);

console.log('kasware trade signing tests: ok');
