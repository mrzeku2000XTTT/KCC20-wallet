/** SilverScript v1.0.0 covenant templates. Compiles with official silverc. */
export const TEMPLATES = [
  {
    id: "vesting",
    name: "Vesting lock",
    tag: "Time",
    blurb: "KAS unlocks only after a DAA age. Kaspa network fee on spend.",
    keywords: /vest|lock|unlock|time|wait|inheritance/i,
    summary: "Funds sit in a P2SH covenant until the UTXO is old enough, then the owner signs and spends. Every spend is a Kaspa L1 tx.",
    rules: [
      "Owner pubkey is baked into the contract at fund time.",
      "Spend requires a Schnorr signature from that owner.",
      "Spend also requires this.ageDaa >= the lock period.",
      "Fee is the native Kaspa network fee only.",
    ],
    ctorArgs: [
      { kind: "bytes", value: "OWNER_SCHNORR_PUBKEY_32_BYTES_HEX", note: "32-byte Schnorr pubkey" },
      { kind: "int", value: 2592000, note: "relative DAA age (example ~30d at 10 BPS; set for your window)" },
    ],
    sil: `pragma silverscript ^1.0.0;

contract VestingLock(pubkey owner, int unlockAgeDaa) {
    entry release(sig ownerSig) {
        require(checkSig(ownerSig, owner));
        require(this.ageDaa >= unlockAgeDaa);
    }
}
`,
  },
  {
    id: "escrow",
    name: "Escrow timeout",
    tag: "Trade",
    blurb: "Recipient claims now; sender reclaims after timeout.",
    keywords: /escrow|timeout|otc|buyer|seller|reclaim/i,
    summary: "Two paths: recipient signs anytime, or sender reclaims after a Unix-ms timeout. SilverScript v1 TransferWithTimeout pattern.",
    rules: [
      "transfer(): recipient signature.",
      "reclaim(): sender signature AND tx.time >= timeout.",
      "No custodian. Kaspa L1 enforces both paths.",
    ],
    ctorArgs: [
      { kind: "bytes", value: "SENDER_PUBKEY_32", note: "sender Schnorr pubkey" },
      { kind: "bytes", value: "RECIPIENT_PUBKEY_32", note: "recipient Schnorr pubkey" },
      { kind: "int", value: 1893456000000, note: "timeout as Unix milliseconds (temporal)" },
    ],
    sil: `pragma silverscript ^1.0.0;

contract TransferWithTimeout(
    pubkey sender,
    pubkey recipient,
    temporal timeout
) {
    entry transfer(sig recipientSig) {
        require(checkSig(recipientSig, recipient));
    }

    entry reclaim(sig senderSig) {
        require(checkSig(senderSig, sender));
        require(tx.time >= timeout);
    }
}
`,
  },
  {
    id: "allow",
    name: "Allow-list send",
    tag: "Safe",
    blurb: "First output must pay a fixed recipient.",
    keywords: /allow|whitelist|safe send|only to/i,
    summary: "Covenant inspects tx.outputs[0].scriptPubKey and requires a P2PK to the baked recipient.",
    rules: [
      "Output 0 must be P2PK to the recipient pubkey.",
      "Change and extra outputs are not constrained in this starter — tighten before mainnet.",
    ],
    ctorArgs: [
      { kind: "bytes", value: "RECIPIENT_PUBKEY_32", note: "allowed Schnorr pubkey" },
    ],
    sil: `pragma silverscript ^1.0.0;

contract AllowListSend(pubkey recipient) {
    entry spend() {
        byte[36] recipientScriptPubKey = new ScriptPubKeyP2PK(recipient);
        require(tx.outputs[0].scriptPubKey == byte[](recipientScriptPubKey));
    }
}
`,
  },
  {
    id: "recurring",
    name: "Recurring pay",
    tag: "Payroll",
    blurb: "After a DAA period, pay a pledge; remainder stays in the covenant.",
    keywords: /recurring|payroll|salary|mecenas|period|pledge/i,
    summary: "Mecenas-style SilverScript v1 covenant. Anyone can trigger receive() after the period. Funder can reclaim.",
    rules: [
      "receive() waits this.ageDaa >= period.",
      "Output 0 pays the recipient P2PK the pledge (or remainder if too small to continue).",
      "Change returns to the same covenant scriptPubKey.",
      "reclaim() is the funder. Miner fee is a Kaspa network fee (1000 sompi in the starter).",
    ],
    ctorArgs: [
      { kind: "bytes", value: "RECIPIENT_PUBKEY_32", note: "beneficiary pubkey" },
      { kind: "bytes", value: "FUNDER_PUBKEY_HASH_32", note: "blake2b(funder pubkey)" },
      { kind: "int", value: 100000000, note: "pledge in sompi (1 KAS = 1e8)" },
      { kind: "int", value: 864000, note: "period in DAA-score units" },
    ],
    sil: `pragma silverscript ^1.0.0;

contract RecurringPay(pubkey recipient, byte[32] funder, int pledge, int period) {
    entry receive() {
        require(this.ageDaa >= period);

        byte[36] recipientScriptPubKey = new ScriptPubKeyP2PK(recipient);
        require(tx.outputs[0].scriptPubKey == byte[](recipientScriptPubKey));

        int minerFee = 1000;
        int currentValue = tx.inputs[this.activeInputIndex].value;
        int changeValue = currentValue - pledge - minerFee;

        if (changeValue <= pledge + minerFee) {
            require(tx.outputs[0].value == currentValue - minerFee);
        } else {
            require(tx.outputs[0].value == pledge);
            byte[] changeScriptPubKey = tx.inputs[this.activeInputIndex].scriptPubKey;
            require(tx.outputs[1].scriptPubKey == changeScriptPubKey);
            require(tx.outputs[1].value == changeValue);
        }
    }

    entry reclaim(pubkey pk, sig s) {
        require(blake2b(byte[](pk)) == funder);
        require(checkSig(s, pk));
    }
}
`,
  },
  {
    id: "counter",
    name: "State counter",
    tag: "State",
    blurb: "1:1 covenant++ transition. Count lives in the UTXO.",
    keywords: /counter|state|covenant\\+\\+|singleton|roll/i,
    summary: "SilverScript v1 #[covenant.singleton] transition. Each spend writes the next State into the continuation output.",
    rules: [
      "State is synthesized from contract fields (count).",
      "step() is a 1:1 auth-bound transition — compiler emits validateOutputState.",
      "Funds stay in the same template. Termination is disallowed by default.",
    ],
    ctorArgs: [
      { kind: "int", value: 0, note: "initial count" },
    ],
    sil: `pragma silverscript ^1.0.0;

contract Counter(int initCount) {
    int count = initCount;

    #[covenant.singleton(mode = transition)]
    function step(State prev_state) : (State) {
        return(State { count: prev_state.count + 1 });
    }
}
`,
  },
  {
    id: "kcc20",
    name: "KCC20 transfer policy",
    tag: "KCC20",
    blurb: "Leader + delegate cov-bound transfer. Official v1 declaration API.",
    keywords: /kcc20|token|transfer policy|leader|delegate/i,
    summary: "Leader contract using binding = cov. Leader validates the shared state transition; delegate authenticates the local owner. Compile with silverc v1.",
    rules: [
      "Do not mix auth-bound and cov-bound declarations.",
      "Delegators never sit at covenant input 0.",
      "Owner keys stay on device. Witness is a signature, not a seed.",
      "This is a policy skeleton — wire amounts/owners before mainnet.",
    ],
    ctorArgs: [
      { kind: "int", value: 4, note: "max_token_inputs" },
      { kind: "int", value: 4, note: "max_token_outputs" },
      { kind: "int", value: 0, note: "init amount" },
      { kind: "bytes", value: "OWNER_32", note: "init owner id (32 bytes)" },
    ],
    sil: `pragma silverscript ^1.0.0;

contract Kcc20Unit(
    int max_token_inputs,
    int max_token_outputs,
    int init_amount,
    byte[32] init_owner
) {
    int amount = init_amount;
    byte[32] owner = init_owner;

    #[covenant(
        binding = cov,
        from = max_token_inputs,
        to = max_token_outputs,
        name = transfer,
        delegate_name = transfer_delegator
    )]
    function transferPolicy(State[] prev_states, State[] new_states, sig leader_sig) {
        require(new_states.length > 0);
        int in_sum = 0;
        for(i, 0, prev_states.length, max_token_inputs) {
            in_sum = in_sum + prev_states[i].amount;
        }
        int out_sum = 0;
        for(i, 0, new_states.length, max_token_outputs) {
            out_sum = out_sum + new_states[i].amount;
            require(new_states[i].owner == prev_states[0].owner);
        }
        require(in_sum >= out_sum);
    }

    #[covenant.delegate]
    function authorizeDelegate(sig owner_sig) {
        require(checkSig(owner_sig, pubkey(owner)));
    }
}
`,
  },
];

export function pickTemplate(prompt) {
  const p = String(prompt || "");
  const hit = TEMPLATES.find((t) => t.keywords.test(p));
  return hit || TEMPLATES[0];
}

export function silvercCmd(filename) {
  return `cargo run -p silverscript-lang --bin silverc -- ${filename} --constructor-args args.json`;
}
