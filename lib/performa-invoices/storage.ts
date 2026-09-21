import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "performa-invoice-attachments";
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB — generous for a scanned GST invoice PDF
const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 5 * 60;

export class InvalidAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAttachmentError";
  }
}

/**
 * Uploads a GST Sales Tax Invoice PDF to a fresh, timestamped path. Mirrors
 * lib/customer-pos/storage.ts exactly (ADR-0003) — an append-only, zero-to-many relationship
 * (contrast with lib/challans/storage.ts's zero-or-one replace shape), so this never deletes a
 * previous object. The caller (service.ts's addPerformaInvoiceAttachmentRecord, via the
 * uploadPerformaInvoiceGstAttachment Server Action) is responsible for inserting the
 * performa_invoice_attachments row that points at the returned path.
 */
export async function uploadPerformaInvoiceGstAttachment(
  invoiceId: string,
  file: File
): Promise<{ path: string }> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new InvalidAttachmentError("File must be 15 MB or smaller.");
  }

  const path = `${invoiceId}/${Date.now()}-${file.name}`;
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;

  return { path };
}

/**
 * Short-lived signed URL for a stored GST invoice attachment — never a public URL (ADR-0003).
 * Generated fresh at render/request time, not cached.
 */
export async function getSignedPerformaInvoiceAttachmentUrl(
  path: string,
  expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(path, expirySeconds);
  if (error) {
    console.error(`Failed to sign Performa Invoice attachment URL for ${path}:`, error);
    return null;
  }
  return data.signedUrl;
}
