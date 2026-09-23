import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductionBatch } from "@/lib/production-batches/service";
import { BatchCompleteForm } from "@/components/production-batches/batch-complete-form";
import { BatchCostSummary } from "@/components/production-batches/batch-cost-summary";
import { BatchStatusControls } from "@/components/production-batches/batch-status-controls";

const STATUS_STYLES: Record<string, string> = {
  issued: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  voided: "bg-zinc-100 text-zinc-600",
};

function rs(value: number): string {
  return `Rs ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ProductionBatchDetailPageProps {
  params: Promise<{ batchId: string }>;
}

export default async function ProductionBatchDetailPage({ params }: ProductionBatchDetailPageProps) {
  const { batchId } = await params;
  const batch = await getProductionBatch(batchId);
  if (!batch) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Batch {batch.batchNumber}</h1>
          <p className="text-sm text-zinc-500">
            {batch.productName} · {batch.contractorName}
            {batch.contractorStatus === "inactive" && " (inactive)"}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_STYLES[batch.status] ?? "bg-zinc-100 text-zinc-600"
          }`}
        >
          {batch.status}
        </span>
      </div>

      <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-6 sm:grid-cols-2">
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Fabric lot</h2>
          <p className="text-sm text-zinc-900">
            <Link href={`/purchases/${batch.lotId}`} className="underline">
              {batch.lotSupplierName} · {batch.lotPurchaseDate}
            </Link>
          </p>
          <p className="text-xs text-zinc-500">
            {batch.lotWeightKg.toFixed(2)} kg lot · Rs {batch.lotRatePerKg.toFixed(2)}/kg
          </p>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Weight issued</h2>
          <p className="text-sm text-zinc-900">
            {batch.weightIssuedKg.toFixed(2)} kg · fabric value {rs(batch.fabricValue)}
          </p>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Product</h2>
          <p className="text-sm text-zinc-900">
            <Link href={`/products/${batch.productId}`} className="underline">
              {batch.productName}
            </Link>
          </p>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Labour rate per packet</h2>
          <p className="text-sm text-zinc-900">
            {rs(batch.labourRatePerPacket)}
            {batch.status === "completed" && " (frozen)"}
          </p>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Issue date</h2>
          <p className="text-sm text-zinc-900">{batch.issueDate}</p>
        </section>
        {batch.expectedPacketsSuggestion !== null && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Expected packets</h2>
            <p className="text-sm text-zinc-900">
              ≈ {batch.expectedPacketsSuggestion.toLocaleString()} (suggestion only)
            </p>
          </section>
        )}
        {batch.completion && (
          <>
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Packets produced</h2>
              <p className="text-sm text-zinc-900">
                {batch.completion.packetsProduced.toLocaleString()} {batch.productStockUom}
              </p>
            </section>
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Returned packet weight</h2>
              <p className="text-sm text-zinc-900">
                {batch.completion.returnedWeightKg.toFixed(2)} kg
              </p>
            </section>
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Completion date</h2>
              <p className="text-sm text-zinc-900">{batch.completion.completionDate}</p>
            </section>
          </>
        )}
        <section className="border-t border-zinc-100 pt-3 text-xs text-zinc-400 sm:col-span-2">
          Created {new Date(batch.createdAt).toLocaleString()} · Last updated{" "}
          {new Date(batch.updatedAt).toLocaleString()}
          {batch.completion && ` · Completed ${new Date(batch.completion.completedAt).toLocaleString()}`}
          {batch.voidedAt && ` · Voided ${new Date(batch.voidedAt).toLocaleString()}`}
        </section>
      </div>

      {batch.completion && (
        <BatchCostSummary completion={batch.completion} weightIssuedKg={batch.weightIssuedKg} />
      )}

      {batch.status === "issued" && (
        <>
          <BatchCompleteForm
            batchId={batch.id}
            weightIssuedKg={batch.weightIssuedKg}
            lotRatePerKg={batch.lotRatePerKg}
            labourRatePerPacket={batch.labourRatePerPacket}
            expectedPackets={batch.expectedPacketsSuggestion}
          />
          <BatchStatusControls batchId={batch.id} status={batch.status} />
        </>
      )}

      {batch.status === "voided" && (
        <p className="text-sm text-zinc-500">
          This batch was voided; its weight was returned to the lot. It is read-only.
        </p>
      )}
    </div>
  );
}
