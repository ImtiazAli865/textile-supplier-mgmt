"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import { performaInvoiceInputSchema, type PerformaInvoiceInput } from "@/lib/performa-invoices/schema";
import {
  createPerformaInvoiceRecord,
  addPerformaInvoiceAttachmentRecord,
} from "@/lib/performa-invoices/service";
import { uploadPerformaInvoiceGstAttachment as uploadPerformaInvoiceGstAttachmentFile } from "@/lib/performa-invoices/storage";

export type { ActionResult };

export async function createPerformaInvoice(
  input: PerformaInvoiceInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = performaInvoiceInputSchema.parse(input);
    const { id } = await createPerformaInvoiceRecord(parsed, user.id);
    revalidatePath("/performa-invoices");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function uploadPerformaInvoiceGstAttachment(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult<{ id: string; fileName: string }>> {
  try {
    const user = await requireCurrentUser();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "No file was provided." };
    }
    const { path } = await uploadPerformaInvoiceGstAttachmentFile(invoiceId, file);
    const { id } = await addPerformaInvoiceAttachmentRecord(
      invoiceId,
      {
        storagePath: path,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      },
      user.id
    );
    revalidatePath(`/performa-invoices/${invoiceId}`);
    return { success: true, data: { id, fileName: file.name } };
  } catch (error) {
    return fail(error);
  }
}
