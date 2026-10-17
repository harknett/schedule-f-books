import Link from "next/link";

import { TrashIcon } from "@/components/icons";
import type { TimeEntry } from "@/lib/db/types";
import { shortDate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";

import { deleteTimeEntry } from "./actions";

/** Where a task's own list lives. */
export function taskHref(task: string, year: number): string {
  return `/time/task?${new URLSearchParams({ name: task, year: String(year) })}`;
}

/**
 * Logged hours, newest first. Tapping a row opens it for editing; `back` is
 * where the edit page returns to once it is saved.
 */
export function TimeEntryList({ entries, back }: { entries: TimeEntry[]; back: string }) {
  return (
    <ul className="card divide-y divide-[var(--border)] overflow-hidden p-0">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center">
          <Link
            href={`/time/${entry.id}?${new URLSearchParams({ back })}`}
            className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 transition-colors hover:bg-surface-muted"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{entry.task}</p>
              <p className="truncate text-xs text-muted">
                {shortDate(entry.date)}
                {entry.notes ? ` · ${entry.notes}` : null}
              </p>
            </div>
            <span className="tabular shrink-0 font-semibold">{formatDuration(entry.minutes)}</span>
          </Link>
          <form action={deleteTimeEntry} className="pr-2">
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
  );
}
