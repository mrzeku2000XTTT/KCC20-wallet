# Scorpion desk (You tab)

Local autonomous KRON desk. **Not a CEX bot.** This app never holds your funds and never sends keys off the phone.

## Why Scorpion “sees no volume”

CEX scalpers (Binance, Bybit, OKX, Kraken, Coinbase Advanced, KuCoin, Gate, Bitget, MEXC, Hyperliquid) sit on millisecond order books. Those venues **accept API bots** (REST + WebSocket, often KYC, withdraw-disabled keys).

KRON is an **on-chain AMM**. A thin pool looks like “no volume” because there is no book to scalp. The desk **refuses** a trade when fees, pool depth, or idx/AMM skew fail the gates. Waiting is the trade.

## How people actually bot-trade (and what we copied)

| Venue | Bots allowed? | How they get paid | What we do |
|---|---|---|---|
| Binance / Bybit / OKX | Yes, API keys | Spread, grid, funding, arb vs deep books | We do **not** deposit there |
| KRON AMM | You sign every spend | Tiny mean-revert if fee < ~80 bps and size < ~2% of pool | Desk wallet + PIN policy |
| Cook TN10 book | Same as K.COM | Limit/fill | Existing A-Trade Scorpion |

## Deploy

1. You → **Desk** (or the Scorpion desk card)
2. **New desk wallet** — fresh Schnorr key, stored with your other wallets
3. **Send it KAS** from the unlocked wallet (local)
4. Research a tick (`KKDAG`, etc.) — fact-check vs live AMM
5. **Sign and deploy desk** — PIN (or KasWare session) writes the policy
6. **Show desk key** anytime — it is yours
7. **Stop desk** kills the loop

The running bot spends **only** the desk address. Main wallet is untouched after you fund it.
