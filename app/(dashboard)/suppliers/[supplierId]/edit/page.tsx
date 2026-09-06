import { notFound } from "next/navigation";
import { getSupplier } from "@/lib/suppliers/service";
import { SupplierForm } from "@/components/suppliers/supplier-form";

interface EditSupplierPageProps {
  params: Promise<{ supplierId: string }>;
}

export default async function EditSupplierPage({ params }: EditSupplierPageProps) {
  const { supplierId } = await params;
  const supplier = await getSupplier(supplierId);
  if (!supplier) notFound();

  const { companyName, address, materials, paymentTerms, notes, rating, contacts } = supplier;

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit {supplier.companyName}</h1>
      <SupplierForm
        mode="edit"
        supplierId={supplier.id}
        defaultValues={{ companyName, address, materials, paymentTerms, notes, rating, contacts }}
      />
    </div>
  );
}
