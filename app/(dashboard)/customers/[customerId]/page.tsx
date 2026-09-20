import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/customers/service";
import { listActiveProductsForSelect } from "@/lib/products/service";
import { DeactivateReactivateControl } from "@/components/customers/deactivate-reactivate-control";
import { CustomerProductMappingsSection } from "@/components/customers/customer-product-mappings-section";

interface CustomerDetailPageProps {
  params: Promise<{ customerId: string }>;
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { customerId } = await params;
  const [customer, productOptions] = await Promise.all([
    getCustomer(customerId),
    listActiveProductsForSelect(),
  ]);
  if (!customer) notFound();

  const { billingAddress } = customer;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">{customer.displayName}</h1>
          <p className="text-sm text-zinc-500">{customer.legalName}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            customer.status === "active"
              ? "bg-green-100 text-green-800"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {customer.status}
        </span>
      </div>

      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Running ledger balance</h2>
          <p className="text-lg font-semibold text-zinc-900">Rs {customer.ledgerBalance.toFixed(2)}</p>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Billing address</h2>
          <p className="text-sm text-zinc-900">
            {billingAddress.line1}
            {billingAddress.line2 ? `, ${billingAddress.line2}` : ""}, {billingAddress.city}
            {billingAddress.state ? `, ${billingAddress.state}` : ""}
            {billingAddress.postalCode ? ` ${billingAddress.postalCode}` : ""}, {billingAddress.country}
          </p>
        </section>

        {customer.shipToAddresses.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Ship-to / warehouse addresses</h2>
            <ul className="space-y-1 text-sm text-zinc-900">
              {customer.shipToAddresses.map((address, index) => (
                <li key={index}>
                  {address.label && <span className="font-medium">{address.label}: </span>}
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}, {address.city}
                  {address.state ? `, ${address.state}` : ""}
                  {address.postalCode ? ` ${address.postalCode}` : ""}, {address.country}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-2 gap-4">
          {customer.telephone && (
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Telephone</h2>
              <p className="text-sm text-zinc-900">{customer.telephone}</p>
            </section>
          )}
          {customer.ntnNumber && (
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">NTN number</h2>
              <p className="text-sm text-zinc-900">{customer.ntnNumber}</p>
            </section>
          )}
          {customer.salesTaxRegistrationNumber && (
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">
                Sales Tax Registration number
              </h2>
              <p className="text-sm text-zinc-900">{customer.salesTaxRegistrationNumber}</p>
            </section>
          )}
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Payment terms</h2>
            <p className="text-sm text-zinc-900">
              {customer.paymentTermsMinDays}–{customer.paymentTermsMaxDays} days (expected range)
            </p>
          </section>
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Issues Performa Invoice</h2>
            <p className="text-sm text-zinc-900">{customer.issuesPerformaInvoice ? "Yes" : "No"}</p>
          </section>
        </div>

        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Contacts</h2>
          <ul className="space-y-1 text-sm text-zinc-900">
            {customer.contacts.map((contact, index) => (
              <li key={index}>
                {contact.name}
                {contact.phone ? ` · ${contact.phone}` : ""}
                {contact.email ? ` · ${contact.email}` : ""}
                {contact.role ? ` (${contact.role})` : ""}
              </li>
            ))}
          </ul>
        </section>

        {customer.tradeNameHints.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">
              Usable trade names (hint only)
            </h2>
            <p className="text-sm text-zinc-900">
              {customer.tradeNameHints.map((hint, index) => (index === 0 ? `★ ${hint.printedName}` : hint.printedName)).join(", ")}
            </p>
          </section>
        )}

        <CustomerProductMappingsSection
          customerId={customer.id}
          mappings={customer.productMappings}
          productOptions={productOptions}
        />

        <section className="border-t border-zinc-100 pt-3 text-xs text-zinc-400">
          Created {new Date(customer.createdAt).toLocaleString()} · Last updated{" "}
          {new Date(customer.updatedAt).toLocaleString()}
        </section>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={`/customers/${customer.id}/edit`}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Edit
        </Link>
        <DeactivateReactivateControl customerId={customer.id} status={customer.status} />
      </div>
    </div>
  );
}
