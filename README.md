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
- **Asset depreciation** under MACRS, with a full year-by-year schedule that
  feeds Schedule F line 14 automatically. See
  [Depreciation](#depreciation).
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

## Depreciation

Add a tractor, a machine shed, drainage tile, or breeding stock under
**Assets**, and the app builds the whole recovery schedule. The current year's
figure flows into Schedule F line 14 without you copying anything.

It implements MACRS under the General Depreciation System: declining balance
with an automatic switch to straight line in the year straight line gives the
larger deduction, under the half-year, mid-quarter, or mid-month convention.
The schedules reproduce the IRS optional tables in Pub. 946 (Tables A-1, A-2,
A-5); `test/depreciation.test.ts` asserts against those published percentages
rather than against the implementation, so a regression fails the build.

Supported classes, with the method each defaults to:

| Class | Method | Typical farm property |
| --- | --- | --- |
| 3-year | 200% DB | Breeding hogs; over-the-road tractor units |
| 5-year | 200% DB | Cars and light trucks, computers, breeding and dairy cattle |
| 7-year | 200% DB | Most farm machinery, grain bins, office furniture |
| 10-year | 200% DB | Single-purpose agricultural structures; fruit and nut trees |
| 15-year | 150% DB | Land improvements: tile, fences, wells, paved lots |
| 20-year | 150% DB | General purpose farm buildings |
| 27.5-year | Straight line | Residential rental |
| 39-year | Straight line | Nonresidential real property |

It also handles section 179, bonus depreciation, business-use percentage, and
partial-year treatment in the year an asset is sold or traded. When more than
40% of a year's additions land in the fourth quarter, the app detects it and
defaults new assets to the mid-quarter convention, which is the rule that is
easiest to miss and expensive to get wrong.

**What it does not do.** Section 179 dollar limits and their phase-out, the
bonus percentage for a given year, and the business-income limitation are
inputs you supply, not rules the app enforces — those figures change from year
to year, and the app deliberately does not pretend to know the current ones.
It does not compute depreciation recapture on sale, handle ADS elections or
listed-property recapture, or produce Form 4562. Check the schedule against
the current year's instructions.

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
- Depreciation (line 14) comes from the asset schedule plus anything you enter
  by hand, and the report labels the line when both are present. Section 179
  limits, bonus percentages, and recapture on sale are yours to verify - see
  [Depreciation](#depreciation).
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
    depreciation.ts   MACRS engine; verified against the IRS optional tables
    assets.ts         stored assets -> schedules -> the line 14 figure
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
    (app)/            dashboard, entries, hours, assets, report, settings
    api/receipts/     authenticated receipt image serving
  proxy.ts            redirects signed-out visitors (convenience only)
```

Money is stored as integer cents everywhere; `parseAmount`/`formatAmount` are
the only conversion points, and they are covered by tests. Time is whole
minutes. Depreciation schedules are derived from the asset's inputs on every
read rather than stored, so correcting a cost or a class re-runs cleanly.

Access is enforced server-side by `requireUser()` in every page and action —
`proxy.ts` only saves a render, and cannot be trusted on its own because it
sees whether a cookie exists, not whether it is valid.

## License

MIT — see [LICENSE](LICENSE).
