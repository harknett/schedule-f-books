import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { timeEntryKey, transactionKey, type ImportKind } from "@/lib/import";

import { Importer } from "./importer";

export const metadata = { title: "Import · Schedule F Books" };

/** Wide enough to cover any file someone imports, without loading whole rows. */
const FROM = "1900-01-01";
const TO = "2999-12-31";

export default async function ImportPage() {
  const user = await requireUser();
  const store = getStore();

  // Fingerprints of what is already recorded, so the preview can mark rows as
  // duplicates before anything is written. These are the user's own books, and
  // only the four fields the comparison uses.
  const transactionKeys = store.transactionFingerprints(FROM, TO).map(transactionKey);
  const existingKeys: Record<ImportKind, string[]> = {
    expense: transactionKeys,
    income: transactionKeys,
    time: store.timeEntryFingerprints(user.id, FROM, TO).map(timeEntryKey),
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import a CSV"
        subtitle="Bring in a bank export, a spreadsheet, or a timesheet."
      />
      <Importer existingKeys={existingKeys} />
    </div>
  );
}
