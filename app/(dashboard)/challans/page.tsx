import Link from "next/link";
import { listChallans } from "@/lib/challans/service";
import { listActiveCustomersForSelect } from "@/lib/customers/service";
import { ChallanFilters, ChallanList } from "@/components/challans/challan-list";
import type { ChallanStatus } from "@/lib/challans/schema";

interface ChallansPageProps {
  searchParams: Promise<{ poId?: string; customerId?: string; status?: string }>;
}

const VALID_STATUSES: ChallanStatus[] = ["issued", "accepted", "voided"];

export default async function ChallansPage({ searchParams }: ChallansPageProps) {
  const params = await searchParams;
  const status = VALID_STATUSES.includes(params.status as ChallanStatus)
    ? (params.status as ChallanStatus)
    : undefined;
  const poId = params.poId || undefined;
  const customerId = params.customerId || undefined;

  const [challans, customerOptions] = await Promise.all([
    listChallans({ poId, customerId, status }),
    listActiveCustomersForSelect(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Challans</h1>
        <Link
          href="/challans/new"
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Create Challan
        </Link>
      </div>
      <ChallanFilters customerOptions={customerOptions} />
      <ChallanList challans={challans} />
    </div>
  );
}
