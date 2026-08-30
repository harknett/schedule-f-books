import Link from "next/link";

import { ChevronIcon } from "@/components/icons";
import { ButtonLink, EmptyState, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { assetClassLabel, remainingBasis, summarizeYear } from "@/lib/assets";
import { getStore } from "@/lib/db";
import { currentYear, prettyDate } from "@/lib/dates";
import { formatUsd } from "@/lib/money";

export const metadata = { title: "Assets · Schedule F Books" };

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const store = getStore();

  const assets = store.listAssets();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) && requested > 1900 ? requested : currentYear();

  const summary = summarizeYear(assets, year);
  const unrecovered = remainingBasis(assets, year);

  const owned = assets.filter(
    (a) => !a.disposedDate || Number(a.disposedDate.slice(0, 4)) > year,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        subtitle={`Depreciation schedule for ${year}.`}
        action={
          <ButtonLink href="/assets/new" variant="secondary">
            Add
          </ButtonLink>
        }
      />

      {assets.length === 0 ? (
        <EmptyState
          title="No assets yet"
          body="Add a tractor, a building, or drainage tile and its depreciation flows straight to Schedule F line 14."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={`${year} deduction`} cents={summary.total} tone="expense" small />
            <Stat label="Basis left to recover" cents={unrecovered} small />
          </div>

          {summary.section179 > 0 || summary.bonus > 0 ? (
            <p className="text-xs text-muted">
              Includes {formatUsd(summary.section179)} of section 179 and {formatUsd(summary.bonus)}{" "}
              of bonus depreciation on assets placed in service this year.
            </p>
          ) : null}

          <section className="space-y-3">
            <h2 className="font-semibold">Owned ({owned.length})</h2>
            <ul className="card divide-y divide-[var(--border)] overflow-hidden p-0">
              {assets.map((asset) => {
                const row = summary.rows.find((r) => r.asset.id === asset.id);
                const disposed =
                  asset.disposedDate && Number(asset.disposedDate.slice(0, 4)) <= year;
                return (
                  <li key={asset.id}>
                    <Link
                      href={`/assets/${asset.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {asset.name}
                          {disposed ? (
                            <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
                              disposed
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {assetClassLabel(asset)} · placed {prettyDate(asset.placedInService)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular font-semibold">
                          {formatUsd(row?.deduction ?? 0)}
                        </p>
                        <p className="text-xs text-muted">{year}</p>
                      </div>
                      <ChevronIcon className="h-5 w-5 shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
