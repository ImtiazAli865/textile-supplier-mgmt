import Link from "next/link";
import { listAvailableLotsForBatch } from "@/lib/production-batches/service";
import { listActiveManufacturedProductsForSelect } from "@/lib/products/service";
import { listActiveContractorsForSelect } from "@/lib/contractors/service";
import { BatchIssueForm } from "@/components/production-batches/batch-issue-form";

export default async function NewProductionBatchPage() {
  const [lots, products, contractors] = await Promise.all([
    listAvailableLotsForBatch(),
    listActiveManufacturedProductsForSelect(),
    listActiveContractorsForSelect(),
  ]);

  return (
    <div>
      <h1 className="mb-2 text-lg font-semibold text-zinc-900">Issue fabric to a contractor</h1>
      <p className="mb-6 text-sm text-zinc-500">
        The weight is deducted from the lot as soon as the batch is issued.
        {contractors.length === 0 && (
          <>
            {" "}
            No active contractors yet —{" "}
            <Link href="/contractors/new" className="underline">
              add one first
            </Link>
            .
          </>
        )}
      </p>
      <BatchIssueForm mode="create" lots={lots} products={products} contractors={contractors} />
    </div>
  );
}
