import Link from "next/link";
import { listManufacturedOpeningStockStatus } from "@/lib/production-batches/service";
import { OpeningStockTable } from "@/components/production-batches/opening-stock-table";

export default async function OpeningStockPage() {
  const rows = await listManufacturedOpeningStockStatus();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Manufactured opening stock</h1>
        <Link href="/production-batches" className="text-sm text-zinc-600 underline">
          Back to batches
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-zinc-500">
        A one-time go-live entry for finished packets already on the shelf that no production batch
        recorded. Each product takes one opening entry (with an optional cost per packet) and at
        most one correction, allowed only until stock of that product goes out on an accepted
        Challan.
      </p>
      <OpeningStockTable rows={rows} />
    </div>
  );
}
