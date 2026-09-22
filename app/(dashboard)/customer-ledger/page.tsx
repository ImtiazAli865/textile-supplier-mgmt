import { listCustomerLedgerSummaries } from "@/lib/customer-ledger/service";
import { LedgerSummaryList } from "@/components/customer-ledger/ledger-summary-list";

export default async function CustomerLedgerSummaryPage() {
  const summaries = await listCustomerLedgerSummaries();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Customer Ledger</h1>
        <div className="flex items-center gap-3">
          <a
            href="/customer-ledger/print"
            target="_blank"
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Print
          </a>
          {/* A raw file download from a Route Handler, not a page transition — a plain <a>
              tag (not next/link) is the correct primitive here. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/customer-ledger"
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Export CSV
          </a>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <LedgerSummaryList summaries={summaries} />
      </div>
    </div>
  );
}
