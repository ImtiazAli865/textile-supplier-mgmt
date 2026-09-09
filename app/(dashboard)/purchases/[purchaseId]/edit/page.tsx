import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchase, listActiveSuppliersForSelect } from "@/lib/purchases/service";
import { PurchaseForm } from "@/components/purchases/purchase-form";

interface EditPurchasePageProps {
  params: Promise<{ purchaseId: string }>;
}

export default async function EditPurchasePage({ params }: EditPurchasePageProps) {
  const { purchaseId } = await params;
  const [purchase, activeSuppliers] = await Promise.all([
    getPurchase(purchaseId),
    listActiveSuppliersForSelect(),
  ]);
  if (!purchase) notFound();

  // If the purchase's supplier was deactivated after this purchase was
  // recorded, it won't be in activeSuppliers — append it so the form still
  // shows the correct current selection (spec Edge Cases).
  const supplierOptions = activeSuppliers.some((s) => s.id === purchase.supplierId)
    ? activeSuppliers
    : [...activeSuppliers, { id: purchase.supplierId, companyName: purchase.supplierName }];

  if (purchase.isLocked) {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-lg font-semibold text-zinc-900">Edit Purchase</h1>
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This lot has already been used in production, so it can no longer be edited.
        </p>
        <Link href={`/purchases/${purchaseId}`} className="text-sm text-zinc-600 underline">
          Back to purchase details
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit Purchase</h1>
      <PurchaseForm
        mode="edit"
        purchaseId={purchase.id}
        activeSuppliers={supplierOptions}
        defaultValues={{
          supplierId: purchase.supplierId,
          purchaseDate: purchase.purchaseDate,
          weightKg: purchase.weightKg,
          ratePerKg: purchase.ratePerKg,
        }}
      />
    </div>
  );
}
