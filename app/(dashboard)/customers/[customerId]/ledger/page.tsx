import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerLedger } from "@/lib/customer-ledger/service";
import { getCustomerAgeing } from "@/lib/customer-ledger/ageing";
import { LedgerTable } from "@/components/customer-ledger/ledger-table";
import { LedgerDateFilter } from "@/components/customer-ledger/ledger-date-filter";
import { AgeingSummary } from "@/components/customer-ledger/ageing-summary";

interface CustomerLedgerPageProps {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function CustomerLedgerPage({ params, searchParams }: CustomerLedgerPageProps) {
  const { customerId } = await params;
  const { from, to } = await searchParams;

  const [ledger, ageing] = await Promise.all([
    getCustomerLedger(customerId, { from, to }),
    getCustomerAgeing(customerId),
  ]);
  if (!ledger) notFound();

  const printHref = `/customers/${customerId}/ledger/print${
    from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}` : ""
  }`;
  const exportHref = `/api/customer-ledger/${customerId}${
    from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}` : ""
  }`;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">{ledger.customer.displayName} — Ledger</h1>
          <p className="text-sm text-zinc-500">{ledger.customer.legalName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-zinc-500">Current balance</p>
          <p className="text-lg font-semibold text-zinc-900">Rs {ledger.currentBalance.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={`/customers/${customerId}/payments/new`}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Record Payment
        </Link>
        <Link
          href={printHref}
          target="_blank"
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Print
        </Link>
        {/* A raw file download from a Route Handler, not a page transition — a plain <a>
            tag (not next/link) is the correct primitive here. */}
        <a
          href={exportHref}
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Export CSV
        </a>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <LedgerDateFilter />
        <LedgerTable rows={ledger.rows} />
      </div>

      <AgeingSummary
        ageing={ageing}
        paymentTermsMinDays={ledger.customer.paymentTermsMinDays}
        paymentTermsMaxDays={ledger.customer.paymentTermsMaxDays}
      />
    </div>
  );
}
