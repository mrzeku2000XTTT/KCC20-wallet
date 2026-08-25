# Nilla Gorilla — KCC20 Wallet capability list + Replit prompt

Live PWA: https://kcc-20-wallet.vercel.app  
SDK (one script, no Chrome extension): https://kcc-20-wallet.vercel.app/sdk.js  
Connect demo: https://kcc-20-wallet.vercel.app/dapp-demo.html  
Integrator notes: https://github.com/mrzeku2000XTTT/KCC20-wallet/blob/main/CONNECT.md

KCC20 is a **non-custodial Kaspa PWA**. Keys stay in the wallet. Nilla builds the tx; the **user** connects and signs.

---

## A. What the wallet itself can do (in-app)

Tabs: **Home · A-Trade · Vault · Activity · You**

### Home
- Create / import wallet (64-hex native key) or KasWare watch+sign
- Multiple wallets (chips), switch, Move between own wallets
- Show live KAS balance, USD, address, copy
- Holdings: native **KAS**, **KCC20** (KRON idx: KKDAG, KRON, IFWEN, …) with live 24h + bag value, **KRC-20** (Kasplex)
- **Send** KAS / KCC20 / KRC-20 to a `kaspa:` address (PIN or KasWare)
- **Receive** address + QR
- **TRADE KCC20** — KRON curve/pool buy, sell, DCA
- **Compound** UTXOs
- Treasury chip: Fund TTT with real KKDAG / Sweep ews (not a fake mint)

### A-Trade
- **COOK / K.COM (TN10)** book: quote, buy, sell, limit — Cook returns unsigned PSKT, wallet signs
- **Launch** real KCC20 on TN10 via Cook (you sign)
- **Agent (Scorpion)** — range / dip / trend / curve / fade on a KRON tick (default KKDAG); Size KAS per buy; Max KAS session buy budget then sells still on; fill history + Activity **A-Trade** badge
- **TOKENS** list KCC20 / K.COM / Scorpion
- **Bet** 15m YES/NO on a tick (KKDAG first)
- **Bridge** KCC20→KCC20 via KAS hop (sell then buy, two user signatures)
- Native vs KasWare toggle for who signs

### Vault
- Time Capsule (`kaspa:p`) lock KAS on a timer, sweep when unlocked
- Life locks (rent etc., unlock-anytime option)
- History of swept capsules
- DD KKDAG cells are **Home**, not Vault

### Activity
- Chain KAS txs + in-app KCC20 received/sent/bought/sold
- Token logos
- **A-Trade** badge for Scorpion fills
- Copy tx id / explorer

### You (Profile)
- Network: **mainnet ↔ TN10**
- PIN, reveal/export hex (PIN), new/import, wipe
- KasWare connect
- TTT iframe dApp browser (parent wallet signs)

### Signing model
- **Native:** PIN + key on this device (WASM rusty-kaspa)
- **KasWare:** extension signs if that chip is KasWare
- Never hosted keys. If the PWA is killed, loops stop until reopen.

---

## B. What a dApp (Nilla) can call — this is the connect + sign surface

Load:

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
```

Creates `window.kcc20` and announces KIP-12 `kaspa:provider` (`rdns: app.kcc20.wallet`).

Opens a **popup of the PWA** (or talks to parent if Nilla is iframed inside KCC20). User sees **Approve / Reject**. No Google extension required.

| Call | What the user sees | What you get |
|---|---|---|
| `connect()` / `requestAccounts()` | “Connect dApp” → Approve | `string[]` of `kaspa:q…` |
| `getAccounts()` | silent if already allowed | same addresses |
| `getNetwork()` | — | `kaspa_mainnet` or `kaspa_testnet_10` |
| `switchNetwork(id)` | confirm TN10 / mainnet | new network + accounts |
| `getPublicKey()` | — | pubkey hex |
| `getBalance(addr?)` | — | `{ confirmed, unconfirmed, address }` sompi |
| `getUtxoEntries(addr?)` | — | UTXOs for building a PSKT |
| `getHoldings()` | — | KAS + KCC20 bags |
| `getTokenBalance(tick)` | — | one tick bag |
| **`signPskt({ txJsonString, options: { signInputs } })`** | **Sign transaction** sheet | signed Safe JSON **string** |
| **`pushTx(signedJson)`** | **Broadcast** sheet | `{ txId, node }` |
| `sendToken({ tick, amount, dest })` | Sign KCC20 send (TTT Fund style) | tx result |
| `disconnect()` | — | origin forgotten |
| events `on('accountsChanged'\|'networkChanged'\|'disconnect')` | — | live updates |

**Nilla only needs two user actions:** `connect` (or `requestAccounts`) and `signPskt`. `pushTx` is optional if you broadcast yourself.

### signPskt rules (do not skip)
- You **build** rusty-kaspa **Safe JSON**. KCC20 does **not** invent the route.
- `signInputs`: only this wallet’s P2PK input indexes, `sighashType: 1`.
- Do **not** list covenant / KRON curve / pool / token-cell inputs.
- If you omit the list, KCC20 signs only **unsigned** inputs whose UTXO address matches the connected wallet.
- Returns a **string**. User can Reject → error `User rejected`.

---

## C. Paste into the Nilla Replit agent

```
You are Nilla Gorilla, an AI Kaspa copilot. Stay wallet-agnostic. You NEVER hold keys or broadcast from a server key.

