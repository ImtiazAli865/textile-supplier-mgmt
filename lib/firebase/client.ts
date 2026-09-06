import { initializeApp, getApps, type FirebaseOptions, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

let cachedApp: FirebaseApp | undefined;
let cachedAuth: Auth | undefined;

function getClientApp(): FirebaseApp {
  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return cachedApp;
}

/**
 * Lazy singleton: only evaluated when a component actually calls it (e.g. on
 * form submit), not at module load. This file is imported by the "use
 * client" login page, whose module code Next.js still executes in Node
 * during static prerendering — eagerly calling getAuth() there throws
 * auth/invalid-api-key whenever real Firebase env vars aren't configured yet.
 */
export function getClientAuth(): Auth {
  if (!cachedAuth) cachedAuth = getAuth(getClientApp());
  return cachedAuth;
}
