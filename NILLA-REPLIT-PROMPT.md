# Nilla Gorilla â€” KCC20 Wallet capability list + Replit prompt

Live PWA: https://kcc-20-wallet.vercel.app  
SDK (one script, no Chrome extension): https://kcc-20-wallet.vercel.app/sdk.js  
Connect demo: https://kcc-20-wallet.vercel.app/dapp-demo.html  
Integrator notes: https://github.com/mrzeku2000XTTT/KCC20-wallet/blob/main/CONNECT.md

KCC20 is a **non-custodial Kaspa PWA**. Keys stay in the wallet. Nilla builds the tx; the **user** connects and signs.

---

## A. What the wallet itself can do (in-app)

Tabs: **Home Â· A-Trade Â· Vault Â· Activity Â· You**

### Home
- Create / import wallet (64-hex native key) or KasWare watch+sign
- Multiple wallets (chips), switch, Move between own wallets
- Show live KAS balance, USD, address, copy
- Holdings: native **KAS**, **KCC20** (KRON idx: KKDAG, KRON, IFWEN, â€¦) with live 24h + bag value, **KRC-20** (Kasplex)
- **Send** KAS / KCC20 / KRC-20 to a `kaspa:` address (PIN or KasWare)
- **Receive** address + QR
- **TRADE KCC20** â€” KRON curve/pool buy, sell, DCA
- **Compound** UTXOs
- Treasury chip: Fund TTT with real KKDAG / Sweep ews (not a fake mint)

### A-Trade
- **COOK / K.COM (TN10)** book: quote, buy, sell, limit â€” Cook returns unsigned PSKT, wallet signs
- **Launch** real KCC20 on TN10 via Cook (you sign)
- **Agent (Scorpion)** â€” range / dip / trend / curve / fade on a KRON tick (default KKDAG); Size KAS per buy; Max KAS session buy budget then sells still on; fill history + Activity **A-Trade** badge
- **TOKENS** list KCC20 / K.COM / Scorpion
- **Bet** 15m YES/NO on a tick (KKDAG first)
- **Bridge** KCC20â†’KCC20 via KAS hop (sell then buy, two user signatures)
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
- Network: **mainnet â†” TN10**
- PIN, reveal/export hex (PIN), new/import, wipe
- KasWare connect
- TTT iframe dApp browser (parent wallet signs)

### Signing model
- **Native:** PIN + key on this device (WASM rusty-kaspa)
- **KasWare:** extension signs if that chip is KasWare
- Never hosted keys. If the PWA is killed, loops stop until reopen.

---

## B. What a dApp (Nilla) can call â€” this is the connect + sign surface

Load:

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
```

Creates `window.kcc20` and announces KIP-12 `kaspa:provider` (`rdns: app.kcc20.wallet`).

Opens a **popup of the PWA** (or talks to parent if Nilla is iframed inside KCC20). User sees **Approve / Reject**. No Google extension required.

| Call | What the user sees | What you get |
|---|---|---|
| `connect()` / `requestAccounts()` | â€œConnect dAppâ€ â†’ Approve | `string[]` of `kaspa:qâ€¦` |
| `getAccounts()` | silent if already allowed | same addresses |
| `getNetwork()` | â€” | `kaspa_mainnet` or `kaspa_testnet_10` |
| `switchNetwork(id)` | confirm TN10 / mainnet | new network + accounts |
| `getPublicKey()` | â€” | pubkey hex |
| `getBalance(addr?)` | â€” | `{ confirmed, unconfirmed, address }` sompi |
| `getUtxoEntries(addr?)` | â€” | UTXOs for building a PSKT |
| `getHoldings()` | â€” | KAS + KCC20 bags |
| `getTokenBalance(tick)` | â€” | one tick bag |
| **`signPskt({ txJsonString, options: { signInputs } })`** | **Sign transaction** sheet | signed Safe JSON **string** |
| **`pushTx(signedJson)`** | **Broadcast** sheet | `{ txId, node }` |
| `sendToken({ tick, amount, dest })` | Sign KCC20 send (TTT Fund style) | tx result |
| `disconnect()` | â€” | origin forgotten |
| events `on('accountsChanged'\|'networkChanged'\|'disconnect')` | â€” | live updates |

**Nilla only needs two user actions:** `connect` (or `requestAccounts`) and `signPskt`. `pushTx` is optional if you broadcast yourself.

### signPskt rules (do not skip)
- You **build** rusty-kaspa **Safe JSON**. KCC20 does **not** invent the route.
- `signInputs`: only this walletâ€™s P2PK input indexes, `sighashType: 1`.
- Do **not** list covenant / KRON curve / pool / token-cell inputs.
- If you omit the list, KCC20 signs only **unsigned** inputs whose UTXO address matches the connected wallet.
- Returns a **string**. User can Reject â†’ error `User rejected`.

---

## C. FULL REPLIT AGENT PROMPT â€” paste everything in the fence

```
You are Nilla Gorilla, an AI Kaspa copilot on Replit. Stay wallet-agnostic. You NEVER hold keys, PINs, or x-access-token. You NEVER broadcast from a server key. You NEVER invent amounts or routes. You BUILD the unsigned tx; the userâ€™s wallet SIGNS it.

