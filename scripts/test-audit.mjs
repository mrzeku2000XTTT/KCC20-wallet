import {
  hexToBytes, bytesToHex, convertBits, kaspaCashaddrEncode, kaspaCashaddrDecode,
  isValidKaspaAddress, validateKaspaAddress, kasToSompi, sompiToKasString,
  validateAndCleanUtxo, deepCloneAndFreeze, addressToScriptPublicKeyBytes
} from '../js/crypto.js';

const fail = [];
const ok = [];
function check(name, cond, extra = '') {
  (cond ? ok : fail).push(name);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
}

check('hex even', (() => {
  try { hexToBytes('aa'); return true; } catch { return false; }
})());
check('hex odd rejected', (() => {
  try { hexToBytes('abc'); return false; } catch { return true; }
})());
check('hex junk rejected', (() => {
  try { hexToBytes('zz'); return false; } catch { return true; }
})());
check('hex roundtrip', bytesToHex(hexToBytes('0a0b0c')) === '0a0b0c');

const pad = convertBits([0, 1, 2, 3, 4], 5, 8, false);
check('convertBits leftover too big is null or array', pad === null || Array.isArray(pad));
check('convertBits non-zero padding rejected', convertBits([1], 5, 8, false) === null);

const pk = new Uint8Array(32).fill(7);
const addr = kaspaCashaddrEncode('kaspa', 0, pk);
check('encode starts kaspa:q', addr.startsWith('kaspa:q'));
check('decode roundtrip', (() => {
  const d = kaspaCashaddrDecode(addr);
  return d && d.versionByte === 0 && d.payloadBytes.length === 32 && d.payloadBytes[0] === 7;
})());
check('valid mainnet', isValidKaspaAddress(addr));
check('two colons rejected', !isValidKaspaAddress('kaspa:foo:bar'));
check('testnet prefix rejected on mainnet', !validateKaspaAddress('kaspatest:' + addr.split(':')[1]).isValid);
check('no colon rejected', !isValidKaspaAddress('qpzry9x8gf2tvdw0s3jn54khce6mua7l'));

const sh = kaspaCashaddrEncode('kaspa', 8, pk);
check('p2sh starts kaspa:p', sh.startsWith('kaspa:p'));
check('p2sh valid', isValidKaspaAddress(sh));
const spkP = addressToScriptPublicKeyBytes(sh);
check('p2sh script aa20…87', spkP[0] === 0xaa && spkP[1] === 0x20 && spkP[34] === 0x87);
const spkQ = addressToScriptPublicKeyBytes(addr);
check('p2pk script 20…ac', spkQ[0] === 0x20 && spkQ[33] === 0xac);

check('kasToSompi 1.5', kasToSompi('1.5') === 150000000n);
check('kasToSompi 0.00000001', kasToSompi('0.00000001') === 1n);
check('sompi string', sompiToKasString(150000000n) === '1.5');
check('kasToSompi rejects letters', (() => {
  try { kasToSompi('1.2x'); return false; } catch { return true; }
})());

const frozen = deepCloneAndFreeze({ dest: addr, nested: { n: '1' } });
let mutated = false;
try { frozen.nested.n = '9'; } catch { mutated = true; }
check('deep freeze nested', frozen.nested.n === '1');

const badUtxo = validateAndCleanUtxo({ outpoint: { transactionId: 'zz', index: 0 }, amount: 1 });
check('bad utxo dropped', badUtxo === null);
const goodUtxo = validateAndCleanUtxo({
  outpoint: { transactionId: 'ab'.repeat(32), index: 0 },
  amount: '123',
  scriptPublicKey: { version: 0, script: '20' + 'aa'.repeat(32) + 'ac' }
});
check('good utxo kept', !!goodUtxo && goodUtxo.amount === 123n);

console.log(`\n${ok.length} passed, ${fail.length} failed`);
if (fail.length) process.exit(1);
