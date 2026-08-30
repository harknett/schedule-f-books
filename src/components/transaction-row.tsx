import Link from "next/link";

import { ReceiptIcon } from "./icons";
import type { TransactionWithMeta } from "@/lib/db/types";
import { shortDate } from "@/lib/dates";
import { formatUsd } from "@/lib/money";
import { getCategory } from "@/lib/schedule-f";

export function TransactionRow({ transaction }: { transaction: TransactionWithMeta }) {
  const category = getCategory(transaction.categoryId);
  const isIncome = transaction.kind === "income";
  const title = transaction.payee ?? category?.label ?? "Entry";

  return (
    <li>
      <Link
        href={`/transactions/${transaction.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          <p className="truncate text-xs text-muted">
            {shortDate(transaction.date)}
            {category ? ` · ${category.line} ${category.label}` : null}
          </p>
        </div>

        {transaction.receiptCount > 0 ? (
          <span
            className="flex items-center gap-0.5 text-xs text-muted"
            title={`${transaction.receiptCount} receipt${transaction.receiptCount === 1 ? "" : "s"}`}
          >
            <ReceiptIcon className="h-4 w-4" />
            {transaction.receiptCount > 1 ? transaction.receiptCount : null}
          </span>
        ) : null}

        <span
          className={`tabular shrink-0 font-semibold ${isIncome ? "text-income" : "text-expense"}`}
        >
          {isIncome ? "+" : "−"}
          {formatUsd(transaction.amount)}
        </span>
      </Link>
    </li>
  );
}

export function TransactionList({ transactions }: { transactions: TransactionWithMeta[] }) {
  return (
    <ul className="card divide-y divide-[var(--border)] overflow-hidden p-0">
      {transactions.map((transaction) => (
        <TransactionRow key={transaction.id} transaction={transaction} />
      ))}
    </ul>
  );
}
