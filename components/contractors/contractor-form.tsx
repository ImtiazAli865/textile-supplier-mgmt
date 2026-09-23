"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contractorInputSchema, type ContractorInput } from "@/lib/contractors/schema";
import { createContractor, updateContractor } from "@/app/actions/contractors";

type ContractorFormProps =
  | { mode: "create" }
  | { mode: "edit"; contractorId: string; defaultValues: ContractorInput };

export function ContractorForm(props: ContractorFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ContractorInput>({
    resolver: zodResolver(contractorInputSchema),
    defaultValues: props.mode === "edit" ? props.defaultValues : { name: "", phone: "" },
  });

  async function submit(data: ContractorInput) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result =
        props.mode === "edit"
          ? await updateContractor(props.contractorId, data)
          : await createContractor(data);
      if (result.success) {
        router.push("/contractors");
        router.refresh();
        return;
      }
      setFormError(result.error);
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          setError(field as keyof ContractorInput, { message: messages[0] });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="max-w-lg space-y-6 rounded-lg border border-zinc-200 bg-white p-6"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Name</label>
        <input {...register("name")} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Phone (optional)</label>
        <input {...register("phone")} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" />
        {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : props.mode === "create" ? "Add Contractor" : "Save Changes"}
      </button>
    </form>
  );
}
