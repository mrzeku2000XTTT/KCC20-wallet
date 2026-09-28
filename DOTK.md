# Dot.K wallets

`.k` is **who**. Veyra is **what they may do**. The wallet **signs**. Kaspa **settles**.

A Dot.K wallet is a Scorpion-class PWA whose human name is `alice.k` (or any `*.k`). The face can be vibe-coded. The core is this repo: [KCC20-wallet](https://github.com/mrzeku2000XTTT/KCC20-wallet). dApps do not integrate a thousand UIs. They call the same `window.kcc20` / `kaspa:announceProvider` surface and may ask for a `.k` identity.

Page: https://kcc20-sdk.vercel.app/dotk.html

## dApp: detect `.k` as Connect

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js?v=177"></script>
```

```js
const kcc = window.kcc20;
const wallets = await kcc.discoverWallets();
// wallets[].info.identity  e.g. "alice.k"
// wallets[].info.rdns      e.g. "k.alice" or "app.kcc20.wallet"

await kcc.connect({ identity: 'alice.k' });
const who = await kcc.getIdentity();
// { name: 'alice.k', address: 'kaspa:q…', rdns }
```

Listen yourself:

```js
window.addEventListener('kaspa:announceProvider', (e) => {
  const info = e.detail?.info;
  if (/\.k$/i.test(info?.identity || '')) {
    // Dot.K wallet — use e.detail.provider.request({ method: 'kaspa_requestAccounts' })
  }
});
window.dispatchEvent(new Event('kaspa:requestProvider'));
```

## Build your own `.k` PWA — every prompt

Open https://kcc20-sdk.vercel.app/dotk.html#guide and copy **one step at a time**.

| Step | Paste into Google AI Studio / Cursor / Replit | Done when |
|---|---|---|
| 0 | Fill-in: `DOTK_NAME`, `RDNS`, `HOST`, `LOOK` | Those four strings exist |
| 1 | Fork KCC20-wallet. Stamp identity. Do not restyle. | `KCC20_DOTK` in index.html |
| 2 | Face only (HTML/CSS). Live KAS and QR stay real. | Home matches LOOK |
| 3 | PWA: manifest, Apple tags, **register `sw.js`**. Delete Scorpion’s `unregister()` block. | Manifest valid, SW activated |
| 4 | Announce `.k`. Add `demo-dapp.html`. | `discoverWallets()` shows DOTK_NAME |
| 5 | Vercel HTTPS. iPhone Add to Home Screen. Desktop install. | Standalone icon, Connect works |
| 6 | Fix pass if install or Connect failed. Do not rewrite `tx.js`. | Installed PWA + PIN sign |

Scorpion **unregisters** service workers on purpose. A Dot.K fork **must register** `sw.js` or it will not become a PWA.

Paste the full pack (all 7) with “Copy every prompt” on the page.

## What `.k` is today

On-chain name primitives exist (DotK / KNS). Linking a name to this PWA is **identity display + discovery**, not a new key. The Schnorr key still lives in the wallet. Do not treat `alice.k` as a private key.
