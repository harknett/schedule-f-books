import { notFound } from "next/navigation";

import { Button, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { taskSuggestions } from "@/lib/tasks";

import { deleteTimeEntry } from "../actions";
import { EditTimeForm } from "../form";

export const metadata = { title: "Edit hours · Schedule F Books" };

export default async function EditTimeEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) notFound();

  // Hours are personal: someone else's entry is as good as missing.
  const store = getStore();
  const entry = store.getTimeEntry(entryId);
  if (!entry || entry.userId !== user.id) notFound();

  // The action checks this again; here it only decides what to pass along.
  const { back: backParam } = await searchParams;
  const back = typeof backParam === "string" && backParam.startsWith("/time") ? backParam : "/time";

  return (
    <div className="space-y-5">
      <PageHeader title="Edit hours" subtitle="Totals update as soon as you save." />

      <EditTimeForm
        entry={entry}
        suggestions={taskSuggestions(store.listTaskNames(user.id))}
        back={back}
      />

      <form action={deleteTimeEntry}>
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="back" value={back} />
        <Button type="submit" variant="danger" className="w-full">
          Delete entry
        </Button>
      </form>
    </div>
  );
}
