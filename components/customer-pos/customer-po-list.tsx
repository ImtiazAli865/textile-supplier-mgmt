"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { CustomerPOListItem } from "@/lib/customer-pos/schema";

interface CustomerOption {
  id: string;
  displayName: string;
}

/** Status (open/cancelled, default "open") and customer filters, composed via the same
 * searchParams object (FR-012) — same pattern as customers' CustomerStatusFilter. */
export function CustomerPoFilters({ customerOptions }: { customerOptions: CustomerOption[] }) {
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
        defaultValue={searchParams.get("status") ?? "open"}
        onChange={(e) => updateParam("status", e.target.value)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      >
        <option value="open">Open</option>
        <option value="cancelled">Cancelled</option>
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

export function CustomerPoList({ pos }: { pos: CustomerPOListItem[] }) {
  if (pos.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No purchase orders match this filter.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
      {pos.map((po) => (
        <li key={po.id}>
          <Link
            href={`/customer-pos/${po.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
          >
            <div>
              <p className="text-sm font-medium text-zinc-900">{po.poNumber}</p>
              <p className="text-xs text-zinc-500">
                {po.customerDisplayName} · {new Date(po.orderDate).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-700">Rs {po.total.toFixed(2)}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  po.status === "open" ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {po.status}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
