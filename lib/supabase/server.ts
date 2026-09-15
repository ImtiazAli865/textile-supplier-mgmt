import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cookie-bound Supabase client for auth only (sign in/out, getUser). Uses the
 * publishable (anon) key — safe by design, since RLS denies all access with
 * it; data reads/writes always go through lib/supabase/admin.ts instead.
 *
 * Must be created fresh per request (it captures the current cookies()
 * store), unlike the admin client which is a true singleton.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component render — middleware refreshes the
          // session on the next request, so a failed write here is harmless.
        }
      },
    },
  });
}
