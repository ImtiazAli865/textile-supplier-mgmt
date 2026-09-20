"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { addProductMapping, updateProductMapping } from "@/app/actions/customers";
import type { CustomerProductMapping } from "@/lib/customers/schema";

interface ProductOption {
  id: string;
  name: string;
  stockUom: string;
}

type ProductMappingFormProps =
  | {
      mode: "create";
      customerId: string;
      productOptions: ProductOption[];
      mapping?: undefined;
      productId?: undefined;
      onDone: () => void;
    }
  | {
      mode: "edit";
      customerId: string;
      productOptions: ProductOption[];
      mapping: CustomerProductMapping;
      productId: string;
      onDone: () => void;
    };

export function ProductMappingForm(props: ProductMappingFormProps) {
  const { customerId, productOptions, onDone } = props;
  const router = useRouter();
  const [productId, setProductId] = useState(props.mode === "edit" ? props.productId : "");
  const [customerItemCode, setCustomerItemCode] = useState(props.mapping?.customerItemCode ?? "");
  const [sellingUom, setSellingUom] = useState(props.mapping?.sellingUom ?? "");
  const [defaultPrice, setDefaultPrice] = useState(
    props.mapping?.defaultPrice != null ? String(props.mapping.defaultPrice) : ""
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      const priceValue = defaultPrice.trim() !== "" ? Number(defaultPrice) : undefined;

      if (props.mode === "create") {
        const result = await addProductMapping({
          customerId,
          productId,
          customerItemCode: customerItemCode.trim() || undefined,
          sellingUom: sellingUom.trim() || undefined,
          defaultPrice: priceValue,
          conversionFactor: 1,
        });
        if (!result.success) {
          setFormError(result.error);
          return;
        }
      } else {
        const result = await updateProductMapping(props.mapping.id, customerId, props.productId, {
          customerItemCode: customerItemCode.trim() || undefined,
          sellingUom: sellingUom.trim() || undefined,
          defaultPrice: priceValue,
        });
        if (!result.success) {
          setFormError(result.error);
          return;
        }
      }
      router.refresh();
      onDone();
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedProduct = productOptions.find((p) => p.id === productId);

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-zinc-200 p-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Product</label>
        {props.mode === "create" ? (
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            <option value="">Select a product…</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.stockUom})
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-zinc-900">{selectedProduct?.name ?? props.mapping.productName}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Customer&apos;s item code</label>
          <input
            value={customerItemCode}
            onChange={(e) => setCustomerItemCode(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Selling unit</label>
          <input
            value={sellingUom}
            onChange={(e) => setSellingUom(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Default price (pre-fill only)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={defaultPrice}
            onChange={(e) => setDefaultPrice(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>
      </div>
      {formError && <p className="text-xs text-red-600">{formError}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {isSubmitting ? "Saving…" : props.mode === "create" ? "Add mapping" : "Save changes"}
        </button>
        <button type="button" onClick={onDone} className="text-xs text-zinc-500 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