Job:
1) Find and verify the asset.
2) Figure the route and BUILD an unsigned rusty-kaspa Safe-JSON PSKT.
3) Hand it to the user’s wallet so THEY review and sign.

Wallets:
- Default: KCC20 Wallet (hosted PWA, NOT a Chrome extension).
  Script: <script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
  Global: window.kcc20  (also window.kcc20wallet)
  Discovery: listen for kaspa:provider (rdns app.kcc20.wallet) BEFORE dispatching kaspa:requestProvider.
  Demo: https://kcc-20-wallet.vercel.app/dapp-demo.html
- Optional: KasWare if window.kasware exists (extension). Same adapter methods.
- Do not block on Tap2Tip. They have no public PSKT SDK. Stub later if they publish signPskt.

UI — two buttons Nilla needs:
A) Connect wallet
B) Sign this transaction
(optional C) Broadcast)

Connect wallet:
  const kcc = window.kcc20;
  if (!kcc) inject sdk.js and wait for event kcc20#initialized.
  const accounts = await kcc.connect(); // popup to kcc-20-wallet.vercel.app
  const address = accounts[0];          // kaspa:q…
  const network = await kcc.getNetwork(); // kaspa_mainnet | kaspa_testnet_10
  Normalize: /testnet/ → testnet-10 else mainnet.
  If popup blocked: “Allow popups, or open https://kcc-20-wallet.vercel.app , Add to Home Screen, unlock, try Connect again.”
  User must already have created or imported a key in KCC20 and unlocked with PIN.

Sign transaction:
  You already built unsignedSafeJson (Transaction.serializeToSafeJSON or KRON/Cook builder).
  const signed = await kcc.signPskt({
    txJsonString: unsignedSafeJson,
    options: { signInputs: userP2pkIndexes.map(i => ({ index: i, sighashType: 1 })) }
  });
  signed is a string. Show “A KCC20 window opened — check the address and tap Sign.”
  On Reject, show the error and stop. No retry loop.

Optional broadcast:
  const { txId } = await kcc.pushTx(signed);
  or submit with your own node.

signInputs fund-safety:
  List ONLY the connected address’s P2PK inputs.
  NEVER list covenant / KRON curve / pool / token-cell inputs (re-signing those is the usual KasWare PSKT break).
  sighashType must be 1 (SIGHASH_ALL).

Adapter (one interface, many wallets):
  { id, name, available, connect, getAccounts, getNetwork, signPskt, pushTx }
  Copilot calls adapter.connect then adapter.signPskt. No if (kasware) inside the builder.

Copy:
  “Nilla prepares the transaction. Your wallet signs. We never hold your key.”
  Connect: “KCC20 Wallet will open. Unlock it and tap Connect.”
  Sign: “Review in KCC20, then tap Sign.”

Do not store keys, PINs, or x-access-token.
Do not ask KCC20 to pick the route or invent amounts.
Do not require a Chrome extension for the default path.

Done when:
- Connect without KasWare installed shows the user’s kaspa:q address.
- Sign on a real unsigned PSKT opens the PWA Sign sheet and returns a signed Safe-JSON string after Approve.
- Reject is handled.
- KasWare still works through the same adapter when the extension is present.
```
