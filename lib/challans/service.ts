import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCustomerPO } from "@/lib/customer-pos/service";
import { getTradeName } from "@/lib/trade-names/service";
import {
  uploadChallanSignedCopy as uploadSignedCopyFile,
  deleteChallanSignedCopy,
  getSignedChallanCopyUrl,
} from "@/lib/challans/storage";
import type {
  ChallanDetail,
  ChallanInput,
  ChallanLineDetail,
  ChallanListItem,
  ChallanPrintView,
  ChallanStatus,
  ChallanUpdateInput,
} from "@/lib/challans/schema";

/** Surfaces the DB-level guarantees create_challan/update_challan/void_challan/accept_challan
 * rely on as friendly messages instead of a raw Postgres error, per contracts/server-actions.md. */
export class MissingShortfallDispositionError extends Error {
  lineIds: string[];
  constructor(lineIds: string[]) {
    super(
      "Line(s) with a short receipt need a disposition (return to inventory or write off) before this Challan can be accepted."
    );
    this.name = "MissingShortfallDispositionError";
    this.lineIds = lineIds;
  }
}

function toFriendlyChallanError(error: { code?: string; message: string }): Error {
  const msg = error.message ?? "";

  if (error.code === "23505") {
    return new Error("A Challan with this number already exists for this trade name.");
  }
  if (msg.includes("MISSING_SHORTFALL_DISPOSITION")) {
    const ids = msg.split("MISSING_SHORTFALL_DISPOSITION:")[1]?.split(",").filter(Boolean) ?? [];
    return new MissingShortfallDispositionError(ids);
  }
  if (msg.includes("PO_NOT_OPEN")) {
    return new Error("This PO does not exist or is not open.");
  }
  if (msg.includes("TRADE_NAME_NOT_FOUND")) {
    return new Error("Select a valid trade name.");
  }
  if (msg.includes("LINE_FULLY_DELIVERED")) {
    return new Error("One of the selected lines has no remaining quantity to deliver.");
  }
  if (msg.includes("LINE_EXCEEDS_REMAINING")) {
    return new Error("A line's delivered quantity exceeds what remains on the PO.");
  }
  if (msg.includes("PO_LINE_NOT_FOUND")) {
    return new Error("A selected line does not belong to this PO.");
  }
  if (msg.includes("DUPLICATE_PO_LINE")) {
    return new Error(
      "This Challan references the same PO line more than once — each PO line can appear at most once per Challan."
    );
  }
  if (msg.includes("ACCEPTED_EXCEEDS_DELIVERED")) {
    return new Error("Accepted quantity cannot exceed delivered quantity.");
  }
  if (msg.includes("CHALLAN_NOT_EDITABLE")) {
    return new Error(
      "This Challan has already been accepted or voided and can no longer be edited."
    );
  }
  if (msg.includes("CHALLAN_NOT_VOIDABLE")) {
    return new Error("An accepted Challan cannot be voided.");
  }
  if (msg.includes("CHALLAN_NOT_ISSUED")) {
    return new Error("This Challan has already been accepted or voided.");
  }
  if (msg.includes("PO_CANCELLED")) {
    return new Error(
      "The referenced PO is cancelled — reactivate it before accepting this Challan."
    );
  }
  if (msg.includes("NO_ACCEPTED_QUANTITY")) {
    return new Error("At least one line must have a positive accepted quantity.");
  }
  return new Error(error.message);
}

function linePayload(lines: ChallanInput["lines"]) {
  return lines.map((line) => ({
    poLineId: line.poLineId,
    deliveredQuantity: line.deliveredQuantity,
  }));
}

function lineUpdatePayload(lines: ChallanUpdateInput["lines"]) {
  return lines.map((line) => ({
    poLineId: line.poLineId,
    deliveredQuantity: line.deliveredQuantity,
    acceptedQuantity: line.acceptedQuantity,
    shortfallDisposition: line.shortfallDisposition || null,
  }));
}

/** Undelivered lines of an open PO, for the "Create Challan" form's line picker. Reuses 006's
 * already-exported getCustomerPO and derives `remaining` in TypeScript (contracts/server-actions.md)
 * — no new export needed from lib/customer-pos/service.ts. */
export async function getOpenPOLinesForChallan(poId: string): Promise<
  {
    id: string;
    customerItemCode: string | null;
    productName: string;
    uom: string;
    unitPrice: number;
    quantityOrdered: number;
    deliveredQuantity: number;
    remaining: number;
  }[]
