import { z } from "zod";

export const productTypeSchema = z.enum(["traded", "manufactured"]);
export type ProductType = z.infer<typeof productTypeSchema>;

export const productStatusSchema = z.enum(["active", "inactive"]);
export type ProductStatus = z.infer<typeof productStatusSchema>;

const baseProductFields = {
  name: z.string().trim().min(1, "Name is required"),
  internalCode: z.string().trim().optional(),
  stockUom: z.string().trim().min(1, "Stock unit of measure is required"),
  defaultSellingPrice: z.coerce
    .number()
    .positive("Default selling price must be greater than zero"),
};

const tradedProductInputSchema = z.object({
  ...baseProductFields,
  type: z.literal("traded"),
});

const manufacturedProductInputSchema = z.object({
  ...baseProductFields,
  type: z.literal("manufactured"),
  expectedYieldPerKg: z.coerce
    .number()
    .positive("Expected yield per kg must be greater than zero"),
  defaultLabourRatePerPacket: z.coerce
    .number()
    .positive("Default labour rate per packet must be greater than zero"),
});

/** Shape submitted by the create form and accepted by createProduct. Type is fixed here and
 * never accepted again on update (FR-004) — see productUpdateInputSchema. */
export const productInputSchema = z.discriminatedUnion("type", [
  tradedProductInputSchema,
  manufacturedProductInputSchema,
]);

export type ProductInput = z.infer<typeof productInputSchema>;

/** Shape submitted by the edit form and accepted by updateProduct. Deliberately has no `type`
 * field at all (FR-004) — the service layer validates the manufactured-only fields against the
 * *existing* record's type, since this schema alone can't know it. */
export const productUpdateInputSchema = z.object({
  ...baseProductFields,
  expectedYieldPerKg: z.coerce
    .number()
    .positive("Expected yield per kg must be greater than zero")
    .optional(),
  defaultLabourRatePerPacket: z.coerce
    .number()
    .positive("Default labour rate per packet must be greater than zero")
    .optional(),
});

export type ProductUpdateInput = z.infer<typeof productUpdateInputSchema>;

/** Full stored record, as returned to Server/Client Components. */
export interface Product {
  id: string;
  name: string;
  internalCode: string | null;
  type: ProductType;
  stockUom: string;
  defaultSellingPrice: number;
  expectedYieldPerKg: number | null;
  defaultLabourRatePerPacket: number | null;
  /** Weighted-average purchase cost — derived, read-only. Always null for manufactured
   * products; null for traded products until at least one per-unit purchase exists. */
  currentPurchaseCost: number | null;
  /** Derived, read-only. Maintained by traded-goods purchasing (003b) for traded products. */
  quantityOnHand: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** Fields shown in the product list view. */
export type ProductListItem = Pick<
  Product,
  "id" | "name" | "internalCode" | "type" | "stockUom" | "defaultSellingPrice" | "status"
>;

/** Full detail view shape — no joins needed, this table has no foreign keys. */
export type ProductDetail = Product;
