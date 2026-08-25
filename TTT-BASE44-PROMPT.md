# Base44 prompt — App Store v2 Connect buttons: KCC20 balance + Sign

Paste into the **tttz.xyz Base44 agent**. App Store v2 only (not the marketing landing page).

KCC20 Wallet (BUILD 155+) already returns **live balance + holdings** on connect and signs PSKTs. Wire **existing Connect wallet buttons** to it.

SDK: https://kcc-20-wallet.vercel.app/sdk.js  
Wallet: https://kcc-20-wallet.vercel.app

---

## What “done” looks like

1. App Store v2 header **Connect KCC20** (top right, all screen sizes).
2. Tap → wallet popup (standalone) **or** parent Sign/Connect sheet (iframe `?kcc20_browser=1`).
3. After connect, TTT **shows this wallet’s balances** (KAS + KKDAG + other KCC20 from `getState` / `getHoldings`). Not a fake 0, not a pasted address.
4. Any app action that spends (Fund, pay, swap, tip) opens the wallet **Sign** sheet. User Approves. TTT never holds the key.

---

## Detect KCC20 first (every Connect button)

Load once in the App Store v2 shell:

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
```

If `window.kcc20` is missing, inject that script and wait for `kcc20#initialized`.

**Prefer `window.kcc20` over KasWare.** When TTT is iframed in KCC20, sdk.js also shims `window.kasware` to the parent wallet so old KasWare-only buttons still hit KCC20.

```js
function wallet() {
  if (window.kcc20 && window.kcc20.isKcc20) return window.kcc20;
  if (window.kasware) return window.kasware;
  throw new Error('Open App Store from KCC20 Wallet, or allow the KCC20 popup');
}

async function connectAndRead() {
  const w = wallet();
  const accounts = await (w.connect || w.requestAccounts)();
  const address = (Array.isArray(accounts) ? accounts[0] : (accounts && accounts.address)) || '';
  let state = null;
  if (w.getState) state = await w.getState();
  else if (w.getHoldings) {
    const h = await w.getHoldings();
    const bal = w.getBalance ? await w.getBalance(address) : null;
    state = { address, holdings: h && h.holdings ? h.holdings : h, balance: bal };
  }
  return { address, state };
}
```

After connect, paint:

- Address chip (short `kaspa:q…`)
- **KAS** = `state.kas` or `state.balance.kas` or `state.balance.confirmed / 1e8`
- **KKDAG** = `state.kkdags` or holdings row `tick === 'KKDAG'`
- Other ticks from `state.holdings`

Poll `getState()` every 8s while the App Store or DDWallet sheet is open so the bag matches Home.

If `getNetwork()` is not `kaspa_mainnet`: banner “Switch off TN10 in KCC20 (You → Network).”

---

## Sign (do not invent a mint)

**Simple KCC20 pay / Fund DD**

```js
await wallet().sendToken({
  tick: 'KKDAG',
  amount: String(amount),
  dest: 'kaspa:qq5yhvly6338dspa9mm24g8q6chvy6v0jww3k4dgqywh0lju5mmm5pj334ews'
});
```

Full `kaspa:q`. Parent/popup Sign sheet. Credit once per `txId`. No fake “Add 1000 KKDAG”.

**Any other tx you already built as rusty-kaspa Safe JSON**

```js
const signed = await wallet().signPskt({
  txJsonString: unsignedSafeJson,
  options: { signInputs: userP2pkIndexes.map(i => ({ index: i, sighashType: 1 })) }
});
await wallet().pushTx(signed); // optional if you broadcast yourself
```

`signInputs` = only this address’s P2PK indexes. Never covenant / KRON / pool inputs. `sighashType` must be `1`.

On Reject: show the wallet error. Re-enable the button.

---

## Header (all screens)

Top-right of App Store v2 header, `flex-shrink: 0`, never in a hamburger.

- ≥420px: **Connect KCC20**
- <420px: **KCC20** (min 44×36)
- Connected: short address chip → Copy / Disconnect
- Busy: **Connecting…** / **Sign in wallet…**
- Popup blocked: “Allow popups, or open TTT from KCC20 Wallet → Profile → TTT.”

Silent restore on load: `getAccounts()` then `getState()`. Do not auto-popup until they tap Connect.

---

## Do not

- Do not edit the marketing landing page.
- Do not use Reown/WalletConnect QR.
- Do not call KasWare when `kcc20.isEmbedded()`.
- Do not store keys, PINs, or `x-access-token`.
- Do not break `?kcc20_browser=1`.

---

## Test

1. KCC20 Wallet (unlocked, has KAS + KKDAG) → Profile → TTT → App Store v2 → Connect KCC20 → parent Connect → header shows address **and** the same KAS/KKDAG as Home.
2. Fund / pay → parent **Sign** → PIN → txId. Balances update.
3. Standalone App Store v2 tab → Connect → **popup** to kcc-20-wallet.vercel.app → same balances → Sign works.
4. Phone width: button stays top-right.
5. Disconnect: balances clear.

Ship Connect + live KCC20 balances + Sign. That is the whole task.
