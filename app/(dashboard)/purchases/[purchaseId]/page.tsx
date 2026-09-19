import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchase } from "@/lib/purchases/service";
import { DeletePurchaseControl } from "@/components/purchases/delete-purchase-control";

interface PurchaseDetailPageProps {
  params: Promise<{ purchaseId: string }>;
}

export default async function PurchaseDetailPage({ params }: PurchaseDetailPageProps) {
  const { purchaseId } = await params;
  const purchase = await getPurchase(purchaseId);
  if (!purchase) notFound();

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">{purchase.supplierName}</h1>
        {purchase.isLocked && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            In use
          </span>
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Purchase date</h2>
          <p className="text-sm text-zinc-900">{purchase.purchaseDate}</p>
        </section>

        {purchase.mode === "weight" ? (
          <>
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Weight purchased</h2>
              <p className="text-sm text-zinc-900">{purchase.weightKg!.toFixed(2)} kg</p>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Rate per kg</h2>
              <p className="text-sm text-zinc-900">Rs {purchase.ratePerKg!.toFixed(2)}</p>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Total cost</h2>
              <p className="text-sm text-zinc-900">Rs {purchase.totalCost.toFixed(2)}</p>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Remaining (unused) weight</h2>
              <p className="text-sm text-zinc-900">{purchase.remainingWeightKg!.toFixed(2)} kg</p>
            </section>
          </>
        ) : (
          <>
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Product</h2>
              <p className="text-sm text-zinc-900">{purchase.productName}</p>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Quantity purchased</h2>
              <p className="text-sm text-zinc-900">{purchase.quantityUnits!.toFixed(2)}</p>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Rate per unit</h2>
              <p className="text-sm text-zinc-900">Rs {purchase.ratePerUnit!.toFixed(2)}</p>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Total cost</h2>
              <p className="text-sm text-zinc-900">Rs {purchase.totalCost.toFixed(2)}</p>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Remaining (unused) quantity</h2>
              <p className="text-sm text-zinc-900">{purchase.remainingUnits!.toFixed(2)}</p>
            </section>
          </>
        )}

        {purchase.isLocked && (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This {purchase.mode === "weight" ? "lot" : "purchase"} has already been used
            {purchase.mode === "weight" ? " in production" : ""}, so it can no longer be edited or
            deleted.
          </p>
        )}

        <section className="border-t border-zinc-100 pt-3 text-xs text-zinc-400">
          Created {new Date(purchase.createdAt).toLocaleString()} · Last updated{" "}
          {new Date(purchase.updatedAt).toLocaleString()}
        </section>
      </div>

      {!purchase.isLocked && (
        <div className="flex items-center gap-3">
          <Link
            href={`/purchases/${purchase.id}/edit`}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Edit
          </Link>
          <DeletePurchaseControl purchaseId={purchase.id} />
        </div>
      )}
    </div>
  );
}
