import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPerformaInvoiceForPrint } from "@/lib/performa-invoices/service";
import { PerformaInvoicePrintViewComponent } from "@/components/performa-invoices/performa-invoice-print-view";

interface PerformaInvoicePrintPageProps {
  params: Promise<{ invoiceId: string }>;
}

/**
 * Standalone route OUTSIDE the (dashboard) route group — no nav chrome, so the printed
 * document is clean. Duplicates (dashboard)/layout.tsx's own auth check rather than inheriting
 * it, since this route deliberately opts out of that layout. This is ADR-0006's own anticipated
 * second application (after 007-challans) — do not move this under (dashboard) to "simplify"
 * it, which would reintroduce the coupling ADR-0006 rejected.
 */
export default async function PerformaInvoicePrintPage({ params }: PerformaInvoicePrintPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { invoiceId } = await params;
  const view = await getPerformaInvoiceForPrint(invoiceId);
  if (!view) notFound();

  return <PerformaInvoicePrintViewComponent view={view} />;
}
