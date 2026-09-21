import type { PerformaInvoicePrintView } from "@/lib/performa-invoices/schema";

/**
 * The actual printable layout (ADR-0006's second application, as that ADR itself anticipated):
 * letterhead, line table (item/UOM/qty invoiced/unit price/line total/source PO), gross/tax/net
 * totals, amount in words, signature/stamp images, two signature lines. Styled with @media
 * print rules; staff use the browser's native Print → Save as PDF. Rendered only by
 * app/performa-invoices/[invoiceId]/print/page.tsx.
 */
export function PerformaInvoicePrintViewComponent({ view }: { view: PerformaInvoicePrintView }) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-zinc-900 print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <header className="mb-6 border-b border-zinc-300 pb-4 text-center">
        <h1 className="text-xl font-bold">{view.tradeNamePrintedName}</h1>
        <p className="whitespace-pre-line text-sm text-zinc-600">{view.tradeNamePrintedAddress}</p>
      </header>

      <div className="mb-6 flex items-center justify-between text-sm">
        <div>
          <p>
            <span className="font-medium">Invoice #:</span> {view.invoiceNumber}
          </p>
          <p>
            <span className="font-medium">Date:</span> {new Date(view.invoiceDate).toLocaleDateString()}
          </p>
          <p>
            <span className="font-medium">PO #:</span> {view.poNumbers.join(", ") || "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-medium">To:</p>
          <p>{view.customerLegalName}</p>
        </div>
      </div>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-400 text-left">
            <th className="py-1 pr-2">S.NO</th>
            <th className="py-1 pr-2">Item</th>
            {view.poNumbers.length > 1 && <th className="py-1 pr-2">PO #</th>}
            <th className="py-1 pr-2">UOM</th>
            <th className="py-1 pr-2 text-right">QTY</th>
            <th className="py-1 pr-2 text-right">Unit Price</th>
            <th className="py-1 pr-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {view.lines.map((line) => (
            <tr key={line.sNo} className="border-b border-zinc-200">
              <td className="py-1 pr-2">{line.sNo}</td>
              <td className="py-1 pr-2">{line.itemName}</td>
              {view.poNumbers.length > 1 && <td className="py-1 pr-2">{line.poNumber}</td>}
              <td className="py-1 pr-2">{line.uom}</td>
              <td className="py-1 pr-2 text-right">{line.quantityInvoiced}</td>
              <td className="py-1 pr-2 text-right">{line.unitPrice.toFixed(2)}</td>
              <td className="py-1 pr-2 text-right">{line.lineTotal.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-6 flex justify-end">
        <table className="text-sm">
          <tbody>
            <tr>
              <td className="py-0.5 pr-4 text-zinc-600">Gross Total</td>
              <td className="py-0.5 text-right font-medium">Rs {view.grossTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="py-0.5 pr-4 text-zinc-600">Tax ({view.taxRate}%)</td>
              <td className="py-0.5 text-right font-medium">Rs {view.taxAmount.toFixed(2)}</td>
            </tr>
            <tr className="border-t border-zinc-400">
              <td className="py-1 pr-4 font-semibold">Net Total</td>
              <td className="py-1 text-right font-semibold">Rs {view.netTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mb-8 text-sm italic text-zinc-700">Amount in words: {view.netTotalInWords}</p>

      <div className="mt-12 grid grid-cols-2 gap-8">
        <div className="text-center">
          {view.signatureImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.signatureImageUrl} alt="Signature" className="mx-auto mb-1 h-16 object-contain" />
          )}
          {view.stampImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.stampImageUrl} alt="Company stamp" className="mx-auto mb-1 h-16 object-contain" />
          )}
          <div className="border-t border-zinc-400 pt-1 text-xs">Authorized signature</div>
        </div>
        <div className="text-center">
          <div className="mt-16 border-t border-zinc-400 pt-1 text-xs">Received by (customer)</div>
        </div>
      </div>
    </div>
  );
}
