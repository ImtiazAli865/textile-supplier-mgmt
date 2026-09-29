import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: don't print Server Action arguments to the terminal. signIn(email, password)
  // would otherwise log the password in plain text (found during 011 QA, 2026-09-29).
  logging: { serverFunctions: false },
};

export default nextConfig;
