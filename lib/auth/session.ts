import "server-only";
import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME, SESSION_EXPIRES_IN_MS } from "@/lib/auth/constants";

export { SESSION_COOKIE_NAME };

export async function createSessionCookie(idToken: string): Promise<string> {
  return getAdminAuth().createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN_MS });
}

export async function verifySessionCookie(sessionCookie: string): Promise<DecodedIdToken | null> {
  try {
    return await getAdminAuth().verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}

/**
 * Reads and verifies the session cookie for the current request. Server
 * Components/Actions use this to get the authenticated staff user; the
 * middleware performs the actual route-gating (see middleware.ts).
 */
export async function getCurrentUser(): Promise<DecodedIdToken | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  return verifySessionCookie(sessionCookie);
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "UnauthenticatedError";
  }
}

export async function requireCurrentUser(): Promise<DecodedIdToken> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}
