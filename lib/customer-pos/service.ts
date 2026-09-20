import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  Attachment,
  CustomerPODetail,
  CustomerPOInput,
  CustomerPOListItem,
  CustomerPOStatus,
  CustomerPOUpdateInput,
  PoLineDetail,
} from "@/lib/customer-pos/schema";
import { getSignedAttachmentUrl } from "@/lib/customer-pos/storage";

/**
 * Surfaces the DB-level guarantees create_customer_po/update_customer_po/set_customer_po_status
 * rely on (the unique-per-customer PO number constraint, and the two lock exceptions) as
 * friendly messages instead of a raw Postgres error, per contracts/server-actions.md.
 */
function toFriendlyPOError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error("A PO with this number already exists for this customer.");
  }
  if (error.message?.includes("LOCKED_LINE")) {
    return new Error(
      "This line has delivery or invoicing activity recorded against it — its quantity, unit of measure, price, and product cannot be changed here (its item code and description can still be edited)."
    );
  }
  if (error.message?.includes("LOCKED_PO")) {
    return new Error(
      "This PO has delivery or invoicing activity recorded against it and can no longer be cancelled here."
    );
  }
  return new Error(error.message);
}

interface BillingAddressRow {
  billing_address_line1: string;
  billing_address_line2: string | null;
  billing_address_city: string;
  billing_address_state: string | null;
  billing_address_postal_code: string | null;
  billing_address_country: string;
}

/**
 * Resolves a blank destinationText to the customer's current billing address, applied here
 * in the TypeScript service layer — never inside the Postgres function itself (research.md:
 * "a blank destination defaults to the customer's billing address in the TypeScript service
 * layer, not a client-side UI copy").
 */
async function resolveDestinationText(
  customerId: string,
  destinationText: string | undefined
): Promise<string | null> {
  if (destinationText && destinationText.trim() !== "") return destinationText;

  const { data, error } = await getSupabaseAdmin()
    .from("customers")
    .select(
      "billing_address_line1, billing_address_line2, billing_address_city, billing_address_state, billing_address_postal_code, billing_address_country"
    )
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as BillingAddressRow;
  const parts = [
    row.billing_address_line1,
    row.billing_address_line2,
    row.billing_address_city,
    row.billing_address_state,
    row.billing_address_postal_code,
    row.billing_address_country,
  ].filter((part): part is string => Boolean(part && part.trim() !== ""));
  return parts.join(", ");
}

function linePayload(lines: CustomerPOInput["lines"]) {
  return lines.map((line) => ({
    customerItemCode: line.customerItemCode || null,
    productId: line.productId,
    description: line.description || null,
    quantityOrdered: line.quantityOrdered,
    uom: line.uom,
    unitPrice: line.unitPrice,
  }));
}

function lineUpdatePayload(lines: CustomerPOUpdateInput["lines"]) {
  return lines.map((line) => ({
    id: line.id ?? null,
    customerItemCode: line.customerItemCode || null,
    productId: line.productId,
    description: line.description || null,
    quantityOrdered: line.quantityOrdered,
    uom: line.uom,
    unitPrice: line.unitPrice,
  }));
}

export async function createCustomerPORecord(
  input: CustomerPOInput,
  userId: string
): Promise<{ id: string }> {
  const destinationText = await resolveDestinationText(input.customerId, input.destinationText);

  const { data, error } = await getSupabaseAdmin().rpc("create_customer_po", {
    p_customer_id: input.customerId,
    p_po_number: input.poNumber,
    p_order_date: input.orderDate,
    p_purchaser_name: input.purchaserName || null,
    p_requested_delivery_date: input.requestedDeliveryDate || null,
    p_destination_text: destinationText,
    p_trade_name_id: input.tradeNameId || null,
    p_lines: linePayload(input.lines),
    p_user_id: userId,
  });
  if (error) throw toFriendlyPOError(error);
  return { id: data as string };
}

export async function updateCustomerPORecord(
  id: string,
  input: CustomerPOUpdateInput,
  userId: string
): Promise<void> {
  const destinationText = await resolveDestinationText(input.customerId, input.destinationText);

  const { error } = await getSupabaseAdmin().rpc("update_customer_po", {
    p_id: id,
    p_po_number: input.poNumber,
    p_order_date: input.orderDate,
    p_purchaser_name: input.purchaserName || null,
    p_requested_delivery_date: input.requestedDeliveryDate || null,
    p_destination_text: destinationText,
    p_trade_name_id: input.tradeNameId || null,
    p_lines: lineUpdatePayload(input.lines),
    p_user_id: userId,
  });
  if (error) throw toFriendlyPOError(error);
}

export async function setCustomerPOStatusRecord(
  id: string,
  status: CustomerPOStatus,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("set_customer_po_status", {
    p_id: id,
    p_status: status,
    p_user_id: userId,
  });
  if (error) throw toFriendlyPOError(error);
}