> {
  const po = await getCustomerPO(poId);
  if (!po) return [];

  return po.lines
    .map((line) => ({
      id: line.id,
      customerItemCode: line.customerItemCode,
      productName: line.productName,
      uom: line.uom,
      unitPrice: line.unitPrice,
      quantityOrdered: line.quantityOrdered,
      deliveredQuantity: line.deliveredQuantity,
      remaining: line.quantityOrdered - line.deliveredQuantity,
    }))
    .filter((line) => line.remaining > 0);
}

export async function createChallanRecord(
  input: ChallanInput,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin().rpc("create_challan", {
    p_po_id: input.poId,
    p_trade_name_id: input.tradeNameId,
    p_challan_number: input.challanNumber || null,
    p_challan_date: input.challanDate.slice(0, 10),
    p_lines: linePayload(input.lines),
    p_user_id: userId,
  });
  if (error) throw toFriendlyChallanError(error);
  return { id: data as string };
}

export async function updateChallanRecord(
  id: string,
  input: ChallanUpdateInput,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("update_challan", {
    p_id: id,
    p_trade_name_id: input.tradeNameId,
    p_challan_number: input.challanNumber,
    p_challan_date: input.challanDate.slice(0, 10),
    p_lines: lineUpdatePayload(input.lines),
    p_user_id: userId,
  });
  if (error) throw toFriendlyChallanError(error);
}

export async function voidChallanRecord(id: string, userId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("void_challan", {
    p_id: id,
    p_user_id: userId,
  });
  if (error) throw toFriendlyChallanError(error);
}

export async function acceptChallanRecord(id: string, userId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("accept_challan", {
    p_id: id,
    p_user_id: userId,
  });
  if (error) throw toFriendlyChallanError(error);
}

/** Uploads a Challan's scanned signed copy and points the row at it, best-effort deleting the
 * previous object if one existed — 004's three-step ordering, never delete-then-upload
 * (lib/trade-names/service.ts's replaceTradeNameAssetRecord is the exact precedent). Allowed
 * regardless of the Challan's status (FR-006). */
export async function recordChallanSignedCopy(
  challanId: string,
  file: File,
  userId: string
): Promise<{ fileName: string }> {
  const admin = getSupabaseAdmin();

  const { data: existing, error: fetchError } = await admin
    .from("challans")
    .select("signed_copy_storage_path")
    .eq("id", challanId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) throw new Error("Challan not found");
  const oldPath = existing.signed_copy_storage_path as string | null;

  const { path } = await uploadSignedCopyFile(challanId, file);

  const { error: updateError } = await admin
    .from("challans")
    .update({
      signed_copy_storage_path: path,
      signed_copy_file_name: file.name,
      signed_copy_content_type: file.type || "application/octet-stream",
      signed_copy_uploaded_at: new Date().toISOString(),
      signed_copy_uploaded_by: userId,
    })
    .eq("id", challanId);
  if (updateError) throw updateError;

  if (oldPath) {
    await deleteChallanSignedCopy(oldPath);
  }

  return { fileName: file.name };
}

interface CustomerRef {
  display_name: string;
  legal_name: string;
}

interface TradeNameRef {
  printed_name: string;
}

interface PoRef {
  po_number: string;
  customer_id: string;
  customers: CustomerRef | CustomerRef[] | null;
}

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface ListChallansFilters {
  poId?: string;
  customerId?: string;
  status?: ChallanStatus;
}

interface ListChallanRow {
  id: string;
  challan_number: string;
  challan_date: string;
  status: ChallanStatus;
  po_id: string;
  customer_pos: PoRef | PoRef[] | null;
  trade_names: TradeNameRef | TradeNameRef[] | null;
}

export async function listChallans(filters: ListChallansFilters = {}): Promise<ChallanListItem[]> {
  let query = getSupabaseAdmin()
    .from("challans")
    .select(
      "id, challan_number, challan_date, status, po_id, customer_pos!inner(po_number, customer_id, customers(display_name, legal_name)), trade_names(printed_name)"
    )
    .order("challan_date", { ascending: false });

  if (filters.poId) query = query.eq("po_id", filters.poId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.customerId) query = query.eq("customer_pos.customer_id", filters.customerId);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as ListChallanRow[]).map((row) => {
    const po = firstOf(row.customer_pos);
    const customer = po ? firstOf(po.customers) : null;
    const tradeName = firstOf(row.trade_names);
    return {
      id: row.id,
      challanNumber: row.challan_number,
      challanDate: row.challan_date,
      status: row.status,
      poId: row.po_id,
      poNumber: po?.po_number ?? "",
      customerId: po?.customer_id ?? "",
      customerDisplayName: customer?.display_name ?? "",
      tradeNamePrintedName: tradeName?.printed_name ?? "",
    };
  });
}

