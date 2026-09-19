import { listPurchases, listActiveSuppliersForSelect } from "@/lib/purchases/service";
import { listActiveTradedProductsForSelect } from "@/lib/products/service";
import { PurchaseFilters } from "@/components/purchases/purchase-filters";
import { PurchaseList } from "@/components/purchases/purchase-list";

interface PurchasesPageProps {
  searchParams: Promise<{
    supplierId?: string;
    dateFrom?: string;
    dateTo?: string;
    productId?: string;
  }>;
}

export default async function PurchasesPage({ searchParams }: PurchasesPageProps) {
  const params = await searchParams;

  const [{ purchases, totals }, activeSuppliers, activeTradedProducts] = await Promise.all([
    listPurchases({
      supplierId: params.supplierId || undefined,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
      productId: params.productId || undefined,
    }),
    listActiveSuppliersForSelect(),
    listActiveTradedProductsForSelect(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Purchases</h1>
      <PurchaseFilters suppliers={activeSuppliers} tradedProducts={activeTradedProducts} />
      <PurchaseList purchases={purchases} totals={totals} />
    </div>
  );
}
