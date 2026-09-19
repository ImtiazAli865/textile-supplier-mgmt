"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function ProductFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onBlur={() => updateParam("search", search)}
        onKeyDown={(e) => {
          if (e.key === "Enter") updateParam("search", search);
        }}
        placeholder="Search by name or internal code…"
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      />

      <select
        defaultValue={searchParams.get("type") ?? ""}
        onChange={(e) => updateParam("type", e.target.value)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      >
        <option value="">All types</option>
        <option value="traded">Traded</option>
        <option value="manufactured">Manufactured</option>
      </select>

      <select
        defaultValue={searchParams.get("status") ?? "active"}
        onChange={(e) => updateParam("status", e.target.value)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      >
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>

      {isPending && <span className="text-xs text-zinc-500">Updating…</span>}
    </div>
  );
}
