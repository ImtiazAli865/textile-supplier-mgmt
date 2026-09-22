import "server-only";
import { getCustomer } from "@/lib/customers/service";
import { fetchLedgerEntries } from "@/lib/customer-ledger/entries";
import type { CustomerAgeingView } from "@/lib/customer-ledger/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00Z").getTime();
  const to = new Date(toIso + "T00:00:00Z").getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

interface QueueEntry {
  entryDate: string;
  remainingAmount: number;
}

/**
 * FIFO (oldest-credit-first) allocation over a customer's chronological ledger, exactly as
 * specified in research.md's `computeAgeing` pseudocode — no per-invoice payment matching, since
 * this project's ledger is a running-balance model (spec.md Assumptions). Every credit (opening
 * balance, Challan, Performa Invoice, or a bounce reversal) is pushed onto the queue under its
 * own `entryDate`, indistinguishably; every debit consumes the oldest still-open credits first,
 * reducing or fully closing them in order, never resetting a partially-closed entry's own date.
 *
 * Classifies each still-open (or partially-open) credit's remaining amount as within/beyond
 * `paymentTermsMaxDays` ONLY — `paymentTermsMinDays` plays no role in this computation at all; it
 * is a separate, presentation-only value the caller renders as context next to each open entry
 * (FR-009, as reworded; /sp.analyze finding A1).
 */
export async function getCustomerAgeing(customerId: string): Promise<CustomerAgeingView> {
  const customer = await getCustomer(customerId);
  if (!customer) return { openEntries: [], overdueAmount: 0 };

  const entries = await fetchLedgerEntries(customerId);
  const today = todayIso();

  const queue: QueueEntry[] = [];

  for (const entry of entries) {
    if (entry.type === "credit") {
      queue.push({ entryDate: entry.entryDate, remainingAmount: entry.amount });
      continue;
    }

    // debit — a customer payment (or, in principle, any future debit-typed entry). Amounts are
    // rounded to 2dp after every subtraction (PKR, 2-decimal convention, matching every other
    // money computation in this project) to avoid floating-point residue leaving a
    // fully-consumed entry lingering with e.g. remainingAmount = 1e-13.
    let toConsume = entry.amount;
    let i = 0;
    while (toConsume > 0 && i < queue.length) {
      const head = queue[i];
      const consumed = Math.round(Math.min(head.remainingAmount, toConsume) * 100) / 100;
      head.remainingAmount = Math.round((head.remainingAmount - consumed) * 100) / 100;
      toConsume = Math.round((toConsume - consumed) * 100) / 100;
      if (head.remainingAmount === 0) {
        i += 1;
      } else {
        break;
      }
    }
    // Any toConsume left over here is an overpayment (spec.md Edge Cases — explicitly
    // allowed) and is simply discarded from this queue, which only ever tracks amounts still
    // owed to the business; getCustomerLedgerBalance (unchanged) is the source of truth for a
    // negative/in-the-customer's-favor balance, not this queue (research.md).
    for (let j = queue.length - 1; j >= 0; j--) {
      if (queue[j].remainingAmount <= 0) queue.splice(j, 1);
    }
  }

  const openEntries = queue.map((e) => ({
    entryDate: e.entryDate,
    remainingAmount: e.remainingAmount,
    withinRange: daysBetween(e.entryDate, today) <= customer.paymentTermsMaxDays,
  }));

  const overdueAmount = openEntries
    .filter((e) => !e.withinRange)
    .reduce((total, e) => total + e.remainingAmount, 0);

  return { openEntries, overdueAmount };
}
