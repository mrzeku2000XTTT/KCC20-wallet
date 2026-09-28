# Apps (You → Apps)

Open App for a **hosted dApp loads in an in-wallet iframe**. Never `window.open`, never a new tab.

Grid tap → docs sheet (Overview / Features / Workflow / Start) → **Open App**.

## Iframe hosts

| App | Screen | Frame | URL |
|---|---|---|---|
| TTT | `#ttt-screen` | `#ttt-frame` | `https://tttz.xyz/?kcc20_browser=1` |
| KasDistro | `#kasdistro-screen` | `#kasdistro-frame` | `https://kasdistro.com/?kcc20_browser=1` |
| KasOdds | `#kasodds-screen` | `#kasodds-frame` | `https://kasodds.com/?kcc20_browser=1` |
| KBUILD | `#kbuild-screen` | `#kbuild-frame` | `kbuild/index.html` (same origin) |
| Kaspa Browser | `#browser-screen` | `#browser-frame` | admin-only |

`showAppIframe(id)` shows one of those screens and hides the rest. Close returns to Apps when opened from the grid.

After load, ping the frame with `host-ready` so Connect talks to this PWA (`pingTttDappFrame` / `pingKasdistroDappFrame` / `pingKasoddsDappFrame`).

A hosted app that wants to sit in this iframe must allow this origin:

```
Content-Security-Policy: frame-ancestors https://kcc-20-wallet.vercel.app
```

Do not fall back to a new tab if they send `X-Frame-Options: DENY`. Keep the iframe. They fix CSP.

## In-wallet panes (not iframes)

K Social, Proof of Fact, vProg TTT, Wallet Forge stay in `#app-*` inside `#build-screen`.

K Social is the Kaposts / KaChat L1 feed. Icon is the black rounded square with the white Kaspa K (`assets/ksocial.svg`). Do not iframe k-social.network.

## Icons

- TTT: `assets/ttt.png`
- KasOdds: `assets/kasodds.svg` (their `/icon.svg`)
- KasDistro: `assets/kasdistro.png`
- KBUILD / vProg TTT / Forge: official Kaspa mark `assets/kas.svg`
- K Social: `assets/ksocial.svg` (black tile, white Kaspa K)
- Proof of Fact: `assets/proof.svg`

## Catalog

`APP_CATALOG` in `js/app.js`. Hosted dApps set `open: 'iframe'`. Internal apps set `open: 'internal'`.
