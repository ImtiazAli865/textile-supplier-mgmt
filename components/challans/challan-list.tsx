"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { ChallanListItem } from "@/lib/challans/schema";

const STATUS_STYLES: Record<string, string> = {
  issued: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  voided: "bg-zinc-100 text-zinc-600",
};

/** Status/customer filters, composed via the same searchParams object (FR-016) — same pattern
 * as customer-pos's CustomerPoFilters. */
export function ChallanFilters({
  customerOptions,
}: {
  customerOptions: { id: string; displayName: string }[];
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
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => updateParam("status", e.target.value)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      >
        <option value="">All statuses</option>
        <option value="issued">Issued</option>
        <option value="accepted">Accepted</option>
        <option value="voided">Voided</option>
      </select>
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
      {isPending && <span className="text-xs text-zinc-500">Updating…</span>}
    </div>
  );
}

export function ChallanList({ challans }: { challans: ChallanListItem[] }) {
  if (challans.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No Challans match this filter.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
      {challans.map((challan) => (
        <li key={challan.id}>
          <Link
            href={`/challans/${challan.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
          >
            <div>
              <p className="text-sm font-medium text-zinc-900">{challan.challanNumber}</p>
              <p className="text-xs text-zinc-500">
                {challan.customerDisplayName} · PO {challan.poNumber} ·{" "}
                {new Date(challan.challanDate).toLocaleDateString()} · {challan.tradeNamePrintedName}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                STATUS_STYLES[challan.status] ?? "bg-zinc-100 text-zinc-600"
              }`}
            >
              {challan.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
