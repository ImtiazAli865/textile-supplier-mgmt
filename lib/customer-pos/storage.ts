import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "customer-po-documents";
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB — generous for a scanned PO PDF
const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 5 * 60;

export class InvalidAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAttachmentError";
  }
}

/**
 * Uploads a PO attachment to a fresh, timestamped path. Mirrors
 * lib/trade-names/storage.ts exactly (ADR-0003) — a second private bucket, service-role-only
 * uploads, short-lived signed URLs for reads. Called only after the PO itself already exists
 * (research.md) — never bundled into create_customer_po/update_customer_po.
 */
export async function uploadCustomerPOAttachment(
  poId: string,
  file: File
): Promise<{ path: string }> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new InvalidAttachmentError("File must be 15 MB or smaller.");
  }

  const path = `${poId}/${Date.now()}-${file.name}`;
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;

  return { path };
}

/**
 * Short-lived signed URL for a stored attachment — never a public URL (ADR-0003). Generated
 * fresh at render/request time, not cached.
 */
export async function getSignedAttachmentUrl(
  path: string,
  expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(path, expirySeconds);
  if (error) {
    console.error(`Failed to sign customer PO attachment URL for ${path}:`, error);
    return null;
  }
  return data.signedUrl;
}
