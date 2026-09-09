"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

interface PurchaseFiltersProps {
  suppliers: { id: string; companyName: string }[];
}

export function PurchaseFilters({ suppliers }: PurchaseFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");

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
      <select
        defaultValue={searchParams.get("supplierId") ?? ""}
        onChange={(e) => updateParam("supplierId", e.target.value)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      >
        <option value="">All suppliers</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.companyName}
          </option>
        ))}
      </select>

      <input
        type="date"
        value={dateFrom}
        onChange={(e) => setDateFrom(e.target.value)}
        onBlur={() => updateParam("dateFrom", dateFrom)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      />
      <span className="text-sm text-zinc-500">to</span>
      <input
        type="date"
        value={dateTo}
        onChange={(e) => setDateTo(e.target.value)}
        onBlur={() => updateParam("dateTo", dateTo)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      />

      {isPending && <span className="text-xs text-zinc-500">Updating…</span>}
    </div>
  );
}
