/* Silverscript v1-rc1 portable ABI consumer.
   Load: <script src="https://kcc20-sdk.vercel.app/silverscript.js"></script>
   Then: window.kcc20Silver.parse(artifactJson)

   What this is (fact-checked against https://github.com/kaspanet/silverscript/releases/tag/v1-rc1):
   - SilverScript is Kaspa’s high-level covenant language (CashScript-like).
   - silverc compiles .sil → SilAbiArtifact JSON (schema_version 1).
   - Bytecode is native Kaspa Script (no VM). State lives in the UTXO redeem
     (prefix | runtime state | suffix). Spend uses KCC-01: push args, then a
     4-byte dispatch tag (blake3 of the entry signature, stored on the artifact).
   - This file does NOT compile .sil. Compile with silverc / silverscript-lang.
   - Argent in the PWA funds the P2SH (kaspa:p) and later spends with the
     encoded entry sigscript. Keys never leave the wallet.

   Repo: https://github.com/kaspanet/silverscript
   Tutorial: https://github.com/kaspanet/silverscript/blob/v1-rc1/docs/TUTORIAL.md
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.kcc20Silver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.0.0-rc1';
  var SCHEMA = 1;
  var RELEASE = 'https://github.com/kaspanet/silverscript/releases/tag/v1-rc1';
  var OP_0 = 0x00;
  var OP_DATA_1 = 0x01;
  var OP_DATA_75 = 0x4b;
  var OP_PUSHDATA1 = 0x4c;
  var OP_PUSHDATA2 = 0x4d;
  var OP_PUSHDATA4 = 0x4e;
  var OP_1NEGATE = 0x4f;
  var OP_1 = 0x51;

  function err(msg) { throw new Error(msg); }

  function asObj(v) {
    if (v && typeof v === 'object') return v;
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch (e) { err('SilverScript artifact is not JSON'); }
    }
    err('Need a SilAbiArtifact JSON object from silverc');
  }

  function toBytes(v, name) {
    if (v == null) return new Uint8Array(0);
    if (v instanceof Uint8Array) return v;
    if (Array.isArray(v)) return Uint8Array.from(v.map(function (n) { return Number(n) & 255; }));
    if (typeof v === 'string') {
      var h = v.replace(/^0x/i, '');
      if (h.length % 2) err((name || 'bytes') + ' hex length must be even');
      var out = new Uint8Array(h.length / 2);
      for (var i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    err('Cannot read ' + (name || 'bytes'));
  }

  function hexOf(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : toBytes(bytes);
    var s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] + 256).toString(16).slice(1);
    return s;
  }

  function concat() {
    var parts = [];
    var n = 0;
    var i;
    for (i = 0; i < arguments.length; i++) {
      var p = arguments[i] instanceof Uint8Array ? arguments[i] : Uint8Array.from(arguments[i]);
      parts.push(p);
      n += p.length;
    }
    var out = new Uint8Array(n);
    var o = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }

  function scriptNum(n) {
    n = Number(n);
    if (!Number.isFinite(n) || Math.floor(n) !== n) err('int must be a whole number');
    if (n === 0) return new Uint8Array(0);
    var neg = n < 0;
    var abs = neg ? -n : n;
    var bytes = [];
    while (abs > 0) {
      bytes.push(abs & 255);
      abs = Math.floor(abs / 256);
    }
    if (bytes[bytes.length - 1] & 0x80) bytes.push(neg ? 0x80 : 0x00);
    else if (neg) bytes[bytes.length - 1] |= 0x80;
    return Uint8Array.from(bytes);
  }

  function pushBytes(data) {
    var b = data instanceof Uint8Array ? data : Uint8Array.from(data);
    if (b.length === 0) return new Uint8Array([OP_0]);
    if (b.length === 1) {
      var v = b[0];
      if (v === 0) return new Uint8Array([OP_0]);
      if (v === 0x81) return new Uint8Array([OP_1NEGATE]);
      if (v >= 1 && v <= 16) return new Uint8Array([OP_1 + v - 1]);
    }
    var head;
    if (b.length <= OP_DATA_75) head = Uint8Array.of(b.length);
    else if (b.length <= 255) head = Uint8Array.of(OP_PUSHDATA1, b.length);
    else if (b.length <= 65535) head = Uint8Array.of(OP_PUSHDATA2, b.length & 255, b.length >> 8);
    else head = Uint8Array.of(OP_PUSHDATA4, b.length & 255, (b.length >> 8) & 255, (b.length >> 16) & 255, (b.length >> 24) & 255);
    return concat(head, b);
  }

  function pushInt(n) {
    n = Number(n);
    if (n === 0) return new Uint8Array([OP_0]);
    if (n === -1) return new Uint8Array([OP_1NEGATE]);
    if (n >= 1 && n <= 16) return new Uint8Array([OP_1 + n - 1]);
    return pushBytes(scriptNum(n));
  }

  function unwrapValue(v) {
    if (v && typeof v === 'object' && v.kind) {
      if (v.kind === 'array') return (v.value || []).map(unwrapValue);
      if (v.kind === 'object') {
        var o = {};
        var src = v.value || v;
        Object.keys(src).forEach(function (k) {
          if (k === 'kind') return;
          o[k] = unwrapValue(src[k]);
        });
        return o;
      }
      return v.value;
    }
    return v;
  }

  function typeName(ty) {
    if (!ty) return 'unknown';
    if (typeof ty === 'string') return ty;
    var k = ty.kind || ty.type || '';
    if (k === 'fixed_bytes' || k === 'FixedBytes') return 'byte[' + ty.len + ']';
    if (k === 'fixed_array' || k === 'FixedArray') return typeName(ty.item) + '[' + ty.len + ']';
    if (k === 'dynamic_array' || k === 'DynamicArray') return typeName(ty.item) + '[]';
    if (k === 'struct' || k === 'Struct') return ty.name || 'State';
    if (k === 'string' || k === 'Text') return 'string';
    return k || 'unknown';
  }

  function pushArg(ty, value) {
    var k = (ty && (ty.kind || ty.type)) || '';
    var v = unwrapValue(value);
    if (k === 'int' || k === 'temporal' || k === 'Int' || k === 'Temporal') return pushInt(v);
    if (k === 'bool' || k === 'Bool') return pushInt(v ? 1 : 0);
    if (k === 'byte' || k === 'Byte') return pushBytes(Uint8Array.of(Number(v) & 255));
    if (k === 'bytes' || k === 'Bytes' || k === 'string' || k === 'Text') {
      if (typeof v === 'string' && k !== 'bytes' && k !== 'Bytes') {
        var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(v) : Uint8Array.from(unescape(encodeURIComponent(v)), function (c) { return c.charCodeAt(0); });
        return pushBytes(enc);
      }
      return pushBytes(toBytes(v, 'bytes'));
    }
    if (k === 'pubkey' || k === 'Pubkey') return pushBytes(requireLen(toBytes(v, 'pubkey'), 32, 'pubkey'));
    if (k === 'sig' || k === 'Sig') return pushBytes(requireLen(toBytes(v, 'sig'), 65, 'sig'));
    if (k === 'datasig' || k === 'Datasig') return pushBytes(requireLen(toBytes(v, 'datasig'), 64, 'datasig'));
    if (k === 'fixed_bytes' || k === 'FixedBytes') return pushBytes(requireLen(toBytes(v, 'byte[N]'), ty.len, 'byte[' + ty.len + ']'));
    if (k === 'struct' || k === 'Struct' || k === 'fixed_array' || k === 'dynamic_array' || k === 'FixedArray' || k === 'DynamicArray') {
      err('Nested ' + typeName(ty) + ' args must be flattened by silverc / encode_contract_entry_sig_script. Pass leaf values or use the official encoder for this entry.');
    }
    err('Unsupported SilverScript arg type ' + typeName(ty));
  }

  function requireLen(bytes, n, name) {
    if (bytes.length !== n) err(name + ' expects ' + n + ' bytes, got ' + bytes.length);
    return bytes;
  }

  function parse(raw) {
    var a = asObj(raw);
    if (Number(a.schema_version) !== SCHEMA) {
      err('Sil ABI schema_version ' + a.schema_version + ' (this SDK speaks v' + SCHEMA + ' / Silverscript v1-rc1)');
    }
    if (!a.contracts || typeof a.contracts !== 'object') err('artifact.contracts missing');
    var names = Object.keys(a.contracts);
    if (!names.length) err('artifact has no contracts');
    names.forEach(function (n) { verifyContract(a, n, a.contracts[n]); });
    return a;
  }

  function verifyContract(abi, name, c) {
    if (!c || !c.entries || !c.compiled) err('contract `' + name + '` is missing entries/compiled');
    var tags = {};
    Object.keys(c.entries).forEach(function (en) {
      var e = c.entries[en];
      var tag = String(e.dispatch_tag || '');
      if (!/^[0-9a-f]{8}$/i.test(tag)) err(name + '::' + en + ' dispatch_tag must be 8 hex chars');
      if (tags[tag]) err(name + ' entries `' + tags[tag] + '` and `' + en + '` share dispatch tag ' + tag);
      tags[tag] = en;
    });
    var bc = toBytes(c.compiled.bytecode, name + '.bytecode');
    var span = c.compiled.state_span || { offset: 0, len: 0 };
    var end = Number(span.offset || 0) + Number(span.len || 0);
    if (end > bc.length) err('contract `' + name + '` state span does not fit in bytecode');
  }

  function contractOf(abi, name) {
    var a = parse(abi);
    if (name) {
      if (!a.contracts[name]) err('unknown contract `' + name + '`');
      return Object.assign({ name: name }, a.contracts[name]);
    }
    var first = Object.keys(a.contracts)[0];
    return Object.assign({ name: first }, a.contracts[first]);
  }

  function entryOf(contract, entryName) {
    if (!contract.entries[entryName]) {
      err('unknown entry `' + (contract.name || '') + '::' + entryName + '`. Have: ' + Object.keys(contract.entries).join(', '));
    }
    return contract.entries[entryName];
  }

  function encodeEntry(abi, contractName, entryName, args) {
    var c = contractOf(abi, contractName);
    var e = entryOf(c, entryName);
    var params = e.params || [];
    args = args || [];
    if (params.length !== args.length) {
      err('entry `' + c.name + '::' + entryName + '` expects ' + params.length + ' arguments, got ' + args.length);
    }
    var chunks = [];
    for (var i = 0; i < params.length; i++) chunks.push(pushArg(params[i].type || params[i].ty, args[i]));
    chunks.push(pushBytes(toBytes(e.dispatch_tag, 'dispatch_tag')));
    var script = concat.apply(null, chunks);
    return { hex: hexOf(script), bytes: script, entry: entryName, contract: c.name, tag: String(e.dispatch_tag) };
  }

  function bytecodeOf(abi, contractName) {
    var c = contractOf(abi, contractName);
    return toBytes(c.compiled.bytecode, 'bytecode');
  }

  function redeemHex(abi, contractName) {
    return hexOf(bytecodeOf(abi, contractName));
  }

  function summary(raw) {
    var a = parse(raw);
    return Object.keys(a.contracts).map(function (n) {
      var c = a.contracts[n];
      return {
        name: n,
        entries: Object.keys(c.entries).map(function (en) {
          var e = c.entries[en];
          return {
            name: en,
            tag: e.dispatch_tag,
            params: (e.params || []).map(function (p) { return { name: p.name, type: typeName(p.type || p.ty) }; })
          };
        }),
        bytecodeBytes: toBytes(c.compiled.bytecode).length,
        templateHash: hexOf(toBytes(c.compiled.template_hash || [])),
        stateSpan: c.compiled.state_span || { offset: 0, len: 0 },
        runtimeFields: (c.runtime_state && c.runtime_state.fields) || []
      };
    });
  }

  function val(kind, value) {
    return { kind: kind, value: value };
  }

  function facts() {
    return {
      what: 'SilverScript is Kaspa’s high-level smart-contract language. silverc compiles .sil to native Kaspa Script (no EVM, no VM). State lives in the UTXO. v1-rc1 is the compatibility target; v1 mainnet is planned one week after rc1 unless blockers appear.',
      notArgent: 'Argent in this wallet is still the English → intent → local P2SH builder. SilverScript is the official Kaspa compiler for richer covenants (loops, arrays, KCC-01 dispatch, N:M covenant declarations). Do not claim Argent compiles .sil.',
      howToCompile: 'Install silverscript, run `silverc contract.sil -o contract.json` (optional --constructor-args args.json). That JSON is a SilAbiArtifact (schema_version 1).',
      howWeUseIt: 'Paste the silverc JSON into KCC20. We P2SH-hash the bytecode (blake2b-256 → kaspa:p), fund it, and later spend with encodeEntry() (args + 4-byte dispatch tag) as the signature script. PIN/KasWare still signs only P2PK funding.',
      kcc01: 'Every entry is dispatched with blake3("name(type1,type2,...)")[0..4], stored on the artifact as dispatch_tag. We do not recompute it; we use the tag silverc wrote.',
      kcc20: 'Official KCC20 examples live in the silverscript repo (kcc20.sil / kcc20-minter.sil). KRON tokens in this wallet are the production KCC20 already on mainnet — do not mix the example contracts with live KRON ticks.',
      testnetNote: 'Upstream README still cautions bytecode on testnet-10 until v1. rc1 is intended to be functionally equivalent to v1.',
      release: RELEASE
    };
  }

  function compileVaultPayload(opts) {
    opts = opts || {};
    var artifact = parse(opts.artifact);
    var c = contractOf(artifact, opts.contract);
    var amountKas = Number(opts.amountKas);
    if (!(amountKas > 0)) err('Need amountKas to fund this SilverScript vault');
    return {
      type: 'silverscript',
      params: {
        amountKas: amountKas,
        artifact: artifact,
        contract: c.name,
        redeemHex: hexOf(toBytes(c.compiled.bytecode))
      }
    };
  }

  return {
    version: VERSION,
    schemaVersion: SCHEMA,
    release: RELEASE,
    parse: parse,
    summary: summary,
    contract: contractOf,
    encodeEntry: encodeEntry,
    bytecode: bytecodeOf,
    redeemHex: redeemHex,
    hexOf: hexOf,
    toBytes: toBytes,
    val: val,
    facts: facts,
    compileVaultPayload: compileVaultPayload,
    pushInt: pushInt,
    pushBytes: pushBytes
  };
});

const _sil = globalThis.kcc20Silver;
export const parse = _sil.parse;
export const encodeEntry = _sil.encodeEntry;
export const redeemHex = _sil.redeemHex;
export const compileVaultPayload = _sil.compileVaultPayload;
export const summary = _sil.summary;
export const facts = _sil.facts;
export const contractOf = _sil.contract;
export default _sil;
