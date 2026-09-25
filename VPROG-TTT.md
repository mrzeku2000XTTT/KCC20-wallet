# vProg Tic-Tac-Toe (Scorpion)

Guest program under test: [biryukovmaxim/vprog-tictactoe](https://github.com/biryukovmaxim/vprog-tictactoe).
Framework: [kaspanet/vprogs](https://github.com/kaspanet/vprogs).
Public TN10 DA: `https://vprogs-tt.izio.fr` (`/api/state`, `/api/config`, `/api/games`, `/api/accounts/:id`, `/api/exits`).

Two players lock a stake, play a multi-round match, RISC0 guest settles the pot (draw splits). Demo L1 + `ttd` + `ttflow` + encoder-wasm + Vite web live in that repo. E2E: `TT_E2E=1 RISC0_DEV_MODE=1 cargo test --release -p vprog-tictactoe-driver --test e2e_simnet`.

## In this wallet

You → Apps → **vProg TTT**. BUILD 263. Reads the DA through `/vprog-tt/*` on Vercel (rewrite to the public lane) or a DA URL you paste (`http://127.0.0.1:9880` for local `ttd`). Rollup id is this wallet's x-only pubkey. Keys stay in Scorpion.

Create / join / turn / claim are **lane-carrier** txs from encoder-wasm. This screen is the live lobby, not a paste-the-hex copy of their KeyBar.

## Local guest stack

See their [demo runbook](https://github.com/biryukovmaxim/vprog-tictactoe/blob/master/docs/demo/README.md). Pin vprogs to the branch in their `Cargo.toml`. Wipe `ttd-data` when restarting a fresh simnet.
