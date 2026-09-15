import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only client authenticated with the Supabase secret (service role)
 * key. This bypasses Row Level Security entirely, the same trust boundary
 * the old firebase-admin SDK provided over Firestore — all suppliers/purchases
 * data access goes through this client, never through a browser-exposed key.
 *
 * Lazy singleton: only evaluated on first use, not at module load, so `next
 * build`'s page-data collection doesn't crash before real env vars exist.
 */
let cachedClient: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing Supabase Admin credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY."
    );
  }

  cachedClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedClient;
}
