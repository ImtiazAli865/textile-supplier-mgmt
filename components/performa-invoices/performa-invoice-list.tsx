"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { PerformaInvoiceListItem } from "@/lib/performa-invoices/schema";

/** Customer/trade-name filters, composed via the same searchParams object (FR-012) — same
 * pattern as components/challans/challan-list.tsx's ChallanFilters. */
export function PerformaInvoiceFilters({
  customerOptions,
  tradeNameOptions,
}: {
  customerOptions: { id: string; displayName: string }[];
  tradeNameOptions: { id: string; printedName: string }[];
}) {
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
    <div className="mb-4 flex items-center gap-3">
      <select
        defaultValue={searchParams.get("customerId") ?? ""}
        onChange={(e) => updateParam("customerId", e.target.value)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      >
        <option value="">All customers</option>
        {customerOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.displayName}
          </option>
        ))}
      </select>
      <select
        defaultValue={searchParams.get("tradeNameId") ?? ""}
        onChange={(e) => updateParam("tradeNameId", e.target.value)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      >
        <option value="">All trade names</option>
        {tradeNameOptions.map((t) => (
          <option key={t.id} value={t.id}>
            {t.printedName}
          </option>
        ))}
      </select>
      {isPending && <span className="text-xs text-zinc-500">Updating…</span>}
    </div>
  );
}

export function PerformaInvoiceList({ invoices }: { invoices: PerformaInvoiceListItem[] }) {
  if (invoices.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No Performa Invoices match this filter.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
      {invoices.map((invoice) => (
        <li key={invoice.id}>
          <Link
            href={`/performa-invoices/${invoice.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
          >
            <div>
              <p className="text-sm font-medium text-zinc-900">Invoice #{invoice.invoiceNumber}</p>
              <p className="text-xs text-zinc-500">
                {invoice.customerDisplayName} · PO {invoice.poNumbers.join(", ") || "—"} ·{" "}
                {new Date(invoice.invoiceDate).toLocaleDateString()} · {invoice.tradeNamePrintedName}
              </p>
            </div>
            <span className="text-sm font-medium text-zinc-900">Rs {invoice.netTotal.toFixed(2)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
