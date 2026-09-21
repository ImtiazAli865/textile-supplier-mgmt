import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getChallanForPrint } from "@/lib/challans/service";
import { ChallanPrintViewComponent } from "@/components/challans/challan-print-view";

interface ChallanPrintPageProps {
  params: Promise<{ challanId: string }>;
}

/**
 * Standalone route OUTSIDE the (dashboard) route group — no nav chrome, so the printed
 * document is clean. Duplicates (dashboard)/layout.tsx's own auth check rather than inheriting
 * it, since this route deliberately opts out of that layout (research.md, ADR-0006). Do not
 * move this under (dashboard) to "simplify" it — that would reintroduce the coupling ADR-0006
 * rejected.
 */
export default async function ChallanPrintPage({ params }: ChallanPrintPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { challanId } = await params;
  const view = await getChallanForPrint(challanId);
  if (!view) notFound();

  return <ChallanPrintViewComponent view={view} />;
}
