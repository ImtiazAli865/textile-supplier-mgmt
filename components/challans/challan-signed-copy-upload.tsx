"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadChallanSignedCopy } from "@/app/actions/challans";

/** Upload control for the scanned signed copy — zero-or-one per Challan, replaced (never
 * appended) on re-upload, usable regardless of the Challan's status (FR-006). */
export function ChallanSignedCopyUpload({
  challanId,
  fileName,
  url,
}: {
  challanId: string;
  fileName: string | null;
  url: string | null;
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
      const result = await uploadChallanSignedCopy(challanId, formData);
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
      <h2 className="mb-1 text-sm font-medium text-zinc-500">Scanned signed copy</h2>
      {fileName ? (
        url ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-sm text-zinc-700 underline hover:text-zinc-900">
            {fileName}
          </a>
        ) : (
          <span className="text-sm text-zinc-700">{fileName}</span>
        )
      ) : (
        <p className="mb-2 text-xs text-zinc-400">Not yet uploaded.</p>
      )}
      <div className="mt-2">
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
