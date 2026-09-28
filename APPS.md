# Apps (You → Apps)

Open App for a **hosted dApp loads in an in-wallet iframe**, except **KasOdds** which opens a **new tab** for now (`window.open('https://kasodds.com')`). Their site sends `X-Frame-Options: DENY` / `frame-ancestors 'none'`.

Grid tap → docs sheet (Overview / Features / Workflow / Start) → **Open App**.

## Iframe hosts

| App | Screen | Frame | URL |
|---|---|---|---|
| TTT | `#ttt-screen` | `#ttt-frame` | `https://tttz.xyz/?kcc20_browser=1` |
| KasDistro | `#kasdistro-screen` | `#kasdistro-frame` | `https://kasdistro.com/?kcc20_browser=1` |
| KBUILD | `#kbuild-screen` | `#kbuild-frame` | `kbuild/index.html` (same origin) |
| Kaspa Browser | `#browser-screen` | `#browser-frame` | admin-only |

`showAppIframe(id)` shows one of those screens and hides the rest. Close returns to Apps when opened from the grid.

After load, ping the frame with `host-ready` so Connect talks to this PWA (`pingTttDappFrame` / `pingKasdistroDappFrame`).

A hosted app that wants to sit in this iframe must allow this origin:

```
Content-Security-Policy: frame-ancestors https://kcc-20-wallet.vercel.app
```

## New tab (for now)

| App | Open |
|---|---|
| KasOdds | `window.open('https://kasodds.com')` — catalog `open: 'tab'` |

Do not iframe KasOdds until they allow this origin as a frame ancestor.

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

`APP_CATALOG` in `js/app.js`. Hosted dApps set `open: 'iframe'`. KasOdds is `open: 'tab'`. Internal apps set `open: 'internal'`.
