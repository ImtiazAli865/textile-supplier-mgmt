import { notFound, redirect } from "next/navigation";
import { getProductionBatch, listAvailableLotsForBatch } from "@/lib/production-batches/service";
import { getProduct, listActiveManufacturedProductsForSelect } from "@/lib/products/service";
import { listActiveContractorsForSelect } from "@/lib/contractors/service";
import { BatchIssueForm } from "@/components/production-batches/batch-issue-form";

interface EditProductionBatchPageProps {
  params: Promise<{ batchId: string }>;
}

export default async function EditProductionBatchPage({ params }: EditProductionBatchPageProps) {
  const { batchId } = await params;
  const batch = await getProductionBatch(batchId);
  if (!batch) notFound();
  if (batch.status !== "issued") redirect(`/production-batches/${batch.id}`);

  const [lots, activeProducts, activeContractors] = await Promise.all([
    listAvailableLotsForBatch({ includeBatchId: batch.id }),
    listActiveManufacturedProductsForSelect(),
    listActiveContractorsForSelect(),
  ]);

  // Keep the batch's current product/contractor selectable even if since deactivated (FR-002,
  // spec edge cases) — only newly selected values must be active.
  const products = [...activeProducts];
  if (!products.some((p) => p.id === batch.productId)) {
    const current = await getProduct(batch.productId);
    if (current) {
      products.unshift({
        id: current.id,
        name: `${current.name} (inactive)`,
        stockUom: current.stockUom,
        defaultLabourRatePerPacket: current.defaultLabourRatePerPacket ?? batch.labourRatePerPacket,
        expectedYieldPerKg: current.expectedYieldPerKg ?? 0,
      });
    }
  }
  const contractors = [...activeContractors];
  if (!contractors.some((c) => c.id === batch.contractorId)) {
    contractors.unshift({ id: batch.contractorId, name: `${batch.contractorName} (inactive)` });
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit batch {batch.batchNumber}</h1>
      <BatchIssueForm
        mode="edit"
        batchId={batch.id}
        lots={lots}
        products={products}
        contractors={contractors}
        defaultValues={{
          lotId: batch.lotId,
          productId: batch.productId,
          contractorId: batch.contractorId,
          weightIssuedKg: batch.weightIssuedKg,
          labourRatePerPacket: batch.labourRatePerPacket,
          issueDate: batch.issueDate,
        }}
      />
    </div>
  );
}
