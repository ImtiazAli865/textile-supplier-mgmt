import Link from "next/link";
import { notFound } from "next/navigation";
import { getChallan } from "@/lib/challans/service";
import { ChallanStatusControls } from "@/components/challans/challan-status-controls";
import { ChallanSignedCopyUpload } from "@/components/challans/challan-signed-copy-upload";

const STATUS_STYLES: Record<string, string> = {
  issued: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  voided: "bg-zinc-100 text-zinc-600",
};

interface ChallanDetailPageProps {
  params: Promise<{ challanId: string }>;
}

export default async function ChallanDetailPage({ params }: ChallanDetailPageProps) {
  const { challanId } = await params;
  const challan = await getChallan(challanId);
  if (!challan) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Challan {challan.challanNumber}</h1>
          <p className="text-sm text-zinc-500">
            {challan.customerDisplayName} · PO{" "}
            <Link href={`/customer-pos/${challan.poId}`} className="underline hover:text-zinc-900">
              {challan.poNumber}
            </Link>{" "}
            · {challan.tradeNamePrintedName}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_STYLES[challan.status] ?? "bg-zinc-100 text-zinc-600"
          }`}
        >
          {challan.status}
        </span>
      </div>

      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Challan date</h2>
          <p className="text-sm text-zinc-900">{new Date(challan.challanDate).toLocaleDateString()}</p>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-500">Line items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="pb-2">Article</th>
                <th className="pb-2">Product</th>
                <th className="pb-2">UOM</th>
                <th className="pb-2 text-right">Price</th>
                <th className="pb-2 text-right">Delivered</th>
                <th className="pb-2 text-right">Accepted</th>
                <th className="pb-2">Shortfall disposition</th>
              </tr>
            </thead>
            <tbody>
              {challan.lines.map((line) => (
                <tr key={line.id} className="border-b border-zinc-100">
                  <td className="py-2">{line.article ?? "—"}</td>
                  <td className="py-2">{line.productName}</td>
                  <td className="py-2">{line.uom}</td>
                  <td className="py-2 text-right">Rs {line.unitPrice.toFixed(2)}</td>
                  <td className="py-2 text-right">{line.deliveredQuantity}</td>
                  <td className="py-2 text-right">{line.acceptedQuantity}</td>
                  <td className="py-2 text-zinc-500">
                    {line.acceptedQuantity < line.deliveredQuantity
                      ? (line.shortfallDisposition ?? "— not set —")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-right text-sm font-semibold text-zinc-900">
            Total: Rs {challan.total.toFixed(2)}
          </p>
        </section>

        {challan.status === "accepted" && (
          <section className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm">
            {challan.ledgerCreditAmount != null ? (
              <p className="text-zinc-900">
                Ledger credit posted: Rs {challan.ledgerCreditAmount.toFixed(2)}
              </p>
            ) : (
              <p className="text-zinc-600">
                No ledger entry — this customer is billed via Performa Invoice.
              </p>
            )}
          </section>
        )}

        <ChallanSignedCopyUpload
          challanId={challan.id}
          fileName={challan.signedCopyFileName}
          url={challan.signedCopyUrl}
        />

        <section className="border-t border-zinc-100 pt-3 text-xs text-zinc-400">
          Created {new Date(challan.createdAt).toLocaleString()} · Last updated{" "}
          {new Date(challan.updatedAt).toLocaleString()}
          {challan.acceptedAt && <> · Accepted {new Date(challan.acceptedAt).toLocaleString()}</>}
        </section>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={`/challans/${challan.id}/print`}
          target="_blank"
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Print
        </Link>
        {challan.status === "issued" && (
          <Link
            href={`/challans/${challan.id}/edit`}
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Edit
          </Link>
        )}
        <ChallanStatusControls challan={challan} />
      </div>
    </div>
  );
}
