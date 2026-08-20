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
- KCC20 watchlist
- AI + manual covenant builder (existing `kccApi` backend)

Keys stay in `localStorage`. Confirmed sends still use the proven covenant builder to assemble the transaction.
