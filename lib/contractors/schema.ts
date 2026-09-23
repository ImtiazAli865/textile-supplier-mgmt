import { z } from "zod";

export const contractorStatusSchema = z.enum(["active", "inactive"]);
export type ContractorStatus = z.infer<typeof contractorStatusSchema>;

/** Shape submitted by the create/edit form and accepted by createContractor/updateContractor.
 * Name uniqueness (case- and surrounding-space-insensitive, FR-001) is enforced by the
 * idx_contractors_name_unique index, not here. */
export const contractorInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  phone: z.string().trim().max(40, "Phone is too long").optional().or(z.literal("")),
});

export type ContractorInput = z.infer<typeof contractorInputSchema>;

/** Full stored record (feature 010; 011 extends the table with payments/rates). */
export interface Contractor {
  id: string;
  name: string;
  phone: string | null;
  status: ContractorStatus;
  createdAt: string;
  updatedAt: string;
}

export type ContractorListItem = Pick<Contractor, "id" | "name" | "phone" | "status">;