export async function addCustomerPOAttachmentRecord(
  poId: string,
  attachment: { storagePath: string; fileName: string; contentType: string },
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("customer_po_attachments")
    .insert({
      po_id: poId,
      storage_path: attachment.storagePath,
      file_name: attachment.fileName,
      content_type: attachment.contentType,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

interface ListLineRow {
  line_total: number;
}

interface CustomerRef {
  display_name: string;
}

interface ListCustomerPORow {
  id: string;
  customer_id: string;
  po_number: string;
  order_date: string;
  status: CustomerPOStatus;
  customers: CustomerRef | CustomerRef[] | null;
  customer_po_lines: ListLineRow[];
}

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function sumLineTotals(lines: ListLineRow[]): number {
  return lines.reduce((total, line) => total + Number(line.line_total), 0);
}

export interface ListCustomerPOsFilters {
  status?: CustomerPOStatus;
  customerId?: string;
}

export async function listCustomerPOs(
  filters: ListCustomerPOsFilters = {}
): Promise<CustomerPOListItem[]> {
  const status = filters.status ?? "open";
  let query = getSupabaseAdmin()
    .from("customer_pos")
    .select(
      "id, customer_id, po_number, order_date, status, customers(display_name), customer_po_lines(line_total)"
    )
    .eq("status", status)
    .order("order_date", { ascending: false });

  if (filters.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as ListCustomerPORow[]).map((row) => {
    const customer = firstOf(row.customers);
    return {
      id: row.id,
      customerId: row.customer_id,
      customerDisplayName: customer?.display_name ?? "",
      poNumber: row.po_number,
      orderDate: row.order_date,
      status: row.status,
      total: sumLineTotals(row.customer_po_lines ?? []),
    };
  });
}

interface DetailLineRow {
  id: string;
  position: number;
  customer_item_code: string | null;
  product_id: string;
  description: string | null;
  quantity_ordered: number;
  uom: string;
  unit_price: number;
  line_total: number;
  delivered_quantity: number;
  invoiced_quantity: number;
  products: { name: string } | { name: string }[] | null;
}

interface DetailAttachmentRow {
  id: string;
  file_name: string;
  content_type: string;
  uploaded_at: string;
  storage_path: string;
}

interface TradeNameRef {
  printed_name: string;
}

interface CustomerPORow {
  id: string;
  customer_id: string;
  po_number: string;
  order_date: string;
  purchaser_name: string | null;
  requested_delivery_date: string | null;
  destination_text: string | null;
  trade_name_id: string | null;
  status: CustomerPOStatus;
  created_at: string;
  updated_at: string;
  customers: CustomerRef | CustomerRef[] | null;
  trade_names: TradeNameRef | TradeNameRef[] | null;
  customer_po_lines: DetailLineRow[];
  customer_po_attachments: DetailAttachmentRow[];
}

const CUSTOMER_PO_DETAIL_SELECT =
  "*, customers(display_name), trade_names(printed_name), " +
  "customer_po_lines(id, position, customer_item_code, product_id, description, quantity_ordered, uom, unit_price, line_total, delivered_quantity, invoiced_quantity, products(name)), " +
  "customer_po_attachments(id, file_name, content_type, uploaded_at, storage_path)";

export async function getCustomerPO(id: string): Promise<CustomerPODetail | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("customer_pos")
    .select(CUSTOMER_PO_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as CustomerPORow;
  const customer = firstOf(row.customers);
  const tradeName = firstOf(row.trade_names);

  const lines: PoLineDetail[] = [...(row.customer_po_lines ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((line) => {
      const product = firstOf(line.products);
      return {
        id: line.id,
        customerItemCode: line.customer_item_code,
        productId: line.product_id,
        productName: product?.name ?? "",
        description: line.description,
        quantityOrdered: Number(line.quantity_ordered),
        uom: line.uom,
        unitPrice: Number(line.unit_price),
        lineTotal: Number(line.line_total),
        deliveredQuantity: Number(line.delivered_quantity),
        invoicedQuantity: Number(line.invoiced_quantity),
      };
    });

  const attachments: Attachment[] = await Promise.all(
    (row.customer_po_attachments ?? []).map(async (attachment) => ({
      id: attachment.id,
      fileName: attachment.file_name,
      contentType: attachment.content_type,
      uploadedAt: attachment.uploaded_at,
      url: await getSignedAttachmentUrl(attachment.storage_path),
    }))
  );

  return {
    id: row.id,
    customerId: row.customer_id,
    customerDisplayName: customer?.display_name ?? "",
    poNumber: row.po_number,
    orderDate: row.order_date,
    purchaserName: row.purchaser_name,
    requestedDeliveryDate: row.requested_delivery_date,
    destinationText: row.destination_text,
    tradeNameId: row.trade_name_id,
    tradeNamePrintedName: tradeName?.printed_name ?? null,
    status: row.status,
    lines,
    attachments,
    total: lines.reduce((total, line) => total + line.lineTotal, 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
