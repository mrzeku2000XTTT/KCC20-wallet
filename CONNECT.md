# KCC20 Wallet connect (no Chrome extension)

Live wallet: https://kcc-20-wallet.vercel.app  
SDK: https://kcc-20-wallet.vercel.app/sdk.js  
Demo: https://kcc-20-wallet.vercel.app/dapp-demo.html

KCC20 Wallet is a **hosted PWA**. It is **not** a Google/Chrome extension. Keys never leave the wallet origin. A dApp (Nilla, TTT, or yours) **builds the unsigned PSKT**, then hands it to this wallet. The user reviews an Approve sheet and PIN-signs (or KasWare, if they turned that on).

This is the same model Nilla asked Tap2Tip for: find the route, build the tx, wallet signs.

## What exists today

| Piece | What it is |
|---|---|
| `sdk.js` | One script. Creates `window.kcc20`. Opens the PWA (popup / iframe / `web+kcc20:`). Talks `postMessage` `ns:'kcc20'`. |
| Host | `wallet/js/dappConnect.js` — Approve / Reject overlay. Native `signPsktJson` or KasWare. |
| KIP-12 | `sdk.js` announces `kaspa:provider` (`rdns: app.kcc20.wallet`) so a wallet-agnostic picker can list **KCC20 Wallet** next to KasWare / Kastle. |
| Protocol | Installed PWA handles `web+kcc20:` (see `manifest.json`). |

KIP-12 itself is still a **draft** ([kaspanet/kips#21](https://github.com/kaspanet/kips/pull/21)). KasWare remains an **extension** inject (`window.kasware.signPskt`). Use KCC20 when you do not want to require an extension.

## Install in a dApp

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
```

```js
const kcc = window.kcc20;
const accounts = await kcc.connect();          // popup: user Approves, then the window closes
const address = accounts[0];
const network = await kcc.getNetwork();        // silent — popup stays closed
const pubKey = await kcc.getPublicKey();       // silent — from the Connect session
const utxos = await kcc.getUtxoEntries(address); // silent — public Kaspa UTXOs for that address
const signed = await kcc.signPskt({
  txJsonString,                               // rusty-kaspa Safe JSON you built
  options: { signInputs: [{ index: 0, sighashType: 1 }] }
});                                           // popup: user Signs
const { txId } = await kcc.pushTx(signed);    // optional — or broadcast yourself
```

**Popup vs silent.** Connect / Sign / Send / Broadcast open the PWA. After Connect succeeds the popup **closes on purpose**. `getAccounts`, `getNetwork`, `getPublicKey`, `getUtxoEntries`, `getBalance`, `getHoldings`, `getTokenBalance` must keep working without it. Do not require a second Connect for Prepare. Do not keep the wallet window open.

KasWare-shaped aliases on the same object: `requestAccounts`, `signPskt`, `pushTx`, `getAccounts`, `getNetwork`, `getPublicKey`, `getUtxoEntries`, `getBalance`.

### Wallet-agnostic discovery (KIP-12)

```js
window.addEventListener('kaspa:provider', (ev) => {
  const { info, provider } = ev.detail || {};
  if (!info || !provider) return;
  // info.rdns === 'app.kcc20.wallet'  → KCC20 PWA
  wallets.set(info.rdns || info.uuid, { info, provider });
});
window.dispatchEvent(new Event('kaspa:requestProvider'));
```

Load `sdk.js` **before** you dispatch `kaspa:requestProvider`.

## Rules that keep funds safe

1. **You build. They sign.** Never send a private key. Never ask KCC20 to invent the route.
2. **Pass `signInputs`.** Only list the user’s P2PK inputs. Do **not** list covenant / pool / curve inputs. If you omit the list, KCC20 signs only unsigned inputs whose UTXO address matches the connected wallet.
3. **SIGHASH_ALL (1) only** on this build.
4. **User must Approve** connect, each sign, and each broadcast.
5. Network strings from `window.kcc20.getNetwork()` are `kaspa_mainnet` / `kaspa_testnet_10`. The KIP-12 provider normalizes to `mainnet` / `testnet-10`.

## Methods

| Method | Result |
|---|---|
| `connect()` / `requestAccounts()` | `string[]` addresses |
| `getAccounts()` | same, no extra prompt if already allowed |
| `getNetwork()` | `kaspa_mainnet` or `kaspa_testnet_10` |
| `switchNetwork(id)` | user confirms |
| `getPublicKey()` | hex |
| `getUtxoEntries(address?)` | UTXOs |
| `getBalance(address?)` | `{ confirmed, unconfirmed, address }` sompi |
| `getHoldings()` | KAS + KCC20 bags |
| `signPskt({ txJsonString, options })` | signed Safe JSON **string** |
| `pushTx(signedJson)` | `{ txId, node }` |
| `sendToken({ tick, amount, dest })` | KCC20 send (used by TTT Fund) |
| `disconnect()` | drop origin |

## What this is not

- Not a Chrome Web Store extension. No `chrome.runtime`.
- Not Tap2Tip. If Tap2Tip has no public PSKT/KIP-12 docs, do not block Nilla on them — KCC20 already does this handoff.
- Not a hosted signer. If the PWA is killed or locked, signing stops until the user reopens it.
- KasWare PSKT issues (extension-only, input-index / Safe JSON mismatches) are why native PIN sign exists. Prefer native KCC20 for Nilla.
