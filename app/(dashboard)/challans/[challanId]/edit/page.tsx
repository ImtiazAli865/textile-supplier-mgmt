import { notFound, redirect } from "next/navigation";
import { getChallan } from "@/lib/challans/service";
import { listActiveTradeNamesForSelect } from "@/lib/trade-names/service";
import { ChallanForm } from "@/components/challans/challan-form";

interface EditChallanPageProps {
  params: Promise<{ challanId: string }>;
}

export default async function EditChallanPage({ params }: EditChallanPageProps) {
  const { challanId } = await params;
  const [challan, tradeNameOptions] = await Promise.all([
    getChallan(challanId),
    listActiveTradeNamesForSelect(),
  ]);
  if (!challan) notFound();
  // Only reachable while Issued (FR-013) — update_challan itself also enforces this.
  if (challan.status !== "issued") {
    redirect(`/challans/${challanId}`);
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit Challan {challan.challanNumber}</h1>
      <ChallanForm mode="edit" challan={challan} tradeNameOptions={tradeNameOptions} />
    </div>
  );
}
