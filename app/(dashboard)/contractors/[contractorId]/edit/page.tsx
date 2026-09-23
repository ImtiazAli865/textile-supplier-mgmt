import { notFound } from "next/navigation";
import { getContractor } from "@/lib/contractors/service";
import { ContractorForm } from "@/components/contractors/contractor-form";

interface EditContractorPageProps {
  params: Promise<{ contractorId: string }>;
}

export default async function EditContractorPage({ params }: EditContractorPageProps) {
  const { contractorId } = await params;
  const contractor = await getContractor(contractorId);
  if (!contractor) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit {contractor.name}</h1>
      <ContractorForm
        mode="edit"
        contractorId={contractor.id}
        defaultValues={{ name: contractor.name, phone: contractor.phone ?? "" }}
      />
    </div>
  );
}
