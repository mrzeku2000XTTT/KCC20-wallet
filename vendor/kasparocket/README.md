# @kasparocket/sdk

The official KaspaRocket SDK. Quotes, swaps, limit orders and market data on Kaspa.

**This package holds, derives and reads no private key.** It builds unsigned transactions; you sign them, with whatever you like.

```bash
npm install @kasparocket/sdk
```

**Node 18 or later** — for native `fetch` and `BigInt`. On Node 16 `fetch` does not exist and the client refuses to construct, with an explicit message.

**ESM and CommonJS**, both:

```js
import { KaspaRocket } from "@kasparocket/sdk"       // ESM
const { KaspaRocket } = require("@kasparocket/sdk")  // CommonJS
```

TypeScript types resolve in both modes (`node10`, `node16`, `bundler`).

### Next.js

If you consume the SDK from a linked working directory (monorepo, `file:`), Next needs to know it lives outside the project root:

```ts
// next.config.ts
transpilePackages: ["@kasparocket/sdk"],
turbopack: { root: path.join(__dirname, "..") },
outputFileTracingRoot: path.join(__dirname, ".."),
```

Without this, the build fails on `Module not found` without mentioning either the link or the root. An install from npm does not have this problem.

---

## Getting started

```ts
import { KaspaRocket, kasToSompi, formatKas } from "@kasparocket/sdk"

const kr = new KaspaRocket({
    apiKey: process.env.KR_API_KEY,   // optional — see "Revenue share"
    network: "testnet-10",            // the only network deployed today
})

// 0. Resolve the pool. Every trading call needs `lpCovenantId`, and no token
//    route carries it: it lives on the covenant, not on the token record.
const pool = await kr.catalogue.poolCovenant(tokenId)
if (!pool) throw new Error("this token has no pool yet")
const lpCovenantId = pool.lp_amm_covenant_id

// 1. Quote, committing to nothing
const quote = await kr.quote({
    tokenId, lpCovenantId,
    direction: "buy",
    kasBudgetSompi: kasToSompi("100"),
})
// `amountTokens` is in RAW units (1000 = 1 token) — display `amountTokensDisplay`.
console.log(`${quote.amountTokensDisplay} tokens for ${formatKas(quote.fee.total)} KAS in fees`)

// 2. Preview the routing — this is what you show the user
const preview = await kr.route({
    tokenId, lpCovenantId, address,
    side: "buy", kind: "market", budgetSompi: kasToSompi("100"),
})

// 3. Build the transaction, carrying the preview's commitment
const plan = await kr.planTrade({
    tokenId, lpCovenantId, address,
    side: "buy", kind: "market", budgetSompi: kasToSompi("100"),
    expected: preview.attendu,
})

// 4. Sign and broadcast — the key never leaves your signer
await kr.signAndSubmit(plan, mySigner)
```

**No host to configure.** One origin serves both APIs — transactions under `/pro-api`, the catalogue under `/api`. Pass `apiUrl` and `catalogueUrl` only to point at your own instance.

---

## Four things to know before writing any code

### 1. Every amount is a `bigint`

Kaspa amounts are `u64` in sompi (1 KAS = 100,000,000 sompi). A JavaScript `number` is a double: **past 2^53 it silently loses units**. The SDK therefore never exposes a `number` for an amount.

```ts
kasToSompi("1.5")        // 150000000n
formatKas(150_000_000n)  // "1.5"
```

`kasToSompi` **truncates** below the sompi, it does not round: nobody expects an input of `0.000000009` KAS to become `0.00000001`.

Two consequences worth knowing before they surprise you in production:

```ts
JSON.stringify(quote)     // ❌ TypeError: Do not know how to serialize a BigInt
fees.total / 2            // ❌ TypeError: Cannot mix BigInt and other types
```

Logging a quote, caching it in Redis, returning it from a webhook — a bot does that constantly, and every one of those crashes. Hence:

```ts
import { toJsonSafe } from "@kasparocket/sdk"

await redis.set(key, JSON.stringify(toJsonSafe(quote)))
bot.sendMessage(id, `Fee: ${formatKas(fees.total)} KAS`)
```

`toJsonSafe` returns amounts as **strings**, not `number`s: converting them back to floats would reintroduce exactly the precision loss `bigint` avoids. A string reads back with `BigInt(...)` losslessly.

For arithmetic, stay in `bigint` (`fees.total / 2n`), or go through `formatKas` for display.

