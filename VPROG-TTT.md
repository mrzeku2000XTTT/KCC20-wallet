# vProg Tic-Tac-Toe (Scorpion)

Guest program under test: [biryukovmaxim/vprog-tictactoe](https://github.com/biryukovmaxim/vprog-tictactoe).
Framework: [kaspanet/vprogs](https://github.com/kaspanet/vprogs).
Public TN10 DA: `https://vprogs-tt.izio.fr` (`/api/state`, `/api/config`, `/api/games`, `/api/accounts/:id`, `/api/exits`).

Two players lock a stake, play a multi-round match, RISC0 guest settles the pot (draw splits). Demo L1 + `ttd` + `ttflow` + encoder-wasm + Vite web live in that repo. E2E: `TT_E2E=1 RISC0_DEV_MODE=1 cargo test --release -p vprog-tictactoe-driver --test e2e_simnet`.

## In this wallet

You → Apps → **vProg TTT**. BUILD 265.

1. **Practice** — guest `rules.rs` on this phone. Default 3 rounds, 0.5 KAS pot display. You are seat 0 (creator). X opens every round; marks swap on odd rounds; early clinch; draw splits the stake. No KAS leaves the wallet.
2. **Live TN10 lane** — spectator. Same games as `vprogs-tt.izio.fr`.
3. **Staked match** — guest UI at https://vprogs-tt.izio.fr with a throwaway TN10 hex key (not this wallet’s PIN key).

Reads the DA through `/vprog-tt/*` on Vercel or a DA URL you paste (`http://127.0.0.1:9880` for local `ttd`). Rollup id is this wallet's x-only pubkey. Keys stay in Scorpion.

Create / join / turn / claim are **lane-carrier** txs from encoder-wasm.

## Local guest stack

See their [demo runbook](https://github.com/biryukovmaxim/vprog-tictactoe/blob/master/docs/demo/README.md). Pin vprogs to the branch in their `Cargo.toml`. Wipe `ttd-data` when restarting a fresh simnet.
