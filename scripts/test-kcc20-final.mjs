import { selfTest, TRANSFER_TAG, DELEGATOR_TAG, KCC20_FINAL } from '../js/kcc20Final.js';

if (TRANSFER_TAG !== '79c71c23') throw new Error('transfer tag');
if (DELEGATOR_TAG !== 'fd3ef14a') throw new Error('delegator tag');
if (KCC20_FINAL.stateLen !== 112) throw new Error('state length');
selfTest();
console.log('KCC-20 Final codec matches kaspanet/kccs conformance vectors');
