import { NextResponse } from "next/server";

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
  const report = buildReport(year, getStore().categoryTotals(year));

  return new NextResponse(reportToCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="schedule-f-${year}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
