# Oryne Admin

Read-only admin for the Oryne API: accounts, wallets, agents, payments, API
requests, API keys and system configuration across every account. Light and
dark themes. It changes nothing: changes to wallets and mandates are signed by
their owners in the product.

It is a standalone Vite + React app with its own `package.json` and lockfile,
so this folder can live in its own repository as is.

## How it signs in

The admin API exists only when the Oryne API has `ADMIN_TOKEN` set (32+
characters). This site asks for that token and keeps it in `sessionStorage`,
so it lasts for the tab and is gone when the browser closes. Wrong tokens are
limited to 10 attempts per 15 minutes per address.

## Run it locally

Needs Node 22.18+.

```sh
npm install
cp .env.example .env    # VITE_ORYNE_API_URL: the API to read from
npm run dev             # http://localhost:5175
```

For a local API, start it with an admin token and allow this origin:

```sh
ADMIN_TOKEN=<32+ characters> CORS_ORIGINS=http://localhost:5175 npm run dev:api
```

## Deploy (Vercel)

1. Put this folder in its own repository and import it in Vercel. `vercel.json`
   sets the build, the SPA fallback, and `noindex` / no-framing headers.
2. In Vercel, set `VITE_ORYNE_API_URL` (e.g. `https://oryne.onrender.com`).
3. Give it a domain, e.g. `admin.oryne.org`.
4. On the API host (Render):
   - set `ADMIN_TOKEN` to a long random value:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   - add the admin site's address to `CORS_ORIGINS`, e.g.
     `https://oryne.org,https://admin.oryne.org`

Keep the token in a password manager; anyone with it can read every account's
data.

## Pages

| Page | What it shows |
|---|---|
| Overview | Accounts, wallets, settled volume, refusals, requests and errors in 24 h, latest failures |
| Accounts | Everyone who signed in, with wallets, API keys, first and last activity; search |
| Wallets | Deployed wallet contracts, owners, agents and payments |
| Agents | Agent keys, status and mandates |
| Payments | Settled, refused and failed payments, with explorer links |
| Requests | Authenticated API calls, with errors |
| API keys | Keys owners created (metadata only; secrets are never stored) |
| System | Network, sponsor, token, wasm, storage, allowed origins, features |
