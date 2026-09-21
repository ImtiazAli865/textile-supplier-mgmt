import { z } from "zod";

export const challanStatusSchema = z.enum(["issued", "accepted", "voided"]);
export type ChallanStatus = z.infer<typeof challanStatusSchema>;

export const shortfallDispositionSchema = z.enum(["return_to_inventory", "write_off"]);
export type ShortfallDisposition = z.infer<typeof shortfallDispositionSchema>;

/** One Challan line as submitted by the create form. */
export const challanLineInputSchema = z.object({
  poLineId: z.string().uuid("Select a PO line"),
  deliveredQuantity: z.coerce.number().positive("Delivered quantity must be greater than zero"),
});

export type ChallanLineInput = z.infer<typeof challanLineInputSchema>;

/** Same shape, plus the accepted quantity/disposition recorded once the signed copy is back
 * (FR-003, FR-007). The whole line set replaces the Challan's existing lines on update — there
 * is no per-line lock within an Issued Challan (research.md), unlike 006's PO lines. */
export const challanLineUpdateSchema = challanLineInputSchema
  .extend({
    acceptedQuantity: z.coerce.number().min(0, "Accepted quantity cannot be negative"),
    shortfallDisposition: shortfallDispositionSchema.optional().or(z.literal("")),
  })
  .refine((line) => line.acceptedQuantity <= line.deliveredQuantity, {
    message: "Accepted quantity cannot exceed delivered quantity",
    path: ["acceptedQuantity"],
  });

export type ChallanLineUpdateInput = z.infer<typeof challanLineUpdateSchema>;

/** Rejects a lines array referencing the same PO line more than once — matches the
 * DUPLICATE_PO_LINE guard create_challan/update_challan enforce authoritatively (a Challan-line
 * candidate is only ever a fixed 1:1 rendering of a PO's lines in this UI, so this should never
 * actually trigger in practice, but the RPC's own guard is the real defense; this is just an
 * earlier, friendlier message for any future caller that bypasses the form). */
function noDuplicatePoLines<L extends { poLineId: string }>(schema: z.ZodType<L[]>) {
  return schema.superRefine((lines, ctx) => {
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.poLineId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each PO line can appear at most once per Challan.",
        });
        return;
      }
      seen.add(line.poLineId);
    }
  });
}

/** Shape submitted by the create form and accepted by createChallan. challanNumber left blank
 * auto-generates from the trade name's counter (FR-004). */
export const challanInputSchema = z.object({
  poId: z.string().uuid("Select a PO"),
  tradeNameId: z.string().uuid("Select a trade name"),
  challanDate: z.string().trim().min(1, "Challan date is required"),
  challanNumber: z.string().trim().max(30, "Challan number is too long").optional(),
  lines: noDuplicatePoLines(z.array(challanLineInputSchema).min(1, "At least one line item is required")),
});

export type ChallanInput = z.infer<typeof challanInputSchema>;

/** Shape submitted by the edit form and accepted by updateChallan. No poId — a Challan's PO is
 * immutable once created (update_challan takes no p_po_id). challanNumber is always carried
 * forward (never re-generated on edit — only create_challan resolves the counter). */
export const challanUpdateInputSchema = z.object({
  tradeNameId: z.string().uuid("Select a trade name"),
  challanDate: z.string().trim().min(1, "Challan date is required"),
  challanNumber: z.string().trim().min(1, "Challan number is required").max(30, "Challan number is too long"),
  lines: noDuplicatePoLines(z.array(challanLineUpdateSchema).min(1, "At least one line item is required")),
});

export type ChallanUpdateInput = z.infer<typeof challanUpdateInputSchema>;

/** Fields shown in the Challan list view. */
export interface ChallanListItem {
  id: string;
  challanNumber: string;
  challanDate: string;
  status: ChallanStatus;
  poId: string;
  poNumber: string;
  customerId: string;
  customerDisplayName: string;
  tradeNamePrintedName: string;
}

/** A resolved Challan line, as returned to Server/Client Components. */
export interface ChallanLineDetail {
  id: string;
  poLineId: string;
  article: string | null;
  productName: string;
  uom: string;
  unitPrice: number;
  deliveredQuantity: number;
  acceptedQuantity: number;
  shortfallDisposition: ShortfallDisposition | null;
}

/** Full Challan record with resolved lines and a computed monetary total (the ledger-credit
 * basis, FR-012) — not the same as the printed document's quantity totals row. */
export interface ChallanDetail {
  id: string;
  poId: string;
  poNumber: string;
  customerId: string;
  customerDisplayName: string;
  customerLegalName: string;
  tradeNameId: string;
  tradeNamePrintedName: string;
  challanNumber: string;
  challanDate: string;
  status: ChallanStatus;
  lines: ChallanLineDetail[];
  total: number;
  signedCopyFileName: string | null;
  signedCopyUrl: string | null;
  ledgerCreditAmount: number | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
}

/** Shape rendered by the standalone print route — quantities only, no pricing, matching the
 * real Challan's printed columns (S.NO/Article/Item Name/UOM/QTY, spec FR-005). */
export interface ChallanPrintView {
  tradeNamePrintedName: string;
  tradeNamePrintedAddress: string;
  signatureImageUrl: string | null;
  stampImageUrl: string | null;
  challanNumber: string;
  challanDate: string;
  customerLegalName: string;
  poNumber: string;
  lines: {
    sNo: number;
    article: string | null;
    itemName: string;
    uom: string;
    quantity: number;
  }[];
  totalQuantity: number;
}
