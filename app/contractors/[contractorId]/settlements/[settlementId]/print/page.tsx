import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSettlementStatement } from "@/lib/contractor-ledger/service";
import { SettlementPrintView } from "@/components/contractor-ledger/settlement-print-view";

interface SettlementPrintPageProps {
  params: Promise<{ contractorId: string; settlementId: string }>;
}

/**
 * Standalone route OUTSIDE the (dashboard) route group — no nav chrome. Duplicates
 * (dashboard)/layout.tsx's own auth check rather than inheriting it, since this route
 * deliberately opts out of that layout (ADR-0006, as the Challan, Performa Invoice and customer
 * ledger print routes). Do not move it under (dashboard).
 */
export default async function SettlementPrintPage({ params }: SettlementPrintPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { contractorId, settlementId } = await params;
  const statement = await getSettlementStatement(contractorId, settlementId);
  if (!statement) notFound();

  return <SettlementPrintView statement={statement} />;
}
