# Running Schedule F Books as a service

For a Linux host with systemd. The service runs as its own unprivileged user,
keeps everything it writes in one state directory, and sits behind a reverse
proxy that terminates TLS.

Nothing here happens automatically. Each step is a command you run.

## What you need first

- Node.js 22 or newer on the server (`node --version`).
- A reverse proxy with a TLS certificate — nginx, Caddy, whatever you already
  run. **This is not optional**: the session cookie is `Secure` when
  `NODE_ENV=production`, so over plain HTTP a browser will accept the sign-in
  redirect and then silently discard the cookie, leaving you at the login page
  forever with no error to explain it.

## 1. The service user

```bash
sudo useradd --system \
  --home-dir /var/lib/schedule-f-books \
  --shell /usr/sbin/nologin \
  schedule-f-books
```

No login shell and no password: this account exists to own a directory and a
process. It never needs to be logged into.

You do **not** need to create `/var/lib/schedule-f-books` yourself — the unit's
`StateDirectory=` creates it, owns it, and sets it to `0700` on first start.

## 2. Build

Build on a machine with the dev dependencies — your workstation is fine, the
server works too if you clone there.

```bash
npm ci
npm run build
```

That produces `.next/standalone`, a server that runs without `node_modules`.
Two directories are deliberately **not** copied into it and have to be added by
hand — this is normal Next behaviour, not an oversight:

```bash
cp -r .next/static .next/standalone/.next/static
cp -r public       .next/standalone/public
```

Without those the app loads but has no CSS, no JavaScript and no icons.

## 3. Install

```bash
sudo mkdir -p /opt/schedule-f-books
sudo rsync -a --delete .next/standalone/ /opt/schedule-f-books/
sudo chown -R root:root /opt/schedule-f-books
```

Owned by root and never written to by the service — the unit sets
`ProtectSystem=strict`, so the application directory is read-only to the
running process. Everything mutable lives in the state directory instead.

```bash
sudo cp deploy/schedule-f-books.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now schedule-f-books
sudo systemctl status schedule-f-books
```

Check it is alive:

```bash
curl -s http://127.0.0.1:3000/api/health   # {"status":"ok"}
```

That endpoint touches the database, so it fails when the state directory is
missing or unwritable — the case where Node is listening happily but nothing
works. It needs no authentication and returns nothing but a status.

## 4. The reverse proxy

### Raise the upload limit — or receipts break

**nginx defaults `client_max_body_size` to 1 MB.** Leave it and every receipt
photo fails at the proxy, before it ever reaches the app. That is exactly the
bug this project already shipped once at the framework layer; the proxy will
happily reintroduce it.

```nginx
server {
    server_name books.example.com;
    listen 443 ssl;
    # ... certificate directives ...

    # Must be at least serverActions.bodySizeLimit; see src/lib/receipt-limits.ts.
    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Next compares the Origin of a Server Action against the host it
        # believes it is serving. Get these wrong and every form in the app
        # fails CSRF validation, while ordinary page loads look fine.
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP         $remote_addr;
    }
}
```

Caddy sets those headers itself; it only needs `request_body { max_size 32MB }`.

If the app is reached under a hostname the proxy does not pass through in
`Host`, add it to `experimental.serverActions.allowedOrigins` in
`next.config.ts` and rebuild. Symptom: pages load, every save fails.

## 5. Create the owner account

Visit the site. The first account created is the farm owner. After that
`/register` refuses, so there is no window for anyone else to claim it — but do
this immediately rather than leaving a fresh install exposed.

## Password recovery

The CLI escape hatch needs the repository and its dev dependencies, which the
standalone build deliberately does not include. Run it from the checkout you
built with, as the service user so it can read the state directory:

```bash
sudo -u schedule-f-books DATA_DIR=/var/lib/schedule-f-books \
  npm run set-password -- you@example.com
```

It prints a temporary password once and signs that account out everywhere.

## Backups

Everything is in one directory: `books.db` plus the `receipts/` folder.

The clean way, without stopping the service:

```bash
sudo -u schedule-f-books sqlite3 /var/lib/schedule-f-books/books.db \
  ".backup '/var/backups/books-$(date +%F).db'"
sudo tar czf /var/backups/receipts-$(date +%F).tar.gz \
  -C /var/lib/schedule-f-books receipts
```

`.backup` is safe on a live database; a plain `cp` of a WAL-mode file while it
is being written is not, unless you take `books.db-wal` and `books.db-shm` with
it. Stopping the service first also works — the app closes SQLite on `SIGTERM`,
which checkpoints the WAL back into the single file.

**Back up before every upgrade.** This is tax records; the schema migrates
forward automatically on start and there is no downgrade path.

## Upgrading

```bash
git pull && npm ci && npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public       .next/standalone/public
sudo rsync -a --delete .next/standalone/ /opt/schedule-f-books/
sudo systemctl restart schedule-f-books
```

Migrations run on start. Watch them land:

```bash
journalctl -u schedule-f-books -f
```

## Notes on the unit

- **Binds `127.0.0.1` only**, via `HOSTNAME` in the unit. The standalone server
  honours that variable; `next start` does **not** — it ignores `HOSTNAME` and
  binds every interface, which is one of the reasons the unit runs
  `server.js` directly.
- **`StateDirectory=schedule-f-books`** makes systemd create and own
  `/var/lib/schedule-f-books` at `0700`, so a fresh machine needs no manual
  directory setup.
- **Confined**: `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, no
  capabilities, a `@system-service` syscall filter, and only inet/unix sockets.
  The app writes nothing outside `DATA_DIR`, so none of this gets in its way.
- **`Restart=on-failure`**, not `always`: a configuration error should stay
  down and visible rather than flapping.
