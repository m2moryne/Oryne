# Hosting Oryne on our own server (Namecheap VPS)

This guide moves Oryne off Render's free plan, which sleeps after 15 idle
minutes and loses its disk on every restart, onto our Namecheap VPS, next to
Ardena. It covers **both networks**: testnet (test mode, test USDC) and
mainnet (live mode, real USDC).

Everything the guide installs is in this folder, ready to copy:

| File | What it is |
|---|---|
| `systemd/oryne-api-testnet.service` | Runs the testnet API, restarts it if it ever stops |
| `systemd/oryne-api-mainnet.service` | The same for mainnet |
| `systemd/oryne-demo-merchant.service` | The demo merchant the examples pay (testnet) |
| `env/*.env.example` | Settings for each service, with every value explained |
| `nginx/oryne.conf` | Domains, HTTPS and the website |
| `scripts/deploy.sh` | Updates the server to the latest `master`, safely |
| `scripts/backup.sh` | Daily database backups |
| `render-forwarder/server.mjs` | Runs on Render after the move, so old links keep working |

Read the whole guide once before starting. Budget half a day. Testnet goes
first; mainnet only after testnet has run cleanly for a few days.

---

## What runs on the server

| Service | Port (local only) | Public address | Replaces on Render |
|---|---|---|---|
| Testnet API | 8787 | `https://testnet-api.oryne.org` | `oryne-api` (`oryne.onrender.com`) |
| Mainnet API | 8789 | `https://api.oryne.org` | `oryne-api-mainnet` |
| Demo merchant | 8788 | `https://demo.oryne.org` | `oryne-demo-merchant` |
| Website and dashboard | (static files) | `https://oryne.org` | Vercel |
| PostgreSQL | 5432 | (not public) | Supabase |

The domain names are suggestions. If you choose others, change them in
`env/*.env.example` and `nginx/oryne.conf`, and tell the developers: the
SDKs need the final testnet and mainnet API addresses (see step 14).

The services listen on `127.0.0.1` only (the `HOST` setting). nginx is the
only thing the internet talks to.

## Rules that keep it from failing

Read these before anything else. Each one prevents a real failure.

1. **Exactly one copy of each API per network, ever.** The API queues the
   sponsor account's Stellar transactions in memory and runs the webhook
   sender in the background. Two copies of the same network, whether two
   systemd units, PM2 in cluster mode, or the server *and* Render at once,
   means failed transactions and duplicate webhooks. That's why Render becomes
   a forwarder in step 14 instead of running alongside.
2. **Keep the keys.** `SPONSOR_SECRET` and `TOKEN_ISSUER_SECRET` (testnet),
   and `SPONSOR_SECRET`, `TREASURY_SECRET` and `WALLET_WASM_HASH` (mainnet),
   must be copied from Render exactly. With new testnet keys, the API makes a
   new test USDC that no existing wallet or the demo merchant holds. A
   different mainnet `WALLET_WASM_HASH` deploys different contract code.
3. **Testnet and mainnet never share** a database, an env file or a data
   directory.
4. **The mainnet env file controls real money.** Only `root` and `oryne` may
   read it. It never leaves the server: no laptops, chats or tickets.
5. **Never `git push` from the server** and never edit code there. The server
   only pulls `master` (step 9).

## Before you start

**Check what Ardena already uses.** On the VPS:

```sh
sudo ss -ltnp            # ports in use: 8787, 8788 and 8789 must be free
nginx -v                 # nginx already there? (Apache or Caddy: tell us first)
node -v                  # Ardena's Node version, if any
df -h / && free -h       # disk and memory
```

If one of the ports is taken, pick another and change it in the env file
*and* in `nginx/oryne.conf`. If Ardena needs a Node version other than 22,
tell us before installing; Node 22 is required by Oryne.

Oryne needs roughly **1.5 GB of memory** (two APIs, the demo merchant,
PostgreSQL, and the website build while deploying) and **5 GB of disk**, on
top of what Ardena uses. The guide assumes **Ubuntu 22.04 or 24.04** with
`sudo`.

