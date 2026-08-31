import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/guard";
import { templateFor, type ImportKind } from "@/lib/import";

const KINDS: ImportKind[] = ["expense", "income", "time"];

/** `/import/expense-template.csv` - a starting point for someone typing it out. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const { file } = await params;
  const match = /^([a-z]+)-template\.csv$/.exec(file);
  const kind = match?.[1] as ImportKind | undefined;
  if (!kind || !KINDS.includes(kind)) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(templateFor(kind), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-template.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
