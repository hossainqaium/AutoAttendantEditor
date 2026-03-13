# IVR Studio — Install API Server and Studio UI on the Same FreeSWITCH/FusionPBX Server

This guide describes what to change so that **api-server** and **studio-ui** both run on the same
machine as your FreeSWITCH/FusionPBX server.

---

## Important: nginx conflict with FusionPBX's own `/api` path

FusionPBX's existing nginx configuration contains this rewrite rule in every server block:

```nginx
if ($uri ~* ^.*/api/.*$) {
    rewrite ^(.*)/api/(.*)$ $1/api/index.php?rewrite_uri=$2 last;
}
```

This means **any URL that contains `/api/` is rewritten to FusionPBX's own REST API**
(`index.php`). If you add IVR Studio's `/api/` proxy inside the same FusionPBX server block,
every call from the Studio UI (`/api/flows`, `/api/domains`, etc.) will be swallowed by
FusionPBX instead of reaching the IVR Studio API server.

**The only clean solution: give IVR Studio its own dedicated nginx server block** — either on
a separate port (e.g. `8443`) or a separate subdomain (e.g. `ivr.yourdomain.com`). Do **not**
add the IVR Studio config inside the existing FusionPBX server blocks.

---

## 1. API server (on the server)

### Environment

Create `api-server/.env` on the server (copy from `api-server/.env` in this repo) with:

| Variable | Value on server |
|----------|------------------|
| `DB_HOST` | `127.0.0.1` (PostgreSQL is on the same machine) |
| `DB_PORT` | `5433` (your FusionPBX PostgreSQL listens on 5433 — confirm with `ss -tlnp \| grep 543`) |
| `DB_NAME` | `fusionpbx` |
| `DB_USER` | `fusionpbx` |
| `DB_PASSWORD` | Your FusionPBX database password (from `/etc/fusionpbx/config.conf`) |
| `PORT` | `3002` |
| `HOST` | `127.0.0.1` (bind to loopback; nginx proxies to it — do not expose 3002 publicly) |
| `STUDIO_ORIGIN` | The full URL where the UI is served, e.g. `https://192.168.0.113:8443` — used for CORS |
| `IVR_SECRET_KEY` | Same 64-character hex key as in `vars.xml` (`ivr_secret_key` global variable) |
| `FS_RECORDINGS_PATH` | `/var/lib/freeswitch/recordings` |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `FUSIONPBX_SSH` | Remove or leave empty — not needed when running on the server itself |
| `FUSIONPBX_SSH_PASSWORD` | Remove or leave empty — not needed on the server itself |

### Run the API server

Install Node.js 18+ on the server if not already present:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Install dependencies and start the API:

```bash
cd /opt/ivr-studio/api-server   # or wherever you put the project
npm install --omit=dev
node src/index.js
```

For production, create a systemd service so it starts automatically and restarts on failure:

**`/etc/systemd/system/ivr-studio-api.service`**
```ini
[Unit]
Description=IVR Studio API Server
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ivr-studio/api-server
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/ivr-studio/api-server/.env
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=ivr-studio-api

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable ivr-studio-api
sudo systemctl start ivr-studio-api
```

---

## 2. Studio UI (build and serve with nginx)

### Build the UI

On the server (or on your local machine — then copy the `dist/` folder across):

```bash
cd /opt/ivr-studio/studio-ui
npm ci
npm run build
```

The output is in `studio-ui/dist/`. Copy it to a web-accessible directory:

```bash
sudo mkdir -p /var/www/ivr-studio
sudo cp -r dist/* /var/www/ivr-studio/
sudo chown -R www-data:www-data /var/www/ivr-studio
```

### vite.config.ts — no change needed for root path

The current `vite.config.ts` has no `base` option, which defaults to `'/'`. This is correct when
the UI is served from the root of its own dedicated server block (e.g. `https://192.168.0.113:8443/`).

If you want to serve the UI under a subpath (e.g. `https://192.168.0.113:8443/ivr-studio/`), you
would need to set `base: '/ivr-studio/'` in `vite.config.ts` before building. Serving from the
root of a dedicated port is simpler and requires no code change.

---

## 3. Nginx — dedicated server block for IVR Studio

