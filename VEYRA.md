# VEYRA — The Sovereign Thread

TTT Phase 6. A user-controlled signing protocol for the Kaspa application layer.

**DApps request. Wallets authorize. Users decide. Kaspa settles.**

This file is the working spec we come back to. The long essay lives with TTT (`TTTz.xyz`, Phase 6). This repo is the **open wallet** that implements the boundary: [KCC20 Wallet / Scorpion](https://kcc-20-wallet.vercel.app). Fork it: [FORK.md](./FORK.md).

| | |
|---|---|
| Name | VEYRA |
| Wallet | Scorpion (this PWA) |
| SDK | `window.kcc20` · pin `sdk.js?v=174` |
| Live | https://kcc-20-wallet.vercel.app |
| Spec page | https://kcc-20-wallet.vercel.app/veyra.html |
| Descriptor | `window.kcc20.veyra` · `kcc20.request('veyra')` |
| Fork | https://github.com/mrzeku2000XTTT/KCC20-wallet |
| Client docs | https://github.com/mrzeku2000XTTT/kcc20-sdk |

---

## 1. Roles

Three rooms. They do not collapse.

| Role | Job | In this stack |
|---|---|---|
| Application | Prepare unsigned work | TTT, KasDistro, Nilla, your site |
| Wallet | Hold keys, show the request, Approve or Reject | **Scorpion** (this PWA), or KasWare / Kaspire |
| Network | Verify and settle | Kaspa L1 (GHOSTDAG today; DAGKnight is future) |

The dApp never sees seed, PIN, or hex. The wallet never becomes the dApp. Kaspa does not custody.

---

## 2. The signing boundary

The dApp knows: the address it was allowed to use, the operation it asked for, the result of the sign.

The dApp does not receive: seed phrases, private keys, PIN, unrestricted signing, extra capability beyond that one request.

Connect is selection of an existing wallet, not creation of a new identity inside the dApp. Each sign is a discrete Approve. Reject is a first-class outcome (`User rejected` / `cancelled`). Authorization for one action does not grant the next.

Scorpion enforces this with an Approve sheet on Connect, `signPskt`, `sendKaspa`, `sendToken`, `buyKron`, and `pushTx`. After Connect the popup closes so reads stay silent. A later sign reopens the sheet.

---

## 3. Shipped interface (`window.kcc20`)

This is Veyra’s developer layer as it exists today. Additive. Pin the query.

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js?v=174"></script>
```

```js
window.kcc20.sdkVersion === '174'
window.kcc20.veyra.principle
await window.kcc20.request('veyra')
```

| Veyra concept | Method |
|---|---|
| Discovery | `kaspa:announceProvider` / `kaspa:requestProvider` · `rdns: app.kcc20.wallet` |
| Connection | `connect()` / `requestAccounts()` — **user click only** |
| Accounts | `getAccounts()`, `getPublicKey()`, `getUtxoEntries()`, `getBalance()`, `getHoldings()` |
| Network | `getNetwork()`, `switchNetwork(id)` (user confirms) |
| Signing | `signPskt({ txJsonString, options: { signInputs } })` |
| Settlement | `pushTx(signed)` → `{ txId, node }` |
| Token send | `sendToken` / `sendKcc20` — bag they already hold |
| KRON buy | `buyKron({ tick, amount })` — **amount is KAS**; wallet builds the covenant tx |
| Activity | `getActivityLog()` |
| This protocol | `veyra` / `getVeyra` — silent, no popup |

`signInputs.index` is the global `tx.inputs[]` slot. List only the user’s P2PK funding inputs. Do not list covenant, curve, pool, or inventory cells. SIGHASH_ALL (`1`) on this build.

Do not overwrite a real `window.kasware`. KasWare and Kaspire are BYO wallets; Scorpion is the PWA. You → Settings toggles extension signing. Phone browsers use PIN.

KCC-12 / KIP-12 are **drafts** (discovery). KCC-01 / KCC-02 / KCC-20 in kaspanet/kccs are **drafts** (conventions). KCC-20 transfers in this wallet are the live KRON/KCC20 covenant path. vProgs (`kaspanet/vprogs`) is a prototype; the TN10 tic-tac-toe guest is a demo lane. DAGKnight is not mainnet.

---

## 4. Agents

An agent may quote, route, and assemble. It may not sign.

Scorpion’s COOK Agent and Home TRADE prepare fills, then the Approve sheet runs. If the wallet is locked, the loop stops. Argent directs vault *compile* in the PWA; it does not generate XMSS keys for the user.

---

## 5. Open source

Scorpion is the reference Veyra wallet so people **do not start from scratch**. Clone [KCC20-wallet](https://github.com/mrzeku2000XTTT/KCC20-wallet), follow [FORK.md](./FORK.md), keep the signing boundary, change origin / rdns / branding. Implement the same `window.kcc20` surface so dApps do not fork.

The signing boundary is a public good. Anyone may inspect, audit, fork, and improve it.

---

## 6. What Veyra is not

A custodian. A seed collector. A mandatory wallet. A replacement for Kaspa, KasWare, or Kaspire. A consensus layer. A token. Authority over the user’s keys.

Veyra is the thread between applications and user-controlled signing.
