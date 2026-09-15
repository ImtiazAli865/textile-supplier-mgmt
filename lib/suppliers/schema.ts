import { z } from "zod";

export const addressSchema = z.object({
  line1: z.string().trim().min(1, "Address line 1 is required"),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  country: z.string().trim().min(1, "Country is required"),
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

export const supplierStatusSchema = z.enum(["active", "inactive"]);

/** Shape submitted by the create/edit form and accepted by createSupplier/updateSupplier. */
export const supplierInputSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  address: addressSchema,
  materials: z
    .array(z.string().trim().min(1))
    .min(1, "At least one material/fabric type is required"),
  paymentTerms: z.string().trim().min(1, "Payment terms are required"),
  notes: z.string().trim().optional().default(""),
  rating: z.number().int().min(1).max(5).optional(),
  contacts: z.array(contactSchema).min(1, "At least one contact is required"),
});

export type SupplierInput = z.infer<typeof supplierInputSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Address = z.infer<typeof addressSchema>;
export type SupplierStatus = z.infer<typeof supplierStatusSchema>;

/** Full stored record, as returned to Server/Client Components (timestamps as ISO strings). */
export interface Supplier extends SupplierInput {
  id: string;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** Fields shown in the supplier list view. */
export type SupplierListItem = Pick<Supplier, "id" | "companyName" | "materials" | "status">;
