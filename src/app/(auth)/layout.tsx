import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1 flex items-center justify-center p-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <p className="text-3xl" aria-hidden>
            🌾
          </p>
          <h1 className="text-xl font-semibold tracking-tight">Schedule F Books</h1>
          <p className="text-sm text-muted">Farm income, expenses, receipts, and hours.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
