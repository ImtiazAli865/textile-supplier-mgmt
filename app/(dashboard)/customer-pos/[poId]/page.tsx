import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerPO } from "@/lib/customer-pos/service";
import { CustomerPoStatusControl } from "@/components/customer-pos/customer-po-status-control";
import { AttachmentList } from "@/components/customer-pos/attachment-list";

interface CustomerPODetailPageProps {
  params: Promise<{ poId: string }>;
}

export default async function CustomerPODetailPage({ params }: CustomerPODetailPageProps) {
  const { poId } = await params;
  const po = await getCustomerPO(poId);
  if (!po) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">PO {po.poNumber}</h1>
          <p className="text-sm text-zinc-500">{po.customerDisplayName}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            po.status === "open" ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {po.status}
        </span>
      </div>

      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Order date</h2>
            <p className="text-sm text-zinc-900">{new Date(po.orderDate).toLocaleDateString()}</p>
          </section>
          {po.requestedDeliveryDate && (
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Requested delivery date</h2>
              <p className="text-sm text-zinc-900">
                {new Date(po.requestedDeliveryDate).toLocaleDateString()}
              </p>
            </section>
          )}
          {po.purchaserName && (
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Purchaser</h2>
              <p className="text-sm text-zinc-900">{po.purchaserName}</p>
            </section>
          )}
          {po.tradeNamePrintedName && (
            <section>
              <h2 className="mb-1 text-sm font-medium text-zinc-500">Bills under trade name</h2>
              <p className="text-sm text-zinc-900">{po.tradeNamePrintedName}</p>
            </section>
          )}
        </div>

        {po.destinationText && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Destination / ship-to</h2>
            <p className="whitespace-pre-line text-sm text-zinc-900">{po.destinationText}</p>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-500">Line items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="pb-2">Item code</th>
                <th className="pb-2">Product</th>
                <th className="pb-2">Description</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2">UOM</th>
                <th className="pb-2 text-right">Price</th>
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2 text-right">Delivered</th>
                <th className="pb-2 text-right">Invoiced</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((line) => (
                <tr key={line.id} className="border-b border-zinc-100">
                  <td className="py-2">{line.customerItemCode ?? "—"}</td>
                  <td className="py-2">{line.productName}</td>
                  <td className="py-2">{line.description ?? "—"}</td>
                  <td className="py-2 text-right">{line.quantityOrdered}</td>
                  <td className="py-2">{line.uom}</td>
                  <td className="py-2 text-right">Rs {line.unitPrice.toFixed(2)}</td>
                  <td className="py-2 text-right">Rs {line.lineTotal.toFixed(2)}</td>
                  <td className="py-2 text-right text-zinc-400">{line.deliveredQuantity}</td>
                  <td className="py-2 text-right text-zinc-400">{line.invoicedQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-right text-sm font-semibold text-zinc-900">
            Total: Rs {po.total.toFixed(2)}
          </p>
        </section>

        <AttachmentList poId={po.id} attachments={po.attachments} />

        <section className="border-t border-zinc-100 pt-3 text-xs text-zinc-400">
          Created {new Date(po.createdAt).toLocaleString()} · Last updated{" "}
          {new Date(po.updatedAt).toLocaleString()}
        </section>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={`/customer-pos/${po.id}/edit`}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Edit
        </Link>
        <CustomerPoStatusControl poId={po.id} status={po.status} />
      </div>
    </div>
  );
}
