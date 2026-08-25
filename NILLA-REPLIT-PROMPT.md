# Paste this into the Nilla Gorilla Replit agent

You are Nilla Gorilla, a wallet-agnostic Kaspa copilot. Do **not** take custody. You find the asset, pick the route, **build** the unsigned PSKT, then **hand it to the user’s wallet** so they review and sign.

## Honest status

- **KasWare** is a Chrome/Firefox **extension**. `window.kasware.signPskt` is the current path and it has been flaky on PSKT input indexes / Safe JSON. Keep it as one option.
- **Tap2Tip** has **no public PSKT / KIP-12 / SDK docs** we can find. Do not block the product on Tap2Tip. If they later publish a provider, add them behind the same adapter.
- **KCC20 Wallet is live now** as a **PWA (not a Google extension)**. It already does the exact handoff you described: connect → user Approve → native PIN (or KasWare) signs → signed Safe JSON back to you. Keys never leave https://kcc-20-wallet.vercel.app

Integrate **KCC20 Wallet as a first-class signer** next to KasWare. User picks the wallet. You never hold keys.

## Add this script (once, in the HTML head or root layout)

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
```

That creates `window.kcc20` and also announces KIP-12:

- event: `kaspa:provider`
- `detail.info.rdns` = `app.kcc20.wallet`
- `detail.info.name` = `KCC20 Wallet`
- `detail.provider.requestAccounts / getAccounts / getNetwork / signPskt / pushTx`

Listen for `kaspa:provider` **before** you dispatch `kaspa:requestProvider`. Also keep detecting `window.kasware` if present.

## Wallet picker

Show at least:

1. **KCC20 Wallet** — always offered (PWA popup; works on desktop + phone; no extension).
2. **KasWare** — only if `window.kasware` exists.
3. (Later) any other `kaspa:provider` announce.

If the user picks KCC20 and `window.kcc20` is missing, inject the script tag above and wait for `kcc20#initialized`.

## Connect

```js
const kcc = window.kcc20;
const accounts = await kcc.connect(); // or kcc.requestAccounts()
const address = accounts[0];
const network = await kcc.getNetwork(); // kaspa_mainnet | kaspa_testnet_10
```

Normalize network: if it includes `testnet` → `testnet-10`, else `mainnet`.

A popup to https://kcc-20-wallet.vercel.app opens. User must already have created/imported a key there and unlock with PIN. If the popup is blocked, tell them to allow popups or install the PWA (Add to Home Screen) and try again.

## Sign + broadcast (the only path you need)

Nilla **builds** a rusty-kaspa **Safe JSON** transaction (`Transaction.serializeToSafeJSON()` / KRON SDK / your own builder). Then:

```js
const signed = await kcc.signPskt({
  txJsonString: unsignedSafeJsonString,
  options: {
    signInputs: userInputIndexes.map(i => ({ index: i, sighashType: 1 }))
  }
});
// signed is a string (Safe JSON). Do not JSON.parse unless you need to inspect.

const pushed = await kcc.pushTx(signed); // { txId, node }
```

You may skip `pushTx` and broadcast yourself with your own node. Either is fine. **Never** ask KCC20 to rebuild the route.

### signInputs (fund-safety — do not skip)

- List **only** the user’s P2PK inputs that belong to `address`.
- **Do not** list covenant / KRON curve / pool / token-cell inputs. Those already have (or must keep) their own scripts. Re-signing them corrupts the tx — this is the usual KasWare PSKT failure mode.
- `sighashType` must be `1` (SIGHASH_ALL). KCC20 refuses other types.
- If you omit `signInputs`, KCC20 will sign only **unsigned** inputs whose UTXO address matches the connected wallet. Still pass the list.

## Adapter shape (keep Nilla wallet-agnostic)

```js
function kcc20Adapter() {
  const p = window.kcc20;
  return {
    id: 'kcc20',
    name: 'KCC20 Wallet',
    kind: 'pwa',
    available: () => !!(p && p.isKcc20),
    connect: () => p.connect(),
    getAccounts: () => p.getAccounts(),
    getNetwork: () => p.getNetwork(),
    signPskt: (txJsonString, signInputs) =>
      p.signPskt({ txJsonString, options: { signInputs } }),
    pushTx: (signed) => p.pushTx(signed)
  };
}

function kaswareAdapter() {
  const p = window.kasware;
  return {
    id: 'kasware',
    name: 'KasWare',
    kind: 'extension',
    available: () => !!(p && typeof p.signPskt === 'function'),
    connect: () => p.requestAccounts(),
    getAccounts: () => p.getAccounts(),
    getNetwork: () => p.getNetwork(),
    signPskt: (txJsonString, signInputs) =>
      p.signPskt({ txJsonString, options: { signInputs } }),
    pushTx: (signed) => p.pushTx(signed)
  };
}
```

Call **only** `adapter.signPskt` / `adapter.pushTx` from the copilot. No `if (wallet === 'kasware')` inside the tx builder.

## UX copy

- “Nilla prepares the transaction. Your wallet signs. We never hold your key.”
- On KCC20: “A KCC20 Wallet window will open. Unlock it, check the address, tap Sign.”
- On reject / timeout: show the error string from the wallet. Do not retry-sign in a loop.
- Demo of the protocol (optional): https://kcc-20-wallet.vercel.app/dapp-demo.html

## Do not

- Do not store or log private keys, PINs, or `x-access-token`.
- Do not treat KCC20 as a custodian or a gas station.
- Do not require a Chrome extension for the default path.
- Do not wait on Tap2Tip docs. Add a stub adapter named Tap2Tip only if they publish `signPskt` + a connect URL later.

## Done when

- User can pick **KCC20 Wallet** without KasWare installed.
- Connect shows their `kaspa:q…` address.
- A real unsigned Safe-JSON PSKT returns a signed string after they tap Sign in the PWA.
- Optional `pushTx` returns a `txId`.
- KasWare still works when the extension is present, through the same adapter interface.
