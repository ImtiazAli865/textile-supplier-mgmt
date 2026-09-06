import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupplier } from "@/lib/suppliers/service";
import { DeactivateReactivateControl } from "@/components/suppliers/deactivate-reactivate-control";

interface SupplierDetailPageProps {
  params: Promise<{ supplierId: string }>;
}

export default async function SupplierDetailPage({ params }: SupplierDetailPageProps) {
  const { supplierId } = await params;
  const supplier = await getSupplier(supplierId);
  if (!supplier) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">{supplier.companyName}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            supplier.status === "active"
              ? "bg-green-100 text-green-800"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {supplier.status}
        </span>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4">
        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Address</h2>
          <p className="text-sm text-zinc-900">
            {supplier.address.line1}
            {supplier.address.line2 ? `, ${supplier.address.line2}` : ""}, {supplier.address.city}
            {supplier.address.state ? `, ${supplier.address.state}` : ""}{" "}
            {supplier.address.postalCode ?? ""}, {supplier.address.country}
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Materials / fabric types</h2>
          <p className="text-sm text-zinc-900">{supplier.materials.join(", ")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Payment terms</h2>
          <p className="text-sm text-zinc-900">{supplier.paymentTerms}</p>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Contacts</h2>
          <ul className="space-y-1">
            {supplier.contacts.map((contact, i) => (
              <li key={i} className="text-sm text-zinc-900">
                {contact.name}
                {contact.role ? ` (${contact.role})` : ""} —{" "}
                {[contact.phone, contact.email].filter(Boolean).join(" / ")}
              </li>
            ))}
          </ul>
        </section>

        {supplier.rating && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Rating</h2>
            <p className="text-sm text-zinc-900">{supplier.rating} / 5</p>
          </section>
        )}

        {supplier.notes && (
          <section>
            <h2 className="mb-1 text-sm font-medium text-zinc-500">Internal notes</h2>
            <p className="whitespace-pre-wrap text-sm text-zinc-900">{supplier.notes}</p>
          </section>
        )}

        <section className="border-t border-zinc-100 pt-3 text-xs text-zinc-400">
          Created {new Date(supplier.createdAt).toLocaleString()} · Last updated{" "}
          {new Date(supplier.updatedAt).toLocaleString()}
        </section>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={`/suppliers/${supplier.id}/edit`}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Edit
        </Link>
        <DeactivateReactivateControl supplierId={supplier.id} status={supplier.status} />
      </div>
    </div>
  );
}
