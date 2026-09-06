import { listSuppliers } from "@/lib/suppliers/service";
import { SupplierFilters } from "@/components/suppliers/supplier-filters";
import { SupplierList } from "@/components/suppliers/supplier-list";
import type { SupplierStatus } from "@/lib/suppliers/schema";

interface SuppliersPageProps {
  searchParams: Promise<{ status?: string; material?: string; search?: string }>;
}

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const params = await searchParams;
  // Default to "active" when no status filter is present (FR-011).
  const status = (params.status === "inactive" ? "inactive" : "active") satisfies SupplierStatus;

  const suppliers = await listSuppliers({
    status,
    material: params.material,
    search: params.search,
  });

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Suppliers</h1>
      <SupplierFilters />
      <SupplierList suppliers={suppliers} />
    </div>
  );
}
