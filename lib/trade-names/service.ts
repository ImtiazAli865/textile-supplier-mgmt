import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  TradeName,
  TradeNameDetail,
  TradeNameInput,
  TradeNameListItem,
  TradeNameStatus,
} from "@/lib/trade-names/schema";
import {
  deleteTradeNameAsset,
  getSignedAssetUrl,
  uploadTradeNameAsset,
  type TradeNameAssetKind,
} from "@/lib/trade-names/storage";

interface TradeNameRow {
  id: string;
  printed_name: string;
  printed_address: string;
  ntn_number: string | null;
  sales_tax_registration_number: string | null;
  signature_image_path: string | null;
  stamp_image_path: string | null;
  next_challan_number: number;
  next_invoice_number: number;
  status: TradeNameStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

function toTradeName(row: TradeNameRow): TradeName {
  return {
    id: row.id,
    printedName: row.printed_name,
    printedAddress: row.printed_address,
    ntnNumber: row.ntn_number ?? undefined,
    salesTaxRegistrationNumber: row.sales_tax_registration_number ?? undefined,
    signatureImagePath: row.signature_image_path,
    stampImagePath: row.stamp_image_path,
    nextChallanNumber: row.next_challan_number,
    nextInvoiceNumber: row.next_invoice_number,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export async function createTradeNameRecord(
  input: TradeNameInput,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("trade_names")
    .insert({
      printed_name: input.printedName,
      printed_address: input.printedAddress,
      ntn_number: input.ntnNumber || null,
      sales_tax_registration_number: input.salesTaxRegistrationNumber || null,
      next_challan_number: input.nextChallanNumber,
      next_invoice_number: input.nextInvoiceNumber,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

export async function updateTradeNameRecord(
  id: string,
  input: TradeNameInput,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("trade_names")
    .update({
      printed_name: input.printedName,
      printed_address: input.printedAddress,
      ntn_number: input.ntnNumber || null,
      sales_tax_registration_number: input.salesTaxRegistrationNumber || null,
      next_challan_number: input.nextChallanNumber,
      next_invoice_number: input.nextInvoiceNumber,
      updated_by: userId,
      // status, signature_image_path, stamp_image_path are intentionally omitted —
      // only setTradeNameStatusRecord/replaceTradeNameAssetRecord may change those.
    })
    .eq("id", id);
  if (error) throw error;
}

export async function setTradeNameStatusRecord(
  id: string,
  status: TradeNameStatus,
  userId: string
): Promise<void> {
  // Unconditional set is a safe no-op when the trade name is already in the
  // target status (spec Edge Cases): it succeeds without error either way.
  const { error } = await getSupabaseAdmin()
    .from("trade_names")
    .update({ status, updated_by: userId })
    .eq("id", id);
  if (error) throw error;
}

export interface ListTradeNamesFilters {
  status?: TradeNameStatus;
}

export async function listTradeNames(
  filters: ListTradeNamesFilters = {}
): Promise<TradeNameListItem[]> {
  const status = filters.status ?? "active";
  const { data, error } = await getSupabaseAdmin()
    .from("trade_names")
    .select("id, printed_name, status")
    .eq("status", status)
    .order("printed_name", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    printedName: row.printed_name as string,
    status: row.status as TradeNameStatus,
  }));
}

/** Thin wrapper over listTradeNames — reused, not reimplemented, by 005-customers' trade-name-hint picker. */
export async function listActiveTradeNamesForSelect(): Promise<
  { id: string; printedName: string }[]
> {
  const tradeNames = await listTradeNames({ status: "active" });
  return tradeNames.map(({ id, printedName }) => ({ id, printedName }));
}

export async function getTradeName(id: string): Promise<TradeNameDetail | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("trade_names")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const tradeName = toTradeName(data as unknown as TradeNameRow);
  const [signatureImageUrl, stampImageUrl] = await Promise.all([
    tradeName.signatureImagePath ? getSignedAssetUrl(tradeName.signatureImagePath) : null,
    tradeName.stampImagePath ? getSignedAssetUrl(tradeName.stampImagePath) : null,
  ]);
  return { ...tradeName, signatureImageUrl, stampImageUrl };
}

const ASSET_COLUMN: Record<TradeNameAssetKind, "signature_image_path" | "stamp_image_path"> = {
  signature: "signature_image_path",
  stamp: "stamp_image_path",
};

/**
 * Replaces a trade name's signature or stamp image: upload the new object,
 * point the row at it, then best-effort delete the old object if one existed.
 * See research.md for why this ordering — never delete-then-upload — is the
 * only way to guarantee the row never points at a missing file.
 */
export async function replaceTradeNameAssetRecord(
  id: string,
  kind: TradeNameAssetKind,
  file: File
): Promise<{ path: string }> {
  const column = ASSET_COLUMN[kind];
  const admin = getSupabaseAdmin();

  const { data: existing, error: fetchError } = await admin
    .from("trade_names")
    .select(column)
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  const oldPath = ((existing as Record<string, string | null> | null)?.[column] ?? null) as
    | string
    | null;

  const { path } = await uploadTradeNameAsset(id, kind, file);

  const { error: updateError } = await admin.from("trade_names").update({ [column]: path }).eq("id", id);
  if (updateError) throw updateError;

  if (oldPath) {
    await deleteTradeNameAsset(oldPath);
  }

  return { path };
}
