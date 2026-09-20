"use client";

import { useState, type FocusEvent } from "react";
import { useFormContext } from "react-hook-form";
import { resolveCustomerItemCode } from "@/app/actions/customer-pos";
import type { CustomerPOUpdateInput } from "@/lib/customer-pos/schema";

interface ProductOption {
  id: string;
  name: string;
  stockUom: string;
}

interface CustomerPoLineRowProps {
  index: number;
  productOptions: ProductOption[];
  locked?: boolean;
  onRemove?: () => void;
}

export function CustomerPoLineRow({
  index,
  productOptions,
  locked,
  onRemove,
}: CustomerPoLineRowProps) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<CustomerPOUpdateInput>();
  const [resolveNote, setResolveNote] = useState<string | null>(null);
  const customerId = watch("customerId");
  const quantity = watch(`lines.${index}.quantityOrdered`);
  const unitPrice = watch(`lines.${index}.unitPrice`);
  const lineErrors = errors.lines?.[index];

  // Auto-fills product/UOM/price from a 005 customer-product mapping when one matches
  // (FR-005); never re-run at save time (research.md) — the value on the field when
  // submitted is what's stored, whatever its origin (FR-006). Skipped on a locked line:
  // the item code text itself may still be corrected (FR-014), but auto-resolving it could
  // try to change the locked product/UOM/price, which the backend would reject anyway.
  async function handleItemCodeBlur(event: FocusEvent<HTMLInputElement>) {
    const code = event.target.value.trim();
    if (!code || !customerId || locked) return;
    const result = await resolveCustomerItemCode(customerId, code);
    if (result.success && result.data) {
      setValue(`lines.${index}.productId`, result.data.productId, { shouldValidate: true });
      if (result.data.sellingUom) setValue(`lines.${index}.uom`, result.data.sellingUom);
      if (result.data.defaultPrice != null) {
        setValue(`lines.${index}.unitPrice`, result.data.defaultPrice);
      }
      setResolveNote(`Resolved to ${result.data.productName}`);
    } else {
      setResolveNote("No mapping found for this code — pick the product manually.");
    }
  }

  const lineTotal = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  return (
    <div
      className={`grid grid-cols-6 gap-2 rounded border p-3 ${
        locked ? "border-zinc-200 bg-zinc-50" : "border-zinc-200"
      }`}
    >
      <div className="col-span-2">
        <label className="mb-1 block text-xs text-zinc-500">
          Customer&apos;s item code (optional)
        </label>
        <input
          {...register(`lines.${index}.customerItemCode` as const)}
          onBlur={handleItemCodeBlur}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
        />
        {resolveNote && <p className="mt-1 text-xs text-zinc-500">{resolveNote}</p>}
      </div>
      <div className="col-span-2">
        <label className="mb-1 block text-xs text-zinc-500">Product</label>
        <select
          {...register(`lines.${index}.productId` as const)}
          disabled={locked}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
        >
          <option value="">Select a product…</option>
          {productOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.stockUom})
            </option>
          ))}
        </select>
        {lineErrors?.productId && (
          <p className="mt-1 text-xs text-red-600">{lineErrors.productId.message}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Quantity</label>
        <input
          type="number"
          min={0}
          step="0.01"
          {...register(`lines.${index}.quantityOrdered` as const, { valueAsNumber: true })}
          disabled={locked}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
        />
        {lineErrors?.quantityOrdered && (
          <p className="mt-1 text-xs text-red-600">{lineErrors.quantityOrdered.message}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">UOM</label>
        <input
          {...register(`lines.${index}.uom` as const)}
          disabled={locked}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
        />
        {lineErrors?.uom && <p className="mt-1 text-xs text-red-600">{lineErrors.uom.message}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Unit price</label>
        <input
          type="number"
          min={0}
          step="0.01"
          {...register(`lines.${index}.unitPrice` as const, { valueAsNumber: true })}
          disabled={locked}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
        />
        {lineErrors?.unitPrice && (
          <p className="mt-1 text-xs text-red-600">{lineErrors.unitPrice.message}</p>
        )}
      </div>
      <div className="col-span-4">
        <label className="mb-1 block text-xs text-zinc-500">Description (optional)</label>
        <input
          {...register(`lines.${index}.description` as const)}
          placeholder="Stored and shown exactly as entered"
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="col-span-2 flex items-end justify-between gap-2">
        <span className="text-xs text-zinc-500">Line total: Rs {lineTotal.toFixed(2)}</span>
        {locked ? (
          <span className="text-xs text-zinc-400">
            Qty/UOM/price/product locked — item code and description can still be edited
          </span>
        ) : (
          onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-600 hover:underline"
            >
              Remove line
            </button>
          )
        )}
      </div>
    </div>
  );
}
