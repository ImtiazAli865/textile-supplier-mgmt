"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import type { SupplierInput } from "@/lib/suppliers/schema";

export function ContactFields() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<SupplierInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "contacts" });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="block text-sm font-medium text-zinc-700">Contacts</span>
        <button
          type="button"
          onClick={() => append({ name: "", phone: "", email: "", role: "" })}
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          + Add contact
        </button>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => {
          const contactErrors = errors.contacts?.[index];
          return (
            <div
              key={field.id}
              className="grid grid-cols-2 gap-2 rounded border border-zinc-200 p-3"
            >
              <input
                placeholder="Name"
                {...register(`contacts.${index}.name` as const)}
                className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-sm"
              />
              <input
                placeholder="Phone"
                {...register(`contacts.${index}.phone` as const)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
              />
              <input
                placeholder="Email"
                {...register(`contacts.${index}.email` as const)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
              />
              <input
                placeholder="Role (optional)"
                {...register(`contacts.${index}.role` as const)}
                className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-sm"
              />
              {contactErrors?.phone && (
                <p className="col-span-2 text-xs text-red-600">{contactErrors.phone.message}</p>
              )}
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="col-span-2 justify-self-end text-xs text-red-600 hover:underline"
                >
                  Remove contact
                </button>
              )}
            </div>
          );
        })}
      </div>
      {errors.contacts?.root && (
        <p className="mt-1 text-xs text-red-600">{errors.contacts.root.message}</p>
      )}
    </div>
  );
}
