# Base44 prompt — tttz.xyz landing + App Store v2 use KCC20 Wallet connect & sign

Paste this into the **tttz.xyz / TTT Base44 agent** as the next task. This is **KCC20 Wallet connect**, not Reown/WalletConnect, not a Chrome extension, not KasWare-only.

Live wallet: https://kcc-20-wallet.vercel.app  
SDK: https://kcc-20-wallet.vercel.app/sdk.js  
Demo: https://kcc-20-wallet.vercel.app/dapp-demo.html  
Integrator notes: https://github.com/mrzeku2000XTTT/KCC20-wallet/blob/main/CONNECT.md

---

## Goal

On **https://tttz.xyz** (landing) and **every existing app in App Store v2 / appstorev2**, the user can:

1. **Connect** KCC20 Wallet (see their `kaspa:q…` address)
2. **Sign** transactions Nilla/TTT/apps prepare (PSKT)
3. Optionally **broadcast** (`pushTx`) or **send KCC20** (`sendToken` for Fund DD)

Keys **never** live on TTT. TTT builds or requests; the **wallet** shows Approve/Sign.

Do this for **all current App Store v2 apps**, not only DDWallet. One shared adapter. No per-app KasWare fork.

---

## Two ways TTT is opened (both must work)

### A) Embedded (already the in-wallet path)

KCC20 Wallet → Profile → TTT iframe:

`https://tttz.xyz/?kcc20_browser=1`

`sdk.js` talks to **parent** via `postMessage` `ns:'kcc20'`.  
`window.kcc20.isEmbedded() === true`.  
Connect / Sign sheets appear **in the parent PWA**. Do **not** call KasWare from TTT when embedded.

### B) Standalone landing (this task must also make this work)

User opens **https://tttz.xyz** in a normal tab (no iframe).  
`sdk.js` **opens a popup** to `https://kcc-20-wallet.vercel.app`.  
User unlocks the PWA, taps Connect / Sign there.  
If popup blocked: tell them to allow popups, or open TTT from KCC20 Wallet (Profile / TTT icon).

Keep `?kcc20_browser=1` as-is. Do not remove iframe support.

---

## Load the SDK once (site-wide)

In the **root layout / landing HTML** (and any App Store v2 shell that does not inherit it):

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
```

If `window.kcc20` is missing, inject that script and wait for `kcc20#initialized`.

Shared helper used by landing **and** every app (put in one module, e.g. `lib/kcc20.js`):

```js
export function getKcc20() {
  const kcc = window.kcc20;
  if (!kcc || !kcc.isKcc20) throw new Error('KCC20 Wallet SDK not loaded');
  return kcc;
}

export async function connectWallet() {
  const kcc = getKcc20();
  const accounts = await kcc.connect(); // or requestAccounts()
  const address = accounts[0];
  const network = await kcc.getNetwork(); // kaspa_mainnet | kaspa_testnet_10
  return { address, accounts, network, embedded: !!(kcc.isEmbedded && kcc.isEmbedded()) };
}

export async function signTx(unsignedSafeJson, signInputs) {
  const kcc = getKcc20();
  return kcc.signPskt({
    txJsonString: unsignedSafeJson,
    options: { signInputs: (signInputs || []).map(i =>
      typeof i === 'number' ? { index: i, sighashType: 1 } : i
    ) }
  });
}

export async function pushTx(signedJson) {
  return getKcc20().pushTx(signedJson);
}
```

Landing header **and** App Store v2 apps **must import this helper**. Do not duplicate `window.kasware` connect in each app.

---

## Landing page (tttz.xyz) UI

Header (always visible on landing and App Store v2 chrome):

- If disconnected: button **Connect KCC20 Wallet**
- If connected: short address (`kaspa:q…` first 6 + last 4), network pill, **Disconnect**
- Optional: KAS / KKDAG live from `getHoldings()` / `getTokenBalance('KKDAG')` — keep existing Hide holdings toggle if present

Copy:

- Disconnected: `Connect KCC20 Wallet to use TTT apps. We never hold your key.`
- Popup blocked: `Allow popups for tttz.xyz, or open TTT from KCC20 Wallet → Profile → TTT.`
- Not mainnet: `Switch this wallet off TN10 in KCC20 (You → Network).`
- Embedded: `Signing in KCC20 Wallet…`
- Standalone: `A KCC20 window opened — unlock and tap Approve.`

On load of landing:

1. Load sdk.js
2. If already allowed, `getAccounts()` to restore chip (do **not** prompt until they tap Connect)
3. Connect is a user gesture (the button)

