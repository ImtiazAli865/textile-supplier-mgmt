import Link from "next/link";
import { listPerformaInvoices } from "@/lib/performa-invoices/service";
import { listPerformaInvoiceCustomersForSelect } from "@/lib/customers/service";
import { listActiveTradeNamesForSelect } from "@/lib/trade-names/service";
import { PerformaInvoiceFilters, PerformaInvoiceList } from "@/components/performa-invoices/performa-invoice-list";

interface PerformaInvoicesPageProps {
  searchParams: Promise<{ customerId?: string; tradeNameId?: string }>;
}

export default async function PerformaInvoicesPage({ searchParams }: PerformaInvoicesPageProps) {
  const params = await searchParams;
  const customerId = params.customerId || undefined;
  const tradeNameId = params.tradeNameId || undefined;

  const [invoices, customerOptions, tradeNameOptions] = await Promise.all([
    listPerformaInvoices({ customerId, tradeNameId }),
    listPerformaInvoiceCustomersForSelect(),
    listActiveTradeNamesForSelect(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Performa Invoices</h1>
        <Link
          href="/performa-invoices/new"
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Create Performa Invoice
        </Link>
      </div>
      <PerformaInvoiceFilters customerOptions={customerOptions} tradeNameOptions={tradeNameOptions} />
      <PerformaInvoiceList invoices={invoices} />
    </div>
  );
}
