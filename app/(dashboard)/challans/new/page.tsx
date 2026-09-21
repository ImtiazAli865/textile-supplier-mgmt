import Link from "next/link";
import { getCustomerPO, listCustomerPOs } from "@/lib/customer-pos/service";
import { getOpenPOLinesForChallan } from "@/lib/challans/service";
import { listActiveTradeNamesForSelect } from "@/lib/trade-names/service";
import { ChallanForm } from "@/components/challans/challan-form";

interface NewChallanPageProps {
  searchParams: Promise<{ poId?: string }>;
}

export default async function NewChallanPage({ searchParams }: NewChallanPageProps) {
  const { poId } = await searchParams;

  if (!poId) {
    // No PO chosen yet — pick one first (navigating to ?poId=<id> reloads this page with the
    // right undelivered-line candidates, per research.md's server-rendered approach).
    const openPOs = await listCustomerPOs({ status: "open" });
    return (
      <div className="max-w-xl">
        <h1 className="mb-6 text-lg font-semibold text-zinc-900">Create Challan</h1>
        <p className="mb-3 text-sm text-zinc-600">Pick the PO to deliver against:</p>
        <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
          {openPOs.map((po) => (
            <li key={po.id}>
              <Link
                href={`/challans/new?poId=${po.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-50"
              >
                <span className="font-medium text-zinc-900">{po.poNumber}</span>
                <span className="text-zinc-500">{po.customerDisplayName}</span>
              </Link>
            </li>
          ))}
          {openPOs.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-zinc-500">No open POs.</li>
          )}
        </ul>
      </div>
    );
  }

  const [po, candidateLines, tradeNameOptions] = await Promise.all([
    getCustomerPO(poId),
    getOpenPOLinesForChallan(poId),
    listActiveTradeNamesForSelect(),
  ]);

  if (!po) {
    return <p className="text-sm text-red-600">PO not found.</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Create Challan</h1>
      <ChallanForm
        mode="create"
        poId={po.id}
        poNumber={po.poNumber}
        candidateLines={candidateLines}
        tradeNameOptions={tradeNameOptions}
      />
    </div>
  );
}
