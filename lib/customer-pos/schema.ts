import { z } from "zod";

export const customerPOStatusSchema = z.enum(["open", "cancelled"]);
export type CustomerPOStatus = z.infer<typeof customerPOStatusSchema>;

/** One PO line as submitted by the create form. */
export const poLineInputSchema = z.object({
  customerItemCode: z.string().trim().optional(),
  productId: z.string().uuid("Select a product for this line"),
  description: z.string().trim().optional(),
  quantityOrdered: z.coerce.number().positive("Quantity must be greater than zero"),
  uom: z.string().trim().min(1, "Unit of measure is required"),
  unitPrice: z.coerce.number().positive("Price must be greater than zero"),
});

export type PoLineInput = z.infer<typeof poLineInputSchema>;

/** Same shape, plus an existing line's id when editing (present = update that line,
 * absent = new line; an existing line's id left out of the whole array = delete attempt). */
export const poLineUpdateSchema = poLineInputSchema.extend({
  id: z.string().uuid().optional(),
});

export type PoLineUpdateInput = z.infer<typeof poLineUpdateSchema>;

const baseCustomerPOFields = {
  customerId: z.string().uuid("Select a customer"),
  // Storage capacity of at least 30 characters, no minimum length or format restriction
  // (FR-003) — accommodates both Habbitt's short PDF-style numbers and Chaseup's long
  // portal-style numbers.
  poNumber: z.string().trim().min(1, "PO number is required").max(30, "PO number is too long"),
  orderDate: z.string().trim().min(1, "Order date is required"),
  purchaserName: z.string().trim().optional(),
  requestedDeliveryDate: z.string().trim().optional(),
  destinationText: z.string().trim().optional(),
  // .or(z.literal("")) because the trade-name <select>'s "none selected" option submits ""
  // (not undefined) — the same pattern used for the optional contact-email field elsewhere in
  // this project (lib/customers/schema.ts, lib/suppliers/schema.ts). Without it, .optional()
  // alone rejects "" (it isn't a valid uuid), which silently blocked every submission that
  // left this field unselected — react-hook-form has no onInvalid handler wired, so it just
  // refocused the field with no visible error instead of calling the submit handler.
  tradeNameId: z.string().uuid().optional().or(z.literal("")),
};

/** Shape submitted by the create form and accepted by createCustomerPO. */
export const customerPOInputSchema = z.object({
  ...baseCustomerPOFields,
  lines: z.array(poLineInputSchema).min(1, "At least one line item is required"),
});

export type CustomerPOInput = z.infer<typeof customerPOInputSchema>;

/** Shape submitted by the edit form and accepted by updateCustomerPO. */
export const customerPOUpdateInputSchema = z.object({
  ...baseCustomerPOFields,
  lines: z.array(poLineUpdateSchema).min(1, "At least one line item is required"),
});

export type CustomerPOUpdateInput = z.infer<typeof customerPOUpdateInputSchema>;

/** Fields shown in the PO list view. */
export interface CustomerPOListItem {
  id: string;
  customerId: string;
  customerDisplayName: string;
  poNumber: string;
  orderDate: string;
  status: CustomerPOStatus;
  total: number;
}

/** A resolved PO line, as returned to Server/Client Components. */
export interface PoLineDetail {
  id: string;
  customerItemCode: string | null;
  productId: string;
  productName: string;
  description: string | null;
  quantityOrdered: number;
  uom: string;
  unitPrice: number;
  lineTotal: number;
  deliveredQuantity: number;
  invoicedQuantity: number;
}

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
  url: string | null;
}

/** Full PO record with resolved lines/attachments and a computed total (FR-011). */
export interface CustomerPODetail {
  id: string;
  customerId: string;
  customerDisplayName: string;
  poNumber: string;
  orderDate: string;
  purchaserName: string | null;
  requestedDeliveryDate: string | null;
  destinationText: string | null;
  tradeNameId: string | null;
  tradeNamePrintedName: string | null;
  status: CustomerPOStatus;
  lines: PoLineDetail[];
  attachments: Attachment[];
  total: number;
  createdAt: string;
  updatedAt: string;
}
