import { PurchaseForm } from "@/components/purchases/purchase-form";
import { listActiveSuppliersForSelect } from "@/lib/purchases/service";

export default async function NewPurchasePage() {
  const activeSuppliers = await listActiveSuppliersForSelect();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Add Purchase</h1>
      <PurchaseForm mode="create" activeSuppliers={activeSuppliers} />
    </div>
  );
}