### 2. A token amount is not a token count

Tokens travel as **integer raw units**, exactly as KAS travels in sompi. One
token is 1,000 raw units, so a raw balance printed as-is reads a thousand times
too large. Nothing in the payload warns you: a `bigint` of raw units looks
exactly like a `bigint` of tokens.

```ts
import { formatTokens, tokensToRaw, tokenPriceSompi, formatKas } from "@kasparocket/sdk"

formatTokens(5_000_000n)    // "5000"      — not "5000000"
formatTokens(1n)            // "0.001"     — one raw unit is not nothing
tokensToRaw("1.234")        // 1234n
tokensToRaw("0.0009")       // 0n          — below one raw unit, TRUNCATED
```

**A price scales the other way.** Prices cross the wire as sompi per RAW unit —
a token worth 0.23 KAS travels as `23000`. Multiply, do not divide:

```ts
formatKas(tokenPriceSompi(23_000n))   // "0.23" per token
```

That is the most tempting mistake in the whole conversion, because dividing
gives a number a thousand times too small that still looks plausible on screen.

> **The scale is a protocol constant, identical for every token.** There is
> deliberately no per-token `decimals` field: the contracts are compiled around
> `RAW_PER_TOKEN`, so it cannot change without a redeploy. `kr.protocol()`
> publishes it under `token` anyway — compare it against the constant your
> package ships and a version mismatch becomes something you detect, not
> something a customer reports.

### 3. The SDK does not sign — you supply a `Signer`

```ts
import type { Signer, PlannedTransaction } from "@kasparocket/sdk"
import {
    instructionsToSign, scriptP2pkh, spliceCovenantSignature,
} from "@kasparocket/sdk"

const mySigner: Signer = {
    getAddress: () => address,
    async sign(planned: PlannedTransaction) {
        // Every input that needs a signature — both kinds, never the "final" ones.
        for (const instruction of instructionsToSign(planned)) {
            const input = planned.tx.inputs[instruction.inputIndex]
            // Your job: a raw 65-byte signature over this input's sighash.
            const signature = await mySignature(planned.tx, instruction.inputIndex)

            input.signatureScript = instruction.kind === "p2pkh"
                ? scriptP2pkh(signature)                            // write a new script
                : spliceCovenantSignature(instruction, signature)   // splice into the prebuilt one
        }
        return planned.tx
    },
}
```

> **Three kinds of input, not two.**
>
> `final` — already complete. The contract requires no signature and the server built the whole script. **Write nothing to it.** Overwriting it gets the transaction rejected with `script ran, but verification failed`, a message that does not say which input is at fault.
>
> `covenant-leader` — the subtle one. It looks like a covenant input, so it is tempting to leave it alone; it nonetheless requires the user's signature, spliced into the prebuilt script at the offsets supplied. **Every order fill has one**: the vault of the order being filled. A signer that only handles `p2pkh` leaves it empty, and every fill fails.
>
> Both helpers above validate before they write: `spliceCovenantSignature` refuses a placeholder that is not zeroed, rather than signing a script it was not shown.
>
> Copy each input's `computeBudget` field through untouched. It is not part of the sighash, but the node refuses the transaction without it.

> **Check your digest against ours before signing.** Every signable instruction carries a `sighash` — the exact 32 bytes that input expects. One comparison, and a wrong digest costs you a line of logging instead of a day:
>
> ```ts
> if (ins.sighash && toHex(myDigest(planned.tx, ins.inputIndex)) !== ins.sighash) {
>     throw new Error(`digest mismatch on input ${ins.inputIndex}`)
> }
> ```
>
> Nothing secret is disclosed — the digest derives entirely from the transaction you already hold.

> **The digest changes with the transaction version — and kaspa-wasm cannot compute it for a trade.**
>
> Plain sends are `version: 0`; every trade is `version: 1`. At version 1, `sigOpCount` **leaves** the digest (both the aggregate and the per-input byte, gated on `tx.version < 1` in rusty-kaspa), and the output hash **commits to each output's covenant**.
>
> That second rule is the trap: kaspa-wasm's `Transaction` type has nowhere to hold an output covenant, and `deserializeFromSafeJSON` drops it silently. `createInputSignature` therefore computes a digest missing a committed field, and **can never sign a pool trade correctly**. Compute the digest from the plan object we return — it carries the covenants — and sign that.
>
> The symptom gives you nothing: `false stack entry at end of script execution`, no input named. And one rejection is not one bad input: the script engine stops at the first failure, so your `p2pkh` input is probably wrong too.

