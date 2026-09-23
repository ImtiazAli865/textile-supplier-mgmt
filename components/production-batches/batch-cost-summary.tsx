import type { BatchDetail } from "@/lib/production-batches/schema";

function rs(value: number): string {
  return `Rs ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Frozen cost / wastage / variance breakdown of a Completed batch (FR-016 to FR-019, US5-3). */
export function BatchCostSummary({
  completion,
  weightIssuedKg,
}: {
  completion: NonNullable<BatchDetail["completion"]>;
  weightIssuedKg: number;
}) {
  const variance = completion.yieldVariance;
  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Cost breakdown (frozen at completion)</h2>

      <table className="w-full text-sm">
        <tbody>
          <tr className="border-b border-zinc-100">
            <td className="py-1.5 text-zinc-500">
              Raw material cost ({weightIssuedKg.toFixed(2)} kg issued × Rs{" "}
              {completion.lotRatePerKg.toFixed(2)}/kg)
            </td>
            <td className="py-1.5 text-right text-zinc-900">{rs(completion.rawMaterialCost)}</td>
          </tr>
          <tr className="border-b border-zinc-100">
            <td className="py-1.5 text-zinc-500">
              Labour cost ({completion.packetsProduced.toLocaleString()} packets)
            </td>
            <td className="py-1.5 text-right text-zinc-900">{rs(completion.labourCost)}</td>
          </tr>
          <tr className="border-b border-zinc-100 font-medium">
            <td className="py-1.5 text-zinc-700">Total production cost</td>
            <td className="py-1.5 text-right text-zinc-900">{rs(completion.totalCost)}</td>
          </tr>
          <tr className="font-medium">
            <td className="py-1.5 text-zinc-700">Average cost per packet</td>
            <td className="py-1.5 text-right text-zinc-900">{rs(completion.avgCostPerPacket)}</td>
          </tr>
        </tbody>
      </table>

      <section>
        <h3 className="mb-1 text-sm font-medium text-zinc-500">Wastage (reported only — not deducted)</h3>
        <p className="text-sm text-zinc-900">
          {completion.wastageKg.toFixed(2)} kg · {rs(completion.wastageValue)} ·{" "}
          {completion.wastagePct.toFixed(2)}%
        </p>
        {completion.returnedWeightExceeded && (
          <p className="mt-1 text-xs text-amber-700">
            Returned weight ({completion.returnedWeightKg.toFixed(2)} kg) exceeded the weight issued,
            so wastage is recorded as 0.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-medium text-zinc-500">Yield (for information only)</h3>
        <p className="text-sm text-zinc-900">
          {completion.packetsProduced.toLocaleString()} produced vs{" "}
          {completion.expectedPackets.toLocaleString()} expected · variance {variance >= 0 ? "+" : ""}
          {variance.toLocaleString()}
          {completion.yieldVariancePct !== null &&
            ` (${completion.yieldVariancePct >= 0 ? "+" : ""}${completion.yieldVariancePct.toFixed(2)}%)`}
        </p>
      </section>
    </div>
  );
}
