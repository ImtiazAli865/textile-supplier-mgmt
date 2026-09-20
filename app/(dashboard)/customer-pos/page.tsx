import Link from "next/link";
import { listCustomerPOs } from "@/lib/customer-pos/service";
import { listActiveCustomersForSelect } from "@/lib/customers/service";
import { CustomerPoFilters, CustomerPoList } from "@/components/customer-pos/customer-po-list";
import type { CustomerPOStatus } from "@/lib/customer-pos/schema";

interface CustomerPOsPageProps {
  searchParams: Promise<{ status?: string; customerId?: string }>;
}

export default async function CustomerPOsPage({ searchParams }: CustomerPOsPageProps) {
  const params = await searchParams;
  // Default to "open" when no status filter is present (FR-012).
  const status = (params.status === "cancelled" ? "cancelled" : "open") satisfies CustomerPOStatus;
  const customerId = params.customerId || undefined;

  const [pos, customerOptions] = await Promise.all([
    listCustomerPOs({ status, customerId }),
    listActiveCustomersForSelect(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Customer Purchase Orders</h1>
        <Link
          href="/customer-pos/new"
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Add Customer PO
        </Link>
      </div>
      <CustomerPoFilters customerOptions={customerOptions} />
      <CustomerPoList pos={pos} />
    </div>
  );
}
