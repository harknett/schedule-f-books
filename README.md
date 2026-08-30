# Schedule F Books

Farm accounting for people who are usually outdoors. Record income and expenses
against the Schedule F line they belong to, photograph the receipt while it is
still in your hand, log the hours you worked, and get a year-end summary that
adds itself up.

Built mobile-first: the phone in the field is the primary interface, not an
afterthought.

> **Not tax advice.** This organises what you record; it does not prepare or
> file a return. See [Accuracy and limits](#accuracy-and-limits).

## What it does

- **Income and expenses** filed directly against Schedule F lines (10 Car and
  truck, 16 Feed, 26 Seeds and plants, …), so the year-end report is a roll-up
  rather than a reclassification exercise.
- **Receipt capture** straight from the rear camera — one tap, no app install.
  HEIC, JPEG, PNG, WebP, and supplier PDFs are all accepted, stored alongside
  the entry, and served only to signed-in users.
- **Hours worked**, entered the way people actually type them (`2.5`, `2h 30m`,
  `2:30`, `90m`), with a breakdown of where the time went.
- **Schedule F report** for any year, on screen or as CSV for your preparer.
- **Multiple accounts** sharing one set of farm books. Hours stay personal to
  whoever logged them.

## Requirements

Node.js 22 or newer. Storage is the built-in `node:sqlite`, so there is no
database server to run and nothing to compile.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first visit asks you to create the owner
account; after that, further accounts are made from **Settings** rather than by
anyone who finds the URL.

For production:

```bash
npm run build
npm start
```

## Using it from the field

Add the site to your phone's home screen (Safari: Share → Add to Home Screen;
Chrome: ⋮ → Add to Home screen). It opens full-screen, and the **+** button in
the tab bar is two taps from a photographed receipt.

To reach it from the field you need the server visible to your phone — on the
same network use the machine's LAN address, or put it behind a reverse proxy
with HTTPS for access from anywhere. Use HTTPS for anything beyond your own
network: session cookies are marked `secure` in production and will not be sent
over plain HTTP.

## Your data

Everything lives in one directory — the SQLite database and every receipt
image:

```
data/
  books.db
  receipts/
```

Back up that directory and you have backed up the books. Set `DATA_DIR` to put
it somewhere else:

```bash
DATA_DIR=/mnt/backup/farm-books npm start
```

`data/` is gitignored. Never commit it.

## Accuracy and limits

The report follows Schedule F's structure, but it is a summary of what you
recorded — not a filable form, and not tax advice. Known simplifications:

- Taxable-amount lines (3b, 4b, 5c, 6b) are shown equal to the gross amounts
  entered. Elections and deferrals (6c/6d) are not modelled.
- Line 32 "other expenses" is one bucket rather than 32a–32f.
- Depreciation (line 14) is a figure you enter; nothing computes a depreciation
  schedule for you.
- Line numbers follow the Schedule F layout but should be checked against the
  current year's form and instructions.

Have a preparer review it before you file.

## Development

```bash
npm run dev        # dev server
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # production build
```

Layout:

```
src/
  lib/
    schedule-f.ts     the chart of accounts - Schedule F lines
    report.ts         roll-up into Part I / Part II / line 34, and CSV
    money.ts          integer cents; no floats touch an amount
    duration.ts       parsing and formatting time worked
    db/               SQLite store, migrations, row mapping
    auth/             scrypt hashing, session cookies, requireUser()
    receipts.ts       receipt files on disk (server only)
    receipt-limits.ts size/type limits shared with the browser
  components/         UI, including the camera-capture receipt picker
  app/
    (auth)/           login, first-run owner setup
    (app)/            dashboard, entries, hours, report, settings
    api/receipts/     authenticated receipt image serving
  proxy.ts            redirects signed-out visitors (convenience only)
```

Money is stored as integer cents everywhere; `parseAmount`/`formatAmount` are
the only conversion points, and they are covered by tests. Time is whole
minutes.

Access is enforced server-side by `requireUser()` in every page and action —
`proxy.ts` only saves a render, and cannot be trusted on its own because it
sees whether a cookie exists, not whether it is valid.

## License

MIT — see [LICENSE](LICENSE).
