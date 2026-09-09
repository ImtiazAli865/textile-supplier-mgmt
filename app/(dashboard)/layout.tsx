import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { signOut } from "@/app/actions/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Real authorization boundary: verifies the session cookie's signature and
  // expiry via the Admin SDK. middleware.ts only checks the cookie is present.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <nav className="flex items-center gap-4">
          <Link href="/suppliers" className="text-sm font-semibold text-zinc-900">
            Supplier Directory
          </Link>
          <Link href="/suppliers/new" className="text-sm text-zinc-600 hover:text-zinc-900">
            Add Supplier
          </Link>
          <Link href="/purchases" className="text-sm text-zinc-600 hover:text-zinc-900">
            Raw Material Purchases
          </Link>
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut();
            redirect("/login");
          }}
        >
          <button type="submit" className="text-sm text-zinc-600 hover:text-zinc-900">
            Sign out
          </button>
        </form>
      </header>
      <main className="flex-1 bg-zinc-50 px-6 py-8">{children}</main>
    </div>
  );
}
