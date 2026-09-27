# Wallet Forge

Anyone can assemble a Kaspa wallet **interface** for free. The Scorpion **core** (keys, UTXOs, signing, nodes) stays standardized.

**You → Apps → Wallet Forge**

Drag primitives onto the canvas. Dropped blocks read **this wallet for real**: KAS balance, KCC20 holdings, activity, receive QR, send, TTT apps, network. Tap a block to edit the label or delete it. **Test live** refreshes from the core. **Export HTML** downloads a skin that `connect()`s via `sdk.js?v=175`.

Official Kaspa mark: `assets/kas.svg`.

AI / themes may change look. They must not generate cryptography. See [VEYRA.md](./VEYRA.md).

```js
window.kcc20.forge
await window.kcc20.request('forge')
```
