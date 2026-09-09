import { z } from "zod";

function endOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
}

/** Shape submitted by the create/edit form and accepted by createPurchase/updatePurchase. */
export const purchaseInputSchema = z.object({
  supplierId: z.string().trim().min(1, "Supplier is required"),
  purchaseDate: z
    .string()
    .trim()
    .min(1, "Purchase date is required")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid purchase date")
    .refine((value) => new Date(value).getTime() <= endOfTodayUtc().getTime(), {
      message: "Purchase date cannot be in the future",
    }),
  weightKg: z.coerce.number().positive("Weight must be greater than zero"),
  ratePerKg: z.coerce.number().positive("Rate must be greater than zero"),
});

export type PurchaseInput = z.infer<typeof purchaseInputSchema>;

/** Full stored record, as returned to Server/Client Components (timestamps as ISO strings). */
export interface Purchase {
  id: string;
  supplierId: string;
  purchaseDate: string;
  weightKg: number;
  ratePerKg: number;
  totalCost: number;
  remainingWeightKg: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** Fields shown in the purchase list view, with the supplier name already joined in. */
export type PurchaseListItem = Pick<
  Purchase,
  "id" | "supplierId" | "purchaseDate" | "weightKg" | "ratePerKg" | "totalCost"
> & {
  supplierName: string;
};

/** Full detail view shape: the stored record, joined supplier info, and the derived lock state. */
export type PurchaseDetail = Purchase & {
  supplierName: string;
  supplierStatus: "active" | "inactive";
  isLocked: boolean;
};
