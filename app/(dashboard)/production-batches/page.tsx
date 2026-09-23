import Link from "next/link";
import { listProductionBatches } from "@/lib/production-batches/service";
import { listContractors } from "@/lib/contractors/service";
import { listManufacturedProductsForFilter } from "@/lib/products/service";
import { BatchFilters, BatchList } from "@/components/production-batches/batch-list";
import type { BatchStatus } from "@/lib/production-batches/schema";

interface ProductionBatchesPageProps {
  searchParams: Promise<{
    status?: string;
    contractorId?: string;
    productId?: string;
    from?: string;
    to?: string;
    q?: string;
  }>;
}

const VALID_STATUSES: BatchStatus[] = ["issued", "completed", "voided"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ProductionBatchesPage({ searchParams }: ProductionBatchesPageProps) {
  const params = await searchParams;
  const status = VALID_STATUSES.includes(params.status as BatchStatus)
    ? (params.status as BatchStatus)
    : undefined;

  const [result, contractors, products] = await Promise.all([
    listProductionBatches({
      status,
      contractorId: params.contractorId || undefined,
      productId: params.productId || undefined,
      issueDateFrom: params.from && DATE_RE.test(params.from) ? params.from : undefined,
      issueDateTo: params.to && DATE_RE.test(params.to) ? params.to : undefined,
      batchNumber: params.q || undefined,
    }),
    // All contractors (inactive included) — past batches can still be filtered by them.
    listContractors(),
    listManufacturedProductsForFilter(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Production batches</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/production-batches/opening-stock"
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Opening stock
          </Link>
          <Link
            href="/production-batches/new"
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Issue new batch
          </Link>
        </div>
      </div>
      <BatchFilters
        contractorOptions={contractors.map(({ id, name }) => ({ id, name }))}
        productOptions={products}
      />
      <BatchList result={result} />
    </div>
  );
}
