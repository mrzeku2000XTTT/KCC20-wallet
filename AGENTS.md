# Base44 Dev Environment

## What this is
A static Kaspa wallet PWA (KCC20 Wallet) — pure HTML/CSS/JS, no build step, no backend database. All wallet logic runs client-side in the browser.

## How it runs here
- **nginx:alpine** serves the static files from the repo root (bind-mounted read-only at `/app`) on port 3000.
- Two custom nginx configs: `nginx.main.base44.conf` (main context, runs as `user root` because the sandbox bind-mount has 700 perms) and `nginx.base44.conf` (server block with API proxies + WASM MIME).
- `vercel.json` rewrites are replicated as nginx `proxy_pass` rules: `/cook-api/` → `dev-api-kcc20.kaspa.com`, `/vprog-tt/` → `vprogs-tt.izio.fr`.
- Edits to HTML/CSS/JS appear on refresh (no build, no reload needed — just refresh the browser).

## No secrets required
No external credentials needed. The wallet is non-custodial and client-side. The two proxied APIs are public endpoints.

## Gotcha: nginx MIME types
Do NOT add a `types { ... }` block inside the server/location config — it **replaces** the entire MIME map inherited from `mime.types`, so every file (including index.html) gets served as `application/octet-stream` and the browser downloads the HTML instead of rendering it (blank white preview). For WASM, use `default_type application/wasm;` inside the `\.wasm$` location instead.

## Healthcheck
`wget --spider http://127.0.0.1:3000/index.html` — must use 127.0.0.1 (not localhost, which resolves to IPv6 where nginx doesn't listen).

## Verify
```bash
docker compose -f docker-compose.base44.yml up -d
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/  # expect 200
```
