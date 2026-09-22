import { z } from "zod";

export const customerPaymentStatusSchema = z.enum(["received", "cleared", "bounced"]);
export type CustomerPaymentStatus = z.infer<typeof customerPaymentStatusSchema>;

export const customerPaymentReferenceTypeSchema = z.enum(["customer_po", "performa_invoice"]);
export type CustomerPaymentReferenceType = z.infer<typeof customerPaymentReferenceTypeSchema>;

/** Shape submitted by the record-payment form and accepted by recordCustomerPayment.
 * referenceType/referenceId are both-or-neither (FR-005) — a friendlier, earlier echo of
 * record_customer_payment's own authoritative pairing CHECK (data-model.md). */
export const customerPaymentInputSchema = z
  .object({
    customerId: z.string().uuid("Select a customer"),
    paymentDate: z.string().trim().min(1, "Payment date is required"),
    amount: z.coerce.number().positive("Amount must be greater than zero"),
    chequeNumber: z.string().trim().min(1, "Cheque number is required"),
    bankName: z.string().trim().min(1, "Bank name is required"),
    referenceType: customerPaymentReferenceTypeSchema.optional(),
    referenceId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (Boolean(data.referenceType) !== Boolean(data.referenceId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select both a reference type and a specific document, or leave both blank.",
        path: ["referenceId"],
      });
    }
  });

export type CustomerPaymentInput = z.infer<typeof customerPaymentInputSchema>;

/** Shape submitted when marking a Received payment Cleared or Bounced (FR-007). No update-input
 * counterpart exists for a payment's other fields — they have no edit path at all (FR-008). */
export const updateCustomerPaymentStatusInputSchema = z.object({
  id: z.string().uuid(),
  newStatus: z.enum(["cleared", "bounced"]),
});

export type CustomerPaymentStatusUpdateInput = z.infer<typeof updateCustomerPaymentStatusInputSchema>;
