# KCC20 Wallet SDK (SCORPION) — dApp connect

**SDK repo (plug-and-play):** https://github.com/mrzeku2000XTTT/kcc20-sdk  
**Docs site:** https://kcc-20-wallet.vercel.app/docs.html  
Live wallet: https://kcc-20-wallet.vercel.app  
SDK: https://kcc-20-wallet.vercel.app/sdk.js?v=168
Argent: https://kcc20-sdk.vercel.app/argent.js · https://kcc20-sdk.vercel.app/argent.html  
Demo: https://kcc-20-wallet.vercel.app/dapp-demo.html  
Wallet app: https://github.com/mrzeku2000XTTT/KCC20-wallet

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
<script src="https://kcc-20-wallet.vercel.app/sdk.js?v=168"></script>
```

```js
const kcc = window.kcc20; // require kcc.sdkVersion === "168"
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
2. **Pass `signInputs`.** `index` is the **global** `tx.inputs[]` slot (0-based), not “the Nth wallet input.” Only list the user’s P2PK funding inputs. Do **not** list covenant / pool / curve / inventory inputs. If you omit the list (or list extras), v167 skips already-signed and P2SH inputs and signs only unsigned P2PK owned by this wallet.
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
| `pushTx(signedJson)` | `{ txId, node }` — **object**, not a hex string. Read `result.txId`. |
| `buyKron({ tick, amount })` | Buy any KRON KCC20. `amount` = KAS. Wallet builds TRADE. Live ticks: [tokens.html](https://kcc20-sdk.vercel.app/tokens.html) |
| `quoteKron` / `sellKron` | Preview / sell (sell amount = tokens) |
| `sendToken({ tick, amount, dest })` | KCC20 send (used by TTT Fund). Not a buy. |
| `compileVault({ type, params })` | Argent compiles a P2SH `kaspa:p`. User PIN-funds. See [argent.html](https://kcc20-sdk.vercel.app/argent.html). |
| `sendKas({ dest, amount })` | Plain KAS to `kaspa:q`. “Send to grandson” is this unless they want a dead-man. |
| `disconnect()` | drop origin |

## Buy on any vibe platform

```js
await kcc.buyKron({ tick: 'KKDAG', amount: '10' });
```

Canonical list of launched ticks: `https://api.kron.technology/api/registry/tokenlist?all=1` (also `/tokens.json` and `/api/tokenlist` on the SDK host). Skip `?` tickers. Agents: read `https://kcc20-sdk.vercel.app/llms.txt`.

Other wallets: list us via KIP-12; copy Connect-on-click, silent session, wallet-built `buyKron`, P2PK-only `signPskt` (global indexes), `pushTx` → `{ txId, node }`.

## What this is not

- Not a Chrome Web Store extension. No `chrome.runtime`.
- Not Tap2Tip. If Tap2Tip has no public PSKT/KIP-12 docs, do not block Nilla on them — KCC20 already does this handoff.
- Not a hosted signer. If the PWA is killed or locked, signing stops until the user reopens it.
- KasWare PSKT issues (extension-only, input-index / Safe JSON mismatches) are why **Nilla must not** ask KasWare to sign the whole covenant tx. Prefer native KCC20 `signPskt` for builder PSKTs.
- **`buyKron` / Home TRADE can use a KasWare chip.** SCORPION builds the swap and asks KasWare to sign **only the KAS funding input** (same `kronPsktPlan` as Home). Desktop Chrome/Edge with the extension. Phone = native PIN chip.
