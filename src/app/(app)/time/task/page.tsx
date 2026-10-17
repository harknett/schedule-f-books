import { notFound } from "next/navigation";

import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { currentYear } from "@/lib/dates";
import { formatDuration, formatHours } from "@/lib/duration";

import { TimeEntryList, taskHref } from "../entry-list";

export const metadata = { title: "Task hours · Schedule F Books" };

/** Every entry for one task in a year, however its name was capitalised. */
export default async function TaskPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const name = typeof params.name === "string" ? params.name.trim() : "";
  if (name === "") notFound();
  const yearParam = Number(params.year);
  const year = Number.isInteger(yearParam) && yearParam > 0 ? yearParam : currentYear();

  const entries = getStore().listTimeEntriesForTask(user.id, name, year);
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={name}
        subtitle={`Every entry for this task in ${year}.`}
        action={
          <ButtonLink href="/time" variant="secondary">
            Back
          </ButtonLink>
        }
      />

      <div className="card px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </p>
        <p className="tabular text-3xl font-semibold">{formatDuration(totalMinutes)}</p>
        <p className="mt-1 text-xs text-muted">{formatHours(totalMinutes)} decimal hours</p>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="Nothing logged" body={`No hours for this task in ${year}.`} />
      ) : (
        <TimeEntryList entries={entries} back={taskHref(name, year)} />
      )}
    </div>
  );
}
