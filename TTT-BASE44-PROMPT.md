# Base44 prompt — stop auto wallet popups on App Store

Paste into the **tttz.xyz Base44 agent**. App Store v2, RMX, kcc20test, every app.

## The bug

You are calling `window.kcc20.connect()` / `window.kasware.requestAccounts()` on **page load**, **route change**, and **when the user opens another app**. That opens the KCC20 popup. Do **not** do that.

The user is already connected for the **tab**. Switching apps must **not** connect again.

## Allowed calls (only these, and only on a button the user just tapped)

Load once in the App Store **shell** (not inside every app iframe):

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
```

| User tap | Call | Do not call |
|---|---|---|
| **Connect KCC20** button | `await window.kcc20.connect()` then `getState()` | never on load / never when opening an app |
| **Disconnect** | `await window.kcc20.disconnect()` | never on route change |
| **Pay / Fund / Send token** | `await window.kcc20.sendToken({ tick, amount, dest })` | never until they tap Pay |
| **Sign a PSKT you built** | `await window.kcc20.signPskt({ txJsonString, options: { signInputs } })` | never on load |
| **Broadcast** (optional) | `await window.kcc20.pushTx(signed)` | — |

Future custom methods the wallet team adds (same rule: **only on that button click**). Examples they may add later: `signMessage`, `signPskt`, `sendToken`. Until then, do not invent calls.

## After connect, keep the session

```js
// OK anytime, does NOT open a window if already connected:
const kcc = window.kcc20;
const acc = await kcc.getAccounts(); // cached
const st = await kcc.getState();     // cached; KAS / KKDAG / holdings
```

Use `getAccounts` / `getState` to paint the header on RMX / App Store / kcc20test. **Never** `connect()` to “refresh.”

On app change (`/rmx`, `/AppStoreV2`, `/kcc20test`):

```js
if (window.kcc20 && (window.kcc20.accounts || []).length) {
  // already connected — just paint the chip. NO connect().
}
```

## Do not

- Do not call `connect()` / `requestAccounts()` in `useEffect`, router `onEnter`, app card `onClick` (except the Connect button), or a 8s poll.
- Do not call `window.kasware.requestAccounts()` — `sdk.js` is `window.kcc20`. KasWare is not the TTT connect UI.
- Do not open a PIN pad on TTT.
- Do not disconnect when switching apps.

## Test

1. App Store → tap **Connect KCC20** once → one popup → it closes. Header shows address.
2. Open RMX, then kcc20test, then another app → **zero** popups. Header still connected.
3. Tap **Pay** → popup for Sign only → closes.
4. Disconnect → Connect → one popup again.

Ship that. Popup only for Connect and Pay/Sign clicks.
