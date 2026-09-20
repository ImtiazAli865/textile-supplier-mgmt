import { z } from "zod";

export const tradeNameStatusSchema = z.enum(["active", "inactive"]);

/** Shape submitted by the create/edit form and accepted by createTradeName/updateTradeName. */
export const tradeNameInputSchema = z.object({
  printedName: z.string().trim().min(1, "Printed name is required"),
  printedAddress: z.string().trim().min(1, "Printed address is required"),
  ntnNumber: z.string().trim().optional(),
  salesTaxRegistrationNumber: z.string().trim().optional(),
  nextChallanNumber: z.number().int().positive("Must be a positive number").default(1),
  nextInvoiceNumber: z.number().int().positive("Must be a positive number").default(1),
});

export type TradeNameInput = z.infer<typeof tradeNameInputSchema>;
export type TradeNameStatus = z.infer<typeof tradeNameStatusSchema>;

/** Full stored record, as returned to Server/Client Components (timestamps as ISO strings). */
export interface TradeName extends TradeNameInput {
  id: string;
  status: TradeNameStatus;
  signatureImagePath: string | null;
  stampImagePath: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** Fields shown in the trade name list view. */
export type TradeNameListItem = Pick<TradeName, "id" | "printedName" | "status">;

/**
 * Full detail view shape: the stored record plus short-lived signed URLs for
 * whichever images exist (null until User Story 2 uploads one, or if a signed
 * URL couldn't be generated). Never a stored/public URL — see ADR-0003.
 */
export interface TradeNameDetail extends TradeName {
  signatureImageUrl: string | null;
  stampImageUrl: string | null;
}
