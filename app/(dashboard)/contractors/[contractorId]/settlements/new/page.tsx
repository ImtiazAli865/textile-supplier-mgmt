import Link from "next/link";
import { notFound } from "next/navigation";
import { getContractor } from "@/lib/contractors/service";
import { getSettlementPreview } from "@/lib/contractor-ledger/service";
import { todayInPakistan } from "@/lib/dates";
import { SettleForm } from "@/components/contractor-ledger/settle-form";

interface NewSettlementPageProps {
  params: Promise<{ contractorId: string }>;
  searchParams: Promise<{ end?: string }>;
}

/** Settle a period (US5). The chosen end date is a search param so the preview is computed on
 * the server with the same formula the settle function uses. */
export default async function NewSettlementPage({ params, searchParams }: NewSettlementPageProps) {
  const { contractorId } = await params;
  const { end } = await searchParams;
  const contractor = await getContractor(contractorId);
  if (!contractor) notFound();

  const periodEnd = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : todayInPakistan();
  const preview = await getSettlementPreview(contractorId, periodEnd);

  return (
    <div>
      <p className="mb-1 text-sm">
        <Link href={`/contractors/${contractorId}`} className="text-zinc-500 underline">
          ← {contractor.name}&apos;s khata
        </Link>
      </p>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Settle {contractor.name}&apos;s khata</h1>
      {preview.periodStart === null ? (
        <div className="max-w-xl rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-900">
          {preview.canSettle ? null : preview.reason}
        </div>
      ) : (
        <SettleForm
          contractorId={contractor.id}
          contractorName={contractor.name}
          periodEnd={periodEnd}
          periodStart={preview.periodStart}
          preview={preview.canSettle ? preview : null}
          problem={preview.canSettle ? null : preview.reason}
        />
      )}
    </div>
  );
}
