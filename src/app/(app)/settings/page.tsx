import { Button, Card, PageHeader } from "@/components/ui";
import { signOut } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth/guard";
import { dataDir, getStore } from "@/lib/db";
import { prettyDate } from "@/lib/dates";

import { AddUserForm, ChangePasswordForm } from "./forms";

export const metadata = { title: "Settings · Schedule F Books" };

export default async function SettingsPage() {
  const user = await requireUser();
  const store = getStore();
  const users = store.listUsers();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <Card className="space-y-1">
        <p className="font-semibold">{user.name}</p>
        <p className="text-sm text-muted">{user.email}</p>
        <p className="text-xs text-muted">
          {user.role === "owner" ? "Farm owner" : "Member"} · joined {prettyDate(user.createdAt.slice(0, 10))}
        </p>
        <form action={signOut} className="pt-3">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </Card>

      <ChangePasswordForm />

      <section className="space-y-3">
        <h2 className="font-semibold">People with access ({users.length})</h2>
        <ul className="card divide-y divide-[var(--border)] overflow-hidden p-0">
          {users.map((person) => (
            <li key={person.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {person.name}
                  {person.id === user.id ? <span className="text-muted"> (you)</span> : null}
                </p>
                <p className="truncate text-xs text-muted">{person.email}</p>
              </div>
              <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted">
                {person.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {user.role === "owner" ? <AddUserForm /> : null}

      <Card className="space-y-2">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-sm text-muted">
          Everything lives in one directory — the SQLite database and every receipt image. Back it
          up and you have backed up the books.
        </p>
        <p className="rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs break-all">
          {dataDir()}
        </p>
      </Card>
    </div>
  );
}
