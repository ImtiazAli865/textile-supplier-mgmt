"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadPerformaInvoiceGstAttachment } from "@/app/actions/performa-invoices";
import type { PerformaInvoiceAttachment } from "@/lib/performa-invoices/schema";

/** Upload control for the externally-prepared GST Sales Tax Invoice — zero or MORE per invoice
 * (FR-011, an append, never a replace, unlike components/challans/challan-signed-copy-upload.tsx's
 * single-slot shape), usable on any already-created invoice with no effect on its totals or
 * ledger posting. */
export function PerformaInvoiceGstAttachmentUpload({
  invoiceId,
  attachments,
}: {
  invoiceId: string;
  attachments: PerformaInvoiceAttachment[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadPerformaInvoiceGstAttachment(invoiceId, formData);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-medium text-zinc-500">GST Sales Tax Invoice (external, reference only)</h2>
      {attachments.length === 0 ? (
        <p className="mb-2 text-xs text-zinc-400">Not yet attached.</p>
      ) : (
        <ul className="mb-2 space-y-1">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="text-sm text-zinc-700">
              {attachment.url ? (
                <a href={attachment.url} target="_blank" rel="noreferrer" className="underline hover:text-zinc-900">
                  {attachment.fileName}
                </a>
              ) : (
                attachment.fileName
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          disabled={isUploading}
          className="text-sm"
        />
        {isUploading && <p className="mt-1 text-xs text-zinc-500">Uploading…</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
