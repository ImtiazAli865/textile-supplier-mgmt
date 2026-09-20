import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/customers/service";
import { listActiveTradeNamesForSelect } from "@/lib/trade-names/service";
import { CustomerForm } from "@/components/customers/customer-form";

interface EditCustomerPageProps {
  params: Promise<{ customerId: string }>;
}

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  const { customerId } = await params;
  const [customer, tradeNameOptions] = await Promise.all([
    getCustomer(customerId),
    listActiveTradeNamesForSelect(),
  ]);
  if (!customer) notFound();

  const {
    displayName,
    legalName,
    billingAddress,
    telephone,
    ntnNumber,
    salesTaxRegistrationNumber,
    issuesPerformaInvoice,
    paymentTermsMinDays,
    paymentTermsMaxDays,
    contacts,
    shipToAddresses,
    tradeNameHints,
  } = customer;

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit {customer.displayName}</h1>
      <CustomerForm
        mode="edit"
        customerId={customer.id}
        tradeNameOptions={tradeNameOptions}
        defaultValues={{
          displayName,
          legalName,
          billingAddress,
          telephone,
          ntnNumber,
          salesTaxRegistrationNumber,
          issuesPerformaInvoice,
          paymentTermsMinDays,
          paymentTermsMaxDays,
          contacts,
          shipToAddresses,
          tradeNameHintIds: tradeNameHints.map((hint) => hint.id),
        }}
      />
    </div>
  );
}
