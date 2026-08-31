import { NextResponse } from "next/server";

import { summarizeYear } from "@/lib/assets";
import { interestForYear } from "@/lib/loans";
import { currentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { buildReport, reportToCsv } from "@/lib/report";

/** `/report/2026.csv` - the year's Schedule F roll-up, for a preparer or a spreadsheet. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  if (!(await currentUser())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { file } = await params;
  const match = /^(\d{4})\.csv$/.exec(file);
  if (!match) return new NextResponse("Not found", { status: 404 });

  const year = Number(match[1]);
  const store = getStore();
  const report = buildReport(year, store.categoryTotals(year), {
    // Keep the CSV in step with the on-screen report, line 14 included.
    assetDepreciation: summarizeYear(store.listAssets(), year).total,
    loanInterest: interestForYear(store.listLoans(), store.listAllLoanPayments(), year),
  });

  return new NextResponse(reportToCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="schedule-f-${year}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