A plan may contain **several chained transactions** (`plan.transactions`) when many UTXOs must be swept. A Kaspa txid excludes signature scripts, so the chain's outpoints are already final at build time: sign everything offline, then submit **in order**. `signAndSubmit` handles that.

### 4. The preview commits the price

`route()` returns an `attendu` field. Passing it back to `planTrade({ expected })` makes execution **refuse** if the market moved between preview and signature.

Omitting it means accepting execution at a price the user never saw. An arbitrage bot may want to go without; a human-facing interface never should.

---

## A sale can cost more than it returns

A quote reports the gross pool flow *and* the fee. Subtracting one from the other is left to you, nobody does it, and a "sell" button written in good faith on the gross figure quietly spends the user's money.

So the quote does the subtraction:

```ts
quote.netKasSompi   // what the user POCKETS (sell) or PAYS (buy), fees included — SIGNED
quote.uneconomic    // true when a sale returns less than it costs
```

Selling 1,000 tokens can return 0.12 KAS against a 3 KAS fee floor: `netKasSompi` is then negative. Show `netKasSompi`, not the gross flow, and branch on `uneconomic` rather than comparing amounts yourself — a boolean is harder to get backwards than a pair of `bigint`s, and this is a case where backwards costs real money.

```ts
if (quote.uneconomic) return refuse("this sale costs more in fees than it returns")
```

---

## Placing orders

Placing a limit order is the one plan that returns something **besides** transactions:

```ts
const plan = await kr.planCreateOrder({
    address, tokenId, lpCovenantId,
    side: "buy",
    priceSompi: kasToSompi("0.0003"),
    tokens: 50_000n,
})

// signAndSubmit forwards `plan.order_row` for you.
await kr.signAndSubmit(plan, mySigner)

// Submitting by hand? Then you must pass it yourself:
await kr.submit([signedTx], plan.order_row)
```

> **`order_row` is what makes the order exist.** An escrow is discovered on-chain only when it is *spent*, and nobody spends an order the book has never heard of. Drop this field and the transaction still succeeds, the funds still lock — and the order is invisible forever, fillable by no one. Cancelling is then the only way to get the money back.

There is a floor on placement, and it is worth reading before you size an input field:

```ts
const { limits } = await kr.protocol()
if (tokens * priceSompi < limits.minOrderValueSompi) {
    return refuse("order below the minimum value")
}
```

It used to surface only as a `422` at submit time, after the user had typed an amount and signed. Note the floor applies to **placement only** — an order filled down below it stays fillable, so never hide a resting order because it now sits under the threshold.

---

## Creating a token

Three steps, under `kr.tokens`. Nothing is deployed and nothing is charged until the deposit arrives.

```ts
const session = await kr.tokens.createSession({
    creatorAddress: userAddress,
    name: "Rocket Coin",
    ticker: "RKT",
    description: "…",
    imageUrl: "https://…",       // REQUIRED — see below
})

console.log(session.depositAddress, formatKas(session.amountSompi))

const { balance_sompi } = await kr.tokens.depositBalance(session.sessionId)

const result = await kr.tokens.run(session.sessionId, (event) => {
    if (event.message) console.log(event.message)
})
```

`run` streams each step and completes in the background: even if your process dies mid-way, the flow is never cut inside a transaction. Poll `kr.tokens.session(id)` to find out where it got to — **calling `run` again pays for a second deployment.**

> **`imageUrl` is required, not optional.** A session opened without it comes back `422`, before anything is deployed or charged, and the SDK types it as required so your compiler says so first. It is a deployment rule rather than a style guide: a token with no image is indistinguishable from every other token with no image, everywhere it appears.

---

## Revenue share

Without an API key everything works: you are simply not identified as a partner.

With a key, the platform fee is split:

| | No partner | With partner |
|---|---|---|
| KaspaRocket treasury | `max(2 KAS, 1.5% of flow)` | `max(2 KAS, 1% of flow)` |
| Your address | — | `max(1 KAS, 0.5% of flow)` |

The two floors are **independent**, not a subdivision of the direct floor. The consequence, and this is the point that matters for your users:

