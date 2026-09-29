import { describeBalance, formatRs, type SettlementStatement } from "@/lib/contractor-ledger/schema";

/**
 * Printable settlement statement (FR-030, ADR-0006): the contractor signs it with the business.
 * Staff use the browser's Print → Save as PDF. Rendered only by
 * app/contractors/[contractorId]/settlements/[settlementId]/print/page.tsx.
 */
export function SettlementPrintView({ statement }: { statement: SettlementStatement }) {
  const { settlement, contractor, rows } = statement;
  const reopened = settlement.reopenedAt !== null;

  const figures: [string, string][] = [
    ["Opening balance", describeBalance(settlement.openingBalance)],
    ["Earned", formatRs(settlement.earned)],
    ["Paid (net of reversals)", formatRs(settlement.paid)],
    ["Adjustments", formatRs(settlement.adjustments)],
    ["Closing balance", describeBalance(settlement.closingBalance)],
  ];

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-zinc-900 print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {reopened && (
        <div className="mb-4 rounded border-2 border-red-600 p-3 text-center text-red-700">
          <p className="text-lg font-bold">REOPENED — NOT VALID</p>
          <p className="text-xs">
            Reopened {new Date(settlement.reopenedAt as string).toLocaleString()} by {settlement.reopenedBy}:{" "}
            {settlement.reopenReason}
          </p>
        </div>
      )}
      {!statement.matchesFrozen && (
        <div className="mb-4 rounded border-2 border-amber-500 p-3 text-center text-sm text-amber-800">
          The khata for this period no longer matches the settled figures (now: closing{" "}
          {describeBalance(statement.recomputed.closingBalance)}). Check before signing.
        </div>
      )}

      <header className="mb-6 border-b border-zinc-300 pb-4">
        <h1 className="text-xl font-bold">MA Textile — Contractor Settlement Statement</h1>
        <p className="mt-1 text-sm">
          {contractor.name}
          {contractor.phone ? ` · ${contractor.phone}` : ""}
        </p>
        <p className="text-sm">
          Period {settlement.periodStart} to {settlement.periodEnd}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Settled {new Date(settlement.settledAt).toLocaleString()} by {settlement.settledBy} · Printed{" "}
          {new Date(statement.generatedAt).toLocaleString()}
        </p>
      </header>

      <table className="mb-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-400 text-left">
            <th className="py-1 pr-2">Date</th>
            <th className="py-1 pr-2">Description</th>
            <th className="py-1 pr-2 text-right">Earned / owed up</th>
            <th className="py-1 pr-2 text-right">Paid / owed down</th>
            <th className="py-1 pr-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-center text-zinc-500">
                No activity in this period.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-zinc-200">
              <td className="py-1 pr-2 whitespace-nowrap">{row.entryDate}</td>
              <td className="py-1 pr-2">
                {row.description}
                {/* A payment reversed after this period still counts in it; its reversal is in the
                    period it was entered, so say so on the paper the contractor signs. */}
                {row.reversedOn && row.reversedOn > settlement.periodEnd && (
                  <span className="block text-xs font-medium text-red-700">
                    (reversed on {row.reversedOn}; the reversal falls in a later period)
                  </span>
                )}
              </td>
              <td className="py-1 pr-2 text-right">{row.credit !== null ? formatRs(row.credit) : ""}</td>
              <td className="py-1 pr-2 text-right">{row.debit !== null ? formatRs(row.debit) : ""}</td>
              <td className="py-1 pr-2 text-right whitespace-nowrap">{describeBalance(row.runningBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mb-10 ml-auto w-full max-w-xs text-sm">
        {figures.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-zinc-200 py-1 last:border-b-2 last:font-semibold">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {settlement.note && <p className="mb-10 text-sm">Note: {settlement.note}</p>}

      <div className="grid grid-cols-2 gap-12 pt-8 text-sm">
        <div>
          <div className="border-t border-zinc-500 pt-1">For MA Textile</div>
        </div>
        <div>
          <div className="border-t border-zinc-500 pt-1">Contractor: {contractor.name}</div>
        </div>
      </div>
    </div>
  );
}
