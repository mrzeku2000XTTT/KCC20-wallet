# Base44 prompt — fund DD credits with real KKDAG from the KCC20 iframe

Paste this into Base44 as the next task. Do not invent a fake “Add 1000 KKDAG” mint. Do not build a KCC20 covenant transaction inside TTT. The parent KCC20 wallet already signs and broadcasts.

---

## What already works (do not break)

- TTT (`https://tttz.xyz`) is iframed inside KCC20 Wallet at `https://kcc-20-wallet.vercel.app` (`?kcc20_browser=1`).
- TTT already loads `https://kcc-20-wallet.vercel.app/sdk.js`, which creates `window.kcc20`.
- Connect / Sign PSKT already talk to the parent via `postMessage` (`ns: 'kcc20'`). Keys never leave the wallet. Keep that.
- The DDWallet button already shows KAS / KKDAG / KRON colors and a Hide holdings toggle. Keep the toggle and the logos.

## What you must change

Replace the fake credit grant / “Add 1000 KKDAG” path with a **real on-chain KKDAG payment** to your DD treasury.

User flow:

1. User buys KKDAG on the native KCC20 Vercel wallet (Home / Tokens KRON trade). That is already live.
2. User opens TTT from the wallet (iframe). Taps Connect. Same `window.kcc20.connect()` as today.
3. DDWallet UI reads **live wallet KKDAG** from the parent (not from your off-chain starter grant).
4. User taps **Fund DD credits** (or “Send KKDAG”). TTT calls `window.kcc20.sendToken(...)`.
5. The **parent wallet** pops the existing Approve sheet: amount, ticker KKDAG, full treasury `kaspa:q…`. User taps **Sign & send**. Wallet builds the KCC20 transfer, signs, broadcasts.
6. TTT receives `{ txId, tick, amount, dest, from }`. Show pending, then credit that user’s DD ledger once, keyed by `from` + `txId`.
7. DD orchestrator then deducts **those credits** per request. Admins stay ∞ / free. Never invent credits.

## Exact APIs (sdk.js on Vercel, BUILD 141+)

Load once:

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
```

Detect iframe wallet:

```js
const kcc = window.kcc20;
const embedded = !!(kcc && kcc.isEmbedded && kcc.isEmbedded());
```

Connect (already working — keep):

```js
const accounts = await kcc.connect();
const address = accounts[0]; // kaspa:q…
```

Show live bag after connect (and on a 8s poll while the DD wallet sheet is open):

```js
const bag = await kcc.getTokenBalance('KKDAG');
// bag.balance = human units string, bag.raw = integer string, bag.decimals, bag.tick
```

Optional: `await kcc.getHoldings()` → `{ address, network, holdings: [{ tick, balance, raw, decimals, protocol }] }`.

Fund credits — this is the Sign popup:

```js
const TREASURY = 'kaspa:q…'; // FULL DD treasury. Never truncate. Must be kaspa:q (not kaspa:p).

const paid = await kcc.sendToken({
  tick: 'KKDAG',
  amount: String(amountHuman), // e.g. '1000'
  dest: TREASURY
});
// paid.txId, paid.amount, paid.from, paid.dest, paid.explorer
```

Aliases that also work: `kcc.request('fundCredits' | 'payToken' | 'sendKcc20', { tick, amount, dest })`.

If the wallet holds 0 KKDAG, sendToken throws: buy KKDAG on Home → Tokens first. Show that error in the DDWallet UI. Do not fall back to a fake grant.

## Credit ledger (your backend)

Table/entity (create if missing): `DdCreditDeposit`

- `txid` unique (primary)
- `from` = payer kaspa:q
- `treasury` = dest
- `tick` = `KKDAG`
- `amount` number
- `status` = `pending | credited | rejected`
- `created_at`

On `sendToken` resolve:

1. Insert pending row keyed by `paid.txId`. If txid already exists, do nothing (idempotent).
2. Add `amount` to that user’s DD credit balance (user key = connected kaspa address).
3. Optional confirm (do not use the KRON **trades** endpoint — this is a **transfer**, not a DEX swap):

```
GET https://idx.kron.technology/v1/kcc20/token/KKDAG/address/{USER}/ 
GET https://idx.kron.technology/v1/kcc20/token/KKDAG/address/{TREASURY}/
```

User bag should drop; treasury bag should rise. kas.fyi: `https://kas.fyi/transaction/{txId}`.

Spent KKDAG in the orchestrator accrues against the treasury **as credits consumed**, not as a second on-chain pull. You already deducted credits per request — keep that, but the balance must come from these deposits (plus admin ∞).

Remove:

- Starter grant of 1000 KKDAG for non-admins
- Any button that credits without a `txId` from `sendToken`
- Any path that asks TTT to construct a KCC20 PSKT

Keep:

- Hide holdings toggle
- Token logos (KAS green, KKDAG `#7aa2f7`, KRON gold)
- Admin free / ∞
- Connect + Sign for other TTT apps

## UI copy

- Live line: `Wallet KKDAG: {bag.balance}` (from `getTokenBalance`)
- Credit line: `DD credits: {ledger}` (your off-chain balance)
- Button: **Fund with KKDAG** (opens parent Sign sheet)
- While waiting: `Sign in KCC20 Wallet…`
- After txId: `Credited {amount} KKDAG · {short txId}` + explorer link
- If not embedded and `window.kcc20` missing: `Open TTT from KCC20 Wallet (Profile / TTT icon) so the parent can sign.`

## Constraints

- Mainnet only. If `getNetwork()` is not `kaspa_mainnet`, tell the user to switch off TN10 in the wallet.
- Treasury must be the **full** `kaspa:q…` you already use (`kaspa:qq5yhvly…` was truncated — paste the complete address into `TREASURY`).
- Never log or store `x-access-token`, private keys, or PSKT signing secrets. You never see keys.
- Do not call KasWare from TTT when embedded. The parent wallet is the signer.
- One credit per `txId`. Never credit twice.

## Test

1. In KCC20 Wallet, buy a small amount of KKDAG on Tokens.
2. Open TTT iframe, Connect. Wallet KKDAG should match Home holdings.
3. Tap Fund with e.g. 10 KKDAG. Parent sheet must show treasury + amount. Approve. PIN if asked.
4. DD credits increase by 10. Wallet KKDAG decreases. kas.fyi shows the tx.
5. Run one DD request as a non-admin: credits drop. Admin: still free.
6. Tap Fund again with the same txid replay: credits must not double.

Ship that. No fake mint.
