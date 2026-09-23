import { z } from "zod";
import { isNotAfterTodayInPakistan } from "@/lib/dates";

// "Not in the future" means not after Pakistan's calendar date (ADR-0009). The previous
// end-of-UTC-day comparison rejected today's date between 00:00 and 05:00 PKT.
const purchaseDateSchema = z
  .string()
  .trim()
  .min(1, "Purchase date is required")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid purchase date")
  .refine(isNotAfterTodayInPakistan, {
    message: "Purchase date cannot be in the future",
  });

const weightPurchaseInputSchema = z.object({
  mode: z.literal("weight"),
  supplierId: z.string().trim().min(1, "Supplier is required"),
  purchaseDate: purchaseDateSchema,
  weightKg: z.coerce.number().positive("Weight must be greater than zero"),
  ratePerKg: z.coerce.number().positive("Rate must be greater than zero"),
});

const unitPurchaseInputSchema = z.object({
  mode: z.literal("unit"),
  supplierId: z.string().trim().min(1, "Supplier is required"),
  productId: z.string().trim().min(1, "Product is required"),
  purchaseDate: purchaseDateSchema,
  quantityUnits: z.coerce.number().positive("Quantity must be greater than zero"),
  ratePerUnit: z.coerce.number().positive("Rate must be greater than zero"),
});

/** Shape submitted by the create/edit form and accepted by createPurchase/updatePurchase.
 * A discriminated union on `mode` — the mode of an existing purchase is never editable
 * (not exposed as a field in either branch), mirroring 003's product-type immutability. */
export const purchaseInputSchema = z.discriminatedUnion("mode", [
  weightPurchaseInputSchema,
  unitPurchaseInputSchema,
]);

export type PurchaseInput = z.infer<typeof purchaseInputSchema>;
export type PurchaseMode = PurchaseInput["mode"];

/** Full stored record, as returned to Server/Client Components (timestamps as ISO strings).
 * Weight-mode fields are null for a unit-mode row and vice versa, mirroring the nullable
 * columns in data-model.md. */
export interface Purchase {
  id: string;
  supplierId: string;
  purchaseDate: string;
  mode: PurchaseMode;
  weightKg: number | null;
  ratePerKg: number | null;
  remainingWeightKg: number | null;
  productId: string | null;
  quantityUnits: number | null;
  ratePerUnit: number | null;
  remainingUnits: number | null;
  totalCost: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** Fields shown in the purchase list view, with the supplier (and, for unit-mode, product)
 * name already joined in. */
export type PurchaseListItem = Pick<
  Purchase,
  | "id"
  | "supplierId"
  | "purchaseDate"
  | "mode"
  | "totalCost"
  | "weightKg"
  | "ratePerKg"
  | "productId"
  | "quantityUnits"
  | "ratePerUnit"
> & {
  supplierName: string;
  productName: string | null;
};

/** Full detail view shape: the stored record, joined supplier/product info, and the
 * derived lock state. */
export type PurchaseDetail = Purchase & {
  supplierName: string;
  supplierStatus: "active" | "inactive";
  productName: string | null;
  isLocked: boolean;
};

/** Mode-split running totals for the currently filtered purchase list (FR-009). `weight`/
 * `unit` are null (not zero) when the filtered set has no rows of that mode. */
export interface PurchaseTotals {
  weight: { totalKg: number; totalCost: number } | null;
  unit: { totalUnits: number; totalCost: number } | null;
  grandTotalCost: number;
}
