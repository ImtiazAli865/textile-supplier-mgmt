import Link from "next/link";
import { listContractors } from "@/lib/contractors/service";
import { listContractorBalances } from "@/lib/contractor-ledger/service";
import { ContractorFilters, ContractorList } from "@/components/contractors/contractor-list";
import type { ContractorStatus } from "@/lib/contractors/schema";

interface ContractorsPageProps {
  searchParams: Promise<{ status?: string }>;
}

const VALID_STATUSES: ContractorStatus[] = ["active", "inactive"];

export default async function ContractorsPage({ searchParams }: ContractorsPageProps) {
  const params = await searchParams;
  const status = VALID_STATUSES.includes(params.status as ContractorStatus)
    ? (params.status as ContractorStatus)
    : undefined;
  const [contractors, balances] = await Promise.all([listContractors({ status }), listContractorBalances()]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Contractors</h1>
        <Link
          href="/contractors/new"
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          New contractor
        </Link>
      </div>
      <ContractorFilters />
      <ContractorList contractors={contractors} balances={Object.fromEntries(balances)} />
    </div>
  );
}
