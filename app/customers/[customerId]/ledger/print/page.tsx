import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCustomerLedgerForPrint } from "@/lib/customer-ledger/service";
import { LedgerPrintView } from "@/components/customer-ledger/ledger-print-view";

interface CustomerLedgerPrintPageProps {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

/**
 * Standalone route OUTSIDE the (dashboard) route group — no nav chrome. Duplicates
 * (dashboard)/layout.tsx's own auth check rather than inheriting it, since this route
 * deliberately opts out of that layout. This is ADR-0006's third application (after Challans and
 * Performa Invoices) — do not move this under (dashboard) to "simplify" it, which would
 * reintroduce the coupling ADR-0006 rejected.
 */
export default async function CustomerLedgerPrintPage({ params, searchParams }: CustomerLedgerPrintPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { customerId } = await params;
  const { from, to } = await searchParams;
  const view = await getCustomerLedgerForPrint(customerId, { from, to });
  if (!view) notFound();

  return <LedgerPrintView view={view} />;
}
