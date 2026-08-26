/* KCC20 Wallet dApp SDK
   Load from the hosted PWA:
     <script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
   Then: await window.kcc20.connect()
   Keys never leave the wallet origin. This script only opens the PWA and talks via postMessage.
*/
(function (root) {
  'use strict';
  var SDK_VERSION = '166';
  if (root.kcc20 && root.kcc20.isKcc20 && String(root.kcc20.sdkVersion || '') === SDK_VERSION) return;

  function scriptOrigin() {
    var WALLET = 'https://kcc-20-wallet.vercel.app';
    try {
      if (root.KCC20_WALLET_ORIGIN) return String(root.KCC20_WALLET_ORIGIN).replace(/\/$/, '');
    } catch (e) {}
    try {
      var s = document.currentScript && document.currentScript.src;
      if (s) {
        var u = new URL(s);
        if (u.hostname === 'kcc-20-wallet.vercel.app' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          return u.origin;
        }
      }
    } catch (e) {}
    return WALLET;
  }

  var ORIGIN = scriptOrigin();
  var hostOrigin = ORIGIN;
  var pending = {};
  var seq = 1;
  var child = null;
  var accounts = [];
  var network = '';
  var lastState = null;
  var listeners = {};
  var embeddedInWallet = false;
  var SESS = 'kcc20_dapp_sess_v1';

  function loadSess() {
    try { return JSON.parse(sessionStorage.getItem(SESS) || 'null'); } catch (e) { return null; }
  }
  function saveSess() {
    try {
      sessionStorage.setItem(SESS, JSON.stringify({
        accounts: accounts,
        network: network,
        lastState: lastState,
        at: Date.now()
      }));
    } catch (e) {}
  }
  function clearSess() {
    try { sessionStorage.removeItem(SESS); } catch (e) {}
  }
  (function bootSess() {
    var s = loadSess();
    if (!s || !Array.isArray(s.accounts) || !s.accounts.length) return;
    accounts = s.accounts;
    network = s.network || '';
    lastState = s.lastState || null;
  })();

  function on(ev, fn) {
    if (!ev || typeof fn !== 'function') return;
    (listeners[ev] || (listeners[ev] = [])).push(fn);
  }
  function off(ev, fn) {
    var list = listeners[ev];
    if (!list) return;
    listeners[ev] = list.filter(function (x) { return x !== fn; });
  }
  function emit(ev, data) {
    (listeners[ev] || []).forEach(function (fn) {
      try { fn(data); } catch (e) {}
    });
  }

  function uid() {
    seq += 1;
    return 'kcc20_' + Date.now().toString(36) + '_' + seq;
  }

  function consumeHashResult() {
    try {
      var h = String(location.hash || '');
      var m = h.match(/[#&]kcc20=([^&]+)/);
      if (!m) return;
      var raw = decodeURIComponent(m[1]);
      var msg = JSON.parse(raw);
      history.replaceState(null, '', location.pathname + location.search);
      if (msg && msg.ns === 'kcc20' && msg.type === 'res' && msg.id && pending[msg.id]) {
        finish(msg);
      }
    } catch (e) {}
  }

  function finish(msg) {
    var p = pending[msg.id];
    if (!p) return;
    delete pending[msg.id];
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(String(msg.error)));
    else p.resolve(msg.result);
  }

  /* True only when this page is iframed inside the KCC20 PWA (TTT Profile).
     A Replit/Nilla iframe is NOT the wallet — do not talk to window.parent. */
  function inWalletBrowser() {
    return !!embeddedInWallet;
  }

  function isWalletOrigin(origin) {
    if (!origin) return false;
    if (origin === ORIGIN || origin === hostOrigin) return true;
    try {
      var h = new URL(origin).hostname;
      if (h === 'kcc-20-wallet.vercel.app') return true;
      if (h === 'localhost' || h === '127.0.0.1') return inWalletBrowser();
    } catch (e) {}
    return false;
  }

  function walletTarget() {
    if (inWalletBrowser()) return hostOrigin && hostOrigin !== ORIGIN ? hostOrigin : '*';
    return ORIGIN;
  }

  window.addEventListener('message', function (ev) {
    try {
      var msg = ev.data;
      if (!msg || msg.ns !== 'kcc20') return;
      if (msg.type === 'host-ready' || msg.type === 'ready') {
        if (isWalletOrigin(ev.origin)) {
          hostOrigin = ev.origin;
          try {
            if (window.parent && ev.source === window.parent) {
              embeddedInWallet = true;
              if (typeof installKaswareShim === 'function') installKaswareShim();
            }
          } catch (e) {}
        }
      }
      if (!isWalletOrigin(ev.origin)) return;
      if (msg.type === 'res' && msg.id) finish(msg);
      if (msg.type === 'event') {
        if (msg.event === 'accountsChanged') {
          accounts = Array.isArray(msg.payload) ? msg.payload : [];
          emit('accountsChanged', accounts);
        }
        if (msg.event === 'networkChanged') {
          network = String(msg.payload || '');
          emit('networkChanged', network);
        }
        if (msg.event === 'disconnect') {
          accounts = [];
          lastState = null;
          clearSess();
          emit('disconnect');
        }
      }
    } catch (e) {}
  });

  function popupFeatures() {
    var w = 420, h = 780;
    var left = Math.max(0, Math.round((screen.width - w) / 2));
    var top = Math.max(0, Math.round((screen.height - h) / 2));
    return 'popup=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=' + top;
  }

  function walletUrl() {
    return ORIGIN + '/index.html?dapp=1&from=' + encodeURIComponent(location.origin)
      + '&return=' + encodeURIComponent(location.href.split('#')[0]);
  }

  function userClicked() {
    try {
      if (navigator.userActivation && 'isActive' in navigator.userActivation) {
        return !!navigator.userActivation.isActive;
      }
    } catch (e) {}
    return true;
  }

  function grabNamedWallet() {
    if (inWalletBrowser()) return window.parent;
    if (child && !child.closed) return child;
    return null;
  }

  function closeWalletWindow() {
    if (inWalletBrowser()) return;
    try { window.focus(); } catch (e) {}
    if (child && !child.closed && child !== window) {
      try { child.close(); } catch (e) {}
    }
    child = null;
    try { window.focus(); } catch (e) {}
  }

  function liveWalletWindow() {
    if (inWalletBrowser()) return window.parent;
    if (child && !child.closed) return child;
    return null;
  }

  function raiseWalletWindow() {
    if (inWalletBrowser()) return window.parent;
    if (child && !child.closed) {
      if (userClicked()) {
        try { child.focus(); } catch (e) {}
      }
      return child;
    }
    if (!userClicked()) return null;
    var url = walletUrl();
    var w = null;
    try {
      w = window.open(url, 'kcc20-wallet', popupFeatures());
    } catch (e) {}
    if (!w) {
      try { w = window.open(url, 'kcc20-wallet'); } catch (e) {}
    }
    if (w && !w.closed) child = w;
    try { if (child && !child.closed) child.focus(); } catch (e) {}
    return (child && !child.closed) ? child : null;
  }

  function waitReady(win) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        window.removeEventListener('message', onMsg);
        reject(new Error(inWalletBrowser()
          ? 'KCC20 Wallet did not answer. Open TTT from the wallet Profile tab and unlock the wallet.'
          : ('KCC20 Wallet did not answer. Unlock the PWA at ' + ORIGIN + ' and allow popups.')));
      }, 45000);
      function onMsg(ev) {
        var msg = ev.data;
        if (!msg || msg.ns !== 'kcc20') return;
        if (msg.type !== 'ready' && msg.type !== 'host-ready') return;
        if (!isWalletOrigin(ev.origin) && !inWalletBrowser()) return;
        hostOrigin = ev.origin;
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(ping);
        window.removeEventListener('message', onMsg);
        resolve();
      }
      window.addEventListener('message', onMsg);
      var ping = setInterval(function () {
        if (done) { clearInterval(ping); return; }
        if (!inWalletBrowser() && (!win || win.closed)) {
          clearInterval(ping);
          if (!done) {
            done = true;
            clearTimeout(timer);
            window.removeEventListener('message', onMsg);
            reject(new Error('KCC20 Wallet window closed. Open it again to connect.'));
          }
          return;
        }
        try { win.postMessage({ ns: 'kcc20', type: 'hello', from: location.origin }, walletTarget()); } catch (e) {}
      }, 350);
      try { win.postMessage({ ns: 'kcc20', type: 'hello', from: location.origin }, walletTarget()); } catch (e) {}
    });
  }

  var INTERACTIVE = {
    connect: 1, requestAccounts: 1, signPskt: 1, signPsbt: 1, pushTx: 1, switchNetwork: 1,
    sendToken: 1, sendKcc20: 1, payToken: 1, payKcc20: 1, fundCredits: 1
  };

  function closeAfterUse() {
    if (inWalletBrowser()) return;
    setTimeout(function () { closeWalletWindow(); }, 280);
  }

  function hasSession() {
    return !!(accounts.length || (lastState && lastState.address));
  }

  function sessionAddr(params) {
    return String((params && params.address) || accounts[0] || (lastState && lastState.address) || '');
  }

  function restBase() {
    var n = String(network || (lastState && lastState.network) || '');
    if (/testnet/.test(n)) return 'https://api-tn10.kaspa.org';
    return 'https://api.kaspa.org';
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Network ' + r.status);
      return r.json();
    });
  }

  function normalizeUtxos(data, fallbackAddr) {
    var list = Array.isArray(data) ? data : [];
    return list.map(function (u) {
      var e = (u && u.utxoEntry) || u || {};
      var out = (u && u.outpoint) || {};
      var spk = e.scriptPublicKey || u.scriptPublicKey || {};
      var script = spk.scriptPublicKey || spk.script || '';
      if (typeof script !== 'string') script = '';
      var txid = out.transactionId || u.transactionId || '';
      var idx = Number(out.index != null ? out.index : (u.index || 0));
      var amt = String(e.amount != null ? e.amount : (u.amount || '0'));
      var daa = String(e.blockDaaScore != null ? e.blockDaaScore : (u.blockDaaScore || '0'));
      var coin = !!(e.isCoinbase || u.isCoinbase);
      return {
        address: (u && u.address) || fallbackAddr || '',
        outpoint: { transactionId: txid, index: idx },
        utxoEntry: {
          amount: amt,
          scriptPublicKey: { version: Number(spk.version || 0), scriptPublicKey: script },
          blockDaaScore: daa,
          isCoinbase: coin
        },
        transactionId: txid,
        index: idx,
        amount: amt,
        scriptPublicKey: { version: Number(spk.version || 0), script: script, scriptPublicKey: script },
        blockDaaScore: daa,
        isCoinbase: coin
      };
    });
  }

  /* After Connect the popup closes on purpose. Reads must still work for
     any dApp (Nilla Prepare, TTT balance, …) from the saved session + public APIs. */
  function silentFallback(method, params) {
    if (!hasSession()) return Promise.reject(new Error('Connect KCC20 Wallet first'));
    var addr = sessionAddr(params);
    if (method === 'getAccounts') return Promise.resolve(accounts.slice());
    if (method === 'getNetwork') {
      return Promise.resolve(network || (lastState && lastState.network) || 'kaspa_mainnet');
    }
    if (method === 'getPublicKey') {
      var pk = (lastState && (lastState.publicKey || lastState.pubKey)) || '';
      if (pk) return Promise.resolve(pk);
      return Promise.reject(new Error('No public key in this KCC20 session. Connect again.'));
    }
    if (method === 'getState') {
      return Promise.resolve(lastState || {
        accounts: accounts.slice(),
        address: addr,
        network: network,
        publicKey: (lastState && lastState.publicKey) || ''
      });
    }
    if (method === 'getHoldings') {
      return Promise.resolve({
        address: addr,
        network: network || (lastState && lastState.network) || '',
        holdings: (lastState && lastState.holdings) || []
      });
    }
    if (method === 'getBalance') {
      if (!addr) return Promise.reject(new Error('Connect KCC20 Wallet first'));
      if (lastState && lastState.balance && (!params || !params.address || params.address === lastState.address)) {
        return Promise.resolve(lastState.balance);
      }
      return fetchJson(restBase() + '/addresses/' + encodeURIComponent(addr) + '/balance').then(function (data) {
        var sompi = Number((data && (data.balance != null ? data.balance : data)) || 0);
        return { confirmed: sompi, unconfirmed: 0, address: addr };
      });
    }
    if (method === 'getUtxoEntries') {
      if (!addr) return Promise.reject(new Error('Connect KCC20 Wallet first'));
      return fetchJson(restBase() + '/addresses/' + encodeURIComponent(addr) + '/utxos').then(function (data) {
        return normalizeUtxos(data, addr);
      });
    }
    if (method === 'getTokenBalance' || method === 'getKcc20Balance') {
      var tick = String((params && (params.tick || params.ticker)) || 'KKDAG').toUpperCase();
      var hold = ((lastState && lastState.holdings) || []).find(function (h) {
        return String((h && (h.tick || h.ticker)) || '').toUpperCase() === tick;
      });
      if (hold) return Promise.resolve(hold);
      if (!addr) return Promise.reject(new Error('Connect KCC20 Wallet first'));
      return fetchJson('https://idx.kron.technology/v1/kcc20/token/' + encodeURIComponent(tick)
        + '/address/' + encodeURIComponent(addr)).then(function (raw) {
        var row = Array.isArray(raw && raw.result) ? raw.result[0] : (raw && raw.result) || raw || {};
        return {
          tick: tick,
          name: tick,
          decimals: Number(row.dec || row.decimals || 0),
          raw: String(row.balance || row.amount || '0'),
          balance: String(row.balance || row.amount || '0'),
          protocol: 'kcc20',
          address: addr
        };
      }).catch(function () {
        return { tick: tick, name: tick, decimals: 0, raw: '0', balance: '0', protocol: 'kcc20', address: addr };
      });
    }
    return Promise.reject(new Error('Connect KCC20 Wallet first'));
  }

  function rpc(method, params) {
    return new Promise(function (resolve, reject) {
      var interactive = !!INTERACTIVE[method];
      if (!interactive && !inWalletBrowser()) {
        if (hasSession()) {
          silentFallback(method, params).then(resolve, reject);
          return;
        }
      }
      var win = interactive ? raiseWalletWindow() : liveWalletWindow();
      if (!win) {
        if (!interactive) {
          silentFallback(method, params).then(resolve, reject);
          return;
        }
        if (userClicked()) {
          try { location.href = 'web+kcc20:' + method + '?from=' + encodeURIComponent(location.origin); } catch (e) {}
        }
        reject(new Error(userClicked()
          ? ('Allow popups for KCC20 Wallet, or open ' + ORIGIN)
          : 'Tap Connect KCC20 Wallet'));
        return;
      }
      if (interactive) {
        try { win.focus(); } catch (e) {}
      }
      waitReady(win).then(function () {
        var id = uid();
        pending[id] = {
          resolve: resolve,
          reject: reject,
          timer: setTimeout(function () {
            if (!pending[id]) return;
            delete pending[id];
            reject(new Error('KCC20 Wallet timed out on ' + method));
          }, 180000)
        };
        try {
          win.postMessage({
            ns: 'kcc20',
            type: 'req',
            id: id,
            method: method,
            params: params || {},
            from: location.origin,
            name: document.title || location.pathname || location.hostname
          }, walletTarget());
        } catch (e) {
          delete pending[id];
          reject(e);
        }
      }).catch(function (err) {
        if (!interactive) {
          silentFallback(method, params).then(resolve, reject);
          return;
        }
        reject(err);
      });
    });
  }

  function parseSignArgs(a, b) {
    if (a && typeof a === 'object' && (a.txJsonString || a.signedTx)) {
      return {
        txJsonString: String(a.txJsonString || a.signedTx || ''),
        signInputs: (a.options && a.options.signInputs) || a.signInputs || []
      };
    }
    return {
      txJsonString: String(a || ''),
      signInputs: (b && (b.signInputs || (b.options && b.options.signInputs))) || []
    };
  }

  var api = {
    isKcc20: true,
    sdkVersion: SDK_VERSION,
    origin: ORIGIN,
    on: on,
    off: off,
    connect: function () {
      if (accounts.length && lastState && (lastState.publicKey || lastState.pubKey)) {
        return Promise.resolve(accounts.slice());
      }
      if (!inWalletBrowser() && !userClicked()) {
        return Promise.reject(new Error('Tap Connect KCC20 Wallet'));
      }
      return rpc('connect').then(function (r) {
        accounts = (r && r.accounts) || [];
        network = (r && r.network) || '';
        lastState = r || {};
        emit('accountsChanged', accounts);
        if (network) {
          emit('networkChanged', network);
          emit('chainChanged', network);
        }
        if (r && r.balance) emit('balanceChanged', r);
        saveSess();
        closeAfterUse();
        return accounts;
      });
    },
    disconnect: function () {
      return new Promise(function (resolve) {
        var finish = function () {
          accounts = [];
          lastState = null;
          clearSess();
          emit('disconnect');
          resolve();
        };
        if (inWalletBrowser()) {
          rpc('disconnect').then(finish).catch(finish);
          return;
        }
        var win = grabNamedWallet();
        if (win && win !== window) {
          try {
            win.postMessage({
              ns: 'kcc20',
              type: 'req',
              id: uid(),
              method: 'disconnect',
              params: {},
              from: location.origin
            }, '*');
          } catch (e) {}
        }
        try { window.focus(); } catch (e) {}
        setTimeout(function () {
          try { window.focus(); } catch (e) {}
          closeWalletWindow();
          finish();
        }, 200);
      });
    },
    getAccounts: function () {
      if (accounts.length) return Promise.resolve(accounts.slice());
      return rpc('getAccounts').then(function (r) {
        accounts = Array.isArray(r) ? r : ((r && r.accounts) || []);
        return accounts;
      });
    },
    getNetwork: function () {
      if (network) return Promise.resolve(network);
      return rpc('getNetwork').then(function (r) {
        network = typeof r === 'string' ? r : (r && r.network) || '';
        return network;
      });
    },
    switchNetwork: function (net) {
      return rpc('switchNetwork', { network: net }).then(function (r) {
        network = typeof r === 'string' ? r : (r && r.network) || String(net || '');
        emit('networkChanged', network);
        emit('chainChanged', network);
        if (r && r.accounts) {
          accounts = r.accounts;
          emit('accountsChanged', accounts);
        }
        return network;
      });
    },
    signPskt: function (a, b) {
      return rpc('signPskt', parseSignArgs(a, b)).then(function (r) { closeAfterUse(); return r; });
    },
    signPsbt: function (a, b) {
      return rpc('signPskt', parseSignArgs(a, b)).then(function (r) { closeAfterUse(); return r; });
    },
    getUtxoEntries: function (address) {
      return rpc('getUtxoEntries', { address: address || '' });
    },
    getBalance: function (address) {
      return rpc('getBalance', { address: address || '' });
    },
    getPublicKey: function () {
      return rpc('getPublicKey');
    },
    getHoldings: function () {
      if (!liveWalletWindow() && lastState && lastState.holdings) {
        return Promise.resolve({
          address: lastState.address,
          network: lastState.network,
          holdings: lastState.holdings
        });
      }
      return rpc('getHoldings');
    },
    getState: function () {
      if (lastState && lastState.address && !liveWalletWindow()) {
        return Promise.resolve(lastState);
      }
      return rpc('getState').then(function (r) {
        lastState = r || lastState;
        if (r && r.accounts) accounts = r.accounts;
        if (r && r.network) network = r.network;
        return r;
      }).catch(function (e) {
        if (lastState && lastState.address) return lastState;
        throw e;
      });
    },
    detect: function () {
      return {
        available: true,
        isKcc20: true,
        sdkVersion: SDK_VERSION,
        name: 'KCC20 Wallet',
        embedded: inWalletBrowser(),
        origin: ORIGIN,
        accounts: accounts.slice(),
        network: network
      };
    },
    getTokenBalance: function (tick) {
      return rpc('getTokenBalance', { tick: tick || 'KKDAG' });
    },
    sendToken: function (opts) {
      return rpc('sendToken', opts || {}).then(function (r) { closeAfterUse(); return r; });
    },
    isEmbedded: function () {
      return inWalletBrowser();
    },
    requestAccounts: function () {
      if (accounts.length) return Promise.resolve(accounts.slice());
      return api.connect();
    },
    removeListener: function (ev, fn) {
      off(ev, fn);
    },
    pushTx: function (json) {
      var s = (json && typeof json === 'object')
        ? String(json.txJsonString || json.signedTx || json.tx || '')
        : String(json || '');
      return rpc('pushTx', { txJsonString: s }).then(function (r) { closeAfterUse(); return r; });
    },
    request: function (method, params) {
      var m = String(method || '');
      var p = params || {};
      if (m === 'connect' || m === 'requestAccounts') {
        return api.connect().then(function (acc) {
          var s = lastState || {};
          return {
            address: (acc && acc[0]) || s.address || '',
            accounts: acc || s.accounts || [],
            network: s.network || network,
            publicKey: s.publicKey || '',
            balance: s.balance || null,
            holdings: s.holdings || [],
            kas: s.kas,
            kkdags: s.kkdags
          };
        });
      }
      if (m === 'getState') return api.getState();
      if (m === 'disconnect') return api.disconnect();
      if (m === 'getAccounts') return api.getAccounts();
      if (m === 'getNetwork') return api.getNetwork();
      if (m === 'switchNetwork') return api.switchNetwork(p.network || p);
      if (m === 'getPublicKey') return api.getPublicKey();
      if (m === 'getUtxoEntries') return api.getUtxoEntries(p.address);
      if (m === 'getBalance') {
        return api.getBalance(p.address).then(function (r) {
          var sompi = typeof r === 'number' ? r : Number((r && (r.confirmed != null ? r.confirmed : r.balance)) || 0);
          var pending = Number((r && r.unconfirmed) || 0);
          return {
            balanceKAS: sompi / 1e8,
            pending: pending / 1e8,
            address: (r && r.address) || p.address || ''
          };
        });
      }
      if (m === 'signPskt' || m === 'signPsbt') return api.signPskt(p, p.options);
      if (m === 'pushTx' || m === 'broadcast') return api.pushTx(p.txJsonString || p.signedTx || p);
      if (m === 'getHoldings' || m === 'getKcc20Holdings') return api.getHoldings();
      if (m === 'getTokenBalance' || m === 'getKcc20Balance') return api.getTokenBalance(p.tick || p.ticker || 'KKDAG');
      if (m === 'sendToken' || m === 'sendKcc20' || m === 'payToken' || m === 'payKcc20' || m === 'fundCredits') {
        return api.sendToken(p);
      }
      return Promise.reject(new Error(m + ' is not supported by this KCC20 PWA build. Use connect / getTokenBalance / sendToken.'));
    }
  };

  Object.defineProperty(api, 'accounts', {
    get: function () { return accounts.slice(); }
  });

  root.kcc20 = api;
  root.kcc20wallet = api;
  consumeHashResult();
  try {
    root.dispatchEvent(new CustomEvent('kcc20#initialized', { detail: api }));
  } catch (e) {}

  /* TTT Connect buttons often look for window.kasware. When this page is
     inside the KCC20 iframe — or KasWare is not installed — route those
     calls to the PWA so they see this wallet’s balance and Sign sheet. */
  var shimKasware = {
    isKcc20Shim: true,
    requestAccounts: function () { return api.connect(); },
    getAccounts: function () { return api.getAccounts(); },
    getNetwork: function () { return api.getNetwork(); },
    getPublicKey: function () { return api.getPublicKey(); },
    getUtxoEntries: function (address) { return api.getUtxoEntries(address); },
    getBalance: function () {
      return api.getState().then(function (s) {
        var sompi = Number((s && s.balance && s.balance.confirmed) || 0);
        return {
          confirmed: sompi,
          unconfirmed: 0,
          total: sompi,
          address: (s && s.address) || '',
          balanceKAS: sompi / 1e8,
          holdings: (s && s.holdings) || [],
          kkdags: (s && s.kkdags) || 0
        };
      });
    },
    signPskt: function (a, b) { return api.signPskt(a, b); },
    signPsbt: function (a, b) { return api.signPskt(a, b); },
    pushTx: function (json) { return api.pushTx(json); },
    sendKaspa: function () {
      return Promise.reject(new Error('Use KCC20 sendToken / signPskt. This shim does not send KAS blindly.'));
    },
    on: on,
    removeListener: off
  };
  /* TTT (and KCC20 iframe) must not hit the KasWare extension.
     Nilla / other dApps keep a real installed KasWare next to window.kcc20. */
  function installKaswareShim() {
    var host = '';
    try { host = String(location.hostname || ''); } catch (e) {}
    var ttt = /(^|\.)tttz\.xyz$/i.test(host);
    var real = root.kasware && !root.kasware.isKcc20Shim;
    if (embeddedInWallet || ttt || !real) root.kasware = shimKasware;
  }
  installKaswareShim();

  var kipUuid = (function () {
    try {
      if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    } catch (e) {}
    return 'kcc20-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2);
  })();
  var kipIcon = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#c9a36a"/><text x="32" y="42" text-anchor="middle" font-size="26" font-family="system-ui,sans-serif" fill="#1a140c">K</text></svg>'
  );
  var kipProvider = {
    requestAccounts: function () { return api.connect(); },
    getAccounts: function () { return api.getAccounts(); },
    getNetwork: function () {
      return api.getNetwork().then(function (n) {
        n = String(n || '');
        if (/testnet/.test(n)) return 'testnet-10';
        if (n === 'mainnet' || n === 'kaspa_mainnet') return 'mainnet';
        return n || 'mainnet';
      });
    },
    switchNetwork: function (id) { return api.switchNetwork(id); },
    getPublicKey: function () { return api.getPublicKey(); },
    getUtxoEntries: function (address) { return api.getUtxoEntries(address); },
    getBalance: function (address) { return api.getBalance(address); },
    getState: function () { return api.getState(); },
    signPskt: function (a, b) { return api.signPskt(a, b); },
    pushTx: function (json) { return api.pushTx(json); },
    disconnect: function () { return api.disconnect(); },
    on: on,
    removeListener: off
  };
  function announceKip12() {
    try {
      var info = Object.freeze({
        id: 'kcc20-wallet',
        name: 'KCC20 Wallet',
        icon: kipIcon,
        methods: ['kaspa:signPskt', 'kaspa:requestAccounts'],
        uuid: kipUuid,
        rdns: 'app.kcc20.wallet'
      });
      var detail = Object.freeze({ info: info, provider: kipProvider });
      root.dispatchEvent(new CustomEvent('kaspa:provider', { detail: detail }));
    } catch (e) {}
  }
  try {
    root.addEventListener('kaspa:requestProvider', announceKip12);
    announceKip12();
  } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
