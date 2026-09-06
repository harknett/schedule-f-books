"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Select } from "@/components/ui";
import { shortDate } from "@/lib/dates";

import { acceptConfident, fileEntry, type ReviewState } from "./actions";

interface CategoryOption {
  id: string;
  line: string;
  label: string;
}

interface SuggestionView extends CategoryOption {
  matchedOn: string;
  confidence: "strong" | "weak";
}

function FileButton({ changed }: { changed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="shrink-0">
      {pending ? "Filing…" : changed ? "File here" : "Accept"}
    </Button>
  );
}

/**
 * One entry waiting to be filed.
 *
 * The suggested line is pre-selected but the control is an ordinary select, so
 * accepting and overriding are the same gesture - there is no separate "reject"
 * path to get wrong. The row disappears on save because the page no longer
 * lists it, which is the feedback.
 */
export function ReviewRow({
  id,
  date,
  payee,
  description,
  amount,
  categories,
  suggestion,
}: {
  id: number;
  date: string;
  payee: string | null;
  description: string | null;
  amount: string;
  categories: CategoryOption[];
  suggestion: SuggestionView | null;
}) {
  const [chosen, setChosen] = useState(suggestion?.id ?? "");

  return (
    <li className="card space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{payee || "No payee recorded"}</p>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </div>
        <p className="tabular shrink-0 font-semibold">{amount}</p>
      </div>

      <p className="text-xs text-muted">{shortDate(date)}</p>

      {suggestion ? (
        <p className="text-xs">
          <span
            className={
              suggestion.confidence === "strong"
                ? "font-medium text-accent"
                : "font-medium text-muted"
            }
          >
            {suggestion.confidence === "strong" ? "Suggested" : "Worth a look"}
          </span>{" "}
          <span className="text-muted">
            — matched &ldquo;{suggestion.matchedOn}&rdquo;
          </span>
        </p>
      ) : (
        <p className="text-xs text-muted">
          Nothing in the wording points to a line. Choose one, or leave it on 32.
        </p>
      )}

      <form action={fileEntry} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <div className="min-w-0 flex-1">
          <label htmlFor={`category-${id}`} className="sr-only">
            Schedule F line for {payee ?? "this entry"}
          </label>
          <Select
            id={`category-${id}`}
            name="categoryId"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            required
          >
            <option value="" disabled>
              Choose a line…
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.line} · {category.label}
              </option>
            ))}
          </Select>
        </div>
        <FileButton changed={chosen !== (suggestion?.id ?? "")} />
      </form>
    </li>
  );
}

function AcceptButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Filing…" : `Accept the ${count} confident ${count === 1 ? "one" : "ones"}`}
    </Button>
  );
}

/**
 * Sweep up the suggestions the rules are sure about; never the weak ones.
 *
 * Stays mounted even once `count` reaches zero, rendering only the result.
 * A successful sweep is exactly what removes the last confident row, so
 * hiding the whole component at that point would unmount it mid-flight and
 * throw away the one message telling you it worked.
 */
export function AcceptConfident({ count }: { count: number }) {
  const [state, action] = useActionState<ReviewState, FormData>(acceptConfident, {});

  return (
    <form action={action} className="space-y-2">
      {count > 0 ? <AcceptButton count={count} /> : null}
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.moved != null ? (
        <p className="text-sm text-muted">
          Filed {state.moved} {state.moved === 1 ? "entry" : "entries"}. Anything left needs a
          decision.
        </p>
      ) : null}
    </form>
  );
}