interface DetailLineRow {
  id: string;
  position: number;
  po_line_id: string;
  product_id: string;
  uom: string;
  unit_price: number;
  delivered_quantity: number;
  accepted_quantity: number;
  shortfall_disposition: ChallanLineDetail["shortfallDisposition"];
  products: { name: string } | { name: string }[] | null;
  customer_po_lines: { customer_item_code: string | null } | { customer_item_code: string | null }[] | null;
}

interface ChallanRow {
  id: string;
  po_id: string;
  trade_name_id: string;
  challan_number: string;
  challan_date: string;
  status: ChallanStatus;
  signed_copy_storage_path: string | null;
  signed_copy_file_name: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  customer_pos: PoRef | PoRef[] | null;
  trade_names: TradeNameRef | TradeNameRef[] | null;
  challan_lines: DetailLineRow[];
}

const CHALLAN_DETAIL_SELECT =
  "*, customer_pos(po_number, customer_id, customers(display_name, legal_name)), trade_names(printed_name), " +
  "challan_lines(id, position, po_line_id, product_id, uom, unit_price, delivered_quantity, accepted_quantity, shortfall_disposition, products(name), customer_po_lines(customer_item_code))";

function mapLines(rows: DetailLineRow[]): ChallanLineDetail[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((line) => {
      const product = firstOf(line.products);
      const poLine = firstOf(line.customer_po_lines);
      return {
        id: line.id,
        poLineId: line.po_line_id,
        article: poLine?.customer_item_code ?? null,
        productName: product?.name ?? "",
        uom: line.uom,
        unitPrice: Number(line.unit_price),
        deliveredQuantity: Number(line.delivered_quantity),
        acceptedQuantity: Number(line.accepted_quantity),
        shortfallDisposition: line.shortfall_disposition,
      };
    });
}

async function getLedgerCreditAmount(challanId: string): Promise<number | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ledger_entries")
    .select("amount")
    .eq("source_type", "challan")
    .eq("source_id", challanId)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.amount) : null;
}

export async function getChallan(id: string): Promise<ChallanDetail | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("challans")
    .select(CHALLAN_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as ChallanRow;
  const po = firstOf(row.customer_pos);
  const customer = po ? firstOf(po.customers) : null;
  const tradeName = firstOf(row.trade_names);
  const lines = mapLines(row.challan_lines ?? []);

  const [signedCopyUrl, ledgerCreditAmount] = await Promise.all([
    row.signed_copy_storage_path ? getSignedChallanCopyUrl(row.signed_copy_storage_path) : null,
    row.status === "accepted" ? getLedgerCreditAmount(id) : null,
  ]);

  return {
    id: row.id,
    poId: row.po_id,
    poNumber: po?.po_number ?? "",
    customerId: po?.customer_id ?? "",
    customerDisplayName: customer?.display_name ?? "",
    customerLegalName: customer?.legal_name ?? "",
    tradeNameId: row.trade_name_id,
    tradeNamePrintedName: tradeName?.printed_name ?? "",
    challanNumber: row.challan_number,
    challanDate: row.challan_date,
    status: row.status,
    lines,
    total: lines.reduce((total, line) => total + line.acceptedQuantity * line.unitPrice, 0),
    signedCopyFileName: row.signed_copy_file_name,
    signedCopyUrl,
    ledgerCreditAmount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    acceptedBy: row.accepted_by,
  };
}

/** Same underlying data as getChallan, reshaped for the standalone print route: quantities
 * only, no pricing (the real Challan's printed columns have no price column, spec FR-005), plus
 * the trade name's signature/stamp images resolved via 004's already-exported getTradeName. */
export async function getChallanForPrint(id: string): Promise<ChallanPrintView | null> {
  const challan = await getChallan(id);
  if (!challan) return null;

  const tradeName = await getTradeName(challan.tradeNameId);

  const lines = challan.lines.map((line, index) => ({
    sNo: index + 1,
    article: line.article,
    itemName: line.productName,
    uom: line.uom,
    quantity: line.deliveredQuantity,
  }));

  return {
    tradeNamePrintedName: tradeName?.printedName ?? "",
    tradeNamePrintedAddress: tradeName?.printedAddress ?? "",
    signatureImageUrl: tradeName?.signatureImageUrl ?? null,
    stampImageUrl: tradeName?.stampImageUrl ?? null,
    challanNumber: challan.challanNumber,
    challanDate: challan.challanDate,
    customerLegalName: challan.customerLegalName,
    poNumber: challan.poNumber,
    lines,
    totalQuantity: lines.reduce((total, line) => total + line.quantity, 0),
  };
}
