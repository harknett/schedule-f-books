import { TrashIcon } from "@/components/icons";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { currentYear, shortDate, today } from "@/lib/dates";
import { formatDuration, formatHours } from "@/lib/duration";

import { deleteTimeEntry } from "./actions";
import { TimeForm } from "./form";

export const metadata = { title: "Hours · Schedule F Books" };

export default async function TimePage() {
  const user = await requireUser();
  const store = getStore();
  const year = currentYear();

  const entries = store.listTimeEntries(user.id, { year, limit: 60 });
  const totalMinutes = store.totalMinutes(user.id, year);
  const byTask = store.minutesByTask(user.id, year).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hours"
        subtitle={`Your labour on the farm in ${year}.`}
        action={
          <ButtonLink href="/import" variant="secondary">
            Import
          </ButtonLink>
        }
      />

      <div className="card px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted">Logged in {year}</p>
        <p className="tabular text-3xl font-semibold">{formatDuration(totalMinutes)}</p>
        <p className="mt-1 text-xs text-muted">{formatHours(totalMinutes)} decimal hours</p>
      </div>

      <TimeForm today={today()} />

      {byTask.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Where the time went</h2>
          <Card className="space-y-2.5">
            {byTask.map(({ task, minutes }) => {
              const share = totalMinutes > 0 ? (minutes / totalMinutes) * 100 : 0;
              return (
                <div key={task} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">{task}</span>
                    <span className="tabular shrink-0 text-muted">{formatDuration(minutes)}</span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
                    role="presentation"
                  >
                    <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-semibold">Recent entries</h2>

        {entries.length === 0 ? (
          <EmptyState title="No hours logged yet" body="Log time above and it collects here." />
        ) : (
          <ul className="card divide-y divide-[var(--border)] overflow-hidden p-0">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{entry.task}</p>
                  <p className="truncate text-xs text-muted">
                    {shortDate(entry.date)}
                    {entry.notes ? ` · ${entry.notes}` : null}
                  </p>
                </div>
                <span className="tabular shrink-0 font-semibold">
                  {formatDuration(entry.minutes)}
                </span>
                <form action={deleteTimeEntry}>
                  <input type="hidden" name="id" value={entry.id} />
                  <button
                    type="submit"
                    aria-label={`Delete ${entry.task} on ${entry.date}`}
                    className="rounded-lg p-2 text-muted hover:bg-surface-muted hover:text-danger"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
