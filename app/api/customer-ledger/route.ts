import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listCustomerLedgerSummaries } from "@/lib/customer-ledger/service";
import { renderSummaryCsv } from "@/lib/customer-ledger/csv";

/** Same auth/shape as app/api/customer-ledger/[customerId]/route.ts (ADR-0007), for the
 * all-customers summary. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Authentication required.", { status: 401 });
  }

  const summaries = await listCustomerLedgerSummaries();
  const csv = renderSummaryCsv(summaries);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="customer-ledger-summary.csv"',
    },
  });
}