This prompt replaces earlier â€œinvestigate session/provider identityâ€ work. The wallet-side bug is already fixed. Do not rip apart KRON quote, PSKT construction, signing boundaries, approval UI, or broadcast. Do not load sdk.js on page mount. Do not treat the Replit runtime-error overlay as this bug.

============================================================
LIVE WALLET (SCORPION / KCC20) â€” use this, nothing else
============================================================
PWA:  https://kcc-20-wallet.vercel.app
SDK:  https://kcc-20-wallet.vercel.app/sdk.js?v=166
Demo: https://kcc-20-wallet.vercel.app/dapp-demo.html
Docs: https://kcc-20-wallet.vercel.app/CONNECT.md

Global after inject: window.kcc20  (also window.kcc20wallet)
KIP-12: listen for kaspa:provider (rdns app.kcc20.wallet) BEFORE dispatching kaspa:requestProvider.
Required: window.kcc20.sdkVersion === "166"  and  window.kcc20.origin === "https://kcc-20-wallet.vercel.app"

If sdkVersion is missing or not "166", you are on the STALE SDK that throws "Connect KCC20 Wallet first" after the popup closes. Stop. Bust the cache:
  delete window.kcc20; delete window.kcc20wallet;
  inject <script src="https://kcc-20-wallet.vercel.app/sdk.js?v=166">
  wait for event kcc20#initialized
  confirm sdkVersion === "166"
Hard-reload the Nilla tab once so the old IIFE is gone. Do not keep two copies.

============================================================
WHERE WE ARE (do not regress)
============================================================
DONE â€” keep these working:
- SCORPION (KCC20) is its own selectable adapter, separate from KasWare (KasWare stays default).
- Selecting SCORPION + Connect opens the REAL kcc-20-wallet.vercel.app popup (not KasWare).
- User Approves. Nilla shows SCORPION connected with the same kaspa:q address.
- Route text: Review â†’ SCORPION (KCC20) approval â†’ Broadcast
- Live KRON quote still works (example: 10 KAS â†’ ~918 KKDAG, identity/covenant/fees populated).
- sdk.js is loaded ONLY when user selects SCORPION and taps Connect. Not on mount.
- Do NOT overwrite window.kasware if a real KasWare extension exists (window.kasware && !window.kasware.isKcc20Shim).
- Diagnostics: signPskt / pushTx stay capability-only. No diagnostic sign/broadcast buttons. No constructing txs from the probe panel.

CURRENT BLOCK (this is the only thing Prepare is dying on):
Connection âœ…  provider âœ…  address âœ…  KRON quote âœ…
getPublicKey / getUtxoEntries after Connect âŒ â†’ error "Connect KCC20 Wallet first"
Prepare blocked. signPskt 0 events. Broadcast not reached.

That error is NOT Nilla losing the address. It is the OLD sdk.js: Connect succeeds, popup CLOSES ON PURPOSE, then silent reads require a live window and throw. Nilla UI still shows connected because it stored the address from Connect.

NEW sdk.js v166: after Connect the popup still closes. Session stays.
  getAccounts / getNetwork / getPublicKey     â†’ silent, from Connect snapshot
  getUtxoEntries / getBalance                 â†’ silent, public Kaspa API for that address
  signPskt / pushTx / sendToken               â†’ popup again (user must approve)
Do not open a second Connect for Prepare. Do not loop Connect. Do not keep the wallet window open.

UNRELATED: Replit [plugin:runtime-error-plugin] (unknown runtime error) is a cross-origin script noise overlay. Ignore it. Do not change vite overlay filtering unless it is already done. Do not confuse it with wallet state.

============================================================
ADAPTER â€” one object, same instance
============================================================
Use ONE live reference: const kcc = window.kcc20 after sdk v166 initialized.
Do not clone it. Do not wrap a snapshot taken before Connect. Do not call getPublicKey on a different object than the one that ran connect().
KasWare path keeps using window.kasware when the user selected KasWare.
SCORPION path uses window.kcc20 only. No if (kasware) inside the KRON/PSKT builder.

Methods:
  kcc.connect() / kcc.requestAccounts()  â†’ string[] kaspa:qâ€¦     POPUP, then closes
  kcc.getAccounts()                      â†’ string[]              silent
  kcc.getNetwork()                       â†’ kaspa_mainnet | kaspa_testnet_10   silent
  kcc.getPublicKey()                     â†’ hex                   silent
  kcc.getUtxoEntries(address?)           â†’ utxo[]                silent
  kcc.getBalance(address?)               â†’ { confirmed, unconfirmed, address } sompi  silent
  kcc.signPskt({ txJsonString, options: { signInputs } })  â†’ signed Safe JSON STRING   POPUP
  kcc.pushTx(signedJson)                 â†’ { txId, node }        POPUP
  kcc.disconnect()                       â†’ clears session

