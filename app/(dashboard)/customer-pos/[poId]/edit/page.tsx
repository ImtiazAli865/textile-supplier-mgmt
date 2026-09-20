import { notFound } from "next/navigation";
import { getCustomerPO } from "@/lib/customer-pos/service";
import { listActiveCustomersForSelect } from "@/lib/customers/service";
import { listActiveTradeNamesForSelect } from "@/lib/trade-names/service";
import { listActiveProductsForSelect } from "@/lib/products/service";
import { CustomerPoForm } from "@/components/customer-pos/customer-po-form";

interface EditCustomerPOPageProps {
  params: Promise<{ poId: string }>;
}

export default async function EditCustomerPOPage({ params }: EditCustomerPOPageProps) {
  const { poId } = await params;
  const [po, customerOptions, tradeNameOptions, productOptions] = await Promise.all([
    getCustomerPO(poId),
    listActiveCustomersForSelect(),
    listActiveTradeNamesForSelect(),
    listActiveProductsForSelect(),
  ]);
  if (!po) notFound();

  // Inert today (no writer sets delivered/invoiced above zero until 007/008 ship), but the
  // per-line lock rendering rule must exist structurally per FR-014.
  const lockedLineIds = new Set(
    po.lines
      .filter((line) => line.deliveredQuantity > 0 || line.invoicedQuantity > 0)
      .map((line) => line.id)
  );

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit PO {po.poNumber}</h1>
      <CustomerPoForm
        mode="edit"
        poId={po.id}
        lockedLineIds={lockedLineIds}
        customerOptions={customerOptions}
        tradeNameOptions={tradeNameOptions}
        productOptions={productOptions}
        defaultValues={{
          customerId: po.customerId,
          poNumber: po.poNumber,
          orderDate: po.orderDate,
          purchaserName: po.purchaserName ?? "",
          requestedDeliveryDate: po.requestedDeliveryDate ?? "",
          destinationText: po.destinationText ?? "",
          tradeNameId: po.tradeNameId ?? "",
          lines: po.lines.map((line) => ({
            id: line.id,
            customerItemCode: line.customerItemCode ?? "",
            productId: line.productId,
            description: line.description ?? "",
            quantityOrdered: line.quantityOrdered,
            uom: line.uom,
            unitPrice: line.unitPrice,
          })),
        }}
      />
    </div>
  );
}
