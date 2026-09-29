"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { settleContractorPeriod } from "@/app/actions/contractor-ledger";
import {
  SETTLEMENT_BALANCE_NOT_ZERO_PREFIX,
  describeBalance,
  formatRs,
  todayInPakistan,
  type SettlementPreview,
} from "@/lib/contractor-ledger/schema";

interface SettleFormProps {
  contractorId: string;
  contractorName: string;
  periodEnd: string;
  preview: Extract<SettlementPreview, { canSettle: true }> | null;
  /** Why the chosen end date can't be settled, when it can't. */
  problem: string | null;
  periodStart: string;
}

/**
 * Settle a period (US5). The preview is computed on the server for the chosen end date (changing
 * the date reloads it); the stored figures always come from settle_contractor_period. A non-zero
 * closing balance needs a second, explicit "Settle anyway" (FR-026).
 */
export function SettleForm({ contractorId, contractorName, periodEnd, preview, problem, periodStart }: SettleFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [nonZeroWarning, setNonZeroWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function changeEnd(value: string) {
    setFormError(null);
    setNonZeroWarning(null);
    startTransition(() => router.push(`${pathname}?end=${encodeURIComponent(value)}`));
  }

  async function submit(confirmNonZero: boolean) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await settleContractorPeriod({ contractorId, periodEnd, note, confirmNonZero });
      if (result.success) {
        router.push(`/contractors/${contractorId}#settlements`);
        router.refresh();
        return;
      }
      if (result.error.startsWith(SETTLEMENT_BALANCE_NOT_ZERO_PREFIX)) {
        setNonZeroWarning(result.error);
        return;
      }
      setNonZeroWarning(null);
      setFormError(result.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const figures = preview
    ? [
        ["Opening balance", describeBalance(preview.openingBalance)],
        ["Earned", formatRs(preview.earned)],
        ["Paid (net of reversals)", formatRs(preview.paid)],
        ["Adjustments", formatRs(preview.adjustments)],
        ["Closing balance", describeBalance(preview.closingBalance)],
      ]
    : [];

  return (
    <div className="max-w-xl space-y-5 rounded-lg border border-zinc-200 bg-white p-6 text-zinc-900">
      <p className="text-sm text-zinc-600">
        Settling freezes these figures and locks {contractorName}&apos;s khata up to the chosen date:
        nothing can be recorded on or before it afterwards, including batch completions.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-medium text-zinc-700">Period starts</p>
          <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">{periodStart}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Settle up to</label>
          <input
            type="date"
            min={periodStart}
            max={todayInPakistan()}
            defaultValue={periodEnd}
            onChange={(e) => e.target.value && changeEnd(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {isNavigating && <p className="text-xs text-zinc-500">Updating preview…</p>}
      {problem && <p className="text-sm text-red-600">{problem}</p>}

      {preview && (
        <dl className="divide-y divide-zinc-100 rounded border border-zinc-200 text-sm">
          {figures.map(([label, value]) => (
            <div key={label} className="flex justify-between px-3 py-2">
              <dt className="text-zinc-600">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Note (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      {nonZeroWarning && (
        <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{nonZeroWarning}</p>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={isSubmitting}
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {isSubmitting ? "Settling…" : "Settle anyway"}
          </button>
        </div>
      )}

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      {!nonZeroWarning && (
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={isSubmitting || isNavigating || !preview}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSubmitting ? "Settling…" : "Settle"}
        </button>
      )}
    </div>
  );
}
