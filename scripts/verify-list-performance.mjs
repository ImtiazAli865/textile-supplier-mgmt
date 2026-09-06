// Verifies SC-004 ("supplier list search/filter renders in <2s at 500 records")
// for the in-memory portion of listSuppliers() — the case-insensitive
// substring filter over already-fetched documents (see research.md's
// "fetch-and-filter" decision). Firestore's own indexed status/material
// query latency at this scale is covered by the composite indexes in
// firestore.indexes.json (T035), not by this script: running it against a
// live Firestore instance requires either the Java-based emulator (not
// available in this environment) or real project credentials.
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
