import Link from "next/link";
import { notFound } from "next/navigation";
import { getContractor } from "@/lib/contractors/service";
import { getOpeningBalanceState } from "@/lib/contractor-ledger/service";
import { OpeningBalanceForm } from "@/components/contractor-ledger/opening-balance-form";

interface OpeningBalancePageProps {
  params: Promise<{ contractorId: string }>;
}

/** One opening balance per contractor, never once a current settlement exists (FR-020). */
export default async function OpeningBalancePage({ params }: OpeningBalancePageProps) {
  const { contractorId } = await params;
  const contractor = await getContractor(contractorId);
  if (!contractor) notFound();
  const state = await getOpeningBalanceState(contractorId);

  let blocked: string | null = null;
  if (state.hasOpeningBalance) {
    blocked = "An opening balance is already recorded. Use an adjustment to correct it.";
  } else if (state.hasCurrentSettlement) {
    blocked =
      "Opening balance can no longer be recorded because this contractor has a settlement. Post an adjustment instead (e.g. reason 'Opening balance missed at go-live').";
  }

  return (
    <div>
      <p className="mb-1 text-sm">
        <Link href={`/contractors/${contractorId}`} className="text-zinc-500 underline">
          ← {contractor.name}&apos;s khata
        </Link>
      </p>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Record opening balance</h1>
      {blocked ? (
        <div className="max-w-xl space-y-3 rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-900">
          <p>{blocked}</p>
          <Link href={`/contractors/${contractorId}/adjustments/new`} className="underline">
            Post an adjustment
          </Link>
        </div>
      ) : (
        <OpeningBalanceForm
          contractorId={contractor.id}
          contractorName={contractor.name}
          earliestEntryDate={state.earliestEntryDate}
        />
      )}
    </div>
  );
}
