import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getContractorKhata,
  getOpeningBalanceState,
  listContractorBatchesWithPaymentStatus,
  listContractorPayments,
  listContractorSettlements,
} from "@/lib/contractor-ledger/service";
import { describeBalance } from "@/lib/contractor-ledger/schema";
import { LedgerDateFilter } from "@/components/customer-ledger/ledger-date-filter";
import { KhataTable } from "@/components/contractor-ledger/khata-table";
import { BatchPaymentStatusTable } from "@/components/contractor-ledger/batch-payment-status-table";
import { PaymentList } from "@/components/contractor-ledger/payment-list";
import { SettlementList } from "@/components/contractor-ledger/settlement-list";

interface ContractorKhataPageProps {
  params: Promise<{ contractorId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

const actionClass = "rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 hover:bg-zinc-50";

/** The contractor khata (US1): balance, entries with running balance, batches with paid status,
 * payments (reverse) and settlements (reopen, print). */
export default async function ContractorKhataPage({ params, searchParams }: ContractorKhataPageProps) {
  const { contractorId } = await params;
  const { from, to } = await searchParams;

  const khata = await getContractorKhata(contractorId, { from, to });
  if (!khata) notFound();

  const [batches, payments, settlements, openingState] = await Promise.all([
    listContractorBatchesWithPaymentStatus(contractorId),
    listContractorPayments(contractorId),
    listContractorSettlements(contractorId),
    getOpeningBalanceState(contractorId),
  ]);
  const balance = khata.currentBalance;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">{khata.contractor.name} — Khata</h1>
          <p className="text-sm text-zinc-500">
            {khata.contractor.phone ?? "No phone"} ·{" "}
            <span className={khata.contractor.status === "active" ? "text-green-700" : "text-zinc-500"}>
              {khata.contractor.status}
            </span>{" "}
            ·{" "}
            <Link href={`/contractors/${contractorId}/edit`} className="underline">
              Edit contractor
            </Link>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Current balance</p>
          <p className="text-xl font-semibold text-zinc-900">{describeBalance(balance)}</p>
          <p className="text-xs text-zinc-500">
            {balance > 0 ? "owed to the contractor" : balance < 0 ? "paid ahead (advance)" : "settled up"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/contractors/${contractorId}/payments/new`} className={actionClass}>
          Record payment
        </Link>
        <Link href={`/contractors/${contractorId}/adjustments/new`} className={actionClass}>
          Post adjustment
        </Link>
        <Link href={`/contractors/${contractorId}/settlements/new`} className={actionClass}>
          Settle
        </Link>
        {!openingState.hasOpeningBalance && !openingState.hasCurrentSettlement && (
          <Link href={`/contractors/${contractorId}/opening-balance`} className={actionClass}>
            Record opening balance
          </Link>
        )}
      </div>
      {!openingState.hasOpeningBalance && openingState.hasCurrentSettlement && (
        <p className="text-xs text-zinc-500">
          Opening balance can no longer be recorded; post an adjustment instead.
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Khata</h2>
        <LedgerDateFilter />
        <KhataTable rows={khata.rows} broughtForward={khata.broughtForward} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Batches</h2>
        <BatchPaymentStatusTable batches={batches} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Payments</h2>
        <PaymentList payments={payments} />
      </section>

      <section id="settlements">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Settlements</h2>
        <SettlementList contractorId={contractorId} settlements={settlements} />
      </section>
    </div>
  );
}
