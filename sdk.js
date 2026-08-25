/* KCC20 Wallet dApp SDK
   Load from the hosted PWA:
     <script src="https://kcc-20-wallet.vercel.app/sdk.js"></script>
   Then: await window.kcc20.connect()
   Keys never leave the wallet origin. This script only opens the PWA and talks via postMessage.
*/
(function (root) {
  'use strict';
  if (root.kcc20 && root.kcc20.isKcc20) return;

  function scriptOrigin() {
    try {
      var s = document.currentScript && document.currentScript.src;
      if (s) return new URL(s).origin;
    } catch (e) {}
    try {
      if (root.KCC20_WALLET_ORIGIN) return String(root.KCC20_WALLET_ORIGIN).replace(/\/$/, '');
    } catch (e) {}
    return 'https://kcc-20-wallet.vercel.app';
  }

  var ORIGIN = scriptOrigin();
  var hostOrigin = ORIGIN;
  var pending = {};
  var seq = 1;
  var child = null;
  var accounts = [];
  var network = '';
  var listeners = {};

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

  function inWalletBrowser() {
    try { return window.parent && window.parent !== window; } catch (e) { return true; }
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
    var msg = ev.data;
    if (!msg || msg.ns !== 'kcc20') return;
    if (msg.type === 'host-ready' || msg.type === 'ready') {
      if (isWalletOrigin(ev.origin) || inWalletBrowser()) hostOrigin = ev.origin;
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
        emit('disconnect');
      }
    }
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

  function ensureChild() {
    if (inWalletBrowser()) return window.parent;
    if (child && !child.closed) return child;
    var url = walletUrl();
    child = window.open(url, 'kcc20-wallet', popupFeatures());
    if (!child) {
      try { child = window.open(url, 'kcc20-wallet'); } catch (e) { child = null; }
    }
    return child;
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

  function rpc(method, params) {
    return new Promise(function (resolve, reject) {
      var win = ensureChild();
      if (!win) {
        try { location.href = 'web+kcc20:' + method + '?from=' + encodeURIComponent(location.origin); } catch (e) {}
        reject(new Error('Allow popups for KCC20 Wallet, or open ' + ORIGIN + ' and install the PWA.'));
        return;
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
      }).catch(reject);
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
    origin: ORIGIN,
    on: on,
    off: off,
    connect: function () {
      return rpc('connect').then(function (r) {
        accounts = (r && r.accounts) || [];
        network = (r && r.network) || '';
        emit('accountsChanged', accounts);
        if (network) emit('networkChanged', network);
        return accounts;
      });
    },
    disconnect: function () {
      return rpc('disconnect').then(function () {
        accounts = [];
        emit('disconnect');
      }).catch(function () {
        accounts = [];
        emit('disconnect');
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
        if (r && r.accounts) {
          accounts = r.accounts;
          emit('accountsChanged', accounts);
        }
        return network;
      });
    },
    signPskt: function (a, b) {
      return rpc('signPskt', parseSignArgs(a, b));
    },
    signPsbt: function (a, b) {
      return rpc('signPskt', parseSignArgs(a, b));
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
      return rpc('getHoldings');
    },
    getTokenBalance: function (tick) {
      return rpc('getTokenBalance', { tick: tick || 'KKDAG' });
    },
    sendToken: function (opts) {
      return rpc('sendToken', opts || {});
    },
    isEmbedded: function () {
      return inWalletBrowser();
    },
    request: function (method, params) {
      var m = String(method || '');
      var p = params || {};
      if (m === 'connect') {
        return api.connect().then(function (acc) {
          return { address: (acc && acc[0]) || '', accounts: acc || [] };
        });
      }
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
})(typeof window !== 'undefined' ? window : this);
