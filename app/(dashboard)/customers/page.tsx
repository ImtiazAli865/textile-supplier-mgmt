import { listCustomers } from "@/lib/customers/service";
import { CustomerStatusFilter } from "@/components/customers/customer-status-filter";
import { CustomerList } from "@/components/customers/customer-list";
import type { CustomerStatus } from "@/lib/customers/schema";

interface CustomersPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  // Default to "active" when no status filter is present (FR-003).
  const status = (params.status === "inactive" ? "inactive" : "active") satisfies CustomerStatus;

  const customers = await listCustomers({ status });

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Customers</h1>
      <CustomerStatusFilter />
      <CustomerList customers={customers} />
    </div>
  );
}
