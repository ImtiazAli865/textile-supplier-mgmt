import Link from "next/link";
import type { PurchaseListItem } from "@/lib/purchases/schema";

interface PurchaseListProps {
  purchases: PurchaseListItem[];
  totals: { totalKg: number; totalCost: number };
}

export function PurchaseList({ purchases, totals }: PurchaseListProps) {
  return (
    <div className="space-y-3">
      <div className="rounded border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-700">
        Total weight: <span className="font-semibold">{totals.totalKg.toFixed(2)} kg</span>
        {" · "}
        Total cost: <span className="font-semibold">Rs {totals.totalCost.toFixed(2)}</span>
      </div>

      {purchases.length === 0 ? (
        <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          No purchases match your filters.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
          {purchases.map((purchase) => (
            <li key={purchase.id}>
              <Link
                href={`/purchases/${purchase.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{purchase.supplierName}</p>
                  <p className="text-xs text-zinc-500">
                    {purchase.purchaseDate} · {purchase.weightKg.toFixed(2)} kg @ Rs{" "}
                    {purchase.ratePerKg.toFixed(2)}/kg
                  </p>
                </div>
                <span className="text-sm font-semibold text-zinc-900">
                  Rs {purchase.totalCost.toFixed(2)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
