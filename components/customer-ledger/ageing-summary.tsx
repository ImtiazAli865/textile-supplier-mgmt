import type { CustomerAgeingView } from "@/lib/customer-ledger/types";

/**
 * Ageing/overdue breakdown (FR-009) — purely informational, no error/warning visual treatment
 * for a "beyond expected range" entry, since this classification never blocks or flags anything.
 * The min-max range is shown as a static context label next to each entry; only
 * `paymentTermsMaxDays` actually drove the within/beyond classification computed upstream
 * (getCustomerAgeing) — `paymentTermsMinDays` plays no role in that computation itself
 * (/sp.analyze finding A1).
 */
export function AgeingSummary({
  ageing,
  paymentTermsMinDays,
  paymentTermsMaxDays,
}: {
  ageing: CustomerAgeingView;
  paymentTermsMinDays: number;
  paymentTermsMaxDays: number;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-500">Ageing</h2>
        <p className="text-sm text-zinc-900">
          Overdue amount: <span className="font-semibold">Rs {ageing.overdueAmount.toFixed(2)}</span>
        </p>
      </div>
      {ageing.openEntries.length === 0 ? (
        <p className="text-sm text-zinc-500">No outstanding entries.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {ageing.openEntries.map((entry, index) => (
            <li key={index} className="flex items-center justify-between">
              <span className="text-zinc-700">
                {new Date(entry.entryDate).toLocaleDateString()}
                <span className="ml-2 text-xs text-zinc-400">
                  Expected within {paymentTermsMinDays}-{paymentTermsMaxDays} days
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-zinc-900">Rs {entry.remainingAmount.toFixed(2)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    entry.withinRange ? "bg-zinc-100 text-zinc-600" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {entry.withinRange ? "Within range" : "Beyond range"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
