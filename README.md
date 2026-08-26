# KCC20 Wallet

**Live app:** [https://kcc-20-wallet.vercel.app](https://kcc-20-wallet.vercel.app)  
**dApp SDK docs:** [https://kcc-20-wallet.vercel.app/docs.html](https://kcc-20-wallet.vercel.app/docs.html) · [CONNECT.md](./CONNECT.md) · [sdk.js](./sdk.js) · [demo](https://kcc-20-wallet.vercel.app/dapp-demo.html)

A non-custodial Kaspa wallet for **native KAS**, **KCC20** (KRON / Kas Knight and other covenant tokens), and **KRC-20** (Kasplex). Time-lock vaults, KCC20 freeze, in-app KRON trading, and covenant++ tools — all in the browser. Keys never leave your device.

### For app developers (plug-and-play connect)

Same job as KasWare’s `window.kasware`, without a Chrome extension:

```html
<script src="https://kcc-20-wallet.vercel.app/sdk.js?v=166"></script>
```

Then `await window.kcc20.connect()` on a **user click**. Popup closes after Approve. `getPublicKey` / `getUtxoEntries` stay silent. You build the unsigned PSKT; `signPskt` opens the Sign sheet. Full API: [docs.html](https://kcc-20-wallet.vercel.app/docs.html).

Built by **TTT agent internet**.

---

## Table of contents

1. [What this is (in plain English)](#1-what-this-is-in-plain-english)
2. [The easiest way: just open the live wallet](#2-the-easiest-way-just-open-the-live-wallet)
3. [Save it to your phone like an app](#3-save-it-to-your-phone-like-an-app)
4. [First-time setup (create a wallet)](#4-first-time-setup-create-a-wallet)
5. [Everyday use](#5-everyday-use)
6. [Clone this repo on your computer](#6-clone-this-repo-on-your-computer)
7. [Run it on your own computer](#7-run-it-on-your-own-computer)
8. [Windows: one-click start](#8-windows-one-click-start)
9. [Put it on your own Vercel](#9-put-it-on-your-own-vercel)
10. [GitHub Pages](#10-github-pages)
11. [Safety rules](#11-safety-rules)
12. [What the buttons do](#12-what-the-buttons-do)
13. [If something looks broken](#13-if-something-looks-broken)
14. [Who built this](#14-who-built-this)

---

## 1. What this is (in plain English)

This is a **Kaspa wallet you open in a web browser**. It is not a bank. Nobody at TTT, Vercel, or GitHub can see your coins or move them for you.

- **KAS** is the native Kaspa coin.
- **KCC20** is Kaspa Layer-1 covenant tokens (KRON, KKDAG / Kas Knight, KPULSE, and others).
- **KRC-20** is Kasplex tokens (PACMAN and similar).
- **Vaults** can freeze KAS or KCC20 on a timer (the same CLTV time-lock used on Kaspa Layer 1). When the timer ends, this wallet can sweep the funds back automatically.

You can use the hosted site, or copy the code and run it yourself. Both are the same wallet.

---

## 2. The easiest way: just open the live wallet

You do **not** need to clone anything if you only want to use the wallet.

### Step by step

1. Open a normal browser. Chrome, Safari, Edge, or Firefox all work.
2. Go to this address (copy and paste it if you need to):

   **[https://kcc-20-wallet.vercel.app](https://kcc-20-wallet.vercel.app)**

3. Wait a few seconds. You should see a phone-shaped wallet with a video background.
4. If the screen is blank or stuck:
   - Make sure you typed `https://` (not `file://`).
   - Pull down to refresh, or press `Ctrl + Shift + R` (Windows) / `Cmd + Shift + R` (Mac) for a hard refresh.
5. Bookmark the page so you can find it again:
   - Chrome / Edge: click the star in the address bar.
   - Safari: Share → Add Bookmark.

That is the current public build. Use this URL unless you have a reason to run a local copy.

---

## 3. Save it to your phone like an app

The wallet is a PWA (a website that can sit on your home screen).

### iPhone / iPad (Safari)

1. Open [https://kcc-20-wallet.vercel.app](https://kcc-20-wallet.vercel.app) in **Safari** (not Chrome on iOS if you want “Add to Home Screen”).
2. Tap the **Share** button (square with an arrow).
3. Scroll and tap **Add to Home Screen**.
4. Name it `KCC20` (or leave the default).
5. Tap **Add**.
6. Open it from the icon on your home screen. It will look like a full-screen app.

### Android (Chrome)

1. Open [https://kcc-20-wallet.vercel.app](https://kcc-20-wallet.vercel.app) in Chrome.
2. Tap the three dots in the top right.
3. Tap **Add to Home screen** / **Install app**.
4. Confirm.

Your keys still live in that browser’s storage on that phone. A home-screen icon is a shortcut, not a backup.

---

## 4. First-time setup (create a wallet)

Do this once per device (or once per browser).

1. Open the live app (section 2).
2. Tap **Create wallet** (or **New wallet** if you already have one and want another).
3. The app makes a Kaspa key on **your device**. It does not send the key to a server.
4. Set a **PIN**. You will need this PIN to send, trade, freeze, or reveal the private key.
   - Pick a PIN you will remember.
   - There is no “forgot PIN” email. If you forget it, you need the private key you copied.
5. When the app shows a **private key**, copy it somewhere safe **before** you continue:
   - A password manager, or
   - Paper stored offline.
   - Do **not** screenshot it into iCloud/Google Photos if you can avoid it.
6. Confirm you saved the key, then tap through to Home.
7. You should see a `kaspa:q…` address, a KAS balance (starts at 0), and tabs: Home, Tokens, Vault, Activity, You.

### Import an existing wallet instead

1. Tap **Import**.
2. Paste your private key (the long hex string you saved earlier).
3. Set a PIN for this device.
4. The same Kaspa address will appear. Balances load from the Kaspa network.

You can keep several wallets (Wallet 1, Wallet 2, …) and switch them on Home or the You tab.

---

## 5. Everyday use

### Receive KAS or tokens

1. On Home, tap **Receive**.
2. Show the QR code, or tap **Copy** for the `kaspa:q…` address.
3. Send KAS or KCC20/KRC-20 **to that exact address** from another wallet.
4. Stay on the page. The balance refreshes by itself. A few seconds to a minute is normal.

### Send KAS, KCC20, or KRC-20

1. Tap **Send**.
2. Choose the asset (KAS, KKDAG, KRON, PACMAN, …).
3. Paste a destination `kaspa:` address, or tap scan to use the camera.
4. Enter the amount.
5. Review the fee line. Native KAS pays the network fee. Token sends also need a little KAS in the wallet.
6. Confirm with your **PIN**.
7. You get a transaction id. Tap it to open [kaspa.stream](https://kaspa.stream). You can copy the id.

### Trade KCC20 (KRON markets)

1. Tap **TRADE KCC20** on Home, or open Tokens and tap a ticker.
2. Pick **Buy** or **Sell**.
3. Enter an amount. The review sheet shows **native KAS leaving**, not just the sticker price:
   - KAS into the market
   - protocol fee legs (covenant-enforced)
   - ~0.5 KAS cell that **stays in your wallet** with the tokens
   - network / compute fee
4. Confirm with PIN.

### Freeze KAS (Time Capsule)

1. Open the **Vault** tab.
2. Choose **Time Capsule**, or type in the chat:  
   `Lock 0.15 KAS for 3 minutes`
3. Review, PIN, confirm.
4. The KAS sits in a `kaspa:p…` covenant until the timer. This wallet **auto-sweeps** it back when time is up.

### Freeze KCC20 (same idea as native KAS)

1. Vault → **KCC20 Freeze**, or open a token and tap **Freeze**, or type:  
   `Lock 20 KKDAG for 3 minutes`
2. Tokens move to SCRIPT_HASH ownership of a CLTV capsule. About **0.2 KAS** sits in the capsule as a witness.
3. When the timer ends, Sweep returns the tokens plus leftover witness KAS.

### Vaults list

- **Active** — locks that are still live.
- **History** — vaults that already swept. Hidden from Active on purpose.

### Compound UTXOs

If Home says you have many UTXOs, tap **Compound** so sends are cheaper and less likely to hit storage-mass errors. PIN required.

---

## 6. Clone this repo on your computer

Cloning means “download a copy of the source code.” You only need this if you want to run it yourself, read the code, or host your own copy.

Public GitHub: [https://github.com/mrzeku2000XTTT/KCC20-wallet](https://github.com/mrzeku2000XTTT/KCC20-wallet)

### Option A — GitHub website (no Git knowledge)

1. Open [https://github.com/mrzeku2000XTTT/KCC20-wallet](https://github.com/mrzeku2000XTTT/KCC20-wallet).
2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Unzip the file. You get a folder named `KCC20-wallet-main`.
5. Go to [section 7](#7-run-it-on-your-own-computer).

### Option B — GitHub Desktop (easiest for most people)

1. Install [GitHub Desktop](https://desktop.github.com/).
2. File → Clone repository → URL.
3. Paste: `https://github.com/mrzeku2000XTTT/KCC20-wallet.git`
4. Choose a folder on your computer (for example Documents).
5. Click **Clone**.
6. When it finishes, click **Show in Explorer** (Windows) or **Show in Finder** (Mac).

### Option C — Command line (Windows PowerShell)

1. Install [Git for Windows](https://git-scm.com/download/win) if `git` is not already installed.
2. Open **PowerShell**.
3. Copy and paste these lines, one block at a time:

```powershell
cd $HOME\Documents
git clone https://github.com/mrzeku2000XTTT/KCC20-wallet.git
cd KCC20-wallet
```

4. You should now be inside the project folder. Continue to section 7.

### Option D — Command line (Mac / Linux)

```bash
cd ~/Documents
git clone https://github.com/mrzeku2000XTTT/KCC20-wallet.git
cd KCC20-wallet
```

---

## 7. Run it on your own computer

The wallet is static files (HTML, CSS, JS, WASM). You still need a **tiny local web server**. Opening `index.html` as a file (`file://`) will fail — the Kaspa engine cannot load that way.

### What you need

- [Node.js](https://nodejs.org/) LTS (the installer includes `npx`).
- After install, close and reopen the terminal.

### Check Node is installed

Windows PowerShell or Mac Terminal:

```bash
node -v
npx -v
```

You should see version numbers, not an error. If you see an error, install Node.js and try again.

### Start the wallet

In the `KCC20-wallet` folder:

```bash
npx --yes serve -p 4173
```

What you should see: a message that the server is accepting connections.

### Open it

In your browser go to:

**http://127.0.0.1:4173**

or

**http://localhost:4173**

Do **not** double-click `index.html`. Use that http address.

### Stop it

Click the terminal window and press `Ctrl + C`.

### Next time

1. Open a terminal.
2. `cd` into the `KCC20-wallet` folder.
3. Run `npx --yes serve -p 4173` again.
4. Open http://127.0.0.1:4173

A local copy uses **your** browser storage. Wallets you created on Vercel do not automatically appear here (and the other way around), unless you import the same private key.

---

## 8. Windows: one-click start

If you cloned or unzipped the repo on Windows:

1. Open the `KCC20-wallet` folder in File Explorer.
2. Double-click **`run.bat`**.
3. A black window opens and starts the server.
4. In your browser, open **http://127.0.0.1:4173**
5. Leave the black window open while you use the wallet.
6. Close that window (or Ctrl+C) when you are done.

If Windows asks “how do you want to open this?”, choose **Open** — it is a script that only starts a local server. It does not send your keys anywhere.

---

## 9. Put it on your own Vercel

The public site is already:

**[https://kcc-20-wallet.vercel.app](https://kcc-20-wallet.vercel.app)**

You only need this section if you want **your own** URL.

1. Create a free account at [https://vercel.com](https://vercel.com).
2. Click **Add New…** → **Project**.
3. Import `mrzeku2000XTTT/KCC20-wallet` (or your fork).
4. Settings to use:
   - **Framework preset:** Other
   - **Root directory:** `.` (the repo root — this repo *is* the wallet)
   - **Build command:** leave empty
   - **Output directory:** leave empty / `.`
5. Click **Deploy**.
6. When it finishes, Vercel shows a URL. That URL is your copy of the wallet.

WASM is already configured in `vercel.json` so `kaspa_bg.wasm` is served with the correct `Content-Type`.

> If you deploy from the bigger `kaspa-xmss-covenants` repo instead, set **Root directory** to `wallet`.

---

## 10. GitHub Pages

Optional public host (same files):

1. Open the repo on GitHub → **Settings** → **Pages**.
2. Source: **Deploy from a branch**.
3. Branch: `main`.
4. Folder: `/ (root)`.
5. Save.
6. After a minute, open:  
   `https://mrzeku2000xttt.github.io/KCC20-wallet/`

Prefer the Vercel URL above as the canonical live app. It is what we keep current.

---

## 11. Safety rules

Read this even if you skip everything else.

1. **This wallet is non-custodial.** If you lose the private key *and* the PIN with no backup, the coins are gone. No one can reset it.
2. **Copy the private key** when you create a wallet. Store it offline.
3. **Never paste your private key** into a chat, email, or a “support” website.
4. **PIN** unlocks signing on this device. It is not a backup of the key.
5. Keys live in **browser localStorage**. Clearing site data, switching browsers, or a new phone means you must **import** the key again.
6. Always check you are on **https://kcc-20-wallet.vercel.app** (or your own clone you trust). Fake copies can steal keys.
7. This talks to **Kaspa mainnet**. Sends, trades, and freezes are real. Start with tiny amounts.
8. KCC20 cells must carry enough native KAS (storage mass). Keep a little spare KAS in the wallet besides the tokens.
9. Protocol fees on KRON trades are enforced by the covenant (creator / platform). They cannot be redirected. A partner tag `kcc20wallet` is attached for integrator settlement if you are registered with KRON.

---

## 12. What the buttons do

| Place | What it does |
| --- | --- |
| **Send** | KAS, KCC20, or KRC-20 to a `kaspa:` address. PIN to sign. |
| **Receive** | Your address + QR. |
| **Vault** | Time Capsule (KAS), KCC20 Freeze, escrow, multisig, chat builder. |
| **Tokens** | Live KCC20 (kascov / KRON indexer) and KRC-20 (Kasplex). |
| **TRADE KCC20** | KRON curve / pool buy & sell. Review shows full native KAS leaving. |
| **Compound** | Merge UTXOs. |
| **Activity** | Recent txs. Tap one for Scorpion (plain-English covenant++). |
| **You** | Address, QR, PIN, keys (hidden until reveal + PIN), new/import wallet, wipe. |
| **Wallet switcher** | Multiple wallets, KasWare-style. |

Explorers used in-app: [kaspa.stream](https://kaspa.stream).

---

## 13. If something looks broken

**Blank screen / “Wallet JS failed”**  
You opened the files as `file://`. Use http://127.0.0.1:4173 or the Vercel URL. Hard-refresh (`Ctrl+Shift+R`).

**Old buttons / missing Freeze**  
The app is cached. Hard-refresh, or close the PWA and reopen. Local builds bump `?v=` on `index.html`.

**“Need about 0.50 more KAS” on freeze / send**  
Often Kaspa **storage mass** (similar-sized outputs), not an empty wallet. Keep spare KAS as a normal UTXO. Freeze keeps the cell’s KAS and uses distinct witness / change sizes.

**Tokens not showing**  
Wait for the indexer. Same key as KasWare should list the same KCC20. Pull Refresh.

**PIN on every send**  
That is intentional.

**iPhone camera QR**  
Allow camera permission when Send asks.

**WASM / “null pointer”**  
Hard-refresh. Do not reuse a frozen tab overnight.

---

## 14. Who built this

**Built by TTT agent internet.**

Kaspa mainnet wallet and covenant++ tools: native KAS, KCC20 SCRIPT_HASH freeze, CLTV time capsules, KRON trading, KRC-20 commit-reveal, multi-wallet, PIN, and Scorpion.

Source: [github.com/mrzeku2000XTTT/KCC20-wallet](https://github.com/mrzeku2000XTTT/KCC20-wallet)  
Live: [kcc-20-wallet.vercel.app](https://kcc-20-wallet.vercel.app)

Related research (XMSS / post-quantum covenants, mainnet proofs):  
[github.com/mrzeku2000XTTT/kaspa-xmss-covenants](https://github.com/mrzeku2000XTTT/kaspa-xmss-covenants)

---

### License / network

Use at your own risk on **Kaspa mainnet**. This is software, not a custodian, not financial advice, and not a recovery service.
