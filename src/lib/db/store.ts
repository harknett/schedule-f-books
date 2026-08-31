import { DatabaseSync } from "node:sqlite";

import { yearBounds } from "@/lib/dates";
import type { CategoryKind } from "@/lib/schedule-f";

import { MIGRATIONS } from "./migrations";
import type {
  Asset,
  CategoryTotal,
  Loan,
  LoanPayment,
  NewAsset,
  NewLoan,
  NewLoanPayment,
  NewTimeEntry,
  NewTransaction,
  Receipt,
  TimeEntry,
  TransactionFilter,
  TransactionWithMeta,
  User,
  UserRole,
} from "./types";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return String(v);
}
function nstr(v: unknown): string | null {
  return v == null ? null : String(v);
}
function num(v: unknown): number {
  return Number(v);
}
function nnum(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function mapUser(r: Row): User {
  return {
    id: num(r.id),
    email: str(r.email),
    name: str(r.name),
    role: str(r.role) as UserRole,
    mustChangePassword: num(r.must_change_password) === 1,
    createdAt: str(r.created_at),
  };
}

function mapTransaction(r: Row): TransactionWithMeta {
  return {
    id: num(r.id),
    kind: str(r.kind) as CategoryKind,
    categoryId: str(r.category_id),
    date: str(r.date),
    amount: num(r.amount),
    payee: nstr(r.payee),
    description: nstr(r.description),
    paymentMethod: nstr(r.payment_method),
    createdBy: nnum(r.created_by),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    createdByName: nstr(r.created_by_name),
    receiptCount: r.receipt_count == null ? 0 : num(r.receipt_count),
  };
}

function mapReceipt(r: Row): Receipt {
  return {
    id: num(r.id),
    transactionId: nnum(r.transaction_id),
    assetId: nnum(r.asset_id),
    filename: str(r.filename),
    mimeType: str(r.mime_type),
    byteSize: num(r.byte_size),
    createdAt: str(r.created_at),
  };
}

function mapAsset(r: Row): Asset {
  return {
    id: num(r.id),
    name: str(r.name),
    description: nstr(r.description),
    assetClassId: str(r.asset_class),
    method: str(r.method) as Asset["method"],
    convention: str(r.convention) as Asset["convention"],
    placedInService: str(r.placed_in_service),
    cost: num(r.cost),
    section179: num(r.section_179),
    bonusPercent: num(r.bonus_percent),
    businessUsePercent: num(r.business_use_percent),
    disposedDate: nstr(r.disposed_date),
    disposalProceeds: nnum(r.disposal_proceeds),
    notes: nstr(r.notes),
    createdBy: nnum(r.created_by),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

function mapLoan(r: Row): Loan {
  return {
    id: num(r.id),
    name: str(r.name),
    lender: nstr(r.lender),
    kind: str(r.kind) as Loan["kind"],
    principal: num(r.principal),
    interestRate: nnum(r.interest_rate),
    startDate: nstr(r.start_date),
    farmUsePercent: num(r.farm_use_percent),
    notes: nstr(r.notes),
    createdBy: nnum(r.created_by),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

function mapLoanPayment(r: Row): LoanPayment {
  return {
    id: num(r.id),
    loanId: num(r.loan_id),
    date: str(r.date),
    interest: num(r.interest),
    principal: num(r.principal),
    escrow: num(r.escrow),
    notes: nstr(r.notes),
    createdBy: nnum(r.created_by),
    createdAt: str(r.created_at),
  };
}

function mapTimeEntry(r: Row): TimeEntry {
  return {
    id: num(r.id),
    userId: num(r.user_id),
    date: str(r.date),
    minutes: num(r.minutes),
    task: str(r.task),
    notes: nstr(r.notes),
    createdAt: str(r.created_at),
  };
}

const TRANSACTION_SELECT = `
  SELECT t.*,
         u.name AS created_by_name,
         (SELECT COUNT(*) FROM receipts r WHERE r.transaction_id = t.id) AS receipt_count
  FROM transactions t
  LEFT JOIN users u ON u.id = t.created_by
`;

export class Store {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    const row = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    for (let version = row.user_version; version < MIGRATIONS.length; version++) {
      this.db.exec(MIGRATIONS[version]!);
    }
    // user_version can't be parameterised; the value is an integer we control.
    this.db.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
  }

  close(): void {
    this.db.close();
  }

  // --- users ---------------------------------------------------------------

  countUsers(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as Row;
    return num(row.n);
  }

  createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
    /** Set when somebody else chose the password, e.g. an owner adding a member. */
    mustChangePassword?: boolean;
  }): User {
    const info = this.db
      .prepare(
        `INSERT INTO users (email, name, password_hash, role, must_change_password)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.email.toLowerCase(),
        input.name,
        input.passwordHash,
        input.role,
        input.mustChangePassword ? 1 : 0,
      );
    return this.getUser(Number(info.lastInsertRowid))!;
  }

  getUser(id: number): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
    return row ? mapUser(row) : undefined;
  }

  findUserByEmail(email: string): (User & { passwordHash: string }) | undefined {
    const row = this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase()) as Row | undefined;
    if (!row) return undefined;
    return { ...mapUser(row), passwordHash: str(row.password_hash) };
  }

  listUsers(): User[] {
    const rows = this.db.prepare("SELECT * FROM users ORDER BY created_at").all() as Row[];
    return rows.map(mapUser);
  }

  /**
   * Replace a password.
   *
   * `mustChange` says whether the new password is the account holder's own
   * choice (false) or one somebody else set for them (true).
   */
  setPassword(userId: number, passwordHash: string, mustChange = false): void {
    this.db
      .prepare("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?")
      .run(passwordHash, mustChange ? 1 : 0, userId);
  }

  // --- sessions ------------------------------------------------------------

  createSession(tokenHash: string, userId: number, expiresAt: string): void {
    this.db
      .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash, userId, expiresAt);
  }

  /** Resolve a session token hash to its user, ignoring expired rows. */
  findSessionUser(tokenHash: string): User | undefined {
    const row = this.db
      .prepare(
        `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
      )
      .get(tokenHash) as Row | undefined;
    return row ? mapUser(row) : undefined;
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  deleteExpiredSessions(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  }

  /** Sign a user out everywhere - used when their password changes. */
  deleteUserSessions(userId: number): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  // --- transactions --------------------------------------------------------

  createTransaction(input: NewTransaction): TransactionWithMeta {
    const info = this.db
      .prepare(
        `INSERT INTO transactions
           (kind, category_id, date, amount, payee, description, payment_method, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.kind,
        input.categoryId,
        input.date,
        input.amount,
        input.payee ?? null,
        input.description ?? null,
        input.paymentMethod ?? null,
        input.createdBy ?? null,
      );
    return this.getTransaction(Number(info.lastInsertRowid))!;
  }

  getTransaction(id: number): TransactionWithMeta | undefined {
    const row = this.db.prepare(`${TRANSACTION_SELECT} WHERE t.id = ?`).get(id) as Row | undefined;
    return row ? mapTransaction(row) : undefined;
  }

  updateTransaction(
    id: number,
    patch: Omit<NewTransaction, "createdBy">,
  ): TransactionWithMeta | undefined {
    this.db
      .prepare(
        `UPDATE transactions
         SET kind = ?, category_id = ?, date = ?, amount = ?, payee = ?,
             description = ?, payment_method = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        patch.kind,
        patch.categoryId,
        patch.date,
        patch.amount,
        patch.payee ?? null,
        patch.description ?? null,
        patch.paymentMethod ?? null,
        id,
      );
    return this.getTransaction(id);
  }

  /** Deletes the row and cascades receipts. Returns the receipt filenames to unlink. */
  deleteTransaction(id: number): string[] {
    const files = this.listReceipts(id).map((r) => r.filename);
    this.db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
    return files;
  }

  listTransactions(filter: TransactionFilter = {}): TransactionWithMeta[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filter.kind) {
      clauses.push("t.kind = ?");
      params.push(filter.kind);
    }
    if (filter.categoryId) {
      clauses.push("t.category_id = ?");
      params.push(filter.categoryId);
    }
    if (filter.year != null) {
      const { start, end } = yearBounds(filter.year);
      clauses.push("t.date BETWEEN ? AND ?");
      params.push(start, end);
    }
    if (filter.from) {
      clauses.push("t.date >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      clauses.push("t.date <= ?");
      params.push(filter.to);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    let tail = " ORDER BY t.date DESC, t.id DESC";
    if (filter.limit != null && filter.limit > 0) {
      tail += " LIMIT ?";
      params.push(filter.limit);
      if (filter.offset != null && filter.offset > 0) {
        tail += " OFFSET ?";
        params.push(filter.offset);
      }
    }

    const rows = this.db.prepare(`${TRANSACTION_SELECT} ${where} ${tail}`).all(...params) as Row[];
    return rows.map(mapTransaction);
  }

  countTransactions(filter: TransactionFilter = {}): number {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filter.kind) {
      clauses.push("kind = ?");
      params.push(filter.kind);
    }
    if (filter.categoryId) {
      clauses.push("category_id = ?");
      params.push(filter.categoryId);
    }
    if (filter.year != null) {
      const { start, end } = yearBounds(filter.year);
      clauses.push("date BETWEEN ? AND ?");
      params.push(start, end);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM transactions ${where}`)
      .get(...params) as Row;
    return num(row.n);
  }

  /** Per-category totals for a tax year - the raw material for the Schedule F report. */
  categoryTotals(year: number): CategoryTotal[] {
    const { start, end } = yearBounds(year);
    const rows = this.db
      .prepare(
        `SELECT category_id, SUM(amount) AS total, COUNT(*) AS count
         FROM transactions
         WHERE date BETWEEN ? AND ?
         GROUP BY category_id`,
      )
      .all(start, end) as Row[];
    return rows.map((r) => ({
      categoryId: str(r.category_id),
      total: num(r.total),
      count: num(r.count),
    }));
  }

  /** Distinct years that have at least one transaction, newest first. */
  transactionYears(): number[] {
    const rows = this.db
      .prepare("SELECT DISTINCT substr(date, 1, 4) AS y FROM transactions ORDER BY y DESC")
      .all() as Row[];
    return rows.map((r) => Number(r.y));
  }

  // --- receipts ------------------------------------------------------------

  /** Attach a receipt to a transaction or to an asset - exactly one. */
  createReceipt(input: {
    transactionId?: number | null;
    assetId?: number | null;
    filename: string;
    mimeType: string;
    byteSize: number;
  }): Receipt {
    const info = this.db
      .prepare(
        `INSERT INTO receipts (transaction_id, asset_id, filename, mime_type, byte_size)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.transactionId ?? null,
        input.assetId ?? null,
        input.filename,
        input.mimeType,
        input.byteSize,
      );
    return this.getReceipt(Number(info.lastInsertRowid))!;
  }

  getReceipt(id: number): Receipt | undefined {
    const row = this.db.prepare("SELECT * FROM receipts WHERE id = ?").get(id) as Row | undefined;
    return row ? mapReceipt(row) : undefined;
  }

  listReceipts(transactionId: number): Receipt[] {
    const rows = this.db
      .prepare("SELECT * FROM receipts WHERE transaction_id = ? ORDER BY id")
      .all(transactionId) as Row[];
    return rows.map(mapReceipt);
  }

  listAssetReceipts(assetId: number): Receipt[] {
    const rows = this.db
      .prepare("SELECT * FROM receipts WHERE asset_id = ? ORDER BY id")
      .all(assetId) as Row[];
    return rows.map(mapReceipt);
  }

  /** Removes the metadata row and returns the filename so the caller can unlink it. */
  deleteReceipt(id: number): string | undefined {
    const receipt = this.getReceipt(id);
    if (!receipt) return undefined;
    this.db.prepare("DELETE FROM receipts WHERE id = ?").run(id);
    return receipt.filename;
  }

  // --- time entries --------------------------------------------------------

  createTimeEntry(input: NewTimeEntry): TimeEntry {
    const info = this.db
      .prepare("INSERT INTO time_entries (user_id, date, minutes, task, notes) VALUES (?, ?, ?, ?, ?)")
      .run(input.userId, input.date, input.minutes, input.task, input.notes ?? null);
    return this.getTimeEntry(Number(info.lastInsertRowid))!;
  }

  getTimeEntry(id: number): TimeEntry | undefined {
    const row = this.db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id) as Row | undefined;
    return row ? mapTimeEntry(row) : undefined;
  }

  deleteTimeEntry(id: number, userId: number): boolean {
    const info = this.db
      .prepare("DELETE FROM time_entries WHERE id = ? AND user_id = ?")
      .run(id, userId);
    return Number(info.changes) > 0;
  }

  listTimeEntries(userId: number, opts: { year?: number; limit?: number } = {}): TimeEntry[] {
    const clauses = ["user_id = ?"];
    const params: Array<string | number> = [userId];
    if (opts.year != null) {
      const { start, end } = yearBounds(opts.year);
      clauses.push("date BETWEEN ? AND ?");
      params.push(start, end);
    }
    let sql = `SELECT * FROM time_entries WHERE ${clauses.join(" AND ")} ORDER BY date DESC, id DESC`;
    if (opts.limit != null && opts.limit > 0) {
      sql += " LIMIT ?";
      params.push(opts.limit);
    }
    return (this.db.prepare(sql).all(...params) as Row[]).map(mapTimeEntry);
  }

  /** Total minutes logged by a user, optionally within a year. */
  totalMinutes(userId: number, year?: number): number {
    const clauses = ["user_id = ?"];
    const params: Array<string | number> = [userId];
    if (year != null) {
      const { start, end } = yearBounds(year);
      clauses.push("date BETWEEN ? AND ?");
      params.push(start, end);
    }
    const row = this.db
      .prepare(`SELECT COALESCE(SUM(minutes), 0) AS n FROM time_entries WHERE ${clauses.join(" AND ")}`)
      .get(...params) as Row;
    return num(row.n);
  }

  // --- loans ---------------------------------------------------------------

  createLoan(input: NewLoan): Loan {
    const info = this.db
      .prepare(
        `INSERT INTO loans
           (name, lender, kind, principal, interest_rate, start_date, farm_use_percent, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.lender ?? null,
        input.kind,
        input.principal,
        input.interestRate ?? null,
        input.startDate ?? null,
        input.farmUsePercent ?? 100,
        input.notes ?? null,
        input.createdBy ?? null,
      );
    return this.getLoan(Number(info.lastInsertRowid))!;
  }

  getLoan(id: number): Loan | undefined {
    const row = this.db.prepare("SELECT * FROM loans WHERE id = ?").get(id) as Row | undefined;
    return row ? mapLoan(row) : undefined;
  }

  updateLoan(id: number, patch: Omit<NewLoan, "createdBy">): Loan | undefined {
    this.db
      .prepare(
        `UPDATE loans
         SET name = ?, lender = ?, kind = ?, principal = ?, interest_rate = ?,
             start_date = ?, farm_use_percent = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        patch.name,
        patch.lender ?? null,
        patch.kind,
        patch.principal,
        patch.interestRate ?? null,
        patch.startDate ?? null,
        patch.farmUsePercent ?? 100,
        patch.notes ?? null,
        id,
      );
    return this.getLoan(id);
  }

  /** Deletes the loan and cascades its payments. */
  deleteLoan(id: number): void {
    this.db.prepare("DELETE FROM loans WHERE id = ?").run(id);
  }

  listLoans(): Loan[] {
    const rows = this.db
      .prepare("SELECT * FROM loans ORDER BY name COLLATE NOCASE")
      .all() as Row[];
    return rows.map(mapLoan);
  }

  addLoanPayment(input: NewLoanPayment): LoanPayment {
    const info = this.db
      .prepare(
        `INSERT INTO loan_payments (loan_id, date, interest, principal, escrow, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.loanId,
        input.date,
        input.interest,
        input.principal,
        input.escrow ?? 0,
        input.notes ?? null,
        input.createdBy ?? null,
      );
    return this.getLoanPayment(Number(info.lastInsertRowid))!;
  }

  getLoanPayment(id: number): LoanPayment | undefined {
    const row = this.db.prepare("SELECT * FROM loan_payments WHERE id = ?").get(id) as
      | Row
      | undefined;
    return row ? mapLoanPayment(row) : undefined;
  }

  deleteLoanPayment(id: number): void {
    this.db.prepare("DELETE FROM loan_payments WHERE id = ?").run(id);
  }

  listLoanPayments(loanId: number): LoanPayment[] {
    const rows = this.db
      .prepare("SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY date DESC, id DESC")
      .all(loanId) as Row[];
    return rows.map(mapLoanPayment);
  }

  /** Every payment, optionally within a date range - used by the report and export. */
  listAllLoanPayments(from?: string, to?: string): LoanPayment[] {
    const sql =
      from && to
        ? "SELECT * FROM loan_payments WHERE date BETWEEN ? AND ? ORDER BY date, id"
        : "SELECT * FROM loan_payments ORDER BY date, id";
    const rows = this.db.prepare(sql).all(...(from && to ? [from, to] : [])) as Row[];
    return rows.map(mapLoanPayment);
  }

  // --- bulk import ---------------------------------------------------------

  /**
   * Run a unit of work inside a database transaction, so a failed import
   * leaves the books exactly as it found them rather than half-written.
   */
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** Existing transactions in a date range, as the fields duplicate keys compare. */
  transactionFingerprints(
    from: string,
    to: string,
  ): Array<{ kind: string; date: string; amount: number; payee: string | null }> {
    const rows = this.db
      .prepare("SELECT kind, date, amount, payee FROM transactions WHERE date BETWEEN ? AND ?")
      .all(from, to) as Row[];
    return rows.map((r) => ({
      kind: str(r.kind),
      date: str(r.date),
      amount: num(r.amount),
      payee: nstr(r.payee),
    }));
  }

  timeEntryFingerprints(
    userId: number,
    from: string,
    to: string,
  ): Array<{ date: string; minutes: number; task: string }> {
    const rows = this.db
      .prepare(
        "SELECT date, minutes, task FROM time_entries WHERE user_id = ? AND date BETWEEN ? AND ?",
      )
      .all(userId, from, to) as Row[];
    return rows.map((r) => ({
      date: str(r.date),
      minutes: num(r.minutes),
      task: str(r.task),
    }));
  }

  // --- assets --------------------------------------------------------------

  createAsset(input: NewAsset): Asset {
    const info = this.db
      .prepare(
        `INSERT INTO assets
           (name, description, asset_class, method, convention, placed_in_service, cost,
            section_179, bonus_percent, business_use_percent, disposed_date,
            disposal_proceeds, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.description ?? null,
        input.assetClassId,
        input.method,
        input.convention,
        input.placedInService,
        input.cost,
        input.section179 ?? 0,
        input.bonusPercent ?? 0,
        input.businessUsePercent ?? 100,
        input.disposedDate ?? null,
        input.disposalProceeds ?? null,
        input.notes ?? null,
        input.createdBy ?? null,
      );
    return this.getAsset(Number(info.lastInsertRowid))!;
  }

  getAsset(id: number): Asset | undefined {
    const row = this.db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as Row | undefined;
    return row ? mapAsset(row) : undefined;
  }

  updateAsset(id: number, patch: Omit<NewAsset, "createdBy">): Asset | undefined {
    this.db
      .prepare(
        `UPDATE assets
         SET name = ?, description = ?, asset_class = ?, method = ?, convention = ?,
             placed_in_service = ?, cost = ?, section_179 = ?, bonus_percent = ?,
             business_use_percent = ?, disposed_date = ?, disposal_proceeds = ?,
             notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        patch.name,
        patch.description ?? null,
        patch.assetClassId,
        patch.method,
        patch.convention,
        patch.placedInService,
        patch.cost,
        patch.section179 ?? 0,
        patch.bonusPercent ?? 0,
        patch.businessUsePercent ?? 100,
        patch.disposedDate ?? null,
        patch.disposalProceeds ?? null,
        patch.notes ?? null,
        id,
      );
    return this.getAsset(id);
  }

  /** Deletes the asset and cascades its receipts. Returns filenames to unlink. */
  deleteAsset(id: number): string[] {
    const files = this.listAssetReceipts(id).map((r) => r.filename);
    this.db.prepare("DELETE FROM assets WHERE id = ?").run(id);
    return files;
  }

  listAssets(): Asset[] {
    const rows = this.db
      .prepare("SELECT * FROM assets ORDER BY placed_in_service DESC, id DESC")
      .all() as Row[];
    return rows.map(mapAsset);
  }

  /** Assets placed in service during a year - the mid-quarter test looks at these. */
  assetsPlacedInYear(year: number): Asset[] {
    const { start, end } = yearBounds(year);
    const rows = this.db
      .prepare(
        "SELECT * FROM assets WHERE placed_in_service BETWEEN ? AND ? ORDER BY placed_in_service, id",
      )
      .all(start, end) as Row[];
    return rows.map(mapAsset);
  }

  /**
   * Time entries across a date range. Omit `userId` for everyone's, which the
   * owner may want when handing records to a preparer.
   */
  listTimeEntriesInRange(
    from: string,
    to: string,
    userId?: number,
  ): Array<TimeEntry & { userName: string | null }> {
    const clauses = ["t.date BETWEEN ? AND ?"];
    const params: Array<string | number> = [from, to];
    if (userId != null) {
      clauses.push("t.user_id = ?");
      params.push(userId);
    }
    const rows = this.db
      .prepare(
        `SELECT t.*, u.name AS user_name
         FROM time_entries t
         LEFT JOIN users u ON u.id = t.user_id
         WHERE ${clauses.join(" AND ")}
         ORDER BY t.date, t.id`,
      )
      .all(...params) as Row[];
    return rows.map((r) => ({ ...mapTimeEntry(r), userName: nstr(r.user_name) }));
  }

  /** Minutes grouped by task for a year, largest first. */
  minutesByTask(userId: number, year: number): Array<{ task: string; minutes: number }> {
    const { start, end } = yearBounds(year);
    const rows = this.db
      .prepare(
        `SELECT task, SUM(minutes) AS minutes
         FROM time_entries
         WHERE user_id = ? AND date BETWEEN ? AND ?
         GROUP BY task
         ORDER BY minutes DESC`,
      )
      .all(userId, start, end) as Row[];
    return rows.map((r) => ({ task: str(r.task), minutes: num(r.minutes) }));
  }
}
