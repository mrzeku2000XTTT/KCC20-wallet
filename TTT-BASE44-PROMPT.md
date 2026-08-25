# Base44 prompt — remove TTT PIN pad; KCC20 popup signs

Paste into the **tttz.xyz Base44 agent**. App: `https://tttz.xyz/kcc20test` and App Store v2 Connect/Pay.

## Delete the PIN keypad on TTT

The modal **“Enter KCC20 PIN” / “Confirm to send 10 KKDAG from your KCC20 wallet”** on tttz.xyz must **go**. TTT must **never** collect a PIN.

Signing is **only** in the KCC20 Wallet popup (`window.kcc20`). That window already asks for PIN.

**Pay with KCC20** should be:

```js
const kcc = window.kcc20;
if (!kcc) throw new Error('Load https://kcc-20-wallet.vercel.app/sdk.js');
const paid = await kcc.sendToken({ tick, amount, dest }); // or kcc.payKcc20 / request('payKcc20', { tick, amount, dest })
```

No PIN state, no PIN dots, no local hash, no “Enter KCC20 PIN”. On click, **immediately** call `sendToken` (user-gesture so the popup can open). Then show “Sign in the KCC20 Wallet window…”.

**Connect** should be only:

```js
await window.kcc20.connect();
const state = await window.kcc20.getState(); // address, kas, kkdags, holdings
```

Disconnect: `await window.kcc20.disconnect()`.

## Do not

- Do not build a PIN pad.
- Do not store a PIN on Base44.
- Do not delay `connect()` / `sendToken()` behind your own modal (that steals the click and the popup stays behind).
- Do not use KasWare when `window.kcc20` exists.

## Test

1. Hard-refresh KCC20 PWA (sdk always pops/focuses the wallet on Connect and Pay).
2. tttz.xyz/kcc20test → Connect → **KCC20 window jumps in front**. Approve there. No PIN on TTT.
3. Pay 10 KKDAG → **KCC20 window jumps in front** with Sign sheet → PIN **in that window** → send.
4. Disconnect, Connect again → **new/focused KCC20 popup**, you should not hunt the taskbar.

If the popup is blocked: “Allow popups for tttz.xyz”.
