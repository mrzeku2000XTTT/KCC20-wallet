# KCC20 Wallet

Non-custodial Kaspa PWA: native KAS, KCC20 token watchlist, and covenant vaults (time capsule, escrow, multisig). Mainnet send, fund, and sweep.

Live: https://mrzeku2000xttt.github.io/KCC20-wallet/

## Run locally

```bash
npx --yes serve -p 4173
```

Open http://localhost:4173

## GitHub Pages

Settings → Pages → Deploy from branch `main`, folder `/` (root).

## Vercel

Import this repo. Framework: Other. No build command. Root directory: `.`

## Features

- Video-background iOS shell (phone chrome on desktop, full-bleed on iPhone)
- Create / import Schnorr wallet (browser keygen)
- Live KAS balance, USD, UTXOs, activity from api.kaspa.org
- Send / receive (QR)
- Time capsule locks the exact KAS you type (leftover stays as change; it is not absorbed into the vault)
- Network fees shown on lock, send, sweep, and Activity (Toccata compute fee, usually 0.004–0.007 KAS)
- Live KCC20 balances (KRON, KKDAG / Kas Knight) from kascov.io — same source KasWare uses, auto-refresh
- Live KRC-20 balances from Kasplex
- UTXO compounder (merge coins into one UTXO)
- AI + manual covenant builder (existing `kccApi` backend)

Keys stay in `localStorage`. Confirmed sends still use the proven covenant builder to assemble the transaction.
