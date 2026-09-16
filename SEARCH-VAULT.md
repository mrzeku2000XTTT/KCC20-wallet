# Search Kaspa vault (SilverScript v1.0.0)

Prepaid metering for **Search Kaspa** (TTTz.xyz / Base44): 0.001 KAS (100 000 sompi) per query, enforced on Kaspa L1.

**Languages (do not mix):**

| Name | What it actually is |
|---|---|
| **KCC20 Argent** | English → intent → this PWA compiles/funds P2SH. Does **not** compile `.sil`. |
| **SilverScript v1** | `pragma silverscript ^1.0.0;` · `entry name()` · official [kaspanet/silverscript v1.0.0](https://github.com/kaspanet/silverscript/releases/tag/v1.0.0). |
| Sutton “Argent” `.ag` | Actor sketch for TTT Search only. **Not** compiled by KCC20 Argent. |

Source: `covenants/SearchVault.sil`

```bash
silverc covenants/SearchVault.sil --constructor-args args.json
```

`args.json`:

```json
[
  { "kind": "bytes", "value": "<32-byte owner Schnorr pubkey hex>" },
  { "kind": "bytes", "value": "<32-byte Search treasury Schnorr pubkey hex>" }
]
```

Then in KCC20 Wallet / SDK:

```js
await kcc.compileVault({
  type: 'searchvault',
  amount: 1,
  params: { artifact: /* silverc JSON */, contract: 'SearchVault' }
});
```

Each search: wallet builds `pay_search_fee` (owner PIN) — output 0 = 100000 to treasury P2PK, output 1 = same covenant, `tx.outputs.length == 2`.