| Flow traded | Direct total | Total via partner | You receive |
|---|---|---|---|
| 10 KAS | 2 KAS | 3 KAS | 1 KAS |
| 200 KAS | 3 KAS | 3 KAS | 1 KAS |
| 1,000 KAS | 15 KAS | **15 KAS** | 5 KAS |
| 10,000 KAS | 150 KAS | **150 KAS** | 50 KAS |

**Above 200 KAS of flow, your user pays exactly the direct tariff** — it is KaspaRocket that gives up a third of its share, not the user who pays more. Below that, the extra cost is capped at 1 KAS.

### What is billable

`swap`, `fill`, `trade`. Nothing else.

**Placing** a limit order charges nothing — the charge happens at the fill. So you earn nothing on a placement, but you earn on every fill **you build**. The beneficiary is whoever builds the transaction, not whoever placed the order: that party is already paying the fee.

### Your fee address is not a parameter

It is attached to your key, server-side. The SDK has no way to put it in a request, and that is deliberate: no contract verifies this output, so if the address travelled in the request body, anyone could assign your share to themselves.

To change it, contact us. To read it:

```ts
const p = await kr.protocol()
console.log(p.partner?.feeAddress, p.partner?.scopes)
```

### Estimating without a network call

```ts
kr.estimateFees(kasToSompi("1000"))
// { treasury: 1000000000n, partner: 500000000n, total: 1500000000n }
```

Purely local — usable on every keystroke while a slider moves. The rates come from `kr.protocol()`, hence from the server: call it once at startup so the estimate is current. **The amount that counts is still the plan's.**

### Two kinds of key

A bot runs on a server; a site and a wallet run in a browser. The same key cannot serve both: in a bundle, it is public — that is a property of the medium, not negligence.

| | Prefix | Where | Restriction |
|---|---|---|---|
| **Secret** | `kr_live_…` | server only | none |
| **Publishable** | `krpub_live_…` | browser | declared origins |

```ts
// Bot, backend, scheduled job
new KaspaRocket({ apiKey: process.env.KR_SECRET_KEY })   // kr_live_…

// Site, extension, wallet
new KaspaRocket({ apiKey: "krpub_live_a3f2c1d0_…" })     // in the bundle, knowingly
```

The prefix makes the distinction visible at a glance: seeing `krpub_` in a bundle is normal, seeing `kr_live_` is an incident. No need to consult the database to know which one leaked.

**What a stolen publishable key allows — and does not.** It gives access to no funds: your fee address is server-side, and whoever uses it *enriches* you rather than robbing you. The real risk is exhausting your quota. The origin check bounds that, without pretending to a confidentiality that is impossible.

A publishable key is only accepted if the request carries a declared `Origin` header. The browser sets it itself — it is the one header a page cannot forge. Outside a browser it is refused, with a message pointing you at a secret key.

Declare your origins at registration, in the header's exact format: `https://mysite.com`, with no path and no trailing slash.

---

## Errors

Every error is a `KaspaRocketError` with a `kind` you can branch an `if` on. The message is documentation, not a contract.

```ts
import { KaspaRocketError } from "@kasparocket/sdk"

try {
    await kr.planTrade({ … })
} catch (e) {
    if (e instanceof KaspaRocketError) {
        switch (e.kind) {
            case "auth":            /* key missing, wrong, or revoked */ break
            case "forbidden":       /* key valid, scope missing */ break
            case "rate_limit":      /* e.retryAfterMs says how long to wait */ break
            case "conflict":        /* the chain refuses: liquidity, balance, order taken */ break
            case "invalid_request": /* fix the request */ break
            case "unavailable":     /* node or database down */ break
            case "network":         /* timeout, drop, unreadable response */ break
        }
        if (e.retryable) { /* retrying as-is makes sense */ }
    }
}
```

`conflict` is **not** `retryable`, by design: chain state moved, so you must re-quote. Retrying as-is would fail identically — or worse, succeed at a price the user never approved.

The SDK retries automatically on `rate_limit`, `unavailable` and `network` (two attempts by default, exponential backoff with jitter). `submit` is **excluded**: replaying a submission can produce a double send, and that is yours to decide.

---

## Reference

### Construction

```ts
new KaspaRocket({
    apiUrl?: string,        // default: the network's public instance
    apiKey?: string,
    catalogueUrl?: string,  // default: the network's public catalogue
    network?: "mainnet" | "testnet-10" | "testnet-11",
    timeoutMs?: number,     // default 30,000
    maxRetries?: number,    // default 2
    fetch?: typeof fetch,   // for tests
})
```

### Reads

