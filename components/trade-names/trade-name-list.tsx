import Link from "next/link";
import type { TradeNameListItem } from "@/lib/trade-names/schema";

export function TradeNameList({ tradeNames }: { tradeNames: TradeNameListItem[] }) {
  if (tradeNames.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No trade names match this filter.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
      {tradeNames.map((tradeName) => (
        <li key={tradeName.id}>
          <Link
            href={`/trade-names/${tradeName.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
          >
            <p className="text-sm font-medium text-zinc-900">{tradeName.printedName}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                tradeName.status === "active"
                  ? "bg-green-100 text-green-800"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {tradeName.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
