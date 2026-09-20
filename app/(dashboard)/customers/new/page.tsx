import { CustomerForm } from "@/components/customers/customer-form";
import { listActiveTradeNamesForSelect } from "@/lib/trade-names/service";

export default async function NewCustomerPage() {
  const tradeNameOptions = await listActiveTradeNamesForSelect();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Add Customer</h1>
      <CustomerForm mode="create" tradeNameOptions={tradeNameOptions} />
    </div>
  );
}
