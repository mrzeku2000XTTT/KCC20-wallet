# Scorpion memory — COOK desk

This file is what the A-Trade **Agent** is supposed to remember. Keys never leave the device or KasWare. This app never custodied funds.

Source of truth: [mrzeku2000XTTT/kaspa-xmss-covenants](https://github.com/mrzeku2000XTTT/kaspa-xmss-covenants)

## Networks

| Network | Address | COOK venues | Launch |
|---|---|---|---|
| **mainnet** | `kaspa:` | **KRON only** (live AMM) | KRON bonding curve on kron.technology |
| **testnet-10** | `kaspatest:` | **K.COM** + **Scorpion** | Cook deploys a real KCC20 V1 |

Never quote or swap **KRON** while this wallet is on Testnet-10. KRON is not on TN10. Never launch Cook while on mainnet — Cook’s public deploy is TN10.

## Signing (native and KasWare)

Same Schnorr key, two ways to sign. Toggle **Native / KasWare** on COOK.

- **Native** — import or create a 64-character hex key in this app. Network toggle rewrites the address prefix (`kaspa:` ↔ `kaspatest:`). PIN signs. Use this for TN10 if KasWare is stuck on mainnet.
- **KasWare** — extension signs PSKT / sends. App calls `switchNetwork('kaspa_testnet_10')` or `kaspa_mainnet` to match. Keys stay in KasWare. Watch-only profile here (no hex stored).

Cook fills, limits, mints, deploys, wraps: Cook returns an unsigned PSKT → native `createInputSignature` **or** `kasware.signPskt` → broadcast on the **same** network’s public node.

## Compound UTXOs (KIP-9)

Do **not** `sendKaspa(self, total − fee)`. KasWare treats that as a 0-spend self-transfer and leaves dust change. Dust change → **Storage mass exceeds maximum**.

Correct compound: merge every KAS UTXO into **one** output (empty `outputs`, `changeAddress = self`), sign native or KasWare PSKT, broadcast. Compounding N→1 does not incur storage mass. Splitting a large coin into a tiny leftover does.

## Trade

- **KRON (mainnet)** — `@kronsdk/kron-sdk` curve/pool quote + swap. Buy amount is KAS. Limit is a max/min price. Slippage re-checked on confirm.
- **K.COM (TN10)** — Cook `https://dev-api-kcc20.kaspa.com` via `/api/relay?path=`. Discovery, candles, orderbook, quote, fill, sweep, rest limit. Amount is **tokens**. Need a wrapper `marketId`. Empty limit takes the book; a limit rests if no fill.
- **Scorpion (TN10)** — tokens launched from this app (`kcc20_launched_v1`). If they have a Cook `tokenId`, they trade **exactly like K.COM** (same book, candles, buy/sell/limit). Show bid/ask from Cook discovery.

Skip rows with no ticker (`?`). Missing logos use `assets/ttt.png`.

## Agent

Runs only while this tab is unlocked. On TN10 arm a **K.COM / Scorpion** token id, not KRON. Buy-below / sell-above: Cook quote+fill when `tokenId` is set; KRON `lookupKronTick` + `executeKronTrade` on mainnet. KasWare will pop for each fill.

## Home vs COOK

Home **TRADE KCC20** is the simple mainnet KRON overlay. The full desk is COOK: COOK / Launch / Agent.
