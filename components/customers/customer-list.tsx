import Link from "next/link";
import type { CustomerListItem } from "@/lib/customers/schema";

export function CustomerList({ customers }: { customers: CustomerListItem[] }) {
  if (customers.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No customers match this filter.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
      {customers.map((customer) => (
        <li key={customer.id}>
          <Link
            href={`/customers/${customer.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
          >
            <p className="text-sm font-medium text-zinc-900">{customer.displayName}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                customer.status === "active"
                  ? "bg-green-100 text-green-800"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {customer.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
