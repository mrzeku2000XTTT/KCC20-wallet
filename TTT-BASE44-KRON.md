# Base44 prompt — buy any KRON token from Tap2Tip (kcc20test)

Paste into the **tttz.xyz Base44 agent**. Do not invent a DEX. Do not build a KRON PSKT in TTT. The KCC20 wallet already quotes, builds, signs, and broadcasts — same as Home → TRADE.

## What already works (do not break)

- `sdk.js` → `window.kcc20`. Connect / Disconnect / `sendToken` (Fund KKDAG) stay as they are.
- Call **Connect / Buy / Pay / Disconnect only on a button tap**. Never on load, never on app switch.
- No TTT PIN pad. No `window.kasware.requestAccounts()` for this flow.
- `sendToken` = send a bag the user **already holds**. It is **not** a KRON buy.

## New: user buys KRON tokens on Tap2Tip test

User flow (kcc20test or a “Buy KRON” card):

1. User has KCC20 Wallet unlocked (mainnet) with some **KAS**.
2. Tap **Connect KCC20** once (if not connected).
3. Pick any live ticker (KKDAG, KRON, IFWEN, …) + KAS amount (e.g. 10).
4. Tap **Buy**. TTT calls `buyKron`. KCC20 popup shows quote (`10 KAS → ~N TICK`) → user PIN-Signs.
5. TTT gets `{ txId, tick, side, quote, explorer }`. Show pending + link. Do not fake a fill.

## Exact APIs (sdk v167+)

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js?v=167"></script>
```

Confirm `window.kcc20.sdkVersion === "167"` (or higher). Hard-refresh if missing `buyKron`.

```js
const kcc = window.kcc20;

// Optional preview (works inside KCC20 iframe). If it throws, skip UI preview — Buy sheet still quotes.
let preview = null;
try {
  preview = await kcc.quoteKron({ tick: 'KKDAG', side: 'buy', amount: '10' });
  // preview.kasHuman, preview.tokenHuman, preview.tick, preview.graduated
} catch (e) {
  /* show “Quote on Sign” */
}

// ONLY on Buy tap:
const bought = await kcc.buyKron({
  tick: String(tick).toUpperCase(), // any KRON KCC20, e.g. KKDAG
  amount: String(kasAmount)         // KAS to spend, e.g. '10'
});
// bought.txId, bought.quote.tokenHuman, bought.explorer
```

Sell (user already holds the tick):

```js
await kcc.sellKron({ tick: 'KKDAG', amount: '100' }); // token amount, not KAS
```

Aliases: `buyToken`, `sellToken`, `tradeKron({ tick, side: 'buy'|'sell', amount })`, `request('buyKron', { tick, amount })`.

## UI on kcc20test (keep it tiny)

- Tick input (default `KKDAG`)
- KAS amount input (default `10`)
- Live bag: `getTokenBalance(tick)` after connect
- Button **Buy KRON** → `buyKron` on that click only
- Result: txId + explorer. Error text from the wallet (0 KAS, TN10, bad ticker, user rejected)

Do **not** call `signPskt` for this buy. That is Nilla’s path (they build the PSKT). Tap2Tip must **not** assemble curve/pool inputs.

Do **not** use `sendToken` for this buy. `sendToken` sends KKDAG the user already has to an address (Fund DD).

## Errors to show, not swallow

| Message | Meaning |
|---|---|
| User rejected | They tapped Reject |
| KRON trade is mainnet | Wallet is on TN10 |
| Need KAS in this wallet | Fund the connected chip with KAS |
| … is not a KRON KCC20 | Bad / unknown tick |
| Amount too small for this curve/pool | Raise KAS amount |
| Tap Connect KCC20 Wallet | Call buyKron on the button click |

## Test

1. Open TTT from KCC20 Profile (iframe) or kcc20test with sdk v167.
2. Connect once.
3. Buy 10 KAS of KKDAG → Sign in KCC20 → txId. Holdings on Home show more KKDAG.
4. Repeat with another tick (e.g. IFWEN) if listed on KRON.
5. Switching apps does not open a popup. Only Connect / Buy / Pay / Disconnect do.

Ship that. Wallet builds the KRON swap. TTT only passes tick + KAS amount.
