# Fork Scorpion — build your own Veyra wallet

This PWA is the open reference wallet for **VEYRA**: dApps request, the wallet authorizes, the user decides, Kaspa settles.

You do not start from a blank HTML file. You copy this repo, keep the signing boundary, and change what makes the wallet yours.

| Repo | What it is |
|---|---|
| [KCC20-wallet](https://github.com/mrzeku2000XTTT/KCC20-wallet) | Static PWA (this app). Deploy to Vercel as-is. |
| [kaspa-xmss-covenants](https://github.com/mrzeku2000XTTT/kaspa-xmss-covenants) | Full tree; wallet lives in `/wallet`. |
| [kcc20-sdk](https://github.com/mrzeku2000XTTT/kcc20-sdk) | Client `sdk.js` + docs. dApps pin the **hosted** script. |

License: MIT (see `LICENSE` in kcc20-sdk; copy it into your fork).

---

## Keep (the Veyra boundary)

- Keys stay on the wallet origin. Never send seed / PIN / hex to a dApp.
- dApp **builds** the unsigned PSKT. Wallet **signs** listed P2PK funding indexes only.
- Connect, Sign, Send, Broadcast each need a user click and an Approve sheet.
- After Connect the popup **closes**. Silent reads must work.
- `pushTx` returns `{ txId, node }`.
- `buyKron` is wallet-built. `sendToken` is a bag send.
- Do not overwrite a real `window.kasware`.
- Pin `sdk.js?v=NNN` and fail closed if `sdkVersion` mismatches.

Read [VEYRA.md](./VEYRA.md) before you rename anything.

---

## Change (make it yours)

1. Fork **KCC20-wallet**.
2. Point Vercel at the fork. Custom domain optional.
3. Replace branding: `index.html` title, `assets/icon.png`, `manifest.json` name, `about.html`.
4. In `sdk.js` set `WALLET` / origin to **your** host. Bump `SDK_VERSION` and add a `releases.json` entry the same day.
5. Change KCC-12 `rdns` from `app.kcc20.wallet` to your reverse-DNS (e.g. `app.yourwallet.kaspa`) so pickers can list **both** wallets.
6. Trusted iframe origins (TTT, KasDistro) live in `dappConnect.js` — add yours; do not silently allow every site.
7. Keep `web+kcc20:` or add your own protocol handler in `manifest.json`.
8. Ship `sdk.js` from **your** origin. Tell integrators to pin `https://YOURHOST/sdk.js?v=NNN`.

Local serve: static files only. WASM `Content-Type` is `application/wasm` (`vercel.json`). `file://` will not load Kaspa WASM.

---

## Implement the same dApp surface

If you write a different wallet (extension, desktop, another PWA), dApps still work if you expose:

```
connect / requestAccounts
getAccounts, getNetwork, getPublicKey, getUtxoEntries, getBalance
signPskt({ txJsonString, options: { signInputs } })
pushTx → { txId, node }
```

Optional: `buyKron`, `sendToken`, `sendKaspa`, `getActivityLog`, `kaspa:announceProvider`.

Announce with a **unique** `rdns`. Load your script before the dApp dispatches `kaspa:requestProvider`.

---

## Come back here

- Protocol: [VEYRA.md](./VEYRA.md) · [veyra.html](./veyra.html)
- Integrators: [docs.html](./docs.html) · [CONNECT.md](./CONNECT.md)
- Releases: [releases.json](./releases.json) · [whats-new.html](./whats-new.html)
- `window.kcc20.veyra` on SDK 174+
