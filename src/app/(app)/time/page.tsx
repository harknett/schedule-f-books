import Link from "next/link";

import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { currentYear, today } from "@/lib/dates";
import { formatDuration, formatHours } from "@/lib/duration";
import { taskSuggestions } from "@/lib/tasks";

import { TimeEntryList, taskHref } from "./entry-list";
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

      <TimeForm today={today()} suggestions={taskSuggestions(store.listTaskNames(user.id))} />

      {byTask.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Where the time went</h2>
          <Card className="space-y-1">
            {byTask.map(({ task, minutes }) => {
              const share = totalMinutes > 0 ? (minutes / totalMinutes) * 100 : 0;
              return (
                <Link
                  key={task}
                  href={taskHref(task, year)}
                  className="-mx-2 block space-y-1 rounded-lg px-2 py-1 transition-colors hover:bg-accent-soft"
                >
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
                </Link>
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
          <TimeEntryList entries={entries} back="/time" />
        )}
      </section>
    </div>
  );
}
