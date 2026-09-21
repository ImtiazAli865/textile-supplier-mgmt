import type { ChallanPrintView } from "@/lib/challans/schema";

/**
 * The actual printable layout (ADR-0006): letterhead, line table (S.NO/Article/Item Name/UOM/QTY
 * — no price column, matching the real Challan's printed format, spec FR-005), a quantity totals
 * row, signature/stamp images, two signature lines. Styled with @media print rules; staff use the
 * browser's native Print → Save as PDF. Rendered only by
 * app/challans/[challanId]/print/page.tsx.
 */
export function ChallanPrintViewComponent({ view }: { view: ChallanPrintView }) {
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
            <span className="font-medium">Challan #:</span> {view.challanNumber}
          </p>
          <p>
            <span className="font-medium">Date:</span> {new Date(view.challanDate).toLocaleDateString()}
          </p>
          <p>
            <span className="font-medium">PO #:</span> {view.poNumber}
          </p>
        </div>
        <div className="text-right">
          <p className="font-medium">To:</p>
          <p>{view.customerLegalName}</p>
        </div>
      </div>

      <table className="mb-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-400 text-left">
            <th className="py-1 pr-2">S.NO</th>
            <th className="py-1 pr-2">Article</th>
            <th className="py-1 pr-2">Item Name</th>
            <th className="py-1 pr-2">UOM</th>
            <th className="py-1 pr-2 text-right">QTY</th>
          </tr>
        </thead>
        <tbody>
          {view.lines.map((line) => (
            <tr key={line.sNo} className="border-b border-zinc-200">
              <td className="py-1 pr-2">{line.sNo}</td>
              <td className="py-1 pr-2">{line.article ?? "—"}</td>
              <td className="py-1 pr-2">{line.itemName}</td>
              <td className="py-1 pr-2">{line.uom}</td>
              <td className="py-1 pr-2 text-right">{line.quantity}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-zinc-400 font-medium">
            <td className="py-1 pr-2" colSpan={4}>
              Total
            </td>
            <td className="py-1 pr-2 text-right">{view.totalQuantity}</td>
          </tr>
        </tfoot>
      </table>

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
          <div className="border-t border-zinc-400 pt-1 text-xs">Authorized signature (dispatch)</div>
        </div>
        <div className="text-center">
          <div className="mt-16 border-t border-zinc-400 pt-1 text-xs">Received by (customer)</div>
        </div>
      </div>
    </div>
  );
}
