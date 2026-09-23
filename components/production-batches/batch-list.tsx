"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { BatchListResult } from "@/lib/production-batches/schema";

const STATUS_STYLES: Record<string, string> = {
  issued: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  voided: "bg-zinc-100 text-zinc-600",
};

function rs(value: number): string {
  return `Rs ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function kg(value: number): string {
  return `${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

/** Status / contractor / product / issue-date range / batch-number filters, composed via
 * searchParams (FR-021) — same pattern as ChallanFilters. */
export function BatchFilters({
  contractorOptions,
  productOptions,
}: {
  contractorOptions: { id: string; name: string }[];
  productOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  const selectClass = "rounded border border-zinc-300 px-3 py-1.5 text-sm";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <select
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => updateParam("status", e.target.value)}
        className={selectClass}
      >
        <option value="">All statuses</option>
        <option value="issued">Issued (with contractor)</option>
        <option value="completed">Completed</option>
        <option value="voided">Voided</option>
      </select>
      <select
        defaultValue={searchParams.get("contractorId") ?? ""}
        onChange={(e) => updateParam("contractorId", e.target.value)}
        className={selectClass}
      >
        <option value="">All contractors</option>
        {contractorOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        defaultValue={searchParams.get("productId") ?? ""}
        onChange={(e) => updateParam("productId", e.target.value)}
        className={selectClass}
      >
        <option value="">All products</option>
        {productOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs text-zinc-500">
        Issued from
        <input
          type="date"
          defaultValue={searchParams.get("from") ?? ""}
          onChange={(e) => updateParam("from", e.target.value)}
          className={selectClass}
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-zinc-500">
        to
        <input
          type="date"
          defaultValue={searchParams.get("to") ?? ""}
          onChange={(e) => updateParam("to", e.target.value)}
          className={selectClass}
        />
      </label>
      <input
        type="search"
        placeholder="Batch number…"
        defaultValue={searchParams.get("q") ?? ""}
        onKeyDown={(e) => {
          if (e.key === "Enter") updateParam("q", e.currentTarget.value.trim());
        }}
        onBlur={(e) => updateParam("q", e.currentTarget.value.trim())}
        className={selectClass}
      />
      {isPending && <span className="text-xs text-zinc-500">Updating…</span>}
    </div>
  );
}

/** Batch table; Issued rows show fabric value and days outstanding, with kg / Rs totals across
 * the filtered Issued batches — the work-in-progress view (FR-022, SC-005). */
export function BatchList({ result }: { result: BatchListResult }) {
  const { items, issuedTotals } = result;
  const issuedCount = items.filter((item) => item.status === "issued").length;

  if (items.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No batches match this filter.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
            <th className="px-3 py-2">Batch</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Contractor</th>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2 text-right">Weight issued</th>
            <th className="px-3 py-2 text-right">Fabric value</th>
            <th className="px-3 py-2">Issued</th>
            <th className="px-3 py-2 text-right">Days out</th>
            <th className="px-3 py-2 text-right">Packets</th>
            <th className="px-3 py-2 text-right">Avg / packet</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="px-3 py-2 font-medium">
                <Link href={`/production-batches/${item.id}`} className="underline">
                  {item.batchNumber}
                </Link>
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLES[item.status] ?? "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {item.status}
                </span>
              </td>
              <td className="px-3 py-2">{item.contractorName}</td>
              <td className="px-3 py-2">{item.productName}</td>
              <td className="px-3 py-2 text-right">{kg(item.weightIssuedKg)}</td>
              <td className="px-3 py-2 text-right">{rs(item.fabricValue)}</td>
              <td className="px-3 py-2">{item.issueDate}</td>
              <td className="px-3 py-2 text-right">{item.daysOutstanding ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                {item.packetsProduced !== null ? item.packetsProduced.toLocaleString() : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {item.avgCostPerPacket !== null ? rs(item.avgCostPerPacket) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        {issuedCount > 0 && (
          <tfoot>
            <tr className="bg-blue-50 text-xs font-medium text-blue-900">
              <td className="px-3 py-2" colSpan={4}>
                With contractors now ({issuedCount} issued batch{issuedCount === 1 ? "" : "es"})
              </td>
              <td className="px-3 py-2 text-right">{kg(issuedTotals.weightKg)}</td>
              <td className="px-3 py-2 text-right">{rs(issuedTotals.valueRs)}</td>
              <td className="px-3 py-2" colSpan={4} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
