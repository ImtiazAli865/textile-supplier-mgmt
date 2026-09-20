import { z } from "zod";

export const addressSchema = z.object({
  line1: z.string().trim().min(1, "Address line 1 is required"),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  country: z.string().trim().min(1, "Country is required"),
});

export const shipToAddressSchema = addressSchema.extend({
  label: z.string().trim().optional(),
});

export const contactSchema = z
  .object({
    name: z.string().trim().min(1, "Contact name is required"),
    phone: z.string().trim().optional(),
    email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
    role: z.string().trim().optional(),
  })
  .refine((contact) => Boolean(contact.phone) || Boolean(contact.email), {
    message: "Each contact needs a phone number or an email address",
    path: ["phone"],
  });

export const customerStatusSchema = z.enum(["active", "inactive"]);

export const openingBalanceSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  type: z.enum(["debit", "credit"]),
  asOfDate: z.string().trim().min(1, "As-of date is required"),
});

/** Shared between the create and edit forms — everything except the opening balance, which
 * only ever appears on create (FR-013: the edit form has no such field at all). */
const baseCustomerFields = {
  displayName: z.string().trim().min(1, "Display name is required"),
  legalName: z.string().trim().min(1, "Legal name is required"),
  billingAddress: addressSchema,
  telephone: z.string().trim().optional(),
  ntnNumber: z.string().trim().optional(),
  salesTaxRegistrationNumber: z.string().trim().optional(),
  issuesPerformaInvoice: z.boolean().default(false),
  // An expected range, not a single fixed number — see spec.md's Assumptions and
  // research.md's "payment terms are captured as an expected min/max day range" decision.
  paymentTermsMinDays: z.coerce.number().int().min(0, "Must be zero or greater").default(0),
  paymentTermsMaxDays: z.coerce.number().int().min(0, "Must be zero or greater").default(0),
  contacts: z.array(contactSchema).min(1, "At least one contact is required"),
  shipToAddresses: z.array(shipToAddressSchema).default([]),
  tradeNameHintIds: z.array(z.string().uuid()).default([]),
};

function checkPaymentTermsRange(
  data: { paymentTermsMinDays: number; paymentTermsMaxDays: number },
  ctx: z.RefinementCtx
) {
  if (data.paymentTermsMaxDays < data.paymentTermsMinDays) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Maximum days must be greater than or equal to minimum days",
      path: ["paymentTermsMaxDays"],
    });
  }
}

/** Shape submitted by the create form and accepted by createCustomer. */
export const customerInputSchema = z
  .object({
    ...baseCustomerFields,
    openingBalance: openingBalanceSchema.optional(),
  })
  .superRefine(checkPaymentTermsRange);

export type CustomerInput = z.infer<typeof customerInputSchema>;

/** Shape submitted by the edit form and accepted by updateCustomer — deliberately has no
 * openingBalance field at all (FR-013), so there is nothing to accidentally accept. */
export const customerUpdateInputSchema = z.object(baseCustomerFields).superRefine(checkPaymentTermsRange);

export type CustomerUpdateInput = z.infer<typeof customerUpdateInputSchema>;

export type Contact = z.infer<typeof contactSchema>;
export type Address = z.infer<typeof addressSchema>;
export type ShipToAddress = z.infer<typeof shipToAddressSchema>;
export type CustomerStatus = z.infer<typeof customerStatusSchema>;
export type OpeningBalance = z.infer<typeof openingBalanceSchema>;

export interface TradeNameHint {
  id: string;
  printedName: string;
}

export interface CustomerProductMapping {
  id: string;
  customerId: string;
  productId: string;
  productName: string;
  customerItemCode: string | null;
  sellingUom: string | null;
  defaultPrice: number | null;
  conversionFactor: number;
}

/** Full stored record, as returned to Server/Client Components (timestamps as ISO strings). */
export interface Customer {
  id: string;
  displayName: string;
  legalName: string;
  billingAddress: Address;
  telephone?: string;
  ntnNumber?: string;
  salesTaxRegistrationNumber?: string;
  issuesPerformaInvoice: boolean;
  paymentTermsMinDays: number;
  paymentTermsMaxDays: number;
  contacts: Contact[];
  shipToAddresses: ShipToAddress[];
  tradeNameHints: TradeNameHint[];
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** Fields shown in the customer list view. */
export type CustomerListItem = Pick<Customer, "id" | "displayName" | "status">;

/** Full detail view shape: the stored record plus its computed running ledger balance
 * (never stored or edited directly — FR-012) and its product mappings. */
export interface CustomerDetail extends Customer {
  ledgerBalance: number;
  productMappings: CustomerProductMapping[];
}

/** Shape submitted when adding a new customer-product mapping. At least one of
 * customerItemCode/sellingUom/defaultPrice is required (customer_product_mappings_has_value_check). */
export const productMappingInputSchema = z
  .object({
    customerId: z.string().uuid(),
    productId: z.string().uuid(),
    customerItemCode: z.string().trim().optional(),
    sellingUom: z.string().trim().optional(),
    defaultPrice: z.coerce.number().positive("Default price must be greater than zero").optional(),
    conversionFactor: z.coerce
      .number()
      .positive("Conversion factor must be greater than zero")
      .default(1),
  })
  .refine(
    (data) =>
      Boolean(data.customerItemCode) || Boolean(data.sellingUom) || data.defaultPrice !== undefined,
    {
      message: "At least one of item code, selling unit, or default price is required",
      path: ["customerItemCode"],
    }
  );

export type ProductMappingInput = z.infer<typeof productMappingInputSchema>;

/** Shape submitted when editing an existing mapping — customer/product themselves are
 * immutable once a mapping exists (contracts/server-actions.md: remove and re-add instead). */
export const productMappingUpdateInputSchema = z.object({
  customerItemCode: z.string().trim().optional(),
  sellingUom: z.string().trim().optional(),
  defaultPrice: z.coerce.number().positive("Default price must be greater than zero").optional(),
  conversionFactor: z.coerce.number().positive("Conversion factor must be greater than zero").optional(),
});

export type ProductMappingUpdateInput = z.infer<typeof productMappingUpdateInputSchema>;
