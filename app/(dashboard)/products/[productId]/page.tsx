import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, listProductStockMovements } from "@/lib/products/service";
import { listProductCustomerMappings } from "@/lib/customers/product-mappings";
import { ProductStatusControl } from "@/components/products/product-status-control";

interface ProductDetailPageProps {
  params: Promise<{ productId: string }>;
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { productId } = await params;
  const [product, customerMappings, stockMovements] = await Promise.all([
    getProduct(productId),
    listProductCustomerMappings(productId),
    listProductStockMovements(productId),
  ]);
  if (!product) notFound();

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">{product.name}</h1>
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

      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Type</h2>
          <p className="text-sm text-zinc-900">
            {product.type === "traded" ? "Traded" : "Manufactured"}
          </p>
        </section>

        {product.internalCode && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Internal code</h2>
            <p className="text-sm text-zinc-900">{product.internalCode}</p>
          </section>
        )}

        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Stock unit of measure</h2>
          <p className="text-sm text-zinc-900">{product.stockUom}</p>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Default selling price</h2>
          <p className="text-sm text-zinc-900">Rs {product.defaultSellingPrice.toFixed(2)}</p>
        </section>

        {product.type === "manufactured" ? (
          <>
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">
                Expected yield (packets/kg)
              </h2>
              <p className="text-sm text-zinc-900">{product.expectedYieldPerKg?.toFixed(2)}</p>
            </section>
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">
                Default labour rate per packet
              </h2>
              <p className="text-sm text-zinc-900">
                Rs {product.defaultLabourRatePerPacket?.toFixed(2)}
              </p>
            </section>
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Quantity on hand</h2>
              <p className="text-sm text-zinc-900">
                {product.quantityOnHand.toFixed(2)} {product.stockUom}
              </p>
            </section>
          </>
        ) : (
          <>
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">
                Current purchase cost (weighted average)
              </h2>
              <p className="text-sm text-zinc-900">
                {product.currentPurchaseCost !== null
                  ? `Rs ${product.currentPurchaseCost.toFixed(2)}`
                  : "Not yet established"}
              </p>
            </section>
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Quantity on hand</h2>
              <p className="text-sm text-zinc-900">
                {product.quantityOnHand.toFixed(2)} {product.stockUom}
              </p>
            </section>
          </>
        )}

        {customerMappings.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Mapped to customers</h2>
            <ul className="space-y-1 text-sm text-zinc-900">
              {customerMappings.map((mapping) => (
                <li key={mapping.id}>
                  <Link href={`/customers/${mapping.customerId}`} className="underline">
                    {mapping.customerDisplayName}
                  </Link>
                  {mapping.customerItemCode && ` · Item code: ${mapping.customerItemCode}`}
                  {mapping.sellingUom && ` · Selling unit: ${mapping.sellingUom}`}
                  {mapping.defaultPrice != null &&
                    ` · Default price: Rs ${mapping.defaultPrice.toFixed(2)} (pre-fill only)`}
                </li>
              ))}
            </ul>
          </section>
        )}

        {stockMovements.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Stock history</h2>
            <table className="w-full text-sm">
              <tbody>
                {stockMovements.map((movement) => (
                  <tr key={movement.id} className="border-b border-zinc-100">
                    <td className="py-1 pr-2 text-zinc-500">{movement.movementDate}</td>
                    <td className="py-1 pr-2 text-zinc-900">
                      {movement.reason}
                      {movement.sourceType === "production_batch" && movement.sourceId && (
                        <>
                          {" · "}
                          <Link
                            href={`/production-batches/${movement.sourceId}`}
                            className="underline"
                          >
                            View batch
                          </Link>
                        </>
                      )}
                    </td>
                    <td
                      className={`py-1 text-right font-medium ${
                        movement.qtyDelta < 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {movement.qtyDelta > 0 ? "+" : ""}
                      {movement.qtyDelta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="border-t border-zinc-100 pt-3 text-xs text-zinc-400">
          Created {new Date(product.createdAt).toLocaleString()} · Last updated{" "}
          {new Date(product.updatedAt).toLocaleString()}
        </section>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={`/products/${product.id}/edit`}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Edit
        </Link>
        <ProductStatusControl productId={product.id} status={product.status} />
      </div>
    </div>
  );
}
