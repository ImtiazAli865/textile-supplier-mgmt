import Link from "next/link";
import { listPerformaInvoiceCustomersForSelect } from "@/lib/customers/service";
import { listCustomerPOs } from "@/lib/customer-pos/service";
import { listActiveTradeNamesForSelect } from "@/lib/trade-names/service";
import { getInvoiceableLinesForPO } from "@/lib/performa-invoices/service";
import { PerformaInvoiceForm, type PoGroup } from "@/components/performa-invoices/performa-invoice-form";

interface NewPerformaInvoicePageProps {
  searchParams: Promise<{ customerId?: string; poId?: string | string[] }>;
}

export default async function NewPerformaInvoicePage({ searchParams }: NewPerformaInvoicePageProps) {
  const params = await searchParams;
  const customerId = params.customerId || undefined;

  if (!customerId) {
    // No customer chosen yet — pick one first, restricted to customers flagged "Issues
    // Performa Invoice" (FR-001), before anything about POs is even fetched.
    const customers = await listPerformaInvoiceCustomersForSelect();
    return (
      <div className="max-w-xl">
        <h1 className="mb-6 text-lg font-semibold text-zinc-900">Create Performa Invoice</h1>
        <p className="mb-3 text-sm text-zinc-600">
          Pick the customer to invoice (only customers flagged &quot;Issues Performa Invoice&quot;
          appear here):
        </p>
        <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
          {customers.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`/performa-invoices/new?customerId=${customer.id}`}
                className="block px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              >
                {customer.displayName}
              </Link>
            </li>
          ))}
          {customers.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-zinc-500">
              No customer is flagged &quot;Issues Performa Invoice&quot;.
            </li>
          )}
        </ul>
      </div>
    );
  }

  const [customers, openPOs, tradeNameOptions] = await Promise.all([
    listPerformaInvoiceCustomersForSelect(),
    listCustomerPOs({ customerId, status: "open" }),
    listActiveTradeNamesForSelect(),
  ]);

  const customer = customers.find((c) => c.id === customerId);
  if (!customer) {
    return <p className="text-sm text-red-600">Customer not found, or not eligible for Performa Invoicing.</p>;
  }

  const selectedPoIds = params.poId ? (Array.isArray(params.poId) ? params.poId : [params.poId]) : [];
  const addedPOs = openPOs.filter((po) => selectedPoIds.includes(po.id));
  const availablePOs = openPOs
    .filter((po) => !selectedPoIds.includes(po.id))
    .map((po) => ({ id: po.id, poNumber: po.poNumber }));

  const poGroups: PoGroup[] = await Promise.all(
    addedPOs.map(async (po) => ({
      poId: po.id,
      poNumber: po.poNumber,
      lines: await getInvoiceableLinesForPO(po.id),
    }))
  );

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Create Performa Invoice</h1>
      {openPOs.length === 0 ? (
        <p className="text-sm text-zinc-500">{customer.displayName} has no open POs.</p>
      ) : poGroups.length === 0 ? (
        <div className="max-w-xl space-y-3">
          <p className="text-sm text-zinc-600">Pick at least one PO to invoice against:</p>
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
            {openPOs.map((po) => (
              <li key={po.id}>
                <Link
                  href={`/performa-invoices/new?customerId=${customerId}&poId=${po.id}`}
                  className="block px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  {po.poNumber}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <PerformaInvoiceForm
          customerId={customerId}
          customerDisplayName={customer.displayName}
          poGroups={poGroups}
          tradeNameOptions={tradeNameOptions}
          availablePOs={availablePOs}
        />
      )}
    </div>
  );
}
