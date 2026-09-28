(function (root) {
  var FILL = [
    'Fill this once. Paste it at the top of every prompt.',
    '',
    'DOTK_NAME=alice.k',
    'RDNS=k.alice',
    'HOST=https://alice-k.vercel.app',
    'LOOK=Scorpion desk, gold on black, large receive QR',
    'GITHUB_USER=your-github-username',
    '',
    'Never invent a kaspa: address. Never print a seed, PIN, or 64-hex.'
  ].join('\n');

  var P1 = [
    'ITERATION 1 — Clone Scorpion. Do not start empty.',
    '',
    'Fork https://github.com/mrzeku2000XTTT/KCC20-wallet into GITHUB_USER/DOTK_NAME-wallet.',
    'Open that fork in this session as the workspace.',
    '',
    'KEEP UNCHANGED:',
    'js/tx.js js/crypto.js js/kasware.js js/kaspire.js js/kassigner.js',
    'vendor/kaspa (entire WASM) vendor/kron-sdk',
    'Approve / PIN / KasWare sheets. Keys never leave the PWA origin.',
    'signPskt only signs listed P2PK funding indexes.',
    'Do not overwrite window.kasware if a real extension exists.',
    '',
    'CHANGE NOW:',
    '1. index.html title, apple-mobile-web-app-title, og:title → DOTK_NAME',
    '2. manifest.json name and short_name → DOTK_NAME (short_name max 12 chars)',
    '3. In index.html BEFORE any other script, add:',
    '   <script>',
    '     window.KCC20_WALLET_ORIGIN = "HOST";',
    '     window.KCC20_DOTK = "DOTK_NAME";',
    '     window.KCC20_RDNS = "RDNS";',
    '   </script>',
    '4. sdk.js: keep SDK_VERSION; scriptOrigin() already reads KCC20_WALLET_ORIGIN.',
    '   Announce uses KCC20_DOTK, KCC20_RDNS, and origin (sdk 178).',
    '5. releases.json: add a note that this fork is DOTK_NAME.',
    '',
    'Do not restyle CSS yet. Commit: "identity: DOTK_NAME".',
    'Done when: grep shows KCC20_DOTK in index.html and manifest name is DOTK_NAME.'
  ].join('\n');

  var P2 = [
    'ITERATION 2 — Face only. LOOK from the fill-in block.',
    '',
    'Restyle index.html chrome and css/app.css to match LOOK.',
    'Home title is DOTK_NAME. Hide TRADE KCC20, Compound, KRON 24H, A-Trade unless LOOK asks for them.',
    'You may change copy, colors, layout, lock-screen title, You tab name.',
    'You may hide Apps you do not want. Do not delete js/ or vendor/.',
    '',
    'Kaspa brand: keep assets/kas.svg as the default mark.',
    'Home must still show live KAS + KCC20 from the existing app.js data.',
    'Receive QR must render THIS wallet address in-page (qrcode), not a fake.',
    '',
    'Do not touch signing, UTXO selection, or node URLs.',
    'Commit: "face: LOOK".'
  ].join('\n');

  var P3 = [
    'ITERATION 3 — Make it a real PWA that iPhone and desktop can INSTALL.',
    '',
    'Scorpion currently UNREGISTERS service workers in index.html to bust cache.',
    'This fork MUST register a service worker so Add to Home Screen works.',
    '',
    'A. manifest.json must include:',
    '   name: DOTK_NAME',
    '   short_name: first label before .k, max 12 chars',
    '   start_url: "./index.html"',
    '   display: "standalone"',
    '   background_color and theme_color',
    '   icons: assets/icon.png 192 and 512 (purpose any maskable). If only 1024 exists, keep it AND add a 192 copy.',
    '   id: "https://HOST/"',
    '   scope: "./"',
    '',
    'B. index.html head must include:',
    '   <link rel="manifest" href="manifest.json">',
    '   <meta name="apple-mobile-web-app-capable" content="yes">',
    '   <meta name="mobile-web-app-capable" content="yes">',
    '   <meta name="apple-mobile-web-app-title" content="DOTK_NAME">',
    '   <link rel="apple-touch-icon" href="assets/icon.png">',
    '   <meta name="theme-color" content="#050506">',
    '',
    'C. Add sw.js at repo root:',
    '   self.addEventListener("install", function(e){ self.skipWaiting(); });',
    '   self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });',
    '   self.addEventListener("fetch", function(e){',
    '     if (e.request.mode === "navigate") return;',
    '     e.respondWith(fetch(e.request).catch(function(){ return caches.match(e.request); }));',
    '   });',
    '',
    'D. REPLACE the block in index.html that calls serviceWorker.getRegistrations().unregister().',
    '   Register instead:',
    '   if ("serviceWorker" in navigator) {',
    '     navigator.serviceWorker.register("./sw.js");',
    '   }',
    '',
    'E. HTTPS only. Vercel provides this. file:// will not install.',
    'Commit: "pwa: installable DOTK_NAME".'
  ].join('\n');

  var P4 = [
    'ITERATION 4 — dApps must see DOTK_NAME on Connect.',
    '',
    'Confirm sdk.js announceProviders() sends:',
    '  info.name = DOTK_NAME',
    '  info.identity = DOTK_NAME',
    '  info.rdns = RDNS',
    '  info.kind = "dotk"',
    '',
    'Add a one-file test: demo-dapp.html in the repo (static).',
    'It loads THIS fork\'s sdk.js from HOST (after deploy you will set HOST).',
    'Button Connect calls:',
    '  const list = await window.kcc20.discoverWallets();',
    '  render list showing identity and rdns;',
    '  await window.kcc20.connect({ identity: "DOTK_NAME", origin: "HOST" });',
    '  const who = await window.kcc20.getIdentity();',
    'Show who.name and who.address. Never ask for a key.',
    '',
    'Allow popups. Connect only on a click.',
    'Commit: "discover: DOTK_NAME".'
  ].join('\n');

  var P5 = [
    'ITERATION 5 — Deploy and install.',
    '',
    '1. Push the fork to GitHub.',
    '2. Vercel: Import that repo. Framework: Other. Output: root. HTTPS on HOST.',
    '3. After first deploy, set HOST in index.html KCC20_WALLET_ORIGIN if it still says YOUR-HOST.',
    '4. Redeploy.',
    '5. Open HOST on desktop Chrome. DevTools → Application → Manifest must be valid.',
    '   Service worker must be activated (not unregistered).',
    '6. Open HOST on iPhone Safari. Share → Add to Home Screen. Icon is DOTK_NAME.',
    '   Opening from the home icon must be standalone (no Safari chrome).',
    '7. Open demo-dapp.html on another origin or the same HOST. Connect.',
    '   The picker / popup must show DOTK_NAME. PIN signs. No seed field.',
    '',
    'If Add to Home Screen is missing: HTTPS, manifest linked, 192 icon, SW registered.',
    'If Connect missing .k: KCC20_DOTK script tag before sdk.js, hard-refresh.',
    'Commit after HOST is real: "deploy: HOST".'
  ].join('\n');

  var P6 = [
    'ITERATION 6 — Fix pass. Only if something failed.',
    '',
    'Report: PWA install yes/no, discoverWallets identities, connect identity, PIN sign yes/no.',
    'Fix only the failing layer. Do not rewrite tx.js.',
    'If SW unregisters itself, you left Scorpion\'s unregister block — delete it.',
    'If rdns is still app.kcc20.wallet, KCC20_RDNS is missing.',
    'If keys leaked into the UI, revert that commit immediately.',
    'Done when: installed PWA, Connect from a dApp shows DOTK_NAME, one real TN10 or mainnet tx optional.'
  ].join('\n');

  var P7 = [
    'ITERATION 7 — This must NOT look like Scorpion / KCC20 Wallet.',
    '',
    'The user complained the app is still Wallet 1, TRADE KCC20, Compound, A-Trade, Vault tab.',
    'That chrome is Scorpion. Strip it unless LOOK explicitly asks for it.',
    '',
    'REMOVE or hide from Home:',
    '- Wallet chip switcher ("Wallet 1") unless they have multiple keys',
    '- TRADE KCC20 row, Compound, KRON 24H, A-Trade tab',
    '- Scorpion / You marketing copy, TTT logos if LOOK is not Scorpion',
    '',
    'REPLACE Home with DOTK_NAME layout:',
    '- Title: DOTK_NAME (not Wallet 1, not KCC20 Wallet)',
    '- Identity, live KAS, live KCC20, Receive QR in-page, Send in-page',
    '- Tab bar labels: Home / Activity / You only, unless LOOK needs more',
    '- Lock screen title DOTK_NAME',
    '- Connect popup title DOTK_NAME (dappConnect.js strings that say KCC20 Wallet)',
    '',
    'Keep the signer. Delete is for UI. Do not delete tx.js.',
    'Commit: "face: not scorpion — DOTK_NAME".',
    'Done when a screenshot would not be mistaken for kcc-20-wallet.vercel.app.'
  ].join('\n');

  var P8 = [
    'ITERATION 8 — Connect must pop THIS PWA, not Scorpion.',
    '',
    'If a dApp loads https://kcc-20-wallet.vercel.app/sdk.js, Connect opens Scorpion.',
    'THIS fork must ship its own sdk.js from HOST.',
    '',
    '1. index.html MUST set before sdk.js:',
    '   window.KCC20_WALLET_ORIGIN = "HOST"',
    '   window.KCC20_DOTK = "DOTK_NAME"',
    '   window.KCC20_RDNS = "RDNS"',
    '2. demo-dapp.html on THIS repo loads:',
    '   <script src="HOST/sdk.js?v=178"></script>',
    '   NOT kcc-20-wallet.vercel.app/sdk.js',
    '3. Button: Connect DOTK_NAME',
    '     await window.kcc20.connect({ identity: "DOTK_NAME", origin: "HOST" })',
    '   The popup URL must be HOST/index.html?dapp=1 — inspect the popup address bar.',
    '4. announceProviders info.origin must be HOST.',
    '',
    'If the popup URL is kcc-20-wallet.vercel.app you failed this pass. Fix origin.',
    'Commit: "connect pops HOST".'
  ].join('\n');

  var P9 = [
    'ITERATION 9 — Third-party dApps using the official SDK.',
    '',
    'A site that only loaded Scorpion sdk.js can still open THIS wallet:',
    '  await window.kcc20.connect({ identity: "DOTK_NAME", origin: "HOST" })',
    'or',
    '  await window.kcc20.connect({ identity: "DOTK_NAME" })',
    'after adding a row to https://kcc20-sdk.vercel.app/dotk-wallets.json :',
    '  { "identity": "DOTK_NAME", "rdns": "RDNS", "origin": "HOST", "name": "DOTK_NAME" }',
    '',
    'Open a PR on mrzeku2000XTTT/kcc20-sdk adding that row, OR document HOST in README.',
    'Test from a blank page that uses ONLY https://kcc-20-wallet.vercel.app/sdk.js?v=178',
    'and connect({ identity, origin: HOST }). Popup must be HOST, chrome must say DOTK_NAME.',
    'Commit: "registry: DOTK_NAME → HOST".'
  ].join('\n');

  var ALL = [FILL, P1, P2, P3, P4, P5, P6, P7, P8, P9].join('\n\n========== NEXT ITERATION ==========\n\n');

  var STEPS = [
    { id: 'fill', n: '0', title: 'Fill this first', blurb: 'Name, host, look. Paste on every later prompt.', text: FILL },
    { id: 'core', n: '1', title: 'Fork the core', blurb: 'Clone Scorpion. Stamp .k identity. Do not restyle yet.', text: P1 },
    { id: 'face', n: '2', title: 'Design the face', blurb: 'HTML/CSS only. Live KAS and QR stay real.', text: P2 },
    { id: 'pwa', n: '3', title: 'Make it installable', blurb: 'Manifest, Apple tags, service worker. Replace Scorpion’s unregister.', text: P3 },
    { id: 'dapp', n: '4', title: 'Be visible to dApps', blurb: 'Announce alice.k. Ship a tiny Connect test page.', text: P4 },
    { id: 'ship', n: '5', title: 'Deploy and Add to Home Screen', blurb: 'Vercel HTTPS. iPhone standalone. Desktop install.', text: P5 },
    { id: 'fix', n: '6', title: 'Fix pass', blurb: 'Only if install or Connect failed.', text: P6 },
    { id: 'notscorpion', n: '7', title: 'Stop looking like Scorpion', blurb: 'Strip Wallet 1, TRADE, Compound, A-Trade. Home is DOTK_NAME.', text: P7 },
    { id: 'popup', n: '8', title: 'Connect pops YOUR PWA', blurb: 'demo-dapp loads HOST/sdk.js. Popup URL is HOST, not kcc-20-wallet.', text: P8 },
    { id: 'registry', n: '9', title: 'Any dApp can open you', blurb: 'connect({ identity, origin }) or a row in dotk-wallets.json.', text: P9 }
  ];

  root.KCC20_DOTK_PROMPT = ALL;
  root.KCC20_DOTK_STEPS = STEPS;
  root.KCC20_copyDotkPrompt = function (id) {
    var text = ALL;
    if (id) {
      var s = STEPS.filter(function (x) { return x.id === id; })[0];
      if (s) text = s.text;
    }
    return navigator.clipboard.writeText(text);
  };
})(typeof window !== 'undefined' ? window : this);
