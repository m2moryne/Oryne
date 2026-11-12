# Oryne with Docker

The Docker way to run what [`deploy/README.md`](../README.md) runs with systemd:
the testnet and mainnet APIs, the demo merchant and the website, on one server,
behind the server's own nginx, redeployed automatically when `master` changes.

The rules in [`deploy/README.md`](../README.md#rules-that-keep-it-from-failing)
apply here unchanged, above all **exactly one running API per network**: don't
run this alongside the same network on Render with the same keys.

| Service | Container port (127.0.0.1) | Public address |
|---|---|---|
| `api-testnet` | 8787 | `https://testnet-apiv1.oryne.org` |
| `demo-merchant` | 8788 | `https://demo.oryne.org` |
| `api-mainnet` | 8789 | `https://apiv1.oryne.org` (only with the `mainnet` profile) |
| `web` | 8790 | not yet: `oryne.org` stays on Vercel until its DNS moves |

| File | What it is |
|---|---|
| `Dockerfile` | One image for the APIs and the merchant (`server`), one for the website (`web`) |
| `compose.yml` | The four services, local-only ports, health checks, data volumes |
| `env.example` | Becomes `.env`: compose settings and the website's API addresses |
| `env/*.env` | Each service's settings, from `deploy/env/*.env.example` (gitignored) |
| `oryne.nginx.conf` | The server's nginx in front, for `/etc/nginx/conf.d/` |
| `autodeploy.sh`, `systemd/` | Redeploys within a minute of a push to `master` |

## Setting up the server

Needs Docker with Compose, nginx, certbot and git.

```sh
sudo git clone https://github.com/m2moryne/Oryne.git /opt/oryne
cd /opt/oryne/deploy/docker

# Settings. HOST, PORT and ORYNE_DATA_DIR are set by compose.yml, so the
# templates' values for them don't matter here.
sudo install -d -m 700 env
for f in api-testnet api-mainnet demo-merchant; do
  sudo install -m 600 ../env/$f.env.example env/$f.env
done
sudo cp env.example .env
sudo nano env/api-testnet.env        # and the others

# First start
sudo docker compose up -d --build
sudo docker compose ps               # all "healthy" after a minute or two

# nginx and HTTPS
sudo cp oryne.nginx.conf /etc/nginx/conf.d/oryne.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d testnet-apiv1.oryne.org -d apiv1.oryne.org -d demo.oryne.org

# Automatic deploys
sudo chmod +x autodeploy.sh
sudo cp systemd/oryne-autodeploy.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now oryne-autodeploy.timer
```

**Mainnet** (real money): fill in `env/api-mainnet.env`, set
`COMPOSE_PROFILES=mainnet` in `.env`, then `sudo docker compose up -d`.

## Everyday

| To | Run (in `/opt/oryne/deploy/docker`) |
|---|---|
| See what's running | `sudo docker compose ps` |
| Follow a service's logs | `sudo docker compose logs -f api-testnet` |
| See the deploys | `journalctl -u oryne-autodeploy -n 100` |
| Deploy now, without waiting | `sudo ./autodeploy.sh --force` |
| Apply a changed env file | `sudo docker compose up -d` (recreates what changed) |
| Pause automatic deploys | `sudo systemctl stop oryne-autodeploy.timer` |
| Roll back | stop the timer, `sudo git checkout <commit>`, `sudo docker compose up -d --build` |

A push to `master` is live within about a minute plus the build. If the build
fails, nothing running is touched; if a service doesn't come up healthy, the
log says which and shows its last lines. A failed commit isn't retried until
the next push.

The APIs' data directory (used for the downloaded contract build, and for
SQLite when there's no `DATABASE_URL`) is a Docker volume per network, so it
survives rebuilds.