| Method | Returns |
|---|---|
| `protocol()` | The schedule and limits in force **for you** (cached) |
| `health()` | Service status |
| `balance(address)` | KAS balance |
| `holdings(address)` | All of an address's tokens |
| `holding(address, tokenId)` | One specific token |
| `orderBook(tokenId)` | Resting bids and asks |
| `orders(address, opts?)` | An address's resting orders. `{ includeClosed: true }` adds the filled and cancelled ones |
| `poolStats(lp, tokenId)` | Pool statistics |
| `candles(lp, tokenId, opts)` | Candlesticks |

### Catalogue

Under `kr.catalogue`. These routes talk to the site's database — names, images, likes, comments, queues — not to the chain. Reads are public; writes require the `catalogue:write` scope.

| Method | Returns |
|---|---|
| `catalogue.poolCovenant(id)` | **The pool of a token** — `lpCovenantId` comes from here, and nowhere else |
| `catalogue.covenants(id)` | The raw covenant list behind it |
| `catalogue.tokens()` / `catalogue.token(id)` | A flat **array** of the catalogue / one token, in the DETAIL shape |
| `catalogue.search(q)` / `catalogue.sections()` | Search / the home page sections |
| `catalogue.likes(id, addr)` / `catalogue.comments(id)` | A token's likes / comments |
| `catalogue.analytics(opts)` / `catalogue.platformStats()` | Market data / platform statistics |
| `catalogue.championship()` | The championship: the levels, and where each token stands |

The list and the detail are **not the same shape**: `catalogue.tokens()` returns `token_name` and `image_url`, `catalogue.token(id)` returns `name` and `image` plus `creator`, `marketCap` and `socials`. `TokenRecord` therefore marks everything but `token_id` optional — declaring one shape for both would have been a lie that typechecks. Reading a name off the list? `token_name ?? name`.

#### The championship

One call returns the levels **and** the ranking: a cell of the table is an "achieved out of threshold", and the threshold comes from the levels.

```ts
import { nextLevel } from "@kasparocket/sdk"

const c = await kr.catalogue.championship()

for (const token of c.tokens) {
    const target = nextLevel(c.levels, token)   // null once everything is cleared
    if (target) {
        console.log(`${token.ticker}: level ${token.level}, aiming for ${target.level} ` +
                    `(${token.holders}/${target.min_holders} holders)`)
    }
}
```

Three things to know, without which the numbers surprise you:

- **`commenters`, `likers` and `holders` count only addresses that have already
  swapped this token** against its KaspaRocket pool. They are therefore smaller
  than `catalogue.likes()` on the same token. Both are correct; they do not
  measure the same thing.
- **A level is a conjunction**: it is cleared when all six thresholds are, not
  five. And levels are cleared in order. A level has no name — its rank is its
  identity; if your interface wants names, index your own on `level`.
- **It is not real time.** `refreshed_at` dates the last computation,
  `refresh_interval_s` gives the period. A swap that just happened is not in
  there yet.

The thresholds are administered from KaspaRocket and do change: read them from `levels`, do not copy them.

### Quoting and routing

| Method | Returns |
|---|---|
| `quote(params)` | Price against current pool state |
| `route(params)` | Curve / book split, cost, and the `attendu` commitment |
| `estimateFees(flow)` | Fee split, computed locally |

### Building transactions

All return an **unsigned** plan.

| Method | Billable |
|---|---|
| `planTrade(params)` | yes — the normal path, curve **and** book |
| `planSwap(params)` | yes — curve only, often a worse price |
| `planFillOrder(params)` | yes |
| `planCreateOrder(params)` | no — the charge happens at the fill. Returns `order_row`, which must reach `submit` |
| `planCancelOrder(params)` | no |
| `planSend(params)` | no |
| `planTransfer(params)` | no |
| `planMerge(params)` | no |

### Broadcasting

| Method | |
|---|---|
| `submit(transactions, orderRow?)` | Submits already-signed transactions |
| `signAndSubmit(plan, signer)` | Signs then submits, in order — and forwards `order_row` |
| `txIndexed(txid)` / `waitTxIndexed(txid)` | Has the indexer digested it? |
| `isUtxoConfirmed(address, txid)` | Is the UTXO visible to the node? |

---

## Development

```bash
npm install
npm run typecheck
npm test          # 80 checks, no network
npm run build     # ESM → dist/esm, CommonJS → dist/cjs
```

## Licence

MIT
