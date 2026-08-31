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
  [Depreciation](#depreciation). Assets take paperwork of their own - a bill of
  sale or finance agreement - alongside their schedule.
- **Loans**, with each payment split into interest, principal, and escrow. The
  interest reaches Schedule F line 21a or 21b on its own. See [Loans](#loans).
- **CSV import** for a bank export, a spreadsheet, or a timesheet, with column
  matching, a preview, and duplicate detection. See [Importing a CSV](#importing-a-csv).
- **Export** of any date range as a single ZIP: the Schedule F summary, the
  supporting detail, the depreciation working, the receipts, and a lossless
  copy for archiving. See [Exporting](#exporting).
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

## Importing a CSV

**Books → Import**, or **Hours → Import**. Choose whether the file is expenses,
income, or hours, pick it, and check the preview before anything is written.

It reads what banks and spreadsheets actually produce:

- **Columns are matched for you** from the header, and every match is a
  dropdown you can correct. A file whose only text column is `Description` puts
  it in the payee field, where the entry list shows it.
- **Date formats are worked out from the file.** `03/04/2026` is genuinely
  ambiguous, so it looks for a day above 12 elsewhere in the column to settle
  it, and shows you the choice when the file can't settle it either.
- **Delimiters, quoting, and encodings**: comma, semicolon, or tab; quoted
  fields containing commas or newlines; CRLF endings; and the byte order mark
  Excel writes.
- **Amounts** may be negative, parenthesised, or carry `$` and thousands
  separators. They are stored as positive, with direction taken from the kind
  you chose.
- **Durations** may be `2.5`, `2h 30m`, `2:30`, or `90m`.
- **Categories** match on a Schedule F line number (`16`), a name (`Feed`), or
  our id (`feed`). Anything unmatched falls to a default you pick, and says so.
- **Duplicates are flagged** against what you already have — matched on date,
  amount, and who it was with — so re-importing last month's export doesn't
  double your books.

Rows that can't be read are listed with the line number and the reason, and are
skipped rather than guessed at. The whole import is one database transaction:
if anything fails, nothing is written.

A bank export with separate Debit and Credit columns is two passes: import
expenses mapping Amount to Debit, then income mapping Amount to Credit.

There is a blank template to download on the page if you'd rather type it out.

## Loans

Record a mortgage or an operating loan under **Loans**, then log payments as
your lender's statement reports them: interest, principal, and escrow entered
separately, with the total shown as you type.

Only the **interest** is deductible, and it lands on Schedule F line 21a for a
mortgage on farm property or 21b for anything else - added to any interest you
entered by hand, and labelled on the line so the two sources stay visible.
Principal repays what you borrowed and is not an expense; escrow is money the
lender holds for tax or insurance, which belongs on whichever line it is
eventually spent against. The loan page tracks the balance down as principal is
repaid.

Nothing is amortised from the interest rate. The split that reaches your return
is the one on the statement, because that is the figure a preparer reconciles
to and the one that appears on a Form 1098.

## Exporting

**Settings → Export**, or **Full export** from the report. Pick a date range and
you get one ZIP that serves both purposes the records have: something to hand
over, and something to keep.

```
README.txt              what is in the package, the totals, and the caveats
schedule-f-2026.csv     every Schedule F line for that tax year
transactions.csv        every entry, each carrying its Schedule F line
assets.csv              the depreciable asset register
depreciation-2026.csv   per-asset working for Form 4562
loans.csv               loans, interest paid, and what is still owed
loan-payments.csv       every payment split into interest/principal/escrow
hours.csv               hours worked, in minutes and decimal hours
receipts/               images: txn-<id>-<n> entries, asset-<id>-<n> assets
archive.json            the same data losslessly, in cents
```

A range spanning several tax years gets a `schedule-f-<year>.csv` and a
`depreciation-<year>.csv` for each, because Schedule F is an annual form.
Amounts in the CSVs are dollars, for spreadsheets; `archive.json` keeps integer
cents, for machines. Receipts and the JSON copy can each be left out for a
smaller file.

Assets are not filtered by the date range - a tractor bought in 2019 still
depreciates into the years being exported - and the README states the totals so
a preparer can cross-check at a glance.

**This is also your backup.** The `data/` directory is the live copy; a dated
export is a complete, readable second copy that does not depend on this
software still running. Take one at year end, and keep it.

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

Back up that directory and you have backed up the books - or take a dated
[export](#exporting), which is readable without this software. Set `DATA_DIR`
to put the live copy somewhere else:

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
- Lines 21a and 21b combine interest from recorded loan payments with anything
  entered by hand, and the report labels the line when both are present.
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
    csv.ts            RFC 4180 reader and writer
    import.ts         column matching, date inference, row validation
    zip.ts            ZIP writer, no dependency
    export.ts         builds the handover/archive package
    depreciation.ts   MACRS engine; verified against the IRS optional tables
    assets.ts         stored assets -> schedules -> the line 14 figure
    loans.ts          loan balances and the interest behind lines 21a/21b
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
    (app)/            dashboard, entries, hours, assets, loans, import,
                      export, report, settings
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
