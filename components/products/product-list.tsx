import Link from "next/link";
import type { ProductListItem } from "@/lib/products/schema";

export function ProductList({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No products match your search or filters.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
      {products.map((product) => (
        <li key={product.id}>
          <Link
            href={`/products/${product.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
          >
            <div>
              <p className="text-sm font-medium text-zinc-900">{product.name}</p>
              <p className="text-xs text-zinc-500">
                {product.type === "traded" ? "Traded" : "Manufactured"} ·{" "}
                {product.stockUom}
                {product.internalCode ? ` · ${product.internalCode}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-zinc-900">
                Rs {product.defaultSellingPrice.toFixed(2)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  product.status === "active"
                    ? "bg-green-100 text-green-800"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {product.status}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
