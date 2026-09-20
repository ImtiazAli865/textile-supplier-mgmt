import { CustomerPoForm } from "@/components/customer-pos/customer-po-form";
import { listActiveCustomersForSelect } from "@/lib/customers/service";
import { listActiveTradeNamesForSelect } from "@/lib/trade-names/service";
import { listActiveProductsForSelect } from "@/lib/products/service";

export default async function NewCustomerPOPage() {
  const [customerOptions, tradeNameOptions, productOptions] = await Promise.all([
    listActiveCustomersForSelect(),
    listActiveTradeNamesForSelect(),
    listActiveProductsForSelect(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Add Customer PO</h1>
      <CustomerPoForm
        mode="create"
        customerOptions={customerOptions}
        tradeNameOptions={tradeNameOptions}
        productOptions={productOptions}
      />
    </div>
  );
}
