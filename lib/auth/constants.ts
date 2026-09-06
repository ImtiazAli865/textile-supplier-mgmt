// Kept dependency-free (no firebase-admin import) so middleware.ts — which
// runs in the Edge runtime and cannot bundle firebase-admin — can safely
// import just the cookie name without pulling in the Admin SDK.
export const SESSION_COOKIE_NAME = "session";
export const SESSION_EXPIRES_IN_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
