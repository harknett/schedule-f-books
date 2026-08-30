import type { Cents } from "@/lib/money";
import type { CategoryKind } from "@/lib/schedule-f";

export type UserRole = "owner" | "member";

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Transaction {
  id: number;
  kind: CategoryKind;
  categoryId: string;
  date: string;
  amount: Cents;
  payee: string | null;
  description: string | null;
  paymentMethod: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionWithMeta extends Transaction {
  createdByName: string | null;
  receiptCount: number;
}

export interface NewTransaction {
  kind: CategoryKind;
  categoryId: string;
  date: string;
  amount: Cents;
  payee?: string | null;
  description?: string | null;
  paymentMethod?: string | null;
  createdBy?: number | null;
}

export interface Receipt {
  id: number;
  transactionId: number;
  filename: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

export interface TimeEntry {
  id: number;
  userId: number;
  date: string;
  minutes: number;
  task: string;
  notes: string | null;
  createdAt: string;
}

export interface NewTimeEntry {
  userId: number;
  date: string;
  minutes: number;
  task: string;
  notes?: string | null;
}

export interface TransactionFilter {
  kind?: CategoryKind;
  categoryId?: string;
  year?: number;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Total per Schedule F category, used to build the year-end report. */
export interface CategoryTotal {
  categoryId: string;
  total: Cents;
  count: number;
}
