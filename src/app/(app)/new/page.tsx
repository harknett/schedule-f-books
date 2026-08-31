import Link from "next/link";

import {
  ArrowDownIcon,
  BankIcon,
  ArrowUpIcon,
  ChevronIcon,
  ClockIcon,
  TractorIcon,
  UploadIcon,
} from "@/components/icons";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Add · Schedule F Books" };

const CHOICES = [
  {
    href: "/expenses/new",
    label: "Expense",
    body: "Money out, with a photo of the receipt.",
    Icon: ArrowUpIcon,
    tone: "text-expense",
  },
  {
    href: "/income/new",
    label: "Income",
    body: "Money in from sales, programs, or custom work.",
    Icon: ArrowDownIcon,
    tone: "text-income",
  },
  {
    href: "/time",
    label: "Hours worked",
    body: "Log time on the farm before you forget it.",
    Icon: ClockIcon,
    tone: "text-accent",
  },
  {
    href: "/assets/new",
    label: "Asset",
    body: "Machinery, buildings, or breeding stock to depreciate.",
    Icon: TractorIcon,
    tone: "text-muted",
  },
  {
    href: "/loans/new",
    label: "Loan",
    body: "A mortgage or operating loan, to track interest paid.",
    Icon: BankIcon,
    tone: "text-muted",
  },
  {
    href: "/import",
    label: "Import a CSV",
    body: "A bank export, a spreadsheet, or a timesheet, all at once.",
    Icon: UploadIcon,
    tone: "text-muted",
  },
] as const;

export default function NewEntryPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Add an entry" subtitle="What are you recording?" />

      <ul className="space-y-3">
        {CHOICES.map(({ href, label, body, Icon, tone }) => (
          <li key={href}>
            <Link
              href={href}
              className="card flex items-center gap-4 p-4 hover:bg-surface-muted transition-colors"
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-muted ${tone}`}>
                <Icon className="h-5.5 w-5.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-muted">{body}</span>
              </span>
              <ChevronIcon className="h-5 w-5 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
