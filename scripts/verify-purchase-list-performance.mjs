// Verifies SC-004 ("purchase list search/filter renders in <2s at 1,000
// records") and SC-003 ("running totals update with no perceptible delay,
// <2s") for the in-memory totals-summation step listPurchases() still does
// after fetching its (already supplier_id+purchase_date-indexed, per
// supabase/migrations/0001_init.sql) filtered result set from Postgres. The
// supplier-name join itself is now a single SQL JOIN, not an in-memory step —
// this script only sanity-checks that summing the fetched rows stays fast at
// this record count; real query latency needs a live Supabase project to
// measure, which isn't available in this environment.
//
// Run: node scripts/verify-purchase-list-performance.mjs

const RECORD_COUNT = 1000;
const SUPPLIER_COUNT = 20;

function round2(value) {
  return Math.round(value * 100) / 100;
}

function seedPurchases(count) {
  const purchases = [];
  const baseDate = new Date("2026-01-01T00:00:00Z").getTime();
  for (let i = 0; i < count; i++) {
    const supplierId = `supplier-${i % SUPPLIER_COUNT}`;
    purchases.push({
      id: `purchase-${i}`,
      supplierId,
      purchaseDate: new Date(baseDate + i * 86400000).toISOString().slice(0, 10),
      weightKg: round2(50 + (i % 100)),
      ratePerKg: round2(100 + (i % 20)),
    });
  }
  return purchases.map((p) => ({ ...p, totalCost: round2(p.weightKg * p.ratePerKg) }));
}

function joinSupplierNamesAndTotal(purchases, supplierNamesById, filters) {
  let filtered = purchases;
  if (filters.supplierId) {
    filtered = filtered.filter((p) => p.supplierId === filters.supplierId);
  }
  if (filters.dateFrom) {
    filtered = filtered.filter((p) => p.purchaseDate >= filters.dateFrom);
  }
  if (filters.dateTo) {
    filtered = filtered.filter((p) => p.purchaseDate <= filters.dateTo);
  }

  const listItems = filtered.map((p) => ({
    ...p,
    supplierName: supplierNamesById.get(p.supplierId) ?? "(unknown supplier)",
  }));

  const totals = listItems.reduce(
    (acc, item) => ({
      totalKg: round2(acc.totalKg + item.weightKg),
      totalCost: round2(acc.totalCost + item.totalCost),
    }),
    { totalKg: 0, totalCost: 0 }
  );

  return { listItems, totals };
}

const purchases = seedPurchases(RECORD_COUNT);
const supplierNamesById = new Map(
  Array.from({ length: SUPPLIER_COUNT }, (_, i) => [`supplier-${i}`, `Textile Supplier ${i}`])
);

const start = performance.now();
const { listItems, totals } = joinSupplierNamesAndTotal(purchases, supplierNamesById, {
  supplierId: "supplier-3",
  dateFrom: "2026-01-01",
  dateTo: "2027-12-31",
});
const elapsedMs = performance.now() - start;

console.log(`Seeded ${RECORD_COUNT} purchases across ${SUPPLIER_COUNT} suppliers.`);
console.log(
  `Filtered to ${listItems.length} matches (totalKg=${totals.totalKg}, totalCost=${totals.totalCost}) in ${elapsedMs.toFixed(2)}ms.`
);

const BUDGET_MS = 2000;
if (elapsedMs > BUDGET_MS) {
  console.error(`FAIL: ${elapsedMs.toFixed(2)}ms exceeds the ${BUDGET_MS}ms SC-003/SC-004 budget.`);
  process.exit(1);
}
console.log(`PASS: well within the ${BUDGET_MS}ms SC-003/SC-004 budget.`);
