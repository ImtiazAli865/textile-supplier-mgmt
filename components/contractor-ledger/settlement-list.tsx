"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { reopenContractorSettlement } from "@/app/actions/contractor-ledger";
import { describeBalance, formatRs, type SettlementItem } from "@/lib/contractor-ledger/schema";

/** Reopen only the latest current settlement, with a required reason (FR-028). */
function ReopenControl({ settlementId }: { settlementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await reopenContractorSettlement({ settlementId, reason });
      if (result.success) {
        setOpen(false);
        setReason("");
        router.refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-zinc-600 underline hover:text-zinc-900">
        Reopen
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs text-amber-900">
        Reopening keeps this settlement on record, marked reopened, and unlocks its dates. You can
        settle the period again afterwards.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isSubmitting}
          className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {isSubmitting ? "Reopening…" : "Confirm reopen"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs text-zinc-600 underline"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Every settlement, current and reopened, with its frozen figures (FR-029). */
export function SettlementList({ contractorId, settlements }: { contractorId: string; settlements: SettlementItem[] }) {
  if (settlements.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
        No settlements yet.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 rounded border border-zinc-200 bg-white text-sm text-zinc-900">
      {settlements.map((settlement) => {
        const reopened = settlement.reopenedAt !== null;
        return (
          <li key={settlement.id} className={`px-4 py-3 ${reopened ? "bg-zinc-50 text-zinc-500" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-medium">
                  {settlement.periodStart} → {settlement.periodEnd}
                </span>
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                    reopened ? "bg-zinc-200 text-zinc-700" : "bg-green-100 text-green-800"
                  }`}
                >
                  {reopened ? "reopened" : "current"}
                </span>
              </div>
              <span className="inline-flex items-center gap-4">
                <Link
                  href={`/contractors/${contractorId}/settlements/${settlement.id}/print`}
                  target="_blank"
                  className="text-xs text-zinc-600 underline hover:text-zinc-900"
                >
                  Print statement
                </Link>
                {settlement.isLatestCurrent && <ReopenControl settlementId={settlement.id} />}
              </span>
            </div>
            <p className="mt-1 text-xs">
              Opening {describeBalance(settlement.openingBalance)} · Earned {formatRs(settlement.earned)} · Paid{" "}
              {formatRs(settlement.paid)} · Adjustments {formatRs(settlement.adjustments)} · Closing{" "}
              <span className="font-medium">{describeBalance(settlement.closingBalance)}</span>
            </p>
            {settlement.note && <p className="mt-1 text-xs">Note: {settlement.note}</p>}
            <p className="mt-1 text-xs text-zinc-400">
              Settled {new Date(settlement.settledAt).toLocaleString()} by {settlement.settledBy}
            </p>
            {reopened && (
              <p className="mt-1 text-xs">
                Reopened {new Date(settlement.reopenedAt as string).toLocaleString()} by {settlement.reopenedBy}:{" "}
                {settlement.reopenReason}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
