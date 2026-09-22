"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** From/to date-range filter (FR-010), composed via searchParams — same pattern as
 * components/performa-invoices/performa-invoice-list.tsx's PerformaInvoiceFilters. A plain
 * client-side param update, not a GET form, since there are only two fields and no dependent
 * per-PO fetch the way the "Add another PO" control has (research.md's server-round-trip
 * preference applies to data-dependent additions, not simple filter inputs). */
export function LedgerDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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
    <div className="mb-4 flex items-center gap-3 text-sm">
      <label className="flex items-center gap-1">
        From
        <input
          type="date"
          defaultValue={searchParams.get("from") ?? ""}
          onChange={(e) => updateParam("from", e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-1">
        To
        <input
          type="date"
          defaultValue={searchParams.get("to") ?? ""}
          onChange={(e) => updateParam("to", e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1"
        />
      </label>
      {isPending && <span className="text-xs text-zinc-500">Updating…</span>}
    </div>
  );
}
