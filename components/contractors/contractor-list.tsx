"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { setContractorStatus } from "@/app/actions/contractors";
import type { ContractorListItem, ContractorStatus } from "@/lib/contractors/schema";

export function ContractorFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("status", value);
    else params.delete("status");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="mb-4 flex items-center gap-3">
      <select
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => updateStatus(e.target.value)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      {isPending && <span className="text-xs text-zinc-500">Updating…</span>}
    </div>
  );
}

function StatusToggle({ contractor }: { contractor: ContractorListItem }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target: ContractorStatus = contractor.status === "active" ? "inactive" : "active";
  const label = contractor.status === "active" ? "Deactivate" : "Reactivate";

  async function handleClick() {
    const confirmed = window.confirm(
      `${label} ${contractor.name}? ${
        target === "inactive"
          ? "They will no longer be offered for new batches; existing batches are unaffected."
          : "They will be offered for new batches again."
      }`
    );
    if (!confirmed) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await setContractorStatus(contractor.id, target);
      if (result.success) router.refresh();
      else setError(result.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isSubmitting}
        className="text-xs text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function ContractorList({ contractors }: { contractors: ContractorListItem[] }) {
  if (contractors.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No contractors match this filter.
      </div>
    );
  }

  return (
    <table className="w-full rounded border border-zinc-200 bg-white text-sm text-zinc-900">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
          <th className="px-4 py-2">Name</th>
          <th className="px-4 py-2">Phone</th>
          <th className="px-4 py-2">Status</th>
          <th className="px-4 py-2" />
        </tr>
      </thead>
      <tbody>
        {contractors.map((contractor) => (
          <tr key={contractor.id} className="border-b border-zinc-100">
            <td className="px-4 py-2 font-medium text-zinc-900">{contractor.name}</td>
            <td className="px-4 py-2 text-zinc-600">{contractor.phone ?? "—"}</td>
            <td className="px-4 py-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  contractor.status === "active"
                    ? "bg-green-100 text-green-800"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {contractor.status}
              </span>
            </td>
            <td className="px-4 py-2 text-right">
              <span className="inline-flex items-center gap-4">
                <Link
                  href={`/contractors/${contractor.id}/edit`}
                  className="text-xs text-zinc-600 underline hover:text-zinc-900"
                >
                  Edit
                </Link>
                <StatusToggle contractor={contractor} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
