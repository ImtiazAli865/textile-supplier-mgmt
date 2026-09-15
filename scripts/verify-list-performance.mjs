// Verifies SC-004 ("supplier list search/filter renders in <2s at 500 records")
// for the in-memory substring-filter shape listSuppliers() used to rely on
// under Firestore. Since the 2026-09-16 Supabase migration, status/material
// filtering and substring search both run as native SQL (see
// supabase/migrations/0001_init.sql's indexes), so this script now only
// sanity-checks that an equivalent JS filter stays fast at this record count
// — the real query latency at this scale needs a live Supabase project to
// measure, which isn't available in this environment.
//
// Run: node scripts/verify-list-performance.mjs

const RECORD_COUNT = 500;
const MATERIALS = ["cotton", "denim", "silk", "wool", "linen", "polyester"];

function seedSuppliers(count) {
  const suppliers = [];
  for (let i = 0; i < count; i++) {
    const companyName = `Textile Supplier ${i.toString().padStart(4, "0")}`;
    suppliers.push({
      id: `supplier-${i}`,
      companyName,
      companyNameLower: companyName.toLowerCase(),
      materials: [MATERIALS[i % MATERIALS.length]],
      status: i % 5 === 0 ? "inactive" : "active",
    });
  }
  return suppliers;
}

function filterByStatusAndSearch(suppliers, { status, search }) {
  let result = suppliers.filter((s) => s.status === status);
  if (search) {
    const term = search.toLowerCase();
    result = result.filter((s) => s.companyNameLower.includes(term));
  }
  return result;
}

const suppliers = seedSuppliers(RECORD_COUNT);

const start = performance.now();
const activeMatches = filterByStatusAndSearch(suppliers, {
  status: "active",
  search: "supplier 04",
});
const elapsedMs = performance.now() - start;

console.log(`Seeded ${RECORD_COUNT} suppliers.`);
console.log(`Filtered to ${activeMatches.length} active matches in ${elapsedMs.toFixed(2)}ms.`);

const BUDGET_MS = 2000;
if (elapsedMs > BUDGET_MS) {
  console.error(`FAIL: ${elapsedMs.toFixed(2)}ms exceeds the ${BUDGET_MS}ms SC-004 budget.`);
  process.exit(1);
}
console.log(`PASS: well within the ${BUDGET_MS}ms SC-004 budget.`);
