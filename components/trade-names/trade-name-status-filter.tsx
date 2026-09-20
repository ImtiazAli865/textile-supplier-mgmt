"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function TradeNameStatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", value);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="mb-4 flex items-center gap-3">
      <select
        defaultValue={searchParams.get("status") ?? "active"}
        onChange={(e) => updateStatus(e.target.value)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      >
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      {isPending && <span className="text-xs text-zinc-500">Updating…</span>}
    </div>
  );
}
