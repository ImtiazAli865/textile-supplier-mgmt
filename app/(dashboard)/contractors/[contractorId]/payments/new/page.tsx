import Link from "next/link";
import { notFound } from "next/navigation";
import { getContractor } from "@/lib/contractors/service";
import { listPayableBatches } from "@/lib/contractor-ledger/service";
import { PaymentForm } from "@/components/contractor-ledger/payment-form";

interface NewContractorPaymentPageProps {
  params: Promise<{ contractorId: string }>;
}

/** Inactive contractors can still be paid off (US2-8). */
export default async function NewContractorPaymentPage({ params }: NewContractorPaymentPageProps) {
  const { contractorId } = await params;
  const contractor = await getContractor(contractorId);
  if (!contractor) notFound();
  const payableBatches = await listPayableBatches(contractorId);

  return (
    <div>
      <p className="mb-1 text-sm">
        <Link href={`/contractors/${contractorId}`} className="text-zinc-500 underline">
          ← {contractor.name}&apos;s khata
        </Link>
      </p>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Record cash payment</h1>
      <PaymentForm
        contractorId={contractor.id}
        contractorName={contractor.name}
        contractorInactive={contractor.status === "inactive"}
        payableBatches={payableBatches}
      />
    </div>
  );
}
