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

`/register` refuses to do anything unless `SETUP_TOKEN` is set in the service
environment. Open it for as long as it takes, then close it again:

```bash
sudo systemctl edit schedule-f-books
#   [Service]
#   Environment=SETUP_TOKEN=<something long and random>
sudo systemctl restart schedule-f-books
```

Visit `/register`, enter that token, and create the owner account. Then remove
the override and restart:

```bash
sudo systemctl edit schedule-f-books     # delete the line
sudo systemctl restart schedule-f-books
```

The gate exists because between the service starting and the first account
being made, whoever loads that page becomes the owner of the farm's books.
On a laptop that window is imaginary; on a server it is a real race, and on a
public hostname it is a race against scanners that find new certificates in the
transparency logs within hours.

Everyone after the owner is added from **Settings**, so the token is needed
exactly once in the life of the installation.

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

## Updating a running server

The whole procedure, in the order it has to happen. It takes a couple of
minutes and the site is down for about ten seconds of that.

### 1. Back up first, every time

Not optional. These are tax records, the schema migrates forward on start, and
**there is no downgrade path** — a migration that has run cannot be un-run, so
the backup is the only way back.

```bash
sudo -u schedule-f-books sqlite3 /var/lib/schedule-f-books/books.db \
  ".backup '/var/backups/books-$(date +%F-%H%M).db'"
sudo tar czf /var/backups/receipts-$(date +%F-%H%M).tar.gz \
  -C /var/lib/schedule-f-books receipts
```

Check the backup is real before going on — a zero-byte file is worse than none,
because you will trust it:

```bash
ls -lh /var/backups/books-*.db | tail -1
sudo -u schedule-f-books sqlite3 /var/backups/books-$(date +%F)*.db \
  "PRAGMA integrity_check; SELECT COUNT(*) FROM transactions;"
```

### 2. Note where you are, so you can get back

```bash
cd /path/to/your/checkout
git rev-parse --short HEAD          # write this down
```

### 3. Fetch and read before building

```bash
git fetch origin
git log --oneline HEAD..origin/master
git diff --stat HEAD..origin/master -- src/lib/db/migrations.ts
```

That last line is the one worth pausing on. If migrations changed, the update
will alter your database on the next start. If it shows nothing, this is a
code-only update and the risk is much lower.

```bash
git pull --ff-only origin master
```

`--ff-only` refuses rather than creating a merge commit if the server checkout
has drifted — which it should not have, and which you want to know about.

### 4. Build

```bash
npm ci
npm run build

cp -r .next/static .next/standalone/.next/static
cp -r public       .next/standalone/public
```

`npm ci` rather than `npm install`: it installs exactly the lockfile, so the
server gets the dependency tree that was tested rather than whatever resolved
today.

Build **before** stopping the service. A build takes far longer than a restart,
and there is no reason for the site to be down while it runs — nor for a failed
build to leave you with a stopped service.

### 5. Swap it in and restart

```bash
sudo rsync -a --delete .next/standalone/ /opt/schedule-f-books/
sudo systemctl restart schedule-f-books
```

`--delete` removes files that are no longer part of the build. Without it a
renamed route can linger and be served long after it was deleted from the
source.

### 6. Check it actually came back

```bash
systemctl status schedule-f-books --no-pager
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/login   # 200
```

Then watch the log for a moment. Migrations run on start, and this is where you
would see one fail:

```bash
journalctl -u schedule-f-books -n 50 --no-pager
```

Finally, sign in and look at one real page — the Schedule F report is a good
one, because it exercises the database, the report maths and the session all at
once. A service that starts is not the same as a service that works.

### If it goes wrong

**The build failed.** Nothing has changed on the server yet. Fix it and start
again; the old version is still running.

**It starts but is broken, and migrations did not change.** Roll the code back
and rebuild:

```bash
git checkout <the short hash from step 2>
npm ci && npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public       .next/standalone/public
sudo rsync -a --delete .next/standalone/ /opt/schedule-f-books/
sudo systemctl restart schedule-f-books
```

**It starts but is broken, and migrations *did* change.** The database has
already moved forward and older code will not understand it. Restore the
backup as well as the code:

```bash
sudo systemctl stop schedule-f-books
sudo -u schedule-f-books cp /var/backups/books-<timestamp>.db \
  /var/lib/schedule-f-books/books.db
sudo -u schedule-f-books rm -f /var/lib/schedule-f-books/books.db-wal \
                               /var/lib/schedule-f-books/books.db-shm
# ...then roll the code back as above, and start again.
sudo systemctl start schedule-f-books
```

Removing the `-wal` and `-shm` matters: they belong to the database you just
replaced, and leaving them beside a restored file is how you get corruption
rather than a rollback.

**Anything entered between the backup and the rollback is lost.** That is the
real argument for taking the backup immediately before the upgrade rather than
relying on last night's.

### Doing it regularly

Nothing here needs to be memorised — but if you update often, the two habits
worth keeping are taking a fresh backup every single time, and reading
`git log HEAD..origin/master` before pulling rather than after something
surprises you.

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

## Ports on a shared host

These services are designed to sit behind one reverse proxy on one machine, so
each takes a different loopback port. Whichever two share a port, the second to
start dies with EADDRINUSE.

| Service | Port |
| --- | --- |
| schedule-f-books | 3000 |
| eden-planner | 3001 |
| tricklingspring | 3002 |

Change one with a drop-in rather than by editing the shipped unit:

```bash
sudo systemctl edit <service>
#   [Service]
#   Environment=PORT=3005
```
