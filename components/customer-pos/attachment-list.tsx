"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadCustomerPOAttachment } from "@/app/actions/customer-pos";
import type { Attachment } from "@/lib/customer-pos/schema";

export function AttachmentList({ poId, attachments }: { poId: string; attachments: Attachment[] }) {
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
      const result = await uploadCustomerPOAttachment(poId, formData);
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
      <h2 className="mb-1 text-sm font-medium text-zinc-500">Attachments</h2>
      {attachments.length > 0 ? (
        <ul className="mb-2 space-y-1 text-sm text-zinc-900">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              {attachment.url ? (
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-700 underline hover:text-zinc-900"
                >
                  {attachment.fileName}
                </a>
              ) : (
                <span>{attachment.fileName}</span>
              )}
              <span className="ml-2 text-xs text-zinc-400">
                {new Date(attachment.uploadedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-zinc-400">No documents attached.</p>
      )}
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
  );
}
