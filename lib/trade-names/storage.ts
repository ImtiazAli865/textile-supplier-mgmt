import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "trade-name-assets";
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (FR-009)
const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 5 * 60;

export class InvalidAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAssetError";
  }
}

export type TradeNameAssetKind = "signature" | "stamp";

/**
 * Uploads a signature/stamp image to a fresh, timestamped path — never
 * overwriting an existing object in place. The caller (service.ts) is
 * responsible for pointing the trade name's row at the new path and cleaning
 * up the old object afterward (see research.md's three-step ordering).
 */
export async function uploadTradeNameAsset(
  tradeNameId: string,
  kind: TradeNameAssetKind,
  file: File
): Promise<{ path: string }> {
  const extension = ALLOWED_CONTENT_TYPES[file.type];
  if (!extension) {
    throw new InvalidAssetError("Only PNG or JPEG images are accepted.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new InvalidAssetError("Image must be 5 MB or smaller.");
  }

  const path = `${tradeNameId}/${kind}-${Date.now()}.${extension}`;
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;

  return { path };
}

/** Best-effort delete — a failure here is logged, never surfaced as an error (research.md). */
export async function deleteTradeNameAsset(path: string): Promise<void> {
  const { error } = await getSupabaseAdmin().storage.from(BUCKET).remove([path]);
  if (error) {
    console.error(`Failed to delete stale trade name asset at ${path}:`, error);
  }
}

/**
 * Short-lived signed URL for a stored asset — never a public URL (FR-010,
 * ADR-0003). Generated fresh at render/request time, not cached.
 */
export async function getSignedAssetUrl(
  path: string,
  expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(path, expirySeconds);
  if (error) {
    console.error(`Failed to sign trade name asset URL for ${path}:`, error);
    return null;
  }
  return data.signedUrl;
}
