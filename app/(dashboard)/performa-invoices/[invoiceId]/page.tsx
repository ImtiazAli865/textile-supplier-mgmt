import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerformaInvoice } from "@/lib/performa-invoices/service";
import { PerformaInvoiceGstAttachmentUpload } from "@/components/performa-invoices/performa-invoice-gst-attachment-upload";

interface PerformaInvoiceDetailPageProps {
  params: Promise<{ invoiceId: string }>;
}

/** Fully read-only — no header field, line, or total can be changed through this feature once
 * an invoice is created (FR-009), so unlike Challans' detail page, there is no edit/void/accept
 * control anywhere on this page. */
export default async function PerformaInvoiceDetailPage({ params }: PerformaInvoiceDetailPageProps) {
  const { invoiceId } = await params;
  const invoice = await getPerformaInvoice(invoiceId);
  if (!invoice) notFound();

  const poNumbers = Array.from(new Set(invoice.lines.map((l) => l.poNumber).filter(Boolean)));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Invoice #{invoice.invoiceNumber}</h1>
          <p className="text-sm text-zinc-500">
            {invoice.customerDisplayName} · PO{poNumbers.length > 1 ? "s" : ""}{" "}
            {poNumbers.map((poNumber, i) => (
              <span key={poNumber}>
                {poNumber}
                {i < poNumbers.length - 1 ? ", " : ""}
              </span>
            ))}{" "}
            · {invoice.tradeNamePrintedName}
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Invoice date</h2>
          <p className="text-sm text-zinc-900">{new Date(invoice.invoiceDate).toLocaleDateString()}</p>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-500">Line items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="pb-2">Product</th>
                <th className="pb-2">PO #</th>
                <th className="pb-2">UOM</th>
                <th className="pb-2 text-right">Unit Price</th>
                <th className="pb-2 text-right">Invoiced Qty</th>
                <th className="pb-2 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="border-b border-zinc-100">
                  <td className="py-2">{line.productName}</td>
                  <td className="py-2">
                    <Link href={`/customer-pos/${line.poId}`} className="underline hover:text-zinc-900">
                      {line.poNumber}
                    </Link>
                  </td>
                  <td className="py-2">{line.uom}</td>
                  <td className="py-2 text-right">Rs {line.unitPrice.toFixed(2)}</td>
                  <td className="py-2 text-right">{line.invoicedQuantity}</td>
                  <td className="py-2 text-right">Rs {line.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex justify-end">
            <table className="text-sm">
              <tbody>
                <tr>
                  <td className="py-0.5 pr-4 text-zinc-600">Gross Total</td>
                  <td className="py-0.5 text-right font-medium">Rs {invoice.grossTotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="py-0.5 pr-4 text-zinc-600">Tax ({invoice.taxRate}%)</td>
                  <td className="py-0.5 text-right font-medium">Rs {invoice.taxAmount.toFixed(2)}</td>
                </tr>
                <tr className="border-t border-zinc-300">
                  <td className="py-1 pr-4 font-semibold">Net Total</td>
                  <td className="py-1 text-right font-semibold">Rs {invoice.netTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm">
          {invoice.ledgerCreditAmount != null ? (
            <p className="text-zinc-900">Ledger credit posted: Rs {invoice.ledgerCreditAmount.toFixed(2)}</p>
          ) : (
            <p className="text-zinc-600">No ledger entry found for this invoice.</p>
          )}
        </section>

        <PerformaInvoiceGstAttachmentUpload invoiceId={invoice.id} attachments={invoice.attachments} />

        <section className="border-t border-zinc-100 pt-3 text-xs text-zinc-400">
          Created {new Date(invoice.createdAt).toLocaleString()}
        </section>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={`/performa-invoices/${invoice.id}/print`}
          target="_blank"
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Print
        </Link>
      </div>
    </div>
  );
}