**Collect from Render** (each service's *Environment* tab) and keep them in
the team password manager, not in a file:

- `oryne-api`: every value, especially `SPONSOR_SECRET`, `TOKEN_ISSUER_SECRET`, `DATABASE_URL`
- `oryne-api-mainnet`: every value, especially `SPONSOR_SECRET`, `TREASURY_SECRET`, `WALLET_WASM_HASH`, `DATABASE_URL`

And from Vercel: the website's `VITE_ORYNE_API_URL` and `VITE_ORYNE_LIVE_API_URL`, if set.

---

## 1. DNS

Where `oryne.org`'s DNS is managed, add **A records** pointing to the VPS's
IP address (and AAAA records if the VPS has IPv6):

| Name | Type | Value |
|---|---|---|
| `testnet-api` | A | VPS IP |
| `api` | A | VPS IP |
| `demo` | A | VPS IP |

Leave `oryne.org` and `www` pointing at Vercel for now; they move in step 14.
Use a short TTL (300 seconds) during the move.

## 2. The base server

```sh
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl rsync ufw fail2ban unattended-upgrades nginx certbot python3-certbot-nginx
sudo dpkg-reconfigure -plow unattended-upgrades      # automatic security updates: yes

# Firewall: SSH and web only. Check Ardena doesn't need other ports open first.
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

If it isn't already: log in with SSH keys and turn off password logins
(`PasswordAuthentication no` in `/etc/ssh/sshd_config`, then
`sudo systemctl restart ssh`). Test a new SSH session works before closing
the old one.

Keep the logs from filling the disk: in `/etc/systemd/journald.conf` set
`SystemMaxUse=1G`, then `sudo systemctl restart systemd-journald`.

## 3. Node.js 22

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v      # must be v22.18 or later: Oryne runs its TypeScript directly
```

## 4. PostgreSQL

```sh
sudo apt install -y postgresql
sudo -u postgres psql
```

In `psql`, with two different strong passwords:

```sql
CREATE ROLE oryne_testnet LOGIN PASSWORD 'testnet-password';
CREATE DATABASE oryne_testnet OWNER oryne_testnet;
CREATE ROLE oryne_mainnet LOGIN PASSWORD 'mainnet-password';
CREATE DATABASE oryne_mainnet OWNER oryne_mainnet;
\q
```

PostgreSQL only listens on `localhost` by default; keep it that way. The API
creates its tables on first start.

## 5. The code

```sh
sudo adduser --system --group --home /var/lib/oryne --shell /bin/bash oryne
sudo install -d -o oryne -g oryne /opt/oryne
sudo -u oryne git clone https://github.com/m2moryne/Oryne.git /opt/oryne
sudo mkdir -p /etc/oryne /var/lib/oryne/testnet /var/lib/oryne/mainnet /var/www/oryne /var/backups/oryne
sudo chown oryne:oryne /var/lib/oryne/testnet /var/lib/oryne/mainnet /var/www/oryne
sudo chmod 700 /var/lib/oryne/testnet /var/lib/oryne/mainnet
sudo chown postgres:postgres /var/backups/oryne
cd /opt/oryne && sudo -u oryne npm ci
```

## 6. Settings

```sh
cd /opt/oryne
for f in api-testnet api-mainnet demo-merchant web; do
  sudo install -m 640 -o root -g oryne deploy/env/$f.env.example /etc/oryne/$f.env
done
sudo nano /etc/oryne/api-testnet.env     # then api-mainnet.env, demo-merchant.env, web.env
```

Fill in every blank. Each value is explained in the file. Values marked
**FROM RENDER** come from what you collected. Leave mainnet for later if
you're doing testnet first, but create the file.

`ADMIN_TOKEN` must be the same value the admin site
([apps/admin](../apps/admin), its own repository) uses for that network.

## 7. The data

Pick one:

**A. Keep Supabase for now (simplest, no downtime).** Put the same
`DATABASE_URL` the Render service uses into the env file. Nothing to copy.
Move the data to the server's PostgreSQL later with option B.

**B. Move the data to the server's PostgreSQL.** For each network, stop the
Render service first (step 14 shows the order), so nothing writes during the
copy:

```sh
# pg_dump must be the same major version as Supabase's PostgreSQL or newer;
# if it complains, install postgresql-client-17 from apt.postgresql.org.
pg_dump --format=custom --no-owner --no-acl --schema=public \
  "<Render DATABASE_URL for testnet>" -f /tmp/testnet.dump
sudo -u postgres pg_restore --no-owner --role=oryne_testnet -d oryne_testnet /tmp/testnet.dump
rm /tmp/testnet.dump
```

The same for mainnet into `oryne_mainnet`. Then set `DATABASE_URL` to the
local one: `postgresql://oryne_testnet:<password>@127.0.0.1:5432/oryne_testnet`.

## 8. The services

```sh
sudo cp /opt/oryne/deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now oryne-api-testnet oryne-demo-merchant
sudo journalctl -u oryne-api-testnet -f      # Ctrl+C to stop watching
```

A good start prints the database, `sponsor G…`, `token C…`, `wallet wasm …`,
the allowed browsers and `Oryne API on http://127.0.0.1:8787`.

**Check the sponsor and token match Render's**: the `sponsor` and `token`
lines must show the same addresses as `https://oryne.onrender.com/v1/info`.
If they differ, the keys weren't copied right (rule 2): stop the service and
fix the env file.

```sh
curl -s http://127.0.0.1:8787/v1/info     # testnet API answers
curl -s http://127.0.0.1:8788/            # demo merchant answers
```

Mainnet is enabled in step 13, after testnet is proven.

## 9. Deploying updates

Let the `oryne` user restart Oryne's services, and nothing else:

```sh
sudo tee /etc/sudoers.d/oryne > /dev/null <<'EOF'
oryne ALL=(root) NOPASSWD: /usr/bin/systemctl restart oryne-api-testnet, /usr/bin/systemctl restart oryne-api-mainnet, /usr/bin/systemctl restart oryne-demo-merchant, /usr/bin/journalctl -u oryne-*
EOF
sudo chmod 440 /etc/sudoers.d/oryne && sudo visudo -c
sudo chmod +x /opt/oryne/deploy/scripts/*.sh
```

From now on, **every update is one command**:

```sh
sudo -u oryne /opt/oryne/deploy/scripts/deploy.sh
```

It pulls `master`, installs, builds the website, and restarts testnet, then
the demo merchant, then mainnet, checking each one answers before going on.
If one doesn't come up, it stops and prints that service's last log lines;
the others keep running the old version. Services that aren't enabled yet
(mainnet, until step 13) are skipped, never started.

**Rolling back** to an earlier version:

```sh
cd /opt/oryne
sudo -u oryne git log --oneline -10            # find the last good commit
sudo -u oryne git checkout <commit>
sudo -u oryne npm ci
sudo systemctl restart oryne-api-testnet oryne-demo-merchant oryne-api-mainnet
# Later, to get back on master: sudo -u oryne git checkout master, then deploy.sh
```

## 10. nginx and HTTPS

```sh
sudo cp /opt/oryne/deploy/nginx/oryne.conf /etc/nginx/sites-available/oryne.conf
sudo ln -s /etc/nginx/sites-available/oryne.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d testnet-api.oryne.org -d api.oryne.org -d demo.oryne.org
```

Add `-d oryne.org -d www.oryne.org` to the certbot command only once those
point at the server (step 14). `nginx -t` checks every site's config, so a
mistake can't take Ardena down: if it fails, fix it before reloading.
Certificates renew on their own (`systemctl list-timers | grep certbot`).

```sh
curl -s https://testnet-api.oryne.org/v1/info
curl -s https://demo.oryne.org/
```

## 11. Backups

Only needed with the server's own PostgreSQL (option 7B). Supabase backs
itself up.

```sh
sudo -u postgres crontab -e
# add:
15 3 * * * /opt/oryne/deploy/scripts/backup.sh >> /var/backups/oryne/backup.log 2>&1
```

Run it once by hand (`sudo -u postgres /opt/oryne/deploy/scripts/backup.sh`)
and check `/var/backups/oryne`. **Copy the backups off the server** every day
(to object storage or another machine): a backup on the same disk doesn't
survive losing the server. Test a restore into a scratch database once a
month.

Money and wallets live on Stellar, not in the database. What a lost database
loses is accounts, agents' names, approvals, the activity history and
webhooks, so the backups still matter.

## 12. Monitoring

Add free uptime checks (UptimeRobot or Better Stack), alerting by email or
phone, every 1 to 5 minutes:

- `https://api.oryne.org/v1/info`
- `https://testnet-api.oryne.org/v1/info`
- `https://demo.oryne.org/`
- `https://oryne.org/`

Weekly, in the admin site: the mainnet **sponsor's XLM** (it pays every
network fee; empty means no wallets can be deployed) and the **treasury's
USDC** (it pays card top-ups). `SPONSOR_DAILY_XLM` caps what the sponsor
spends per day.

