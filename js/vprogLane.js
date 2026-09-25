/* TN10 vProg tic-tac-toe carriers — same encoder-wasm as vprogs-tt.izio.fr.
   PIN hex signs. Keys stay in this wallet. */
import { loadKaspaSdk, connectPublicNode, fetchAddressUtxos } from './tx.js?v=232';
import { isTestnet, networkId, validateAndCleanUtxo } from './crypto.js?v=100';
import initEncoder, {
  UtxoCandidate, create_game_tx, join_game_tx, turn_tx, network_params, my_ids
} from '../vendor/vprog-ttt/vprog_tictactoe_encoder_wasm.js';

const CONFIG_ID_HEX = 'e52d9c508c502347344d8c07ad91cbd6068afc75ff6292f062a09ca381c89e71';
const MIN_CREATE_BALANCE = 1000n;
const FEE_PAD = 100_000n;
const WASM_URL = new URL('../vendor/vprog-ttt/vprog_tictactoe_encoder_wasm_bg.wasm', import.meta.url);

let encReady = null;

export function vprogHexKey(wallet) {
  const s = String(wallet?.privKey || '').replace(/^0x/i, '').replace(/\s/g, '');
  return /^[0-9a-fA-F]{64}$/.test(s) ? s.toLowerCase() : '';
}

async function loadEncoder() {
  if (!encReady) encReady = initEncoder(WASM_URL).catch(e => {
    encReady = null;
    throw e;
  });
  await encReady;
}

export async function vprogRollupId(wallet) {
  const hex = vprogHexKey(wallet);
  if (!hex) return '';
  await loadEncoder();
  return String(my_ids(hex).user_id_hex || '').toLowerCase();
}

function entryDeposit({ exists, balance, stake }) {
  const shortfall = balance >= stake ? 0n : stake - balance;
  const floor = exists ? 0n : MIN_CREATE_BALANCE;
  return shortfall > floor ? shortfall : floor;
}

function pickUtxo(utxos, needed) {
  let best = null;
  for (const u of utxos || []) {
    const c = validateAndCleanUtxo(u);
    if (!c || c.amount <= needed) continue;
    if (!best || c.amount > best.amount) best = c;
  }
  return best;
}

function candidate(c) {
  return new UtxoCandidate(
    c.outpoint.transactionId,
    Number(c.outpoint.index),
    c.amount,
    c.scriptPublicKey.script,
    Number(c.scriptPublicKey.version || 0)
  );
}

