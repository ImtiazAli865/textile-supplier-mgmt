import Link from "next/link";
import { notFound } from "next/navigation";
import { getTradeName } from "@/lib/trade-names/service";
import { TradeNameAssetUpload } from "@/components/trade-names/trade-name-asset-upload";
import { DeactivateReactivateControl } from "@/components/trade-names/deactivate-reactivate-control";

interface TradeNameDetailPageProps {
  params: Promise<{ tradeNameId: string }>;
}

export default async function TradeNameDetailPage({ params }: TradeNameDetailPageProps) {
  const { tradeNameId } = await params;
  const tradeName = await getTradeName(tradeNameId);
  if (!tradeName) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">{tradeName.printedName}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            tradeName.status === "active"
              ? "bg-green-100 text-green-800"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {tradeName.status}
        </span>
      </div>

      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Printed address</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-900">{tradeName.printedAddress}</p>
        </section>

        {tradeName.ntnNumber && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">NTN number</h2>
            <p className="text-sm text-zinc-900">{tradeName.ntnNumber}</p>
          </section>
        )}

        {tradeName.salesTaxRegistrationNumber && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">
              Sales Tax Registration number
            </h2>
            <p className="text-sm text-zinc-900">{tradeName.salesTaxRegistrationNumber}</p>
          </section>
        )}

        <section>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-500">Document numbers</h2>
            <Link href={`/trade-names/${tradeName.id}/edit`} className="text-xs text-zinc-500 underline">
              Override
            </Link>
          </div>
          <p className="text-sm text-zinc-900">
            Next Challan #: {tradeName.nextChallanNumber} · Next Invoice #:{" "}
            {tradeName.nextInvoiceNumber}
          </p>
        </section>

        <div className="grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4">
          <TradeNameAssetUpload
            tradeNameId={tradeName.id}
            kind="signature"
            label="Signature"
            currentImageUrl={tradeName.signatureImageUrl}
          />
          <TradeNameAssetUpload
            tradeNameId={tradeName.id}
            kind="stamp"
            label="Company stamp"
            currentImageUrl={tradeName.stampImageUrl}
          />
        </div>

        <section className="border-t border-zinc-100 pt-3 text-xs text-zinc-400">
          Created {new Date(tradeName.createdAt).toLocaleString()} · Last updated{" "}
          {new Date(tradeName.updatedAt).toLocaleString()}
        </section>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={`/trade-names/${tradeName.id}/edit`}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Edit
        </Link>
        <DeactivateReactivateControl tradeNameId={tradeName.id} status={tradeName.status} />
      </div>
    </div>
  );
}
