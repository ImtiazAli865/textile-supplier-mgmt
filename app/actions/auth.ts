"use server";

import { cookies } from "next/headers";
import { createSessionCookie } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME, SESSION_EXPIRES_IN_MS } from "@/lib/auth/constants";

export async function createSession(idToken: string): Promise<void> {
  const sessionCookie = await createSessionCookie(idToken);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRES_IN_MS / 1000,
  });
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
