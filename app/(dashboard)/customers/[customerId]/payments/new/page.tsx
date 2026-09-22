import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/customers/service";
import { listCustomerPOs } from "@/lib/customer-pos/service";
import { listPerformaInvoices } from "@/lib/performa-invoices/service";
import { CustomerPaymentForm } from "@/components/customer-payments/customer-payment-form";

interface RecordPaymentPageProps {
  params: Promise<{ customerId: string }>;
}

export default async function RecordPaymentPage({ params }: RecordPaymentPageProps) {
  const { customerId } = await params;

  const [customer, pos, invoices] = await Promise.all([
    getCustomer(customerId),
    listCustomerPOs({ customerId, status: "open" }),
    listPerformaInvoices({ customerId }),
  ]);
  if (!customer) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Record Payment</h1>
      <CustomerPaymentForm
        customerId={customer.id}
        customerDisplayName={customer.displayName}
        poOptions={pos.map((po) => ({ id: po.id, poNumber: po.poNumber }))}
        invoiceOptions={invoices.map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber }))}
      />
    </div>
  );
}