Network normalize: /testnet/ â†’ testnet-10 else mainnet.
KIP-12 getNetwork already returns mainnet | testnet-10. window.kcc20.getNetwork returns kaspa_mainnet | kaspa_testnet_10. Handle both.

Popup blocked: â€œAllow popups for KCC20 Wallet, or open https://kcc-20-wallet.vercel.app , unlock with PIN, try Connect again.â€
User must already have created/imported a key in KCC20.

============================================================
JOB 1 â€” prove silent reads (required before Prepare)
============================================================
1. Confirm window.kcc20.sdkVersion === "166".
2. Select SCORPION â†’ Connect ONCE. User Approves. Popup closes. That close is correct.
3. With the popup STILL CLOSED, call in order and log SUCCESS/FAILURE (redact: short address, pubkey fingerprint only, UTXO count + total sompi, never tx bodies):
     const accounts = await kcc.getAccounts();          // same kaspa:q as Connect
     const network  = await kcc.getNetwork();
     const pubKey   = await kcc.getPublicKey();         // must NOT throw Connect KCC20 Wallet first
     const utxos    = await kcc.getUtxoEntries(accounts[0]);
4. If any throw "Connect KCC20 Wallet first": stale SDK. Stop. Reload v166. Do not Connect-loop.
5. If getPublicKey throws "No public key in this KCC20 session. Connect again.": Disconnect once, Connect once more (one popup), retry step 3. That happens only for a session opened on the old SDK.
6. Pass = all four succeed with popup closed. Then go to Job 2. Do not Sign yet.

============================================================
JOB 2 â€” Prepare verified purchase (build unsigned PSKT)
============================================================
You already have the KRON quote (10 KAS â†’ KKDAG etc.). Keep that builder.
Using pubKey + utxos from Job 1 + the quote, BUILD unsigned rusty-kaspa Safe JSON yourself (Transaction.serializeToSafeJSON or your KRON/Cook builder).
KCC20 does not pick the route or amounts.
UTXO objects from getUtxoEntries include both REST shape (outpoint + utxoEntry) and KasWare-flat aliases (transactionId, index, amount, scriptPublicKey). Use whichever your builder already uses for KasWare.
If UTXO list is empty: the connected address has no KAS. Tell the user to fund that kaspa:q, do not fake UTXOs.

Prepare is SUCCESS when you hold unsignedSafeJson and the list of user P2PK input indexes. Still no wallet popup.

============================================================
JOB 3 â€” Sign (first popup after Connect)
============================================================
const signed = await kcc.signPskt({
  txJsonString: unsignedSafeJson,
  options: { signInputs: userP2pkIndexes.map(i => ({ index: i, sighashType: 1 })) }
});
signed is a STRING.
UI: â€œA KCC20 window opened â€” check the address and tap Sign.â€
signInputs fund-safety:
  - ONLY the connected addressâ€™s P2PK inputs
  - NEVER covenant / KRON curve / pool / token-cell inputs (re-signing those is the usual KasWare PSKT break)
  - sighashType MUST be 1 (SIGHASH_ALL)
  - If you omit signInputs, KCC20 signs only unsigned inputs whose UTXO address matches the connected wallet
User Reject â†’ error "User rejected". Show it. Stop. No retry loop.
Diagnostics panel must NOT call signPskt.

============================================================
JOB 4 â€” Broadcast (optional, after Sign returns)
============================================================
const { txId } = await kcc.pushTx(signed);
or submit with your own node.
Do not Broadcast until Sign returned a string. Do not click Broadcast from diagnostics.

============================================================
COPY
============================================================
â€œNilla prepares the transaction. Your wallet signs. We never hold your key.â€
Connect: â€œKCC20 Wallet will open. Unlock it and tap Connect.â€
Sign: â€œReview in KCC20, then tap Sign.â€

============================================================
DO NOT
============================================================
- Load sdk.js on mount / app-switch / every render
- Call connect() just to read pubkey/UTXOs
- Clone/wrap a provider instance from before Connect
- Overwrite a real KasWare extension
- Require a Chrome extension for SCORPION
- Ask KCC20 to invent the route
- Sign covenant/curve/pool/token-cell inputs
- Fake grants without a txId
- Store keys / PIN / x-access-token
- Treat Tap2Tip as a blocker (no public PSKT SDK)

============================================================
DONE WHEN
============================================================
- sdkVersion is "166"
- Connect once â†’ popup closes â†’ getAccounts, getNetwork, getPublicKey, getUtxoEntries all succeed with no second popup
- Prepare produces unsigned Safe JSON from those reads + KRON quote
- signPskt opens the real KCC20 Sign sheet and returns a signed string after Approve
- Reject is handled
- KasWare path still works when that adapter is selected
- No diagnostic sign/broadcast buttons

REPLY with:
1) window.kcc20.sdkVersion
2) Job 1 four calls: SUCCESS/FAILURE + redacted shapes
3) whether Prepare now has unsigned Safe JSON
4) whether you stopped before Sign (correct until Job 1+2 pass) or Sign returned a string
```
