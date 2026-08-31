"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { logTime, type TimeFormState } from "./actions";
import { Button, Card, ErrorBanner, Field, Input, Textarea } from "@/components/ui";
import {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS,
  datesBetween,
  describeWeekdays,
  type Weekday,
} from "@/lib/dates";
import { formatDuration } from "@/lib/duration";

/** Common farm tasks, offered as suggestions but never enforced. */
const TASK_SUGGESTIONS = [
  "Livestock chores",
  "Fencing",
  "Irrigation",
  "Planting",
  "Harvest",
  "Equipment maintenance",
  "Pasture management",
  "Compost & soil",
  "Marketing & sales",
  "Recordkeeping",
];

type Mode = "single" | "range";

function Submit({ count }: { count: number | null }) {
  const { pending } = useFormStatus();
  const label =
    count == null ? "Log hours" : count === 1 ? "Log 1 day" : `Log ${count} days`;
  return (
    <Button type="submit" className="w-full" disabled={pending || count === 0}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function TimeForm({ today }: { today: string }) {
  const [state, action] = useActionState<TimeFormState, FormData>(logTime, {});

  return (
    <Card>
      <form action={action} className="space-y-5">
        <ErrorBanner message={state.error} />
        {state.savedCount != null && !state.error ? (
          <p className="rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5 text-sm text-accent">
            Logged {formatDuration(state.savedMinutes ?? 0)}
            {state.savedCount > 1 ? ` on ${state.savedCount} days` : ""}.
            {state.skippedCount ? (
              <span className="block text-xs text-muted">
                {state.skippedCount}{" "}
                {state.skippedCount === 1 ? "day was" : "days were"} already logged and left alone.
              </span>
            ) : null}
          </p>
        ) : null}

        {/* Keyed on the save token: a successful save brings back empty fields. */}
        <TimeFields key={state.savedAt ?? 0} today={today} />
      </form>
    </Card>
  );
}

function TimeFields({ today }: { today: string }) {
  const [mode, setMode] = useState<Mode>("single");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [weekdays, setWeekdays] = useState<Set<Weekday>>(new Set(ALL_WEEKDAYS));

  function toggleWeekday(day: Weekday) {
    setWeekdays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  // The same expansion the server will do, so the count shown is the truth.
  let dayCount: number | null = null;
  let rangeProblem: string | null = null;
  if (mode === "range") {
    try {
      dayCount = datesBetween(from, to, weekdays).length;
    } catch (err) {
      rangeProblem = err instanceof Error ? err.message : "That range is not valid.";
    }
  }

  return (
    <>
      <input type="hidden" name="mode" value={mode} />

      <Field label="When">
        <div className="grid grid-cols-2 gap-2">
          {(["single", "range"] as Mode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              className={`rounded-xl border min-h-12 px-3 text-sm font-medium transition-colors ${
                mode === option
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface text-muted hover:bg-surface-muted"
              }`}
            >
              {option === "single" ? "One day" : "Catching up"}
            </button>
          ))}
        </div>
      </Field>

      {mode === "single" ? (
        <Field label="Date" htmlFor="date">
          <Input id="date" name="date" type="date" defaultValue={today} required />
        </Field>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First day" htmlFor="from">
              <Input
                id="from"
                name="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </Field>
            <Field label="Last day" htmlFor="to">
              <Input
                id="to"
                name="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="On which days" hint="Leave them all on for every day.">
            <div className="flex flex-wrap gap-1.5">
              {ALL_WEEKDAYS.map((day) => {
                const on = weekdays.has(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    aria-pressed={on}
                    className={`min-h-11 w-12 rounded-xl border text-sm font-medium transition-colors ${
                      on
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-surface text-muted hover:bg-surface-muted"
                    }`}
                  >
                    {WEEKDAY_LABELS[day]}
                  </button>
                );
              })}
            </div>
            {/* The server reads these, not the button state. */}
            {[...weekdays].map((day) => (
              <input key={day} type="hidden" name="weekdays" value={day} />
            ))}
          </Field>
        </>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Time worked"
          htmlFor="duration"
          hint={mode === "range" ? "Per day." : "2.5, 2h 30m, 2:30, or 90m."}
        >
          <Input
            id="duration"
            name="duration"
            inputMode="decimal"
            placeholder="2.5"
            required
            className="tabular"
          />
        </Field>

        <Field label="Task" htmlFor="task">
          <Input
            id="task"
            name="task"
            list="task-suggestions"
            placeholder="Fencing"
            autoCapitalize="sentences"
            required
          />
          <datalist id="task-suggestions">
            {TASK_SUGGESTIONS.map((task) => (
              <option key={task} value={task} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} placeholder="Optional." />
      </Field>

      {mode === "range" ? (
        rangeProblem ? (
          <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {rangeProblem}
          </p>
        ) : (
          <p className="rounded-xl bg-surface-muted px-3 py-2.5 text-sm">
            {dayCount === 0 ? (
              <span className="text-muted">
                No day in that range falls on {describeWeekdays(weekdays)}.
              </span>
            ) : (
              <>
                <span className="font-medium">
                  {dayCount} {dayCount === 1 ? "entry" : "entries"}
                </span>
                <span className="text-muted">
                  {" "}
                  · {describeWeekdays(weekdays)} from {from} to {to}. Any day already logged the
                  same way is left alone.
                </span>
              </>
            )}
          </p>
        )
      ) : null}

      <Submit count={mode === "range" ? (rangeProblem ? 0 : dayCount) : null} />
    </>
  );
}
