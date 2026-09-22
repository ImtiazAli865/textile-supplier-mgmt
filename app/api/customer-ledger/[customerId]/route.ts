import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCustomerLedger } from "@/lib/customer-ledger/service";
import { renderLedgerCsv, sanitizeFilenamePart } from "@/lib/customer-ledger/csv";

/**
 * This project's first Route Handler (ADR-0007) — a raw text/csv file download, the correct
 * Next.js primitive for a response with a custom content type and Content-Disposition header
 * (a Server Action can only return RSC-serializable data, not a byte stream with headers).
 * Requires the same authenticated session every Server Action already requires (FR-013).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Authentication required.", { status: 401 });
  }

  const { customerId } = await params;
  const from = request.nextUrl.searchParams.get("from") || undefined;
  const to = request.nextUrl.searchParams.get("to") || undefined;

  const ledger = await getCustomerLedger(customerId, { from, to });
  if (!ledger) {
    return new NextResponse("Customer not found.", { status: 404 });
  }

  const csv = renderLedgerCsv(ledger.rows);
  const filename = `${sanitizeFilenamePart(ledger.customer.displayName)}-ledger.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