KIP-12: sdk already dispatches `kaspa:provider` (`rdns: app.kcc20.wallet`). You do not need a second discovery layer. Prefer `window.kcc20` as the TTT default.

KasWare: **only** as a fallback when `!window.kcc20 && window.kasware` on standalone desktop. Never when `isEmbedded()`. Default path is KCC20 PWA.

---

## App Store v2 — every existing app

Find the App Store v2 list (routes like `/appstore`, `/appstorev2`, `/apps`, iframe catalog, or whatever this repo already uses). For **each live app**:

1. Replace any **fake connect**, pasted address, KasWare-only `requestAccounts`, or dead “Connect wallet”.
2. Use `connectWallet()` from the shared helper.
3. Any **send / swap / tip / fund / mint / play / buy** that needs a signature:
   - TTT or the app **builds** unsigned rusty-kaspa **Safe JSON** (or calls `sendToken` for a simple KCC20 pay).
   - Then `signTx(...)`. User Approves in KCC20.
   - Then `pushTx(signed)` **or** your existing broadcast — do not double-broadcast.
4. Do **not** construct KCC20 covenant / KRON AMM txs inside TTT if the parent already has `sendToken` / the wallet can sign a PSKT you were given. Prefer:
   - Simple KCC20 pay → `kcc.sendToken({ tick, amount, dest })` (parent builds + signs + broadcasts)
   - Complex / Nilla / Cook / custom → you build PSKT → `signPskt` → `pushTx`
5. Pass `signInputs` = **only** the connected address’s P2PK input indexes, `sighashType: 1`. Never list covenant / KRON curve / pool / token-cell inputs.
6. Show the wallet error string on Reject / timeout. No silent retry loop.
7. Session: one connect on the landing persists via the SDK to apps in the same origin. If an app is another origin/iframe, it must load the **same sdk.js** and call `connect()` (parent/popup still signs).

Keep each app’s product UI. Only fix wallet connect + sign.

### Fund DD (already specified — do not regress)

`sendToken({ tick: 'KKDAG', amount, dest: 'kaspa:qq5yhvly6338dspa9mm24g8q6chvy6v0jww3k4dgqywh0lju5mmm5pj334ews' })`  
Full `kaspa:q` treasury. No fake “Add 1000 KKDAG”. One credit per `txId`. See existing DD notes.

---

## APIs you may use (`window.kcc20`)

| Method | Use on TTT |
|---|---|
| `connect()` / `requestAccounts()` | Connect button |
| `getAccounts()` | Restore header |
| `getNetwork()` | Must be `kaspa_mainnet` for live apps |
| `getPublicKey()` | if an app needs it |
| `getBalance(addr?)` | KAS sompi |
| `getUtxoEntries(addr?)` | when **you** build a PSKT |
| `getHoldings()` / `getTokenBalance(tick)` | DDWallet / landing bags |
| `signPskt({ txJsonString, options })` | **Sign** for App Store apps |
| `pushTx(signed)` | Broadcast after sign |
| `sendToken({ tick, amount, dest })` | Fund / pay KCC20 (parent builds the send) |
| `disconnect()` | Header disconnect |
| `isEmbedded()` | iframe vs popup copy |
| `on('accountsChanged'\|'networkChanged'\|'disconnect')` | update header |

`request('connect'|'signPskt'|'pushTx'|...)` aliases also work.

---

## Do not

- Do not add Reown / WalletConnect Network / QR WalletConnect. This is **KCC20 `sdk.js`**.
- Do not require a Google/Chrome extension for the default path.
- Do not store private keys, PINs, or `x-access-token` on TTT.
- Do not call KasWare when embedded in KCC20.
- Do not truncate the treasury to `kaspa:p` or a short `q`.
- Do not invent credits or mint KKDAG.
- Do not break `?kcc20_browser=1` iframe.
- Do not wait on Tap2Tip.

---

## Test (landing + at least two App Store v2 apps + DD)

1. **Embedded:** KCC20 Wallet → TTT. Landing Connect → parent Connect sheet. Address matches Home chip. Open an App Store v2 app → already connected or Connect works. An action that needs a sig → parent Sign sheet → PIN → success.
2. **Standalone:** https://tttz.xyz (new tab). Connect → **popup** to kcc-20-wallet.vercel.app. Approve. Same address. Sign an app action in the popup. If popup blocked, the copy above shows.
3. DD Fund still: live KKDAG from `getTokenBalance`, Sign in parent, credits + txId, no fake mint.
4. Disconnect on landing clears the chip; apps stop treating the user as connected.
5. TN10: banner to switch to mainnet; do not send live Fund.

Ship the shared helper, landing header, and App Store v2 wiring. Product features of each app stay; only wallet connect/sign is unified.
