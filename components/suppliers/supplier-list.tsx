import Link from "next/link";
import type { SupplierListItem } from "@/lib/suppliers/schema";

export function SupplierList({ suppliers }: { suppliers: SupplierListItem[] }) {
  if (suppliers.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No suppliers match your search or filters.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
      {suppliers.map((supplier) => (
        <li key={supplier.id}>
          <Link
            href={`/suppliers/${supplier.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
          >
            <div>
              <p className="text-sm font-medium text-zinc-900">{supplier.companyName}</p>
              <p className="text-xs text-zinc-500">{supplier.materials.join(", ")}</p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                supplier.status === "active"
                  ? "bg-green-100 text-green-800"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {supplier.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
