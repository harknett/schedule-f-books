"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { logTime, type TimeFormState } from "./actions";
import { Button, Card, ErrorBanner, Field, Input, Textarea } from "@/components/ui";
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

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Saving…" : "Log hours"}
    </Button>
  );
}

export function TimeForm({ today }: { today: string }) {
  const [state, action] = useActionState<TimeFormState, FormData>(logTime, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form after a successful save so the next entry starts fresh -
  // hours get logged several at a time when catching up on a week.
  useEffect(() => {
    if (state.savedMinutes != null) formRef.current?.reset();
  }, [state.savedMinutes]);

  return (
    <Card>
      <form ref={formRef} action={action} className="space-y-5">
        <ErrorBanner message={state.error} />
        {state.savedMinutes != null && !state.error ? (
          <p className="rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5 text-sm text-accent">
            Logged {formatDuration(state.savedMinutes)}.
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Date" htmlFor="date">
            <Input id="date" name="date" type="date" defaultValue={today} required />
          </Field>

          <Field label="Time worked" htmlFor="duration" hint="2.5, 2h 30m, 2:30, or 90m.">
            <Input
              id="duration"
              name="duration"
              inputMode="decimal"
              placeholder="2.5"
              required
              className="tabular"
            />
          </Field>
        </div>

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

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={2} placeholder="Optional detail." />
        </Field>

        <Submit />
      </form>
    </Card>
  );
}
