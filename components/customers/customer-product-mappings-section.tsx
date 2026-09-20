"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeProductMapping } from "@/app/actions/customers";
import { ProductMappingForm } from "@/components/customers/product-mapping-form";
import type { CustomerProductMapping } from "@/lib/customers/schema";

interface ProductOption {
  id: string;
  name: string;
  stockUom: string;
}

export function CustomerProductMappingsSection({
  customerId,
  mappings,
  productOptions,
}: {
  customerId: string;
  mappings: CustomerProductMapping[];
  productOptions: ProductOption[];
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(mapping: CustomerProductMapping) {
    const confirmed = window.confirm(
      `Remove the mapping for "${mapping.productName}"? This does not affect any past PO.`
    );
    if (!confirmed) return;
    setRemovingId(mapping.id);
    try {
      await removeProductMapping(mapping.id, customerId, mapping.productId);
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-500">Product mappings</h2>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="text-xs text-zinc-600 underline hover:text-zinc-900"
          >
            + Add mapping
          </button>
        )}
      </div>

      {isAdding && (
        <div className="mb-3">
          <ProductMappingForm
            mode="create"
            customerId={customerId}
            productOptions={productOptions}
            onDone={() => setIsAdding(false)}
          />
        </div>
      )}

      {mappings.length === 0 ? (
        <p className="text-sm text-zinc-500">No product mappings yet.</p>
      ) : (
        <ul className="space-y-2">
          {mappings.map((mapping) =>
            editingId === mapping.id ? (
              <li key={mapping.id}>
                <ProductMappingForm
                  mode="edit"
                  customerId={customerId}
                  productId={mapping.productId}
                  mapping={mapping}
                  productOptions={productOptions}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={mapping.id}
                className="flex items-center justify-between rounded border border-zinc-200 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-zinc-900">{mapping.productName}</p>
                  <p className="text-xs text-zinc-500">
                    {mapping.customerItemCode && `Item code: ${mapping.customerItemCode}`}
                    {mapping.customerItemCode && mapping.sellingUom && " · "}
                    {mapping.sellingUom && `Selling unit: ${mapping.sellingUom}`}
                    {(mapping.customerItemCode || mapping.sellingUom) && mapping.defaultPrice != null && " · "}
                    {mapping.defaultPrice != null && `Default price: Rs ${mapping.defaultPrice.toFixed(2)} (pre-fill only)`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(mapping.id)}
                    className="text-xs text-zinc-600 underline hover:text-zinc-900"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(mapping)}
                    disabled={removingId === mapping.id}
                    className="text-xs text-red-600 underline hover:text-red-800 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </section>
  );
}
