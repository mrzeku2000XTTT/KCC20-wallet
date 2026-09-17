import { encodeKcc01, toSig65, SEARCH_DISPATCH_TAGS } from '../js/silverscript.js';

const sig64 = '11'.repeat(64);
const sig65 = sig64 + '01';
const with0x = '0x' + sig65;
const pushed = '41' + sig65; // OP_DATA_65 || sig65 → 66 bytes (the live wallet error)

function eq(a, b, label) {
  if (a !== b) throw new Error(label + ': ' + a + ' !== ' + b);
}

eq(toSig65(sig64), sig65, '64-byte');
eq(toSig65(sig65), sig65, '65-byte');
eq(toSig65(with0x), sig65, '0x prefix');
eq(toSig65(pushed), sig65, 'OP_DATA_65 prefix (66 bytes)');
eq(toSig65(pushed.toUpperCase()), sig65, 'uppercase 66');
eq(SEARCH_DISPATCH_TAGS.unlock, '3f64dcc7', 'unlock tag');
eq(SEARCH_DISPATCH_TAGS.pay_search_fee, '128f4127', 'pay_search_fee tag');

const enc = encodeKcc01(pushed, SEARCH_DISPATCH_TAGS.unlock);
const expected = '41' + sig65 + '043f64dcc7'; // OP_DATA_65 || sig65 || OP_DATA_4 || tag
if (enc.hex !== expected) {
  throw new Error('KCC-01 prefix mismatch: ' + enc.hex.slice(0, 24) + ' expected ' + expected.slice(0, 24));
}

console.log('search-unlock ok', {
  unlock: SEARCH_DISPATCH_TAGS.unlock,
  pay_search_fee: SEARCH_DISPATCH_TAGS.pay_search_fee,
  prefixHead: enc.hex.slice(0, 16),
  prefixBytes: enc.hex.length / 2
});
