import Link from "next/link";
import { notFound } from "next/navigation";

import { TrashIcon } from "@/components/icons";
import { Button, ButtonLink, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { assetClassLabel, deductionFor, scheduleFor } from "@/lib/assets";
import { getStore } from "@/lib/db";
import { currentYear, prettyDate } from "@/lib/dates";
import { CONVENTION_LABELS, METHOD_LABELS } from "@/lib/depreciation";
import { formatUsd } from "@/lib/money";

import { deleteAsset } from "../actions";

export const metadata = { title: "Asset · Schedule F Books" };

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId)) notFound();

  const asset = getStore().getAsset(assetId);
  if (!asset) notFound();

  const schedule = scheduleFor(asset);
  const thisYear = currentYear();
  const thisYearDeduction = deductionFor(asset, thisYear);
  const disposalYear = asset.disposedDate ? Number(asset.disposedDate.slice(0, 4)) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={asset.name}
        subtitle={`${assetClassLabel(asset)} · placed in service ${prettyDate(asset.placedInService)}`}
        action={
          <ButtonLink href={`/assets/${assetId}/edit`} variant="secondary">
            Edit
          </ButtonLink>
        }
      />

      <div className="card px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted">
          {thisYear} deduction · Schedule F line 14
        </p>
        <p className="tabular text-3xl font-semibold text-expense">
          {formatUsd(thisYearDeduction)}
        </p>
      </div>

      <Card>
        <dl className="space-y-2.5 text-sm">
          <Row label="Cost">{formatUsd(asset.cost)}</Row>
          {asset.businessUsePercent !== 100 ? (
            <Row label="Business use">
              {asset.businessUsePercent}% · {formatUsd(schedule.businessBasis)} depreciable
            </Row>
          ) : null}
          {schedule.section179 > 0 ? (
            <Row label="Section 179">{formatUsd(schedule.section179)}</Row>
          ) : null}
          {schedule.bonus > 0 ? (
            <Row label={`Bonus (${asset.bonusPercent}%)`}>{formatUsd(schedule.bonus)}</Row>
          ) : null}
          <Row label="Basis to recover">{formatUsd(schedule.depreciableBasis)}</Row>
          <Row label="Method">{METHOD_LABELS[asset.method]}</Row>
          <Row label="Convention">{CONVENTION_LABELS[asset.convention]}</Row>
          {asset.description ? <Row label="Details">{asset.description}</Row> : null}
          {asset.disposedDate ? (
            <Row label="Disposed">
              {prettyDate(asset.disposedDate)}
              {asset.disposalProceeds != null
                ? ` · ${formatUsd(asset.disposalProceeds)} proceeds`
                : null}
            </Row>
          ) : null}
          {asset.notes ? <Row label="Notes">{asset.notes}</Row> : null}
        </dl>
      </Card>

      <section className="space-y-3">
        <h2 className="font-semibold">Depreciation schedule</h2>

        {schedule.years.length === 0 ? (
          <Card className="text-sm text-muted">
            Written off entirely in {asset.placedInService.slice(0, 4)} through section 179 and
            bonus depreciation — there is no remaining basis to recover.
          </Card>
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5 font-medium">Year</th>
                    <th className="px-4 py-2.5 font-medium">Rate</th>
                    <th className="px-4 py-2.5 text-right font-medium">Deduction</th>
                    <th className="px-4 py-2.5 text-right font-medium">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {schedule.years.map((row) => {
                    const stopped = disposalYear != null && row.year > disposalYear;
                    const current = row.year === thisYear;
                    return (
                      <tr
                        key={row.year}
                        className={`${current ? "bg-accent-soft font-medium" : ""} ${
                          stopped ? "text-muted line-through" : ""
                        }`}
                      >
                        <td className="tabular px-4 py-2.5">
                          {row.year}
                          {row.ordinal === 1 && schedule.firstYearWriteOff > 0 ? (
                            <span className="ml-2 text-xs text-muted no-underline">
                              + {formatUsd(schedule.firstYearWriteOff)} up front
                            </span>
                          ) : null}
                        </td>
                        <td className="tabular px-4 py-2.5 text-muted">
                          {(row.rate * 100).toFixed(2)}%
                          <span className="ml-1.5 text-xs">{row.basisOf}</span>
                        </td>
                        <td className="tabular px-4 py-2.5 text-right">
                          {formatUsd(row.amount)}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-muted">
                          {formatUsd(row.remaining)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-muted leading-relaxed">
          Computed under MACRS GDS: {METHOD_LABELS[asset.method].toLowerCase()} with a switch to
          straight line in the year that gives more, under the{" "}
          {CONVENTION_LABELS[asset.convention].toLowerCase()} convention. &ldquo;DB&rdquo; and
          &ldquo;SL&rdquo; mark which one applied. Section 179 and bonus are deducted in the first
          year and are not part of the yearly rates.
          {disposalYear != null
            ? " Years after disposal are struck through and are not claimed."
            : null}
        </p>
      </section>

      <div className="flex items-center justify-between pt-2">
        <Link href="/assets" className="text-sm text-accent underline">
          ← All assets
        </Link>
        <form action={deleteAsset}>
          <input type="hidden" name="id" value={assetId} />
          <Button type="submit" variant="danger">
            <TrashIcon className="h-4 w-4" />
            Delete asset
          </Button>
        </form>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-36 shrink-0 text-muted">{label}</dt>
      <dd className="tabular min-w-0 flex-1">{children}</dd>
    </div>
  );
}
