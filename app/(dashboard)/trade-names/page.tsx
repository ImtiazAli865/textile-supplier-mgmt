import { listTradeNames } from "@/lib/trade-names/service";
import { TradeNameStatusFilter } from "@/components/trade-names/trade-name-status-filter";
import { TradeNameList } from "@/components/trade-names/trade-name-list";
import type { TradeNameStatus } from "@/lib/trade-names/schema";

interface TradeNamesPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function TradeNamesPage({ searchParams }: TradeNamesPageProps) {
  const params = await searchParams;
  // Default to "active" when no status filter is present (FR-003).
  const status = (params.status === "inactive" ? "inactive" : "active") satisfies TradeNameStatus;

  const tradeNames = await listTradeNames({ status });

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Trade Names</h1>
      <TradeNameStatusFilter />
      <TradeNameList tradeNames={tradeNames} />
    </div>
  );
}
