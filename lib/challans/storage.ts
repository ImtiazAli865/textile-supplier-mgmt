import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "challan-attachments";
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB — generous for a scanned signed copy
const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 5 * 60;

export class InvalidAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAttachmentError";
  }
}

/**
 * Uploads a Challan's scanned signed copy to a fresh, timestamped path — never overwriting an
 * existing object in place. Mirrors lib/trade-names/storage.ts's three-step ordering (ADR-0003):
 * the caller (service.ts) is responsible for pointing the Challan's signed_copy_* columns at the
 * new path and best-effort deleting the previous object afterward. Zero-or-one per Challan
 * (FR-006) — unlike 006's customer_po_attachments, this is a replace, not an append.
 */
export async function uploadChallanSignedCopy(
  challanId: string,
  file: File
): Promise<{ path: string }> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new InvalidAttachmentError("File must be 15 MB or smaller.");
  }

  const path = `${challanId}/${Date.now()}-${file.name}`;
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;

  return { path };
}

/** Best-effort delete — a failure here is logged, never surfaced as an error (matches
 * lib/trade-names/storage.ts). */
export async function deleteChallanSignedCopy(path: string): Promise<void> {
  const { error } = await getSupabaseAdmin().storage.from(BUCKET).remove([path]);
  if (error) {
    console.error(`Failed to delete stale Challan signed copy at ${path}:`, error);
  }
}

/**
 * Short-lived signed URL for a stored signed copy — never a public URL (ADR-0003). Generated
 * fresh at render/request time, not cached.
 */
export async function getSignedChallanCopyUrl(
  path: string,
  expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(path, expirySeconds);
  if (error) {
    console.error(`Failed to sign Challan signed copy URL for ${path}:`, error);
    return null;
  }
  return data.signedUrl;
}
