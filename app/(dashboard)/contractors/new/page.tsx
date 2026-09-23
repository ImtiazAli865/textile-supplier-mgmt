import { ContractorForm } from "@/components/contractors/contractor-form";

export default function NewContractorPage() {
  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">New contractor</h1>
      <ContractorForm mode="create" />
    </div>
  );
}
