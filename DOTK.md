# Dot.K wallets

`.k` is **who**. Veyra is **what they may do**. The wallet **signs**. Kaspa **settles**.

A Dot.K wallet is a Scorpion-class PWA whose human name is `alice.k` (or any `*.k`). The face is vibe-coded. The core is [KCC20-wallet](https://github.com/mrzeku2000XTTT/KCC20-wallet). dApps call the same `window.kcc20` / `kaspa:announceProvider` surface and ask for a `.k` identity.

The name itself is **official Dot.K** on Kaspa L1 (a covenant deed), not a nickname and not a `.kas` inscription.

| Official | URL |
|---|---|
| App | https://dotk.name |
| Read SDK | https://github.com/supertypo/dotk-sdk · npm `@dotk/sdk` |
| Register / transfer | https://github.com/supertypo/dotk-sdk-tx · npm `@dotk/sdk-tx` |
| API | https://api.dotk.name (TN10: https://api-tn10.dotk.name) |

Page: https://kcc20-sdk.vercel.app/dotk.html  
Live dApp: https://kcc20-sdk.vercel.app/dotk-dapp.html

Pin `sdk.js?v=178`.

## Why the first build still looks like Scorpion

The fork **starts** as Scorpion. Steps 1–6 stamp identity, restyle, install as a PWA, and announce `.k`. Home still has Wallet 1, TRADE KCC20, Compound, A-Trade because that is the template.

- **Step 7** replaces that chrome with `DOTK_NAME`.
- **Step 8** makes Connect open **your** `HOST`, not `kcc-20-wallet.vercel.app`.
- **Step 9** registers `identity → origin` so any dApp that loaded the official SDK can find you.
- **Step 10** buys the official `.k` with **this PWA’s Receive address** (`@dotk/sdk-tx`). That deed is who they are.
- **Step 11** pushes GitHub, deploys Vercel `HOST`, sets `records.url`, then [dotk-dapp.html](https://kcc20-sdk.vercel.app/dotk-dapp.html) Connects that HOST.

## dApp: detect `.k` and open THAT PWA

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js?v=178"></script>
```

```js
const kcc = window.kcc20; // require kcc.sdkVersion === "178"

const wallets = await kcc.discoverWallets();
// in-page announces + https://kcc20-sdk.vercel.app/dotk-wallets.json
// wallets[].identity  e.g. "alice.k"
// wallets[].origin    e.g. "https://alice-k.vercel.app"
// wallets[].rdns      e.g. "k.alice"

await kcc.connect({
  identity: 'alice.k',
  origin: 'https://alice-k.vercel.app'   // popup URL = origin/index.html?dapp=1
});

const who = await kcc.getIdentity();
// { name: 'alice.k', address: 'kaspa:q…', rdns }
```

`origin` is the popup host. Pass it whenever you know it. If you only have the name:

```js
await kcc.connect({ identity: 'alice.k' });
// resolveDotk() uses discoverWallets() then the registry.
```

Helpers:

```js
await kcc.listDotk();                 // registry rows
await kcc.resolveDotk('alice.k');     // { identity, origin, rdns }
await kcc.useWallet('https://alice-k.vercel.app');
await kcc.connectDotk({ identity: 'alice.k', origin: 'https://alice-k.vercel.app' });
```

Inspect the popup address bar. It must be `https://alice-k.vercel.app/index.html?dapp=1`. If it is `kcc-20-wallet.vercel.app`, the dApp loaded Scorpion’s `sdk.js` and never passed `origin` / a registry row.

Listen yourself:

```js
window.addEventListener('kaspa:announceProvider', (e) => {
  const info = e.detail?.info;
  if (/\.k$/i.test(info?.identity || '')) {
    // Dot.K wallet — e.detail.provider.request({ method: 'kaspa_requestAccounts', params: { identity, origin: info.origin } })
  }
});
window.dispatchEvent(new Event('kaspa:requestProvider'));
```

A dApp that only loaded Scorpion `sdk.js` still opens a listed Dot.K PWA because `discoverWallets()` merges [dotk-wallets.json](https://kcc20-sdk.vercel.app/dotk-wallets.json).

## How a name identifies the whole wallet

Best binding, three facts that must agree:

1. **Deed owner** — official `addressFor('alice.k')` is the PWA’s Receive `kaspa:` address (the key they created in *that* wallet). Buy in step 10 with no other wallet.
2. **Signer origin** — `HOST` is the Vercel HTTPS origin of that same PWA. `records.url` and `dotk-wallets.json` both store it.
3. **Connect** — `kcc20.connect({ identity: 'alice.k', origin: HOST })` pops `HOST/index.html?dapp=1`. After Approve, `getAccounts()[0]` must equal the deed owner.

If those three match, the dApp knows which person, which key, and which PWA. A typed `.k` without origin still uses the registry; a live lookup on `@dotk/sdk` is the chain’s word.

Live check: https://kcc20-sdk.vercel.app/dotk-dapp.html (Connect DOT.K top right).

## Registry

Live: https://kcc20-sdk.vercel.app/dotk-wallets.json

```json
{
  "identity": "alice.k",
  "rdns": "k.alice",
  "origin": "https://alice-k.vercel.app",
  "name": "alice.k"
}
```

Open a PR on [mrzeku2000XTTT/kcc20-sdk](https://github.com/mrzeku2000XTTT/kcc20-sdk) adding that row after you deploy.

## Build your own `.k` PWA — every prompt

Open https://kcc20-sdk.vercel.app/dotk.html#guide and copy **one step at a time**.

| Step | Paste into Google AI Studio / Cursor / Replit | Done when |
|---|---|---|
| 0 | Fill-in: `DOTK_NAME`, `RDNS`, `HOST`, `LOOK` | Those four strings exist |
| 1 | Fork KCC20-wallet. Stamp identity. Do not restyle. | `KCC20_DOTK` in index.html |
| 2 | Face only (HTML/CSS). Title is DOTK_NAME. Hide TRADE/Compound unless LOOK asks. | Home matches LOOK |
| 3 | PWA: manifest, Apple tags, **register `sw.js`**. Delete Scorpion’s `unregister()` block. | Manifest valid, SW activated |
| 4 | Announce `.k`. Add `demo-dapp.html` that loads **HOST/sdk.js** and `connect({ identity, origin: HOST })`. | `discoverWallets()` shows DOTK_NAME |
| 5 | Vercel HTTPS. iPhone Add to Home Screen. Desktop install. | Standalone icon, Connect works |
| 6 | Fix pass if install or Connect failed. Do not rewrite `tx.js`. | Installed PWA + PIN sign |
| 7 | Strip Scorpion chrome: Wallet 1, TRADE KCC20, Compound, A-Trade, KRON 24H. | Screenshot is not kcc-20-wallet.vercel.app |
| 8 | Connect pops **HOST**. demo-dapp loads HOST/sdk.js?v=178. Popup URL is HOST/index.html?dapp=1. | Address bar is HOST |
| 9 | Register `{ identity, rdns, origin: HOST }` in `dotk-wallets.json`. | Official sdk.js + `connect({ identity })` opens HOST |
| 10 | Buy official `.k` via `@dotk/sdk` + `@dotk/sdk-tx` with **this PWA Receive address**. | `lookup(name).kind === 'active'` and `addressFor === this wallet` |
| 11 | Push GitHub. Vercel HOST. `records.url = HOST`. Open [dotk-dapp.html](https://kcc20-sdk.vercel.app/dotk-dapp.html). | Connect pops HOST. Prove self-send Approves in their PWA |

Scorpion **unregisters** service workers on purpose. A Dot.K fork **must register** `sw.js` or it will not become a PWA.

Paste the full pack with “Copy every prompt” on the page.

Fork `index.html` **before** any other script:

```html
<script>
  window.KCC20_WALLET_ORIGIN = "https://alice-k.vercel.app";
  window.KCC20_DOTK = "alice.k";
  window.KCC20_RDNS = "k.alice";
</script>
```

`RDNS` must be unique. Do not keep `app.kcc20.wallet`.

## What `.k` is today

On-chain name primitives exist (DotK / KNS). Linking a name to this PWA is **identity display + discovery**, not a new key. The Schnorr key still lives in the wallet. Do not treat `alice.k` as a private key.