Logs: `sudo journalctl -u oryne-api-mainnet -n 200` (or `-f` to follow).

## 13. Check it works

**Testnet**, from any machine with the repository (this pays test USDC only):

```sh
ORYNE_API_URL=https://testnet-api.oryne.org MERCHANT_URL=https://demo.oryne.org npm run mcp-check
cd packages/python && ORYNE_TESTNET=1 ORYNE_API_URL=https://testnet-api.oryne.org \
  MERCHANT_URL=https://demo.oryne.org .venv/bin/pytest -m testnet
```

Both run the whole flow: a wallet, an agent, a payment, a refusal by the
contract, an approval, and the approved payment.

**Mainnet** (real money, so no automated payment test):

```sh
sudo systemctl enable --now oryne-api-mainnet
sudo journalctl -u oryne-api-mainnet -n 30
curl -s https://api.oryne.org/v1/info
```

The `sponsor`, `token` (Circle's USDC) and `wallet wasm` lines must match
`https://oryne-api-mainnet.onrender.com/v1/info`. Then follow step 14, and
check by hand in the dashboard's Live mode with an invited account: sign in,
see the wallet, and make one small payment.

## 14. Cut over

Do this per network, testnet first. The order matters because of rule 1.

1. **Update the outside services** to the new API addresses:
   - Google and GitHub OAuth apps: add `https://<api>/v1/auth/oauth/google/callback` and `…/github/callback`
   - Paystack (test mode for testnet, live mode for mainnet): webhook `https://<api>/v1/paystack/webhook`
   - Resend: nothing changes
2. **Point the website at the new APIs.** In `/etc/oryne/web.env` (or in
   Vercel, if the website stays there) set `VITE_ORYNE_API_URL` and
   `VITE_ORYNE_LIVE_API_URL`, then deploy (`deploy.sh`, or redeploy on
   Vercel).
3. **Turn the Render API into a forwarder**, so nothing runs twice and old
   links keep working. Render's services are defined in `render.yaml` and
   `render.mainnet.yaml` (Blueprints), so this is a change to those files,
   committed and pushed at cut-over time, not an edit in Render's dashboard
   (the next Blueprint sync would undo that). For the service being moved:
   `startCommand: node deploy/render-forwarder/server.mjs`, an env var
   `TARGET` with the new address (`https://testnet-api.oryne.org`,
   `https://api.oryne.org`, or `https://demo.oryne.org` for the demo
   merchant), and every other env var removed. Ask the developers for this
   commit when you're ready; it takes a minute. Once Render has redeployed,
   **delete the secrets** still stored on the Render services
   (`SPONSOR_SECRET`, `TREASURY_SECRET`, `TOKEN_ISSUER_SECRET`,
   `DATABASE_URL`, the OAuth and Paystack keys): the forwarder needs none of
   them. Check `https://oryne.onrender.com/v1/info` still answers, now
   through the server.
4. **Moving the website too?** When it has been built on the server once
   (`deploy.sh`), point `oryne.org` and `www` at the VPS in DNS, run certbot
   again with `-d oryne.org -d www.oryne.org` added, and turn the Vercel
   project off.
5. **SDKs.** The published SDKs and the docs default to the `onrender.com`
   addresses. The forwarders keep those working, so nothing breaks. Send the
   final addresses to the developers, so new SDK versions and the docs use
   them directly. Keep the Render forwarders running for at least two months
   after those versions are out, then switch them off.

## Troubleshooting

| What you see | What it means |
|---|---|
| `SPONSOR_SECRET is a public address (G…)` | A `G…` address went where the `S…` secret belongs |
| `sponsor` or `token` differs from Render's | Wrong or missing keys (rule 2). Stop the service and fix the env file |
| `Could not refresh the wallet wasm` | Testnet couldn't download the contract build from GitHub; it carries on with the last one it uploaded. Mainnet, with `WALLET_WASM_HASH` set, never downloads |
| Browser shows CORS errors | The website's address is missing from `CORS_ORIGINS` or `WEB_URL` |
| Google or GitHub sign-in fails | The callback URL in the OAuth app doesn't match `PUBLIC_URL` |
| 502 from nginx | The service is down or still starting: `systemctl status oryne-api-testnet` and its journal |
| `deploy.sh` stops with "did not come up" | Read the log lines it printed; the previous version of the other services keeps running |
| Payments time out | The Stellar RPC is slow; on mainnet, use a paid RPC provider (`STELLAR_RPC_URL`) |
