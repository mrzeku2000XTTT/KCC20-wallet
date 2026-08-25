# Base44 prompt — App Store v2 header: Connect KCC20 (all screens)

Paste this into the **tttz.xyz Base44 agent**. Do **not** change the marketing landing page. Work **only** on **App Store v2** (`appstorev2`).

This is **KCC20 Wallet connect**, not Reown/WalletConnect, not a Chrome extension.

SDK: https://kcc-20-wallet.vercel.app/sdk.js  
Wallet: https://kcc-20-wallet.vercel.app  
Demo: https://kcc-20-wallet.vercel.app/dapp-demo.html

---

## What to build

On the **App Store v2 top bar, top-right**, add a **Connect KCC20** button that fits **phone, tablet, and desktop**.

Flow:

1. User taps **Connect KCC20**.
2. A **wallet popup** opens (`kcc.connect()`).
   - If TTT is inside KCC20 Wallet iframe (`?kcc20_browser=1`): the **parent PWA** shows Connect / Sign (no extra popup).
   - If TTT is a normal tab: `sdk.js` opens a **popup window** to https://kcc-20-wallet.vercel.app
3. User Approves in KCC20, unlocks PIN if asked.
4. Header shows the short `kaspa:q…` address. Session is shared with **every App Store v2 app**.
5. When an app needs a signature (fund, pay, swap, play), call `signPskt` — **same popup/parent Sign sheet**. User taps Sign. TTT never sees the key.

---

## Header UI (must fit all screens)

Put it in the existing App Store v2 **top header, right side** (same row as title / search / menu). Do not put it on the marketing landing page.

**Disconnected**

- Button label:
  - width ≥ 420px: `Connect KCC20`
  - width < 420px: `KCC20` (still tappable, min height 36px, min width 44px)
- Gold / TTT style, one line, no wrap, `flex-shrink: 0`
- Header is `display:flex; align-items:center`. Title/search `min-width:0; flex:1`. Button stays **right** and never drops under the title or overflows off-screen.
- `padding-right` includes safe-area (`env(safe-area-inset-right)`).

**Connected**

- Chip: `q…` + last 4 of address (e.g. `qrtf…sax6`)
- Tiny network dot if not mainnet
- Tap chip → small menu: **Copy address**, **Disconnect**
- On very narrow screens the chip may replace the long button; still top-right.

**Busy**

- Button disabled, text `Connecting…` / `Sign in wallet…` while the popup/parent sheet is open.

Copy if popup blocked:

`Allow popups for tttz.xyz, or open App Store from KCC20 Wallet → Profile → TTT.`

Copy if TN10:

`Switch off TN10 in KCC20 (You → Network).`

---

## SDK (load once in App Store v2 shell)

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
```

If `window.kcc20` is missing, inject that script and wait for `kcc20#initialized`.

```js
function kcc() {
  const w = window.kcc20;
  if (!w || !w.isKcc20) throw new Error('KCC20 Wallet SDK not loaded');
  return w;
}

async function connectKcc20() {
  const accounts = await kcc().connect(); // OPENS the wallet popup / parent sheet
  return accounts[0];
}

async function signKcc20(unsignedSafeJson, signInputs) {
  return kcc().signPskt({
    txJsonString: unsignedSafeJson,
    options: {
      signInputs: (signInputs || []).map((i) =>
        typeof i === 'number' ? { index: i, sighashType: 1 } : i
      )
    }
  });
}
```

On App Store v2 mount: `getAccounts()` **silently** to restore the chip. Do **not** auto-open the popup until they tap **Connect KCC20**.

Listen `kcc().on('accountsChanged', …)` and `disconnect` to update the header.

KasWare: do **not** call `window.kasware` from App Store v2 when `kcc().isEmbedded()`. Default is always `window.kcc20`.

---

## Sign (all App Store v2 apps)

Any Fund / pay / swap / tip / play that needs a chain tx:

- Simple KCC20 pay (DD Fund):  
  `await kcc().sendToken({ tick: 'KKDAG', amount, dest: 'kaspa:qq5yhvly6338dspa9mm24g8q6chvy6v0jww3k4dgqywh0lju5mmm5pj334ews' })`  
  Full `kaspa:q`. Parent/popup **Sign** sheet. No fake mint.
- Anything else you already build as rusty-kaspa Safe JSON:  
  `await signKcc20(json, userP2pkIndexes)` then optional `kcc().pushTx(signed)`.

`signInputs`: **only** this wallet’s P2PK input indexes, `sighashType: 1`. Never covenant / KRON curve / pool inputs.

On Reject: show the error, re-enable the button. No retry loop.

---

## Do not

- Do not edit the marketing landing page.
- Do not add Reown / WalletConnect QR.
- Do not require a Chrome extension.
- Do not store keys, PINs, or `x-access-token`.
- Do not break `?kcc20_browser=1`.
- Do not hide the button behind a hamburger on mobile — it stays top-right.

---

## Test

1. Phone width (~375): header one row, **KCC20** button top-right, not clipped.
2. Desktop: **Connect KCC20** top-right.
3. Standalone App Store v2: tap button → **popup** wallet → Approve → chip shows address.
4. Inside KCC20 iframe: tap button → **parent** Connect sheet (no second window) → same chip.
5. Open any App Store v2 app → still connected. An action that signs → Sign sheet → success.
6. Disconnect from the chip menu → apps see disconnected.
7. DD Fund still uses `sendToken` + real Sign, no fake 1000 KKDAG.

Ship the header button + shared connect/sign. That is the whole task.