class Reader {
  pos = 0;
  constructor(b) { this.b = b; }
  u8() { return this.b[this.pos++]; }
  u16() {
    const v = (this.b[this.pos] | (this.b[this.pos + 1] << 8)) >>> 0;
    this.pos += 2;
    return v;
  }
  u32() {
    const v = (this.b[this.pos] | (this.b[this.pos + 1] << 8) | (this.b[this.pos + 2] << 16) | (this.b[this.pos + 3] << 24)) >>> 0;
    this.pos += 4;
    return v;
  }
  u64() { return BigInt(this.u32()) + 0x1_0000_0000n * BigInt(this.u32()); }
  bytes(n) {
    const v = this.b.subarray(this.pos, this.pos + n);
    if (v.length !== n) throw new Error('carrier: truncated tx');
    this.pos += n;
    return v;
  }
  vec() { return this.bytes(this.u32()); }
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
function hex(bytes) {
  let s = '';
  for (const b of bytes) s += HEX[b];
  return s;
}

function txFromBorsh(bytes) {
  const r = new Reader(bytes);
  const version = r.u16();
  const inputs = Array.from({ length: r.u32() }, () => {
    const transactionId = hex(r.bytes(32));
    const index = r.u32();
    const signatureScript = hex(r.vec());
    const sequence = r.u64();
    const input = { previousOutpoint: { transactionId, index }, signatureScript, sequence, sigOpCount: 0 };
    if (r.u8() === 0) input.sigOpCount = r.u8();
    else input.computeBudget = r.u16();
    return input;
  });
  const outputs = Array.from({ length: r.u32() }, () => {
    const value = r.u64();
    const scriptPublicKey = { version: r.u16(), script: hex(r.vec()) };
    let covenant;
    if (r.u8() === 1) covenant = { authorizingInput: r.u16(), covenantId: hex(r.bytes(32)) };
    return { value, scriptPublicKey, covenant };
  });
  const tx = {
    version,
    inputs,
    outputs,
    lockTime: r.u64(),
    subnetworkId: hex(r.bytes(20)),
    gas: r.u64(),
    payload: hex(r.vec()),
    storageMass: r.u64(),
    id: hex(r.bytes(32))
  };
  if (r.pos !== bytes.length) throw new Error('carrier: trailing tx bytes');
  return tx;
}

async function submitBytes(bytes, onStatus) {
  const k = await loadKaspaSdk();
  const { rpc, url } = await connectPublicNode();
  const obj = txFromBorsh(bytes);
  let tx;
  try { tx = new k.Transaction(obj); } catch {
    tx = obj;
  }
  onStatus?.('Broadcasting vProg carrier on ' + url + '…');
  let submitted;
  try {
    submitted = await rpc.submitTransaction({ transaction: tx, allowOrphan: true });
  } catch (e) {
    submitted = await rpc.submitTransaction({ transaction: obj, allowOrphan: true });
  }
  const id = submitted?.transactionId || submitted || obj.id;
  if (!id) throw new Error('Node did not return a transaction id');
  return String(id);
}

async function prep(wallet, onStatus) {
  if (!isTestnet()) throw new Error('Switch You → Network to testnet-10. The vProg lane is TN10, same as izio.');
  const hexKey = vprogHexKey(wallet);
  if (!hexKey) throw new Error('Need the in-app PIN key (same as Send KAS). KasWare-only chips cannot sign encoder carriers.');
  await loadEncoder();
  const ids = my_ids(hexKey);
  const uid = String(ids.user_id_hex || '').toLowerCase();
  const net = network_params('testnet-10');
  onStatus?.('Loading TN10 UTXOs…');
  const utxos = await fetchAddressUtxos(wallet.address);
  return { hexKey, uid, net, utxos, ids };
}

export async function vprogCreate({ wallet, stakeSompi, rounds, mark, state, account, onStatus }) {
  const { hexKey, net, utxos } = await prep(wallet, onStatus);
  const stake = BigInt(stakeSompi);
  const bal = account?.exists && account.balance != null ? BigInt(account.balance) : 0n;
  const deposit = entryDeposit({ exists: !!account?.exists, balance: bal, stake });
  const picked = pickUtxo(utxos, deposit + FEE_PAD);
  if (!picked) {
    throw new Error('Need one TN10 KAS UTXO bigger than ' + Number(deposit + FEE_PAD) / 1e8 + ' KAS (stake + fee). Faucet this address, then Create.');
  }
  const lane = state?.lane_subnet;
  const covenantId = state?.covenant_id;
  if (!lane || !covenantId) throw new Error('DA has no lane yet');
  onStatus?.('Building create carrier…');
  const bytes = create_game_tx(
    hexKey, net, candidate(picked), wallet.address, lane, CONFIG_ID_HEX,
    BigInt(account?.games_started || 0), stake, Number(rounds || 3), Number(mark || 1),
    deposit, covenantId
  );
  return submitBytes(bytes, onStatus);
}

export async function vprogJoin({ wallet, game, state, account, onStatus }) {
  const { hexKey, net, utxos } = await prep(wallet, onStatus);
  const stake = BigInt(game.stake || 0);
  const bal = account?.exists && account.balance != null ? BigInt(account.balance) : 0n;
  const deposit = entryDeposit({ exists: !!account?.exists, balance: bal, stake });
  const picked = pickUtxo(utxos, deposit + FEE_PAD);
  if (!picked) {
    throw new Error('Need one TN10 KAS UTXO bigger than ' + Number(deposit + FEE_PAD) / 1e8 + ' KAS to join.');
  }
  const lane = state?.lane_subnet;
  const covenantId = state?.covenant_id;
  if (!lane || !covenantId) throw new Error('DA has no lane yet');
  onStatus?.('Building join carrier…');
  const bytes = join_game_tx(
    hexKey, net, candidate(picked), wallet.address, lane, CONFIG_ID_HEX,
    game.id, deposit, covenantId
  );
  return submitBytes(bytes, onStatus);
}

export async function vprogTurn({ wallet, game, cell, state, onStatus }) {
  const { hexKey, uid, net, utxos } = await prep(wallet, onStatus);
  const picked = pickUtxo(utxos, FEE_PAD);
  if (!picked) throw new Error('Need a TN10 KAS UTXO for the turn fee.');
  const opponent = game.players[0] === uid ? game.players[1] : game.players[0];
  if (!opponent) throw new Error('Waiting for a joiner');
  const lane = state?.lane_subnet;
  if (!lane) throw new Error('DA has no lane yet');
  onStatus?.('Building turn carrier…');
  const bytes = turn_tx(
    hexKey, net, candidate(picked), wallet.address, lane,
    game.id, uid, opponent, Number(cell)
  );
  return submitBytes(bytes, onStatus);
}

export { isTestnet, networkId, FEE_PAD };
