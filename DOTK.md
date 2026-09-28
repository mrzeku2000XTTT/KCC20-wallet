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

## Build your own `.k` PWA (Google AI Studio / Cursor / Replit)

1. Fork https://github.com/mrzeku2000XTTT/KCC20-wallet
2. Keep `js/tx.js`, `js/crypto.js`, `js/kasware.js`, `vendor/kaspa`, Veyra Approve sheets.
3. Change the HTML/CSS (Forge templates, or a vibe prompt).
4. Before `sdk.js`, set:

```html
<script>
  window.KCC20_WALLET_ORIGIN = 'https://YOUR-DEPLOY.vercel.app';
  window.KCC20_DOTK = 'alice.k';
  window.KCC20_RDNS = 'k.alice';
</script>
<script src="https://YOUR-DEPLOY.vercel.app/sdk.js?v=177"></script>
```

5. Deploy as a PWA. dApps that load that `sdk.js` (or listen for `kaspa:announceProvider`) see **alice.k** next to Scorpion.

Paste the full agent prompt from https://kcc20-sdk.vercel.app/dotk.html

## What `.k` is today

On-chain name primitives exist (DotK / KNS). Linking a name to this PWA is **identity display + discovery**, not a new key. The Schnorr key still lives in the wallet. Do not treat `alice.k` as a private key.
