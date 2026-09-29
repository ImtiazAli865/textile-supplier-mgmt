import Link from "next/link";
import { notFound } from "next/navigation";
import { getContractor } from "@/lib/contractors/service";
import { AdjustmentForm } from "@/components/contractor-ledger/adjustment-form";

interface NewAdjustmentPageProps {
  params: Promise<{ contractorId: string }>;
}

export default async function NewAdjustmentPage({ params }: NewAdjustmentPageProps) {
  const { contractorId } = await params;
  const contractor = await getContractor(contractorId);
  if (!contractor) notFound();

  return (
    <div>
      <p className="mb-1 text-sm">
        <Link href={`/contractors/${contractorId}`} className="text-zinc-500 underline">
          ← {contractor.name}&apos;s khata
        </Link>
      </p>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Post adjustment</h1>
      <AdjustmentForm contractorId={contractor.id} contractorName={contractor.name} />
    </div>
  );
}
