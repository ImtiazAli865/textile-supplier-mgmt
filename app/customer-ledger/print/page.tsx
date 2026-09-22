import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCustomerLedgerSummaryForPrint } from "@/lib/customer-ledger/service";
import { LedgerSummaryPrintView } from "@/components/customer-ledger/ledger-summary-print-view";

/** Standalone route OUTSIDE the (dashboard) route group (ADR-0006), same auth-gate pattern as
 * app/customers/[customerId]/ledger/print/page.tsx. */
export default async function CustomerLedgerSummaryPrintPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const view = await getCustomerLedgerSummaryForPrint();
  return <LedgerSummaryPrintView view={view} />;
}
