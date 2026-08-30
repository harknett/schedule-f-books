import Link from "next/link";
import type { ReactNode } from "react";

import { SettingsIcon } from "@/components/icons";
import { BottomNav, HeaderNav } from "@/components/nav";
import { requireUser } from "@/lib/auth/guard";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <header className="no-print sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden>🌾</span>
            <span className="hidden sm:inline">Schedule F Books</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <HeaderNav />
            <Link
              href="/settings"
              className="rounded-lg p-2 text-muted hover:bg-surface-muted"
              aria-label={`Settings — signed in as ${user.name}`}
              title={user.name}
            >
              <SettingsIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Bottom padding clears the fixed tab bar on mobile. */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 pb-28 md:pb-8">{children}</main>

      <BottomNav />
    </>
  );
}
