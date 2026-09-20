"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadTradeNameSignature, uploadTradeNameStamp } from "@/app/actions/trade-names";

interface TradeNameAssetUploadProps {
  tradeNameId: string;
  kind: "signature" | "stamp";
  label: string;
  currentImageUrl: string | null;
}

export function TradeNameAssetUpload({
  tradeNameId,
  kind,
  label,
  currentImageUrl,
}: TradeNameAssetUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const action = kind === "signature" ? uploadTradeNameSignature : uploadTradeNameStamp;
      const result = await action(tradeNameId, formData);
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
      <h2 className="mb-1 text-sm font-medium text-zinc-500">{label}</h2>
      {currentImageUrl ? (
        // Plain <img>, not next/image: this is a short-lived signed URL
        // (ADR-0003) that changes on every render, which defeats Next's
        // image optimizer/cache rather than benefiting from it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentImageUrl}
          alt={label}
          className="mb-2 max-h-24 rounded border border-zinc-200 bg-white p-1"
        />
      ) : (
        <p className="mb-2 text-xs text-zinc-400">Not uploaded yet.</p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={handleFileChange}
        disabled={isUploading}
        className="text-sm"
      />
      {isUploading && <p className="mt-1 text-xs text-zinc-500">Uploading…</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
