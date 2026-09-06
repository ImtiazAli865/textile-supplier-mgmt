import { SupplierForm } from "@/components/suppliers/supplier-form";

export default function NewSupplierPage() {
  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Add Supplier</h1>
      <SupplierForm mode="create" />
    </div>
  );
}
