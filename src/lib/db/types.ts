import type { Convention, DepreciationMethod } from "@/lib/depreciation";
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
  /** Exactly one of these is set. */
  transactionId: number | null;
  assetId: number | null;
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

export interface Asset {
  id: number;
  name: string;
  description: string | null;
  assetClassId: string;
  method: DepreciationMethod;
  convention: Convention;
  placedInService: string;
  cost: Cents;
  section179: Cents;
  bonusPercent: number;
  businessUsePercent: number;
  /** Set once sold, traded, or scrapped; depreciation stops that year. */
  disposedDate: string | null;
  disposalProceeds: Cents | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewAsset {
  name: string;
  description?: string | null;
  assetClassId: string;
  method: DepreciationMethod;
  convention: Convention;
  placedInService: string;
  cost: Cents;
  section179?: Cents;
  bonusPercent?: number;
  businessUsePercent?: number;
  disposedDate?: string | null;
  disposalProceeds?: Cents | null;
  notes?: string | null;
  createdBy?: number | null;
}

/** Interest on a farm mortgage goes to Schedule F line 21a; anything else 21b. */
export type LoanKind = "mortgage" | "other";

export interface Loan {
  id: number;
  name: string;
  lender: string | null;
  kind: LoanKind;
  /** Original amount borrowed, in cents. */
  principal: Cents;
  /** Annual rate as a percentage. Informational; nothing is amortised from it. */
  interestRate: number | null;
  startDate: string | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewLoan {
  name: string;
  lender?: string | null;
  kind: LoanKind;
  principal: Cents;
  interestRate?: number | null;
  startDate?: string | null;
  notes?: string | null;
  createdBy?: number | null;
}

/**
 * One payment, stored as its parts. The total is always the sum of the three,
 * so there is no separate figure to fall out of step.
 */
export interface LoanPayment {
  id: number;
  loanId: number;
  date: string;
  interest: Cents;
  principal: Cents;
  /** Taxes, insurance, or anything else bundled in that is not interest. */
  escrow: Cents;
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface NewLoanPayment {
  loanId: number;
  date: string;
  interest: Cents;
  principal: Cents;
  escrow?: Cents;
  notes?: string | null;
  createdBy?: number | null;
}