Add a **new, separate server block** to nginx. Do NOT edit the existing FusionPBX server blocks.

Create a new file: **`/etc/nginx/sites-available/ivr-studio`**

```nginx
# ─────────────────────────────────────────────────────────────────
# IVR Studio — dedicated server block on port 8443
# Keeps IVR Studio completely separate from the FusionPBX vhost
# and avoids the FusionPBX /api rewrite conflict.
# ─────────────────────────────────────────────────────────────────
server {
    listen 8443 ssl;
    listen [::]:8443 ssl;
    server_name _;   # catch-all; change to your hostname if you have one

    # Reuse FusionPBX's existing self-signed certificate
    ssl_certificate     /etc/ssl/certs/nginx.crt;
    ssl_certificate_key /etc/ssl/private/nginx.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    access_log /var/log/nginx/ivr-studio-access.log;
    error_log  /var/log/nginx/ivr-studio-error.log;

    # ── Proxy IVR Studio API calls to the Node.js API server ─────
    location /api/ {
        proxy_pass         http://127.0.0.1:3002/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── API server health check ───────────────────────────────────
    location /health {
        proxy_pass http://127.0.0.1:3002/health;
    }

    # ── Serve the built React UI ──────────────────────────────────
    location / {
        root  /var/www/ivr-studio;
        index index.html;
        try_files $uri $uri/ /index.html;   # SPA fallback
    }
}
```

Enable the site and reload nginx:

```bash
sudo ln -s /etc/nginx/sites-available/ivr-studio /etc/nginx/sites-enabled/ivr-studio
sudo nginx -t        # verify config is valid
sudo systemctl reload nginx
```

Allow port 8443 through the firewall:

```bash
sudo ufw allow 8443/tcp
```

---

## 4. CORS — STUDIO_ORIGIN must match the browser URL

The API server reads `STUDIO_ORIGIN` from `.env` and uses it for the CORS `Access-Control-Allow-Origin` header.

Set it to the exact URL your browser uses to open IVR Studio:

| nginx setup | STUDIO_ORIGIN value |
|-------------|---------------------|
| Port 8443, IP only | `https://192.168.0.113:8443` |
| Port 8443, hostname | `https://ivr.yourdomain.com:8443` |
| Standard 443, subdomain | `https://ivr.yourdomain.com` |

If `STUDIO_ORIGIN` does not match, the browser will block API calls with a CORS error.

---

## 5. Summary of what needs to change

| What | Change required |
|------|-----------------|
| **`api-server/.env`** on server | `DB_HOST=127.0.0.1`, `DB_PORT=5433`, `HOST=127.0.0.1`, add `STUDIO_ORIGIN`, remove SSH vars |
| **studio-ui** | Build with `npm run build` (no code change needed when serving from root of dedicated vhost) |
| **nginx** | Add a new dedicated server block on port `8443` (do NOT add to existing FusionPBX blocks) |
| **firewall (ufw)** | `sudo ufw allow 8443/tcp` |
| **api-server process** | Run via systemd service (`ivr-studio-api.service`) for production |
| **`studio-ui/src/api/client.ts`** | No change needed — all requests use relative `/api` which the dedicated nginx block proxies correctly |
| **`vite.config.ts`** | No change needed when UI is at root of dedicated vhost |

---

## 6. Prerequisites on the server

- **Node.js 18+** installed.
- **FusionPBX + PostgreSQL** already running.
- **IVR Studio DB schema** applied: `psql -h 127.0.0.1 -p 5433 -U fusionpbx fusionpbx -f db/migrations/001_ivr_studio_schema.sql`
- **Lua engine** deployed to FreeSWITCH (see `deploy.sh` and `SERVER_CHANGES.md`).

---

## 7. Verify it is working

After completing the setup, run these checks from the server:

```bash
# 1. API server is running
curl -sk https://127.0.0.1:8443/health
# Expected: {"status":"ok","ts":"..."}

# 2. API server reaches the database
curl -sk https://127.0.0.1:8443/api/domains
# Expected: JSON array of domains

# 3. UI is served
curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1:8443/
# Expected: 200
```

Then open `https://192.168.0.113:8443` in your browser (accept the self-signed cert warning)
and the IVR Studio login/dashboard should appear.
