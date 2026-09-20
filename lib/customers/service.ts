import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  Customer,
  CustomerDetail,
  CustomerInput,
  CustomerListItem,
  CustomerStatus,
  CustomerUpdateInput,
} from "@/lib/customers/schema";
import { getCustomerLedgerBalance } from "@/lib/customers/ledger";
import { listCustomerProductMappings } from "@/lib/customers/product-mappings";

interface CustomerContactRow {
  position: number;
  name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
}

interface CustomerShipToRow {
  position: number;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  country: string;
}

interface TradeNameRef {
  id: string;
  printed_name: string;
}

interface CustomerTradeNameRow {
  position: number;
  trade_names: TradeNameRef | TradeNameRef[] | null;
}

interface CustomerRow {
  id: string;
  display_name: string;
  legal_name: string;
  billing_address_line1: string;
  billing_address_line2: string | null;
  billing_address_city: string;
  billing_address_state: string | null;
  billing_address_postal_code: string | null;
  billing_address_country: string;
  telephone: string | null;
  ntn_number: string | null;
  sales_tax_registration_number: string | null;
  issues_performa_invoice: boolean;
  payment_terms_min_days: number;
  payment_terms_max_days: number;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  customer_contacts: CustomerContactRow[];
  customer_ship_to_addresses: CustomerShipToRow[];
  customer_trade_names: CustomerTradeNameRow[];
}

const CUSTOMER_DETAIL_SELECT =
  "*, customer_contacts(position, name, phone, email, role), " +
  "customer_ship_to_addresses(position, label, line1, line2, city, state, postal_code, country), " +
  "customer_trade_names(position, trade_names(id, printed_name))";

function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

function toCustomer(row: CustomerRow): Customer {
  const contacts = [...(row.customer_contacts ?? [])].sort(byPosition).map((c) => ({
    name: c.name,
    phone: c.phone ?? undefined,
    email: c.email ?? undefined,
    role: c.role ?? undefined,
  }));

  const shipToAddresses = [...(row.customer_ship_to_addresses ?? [])].sort(byPosition).map((a) => ({
    label: a.label ?? undefined,
    line1: a.line1,
    line2: a.line2 ?? undefined,
    city: a.city,
    state: a.state ?? undefined,
    postalCode: a.postal_code ?? undefined,
    country: a.country,
  }));

  const tradeNameHints = [...(row.customer_trade_names ?? [])].sort(byPosition).map((t) => {
    const tradeName = Array.isArray(t.trade_names) ? t.trade_names[0] : t.trade_names;
    return { id: tradeName?.id ?? "", printedName: tradeName?.printed_name ?? "" };
  });

  return {
    id: row.id,
    displayName: row.display_name,
    legalName: row.legal_name,
    billingAddress: {
      line1: row.billing_address_line1,
      line2: row.billing_address_line2 ?? undefined,
      city: row.billing_address_city,
      state: row.billing_address_state ?? undefined,
      postalCode: row.billing_address_postal_code ?? undefined,
      country: row.billing_address_country,
    },
    telephone: row.telephone ?? undefined,
    ntnNumber: row.ntn_number ?? undefined,
    salesTaxRegistrationNumber: row.sales_tax_registration_number ?? undefined,
    issuesPerformaInvoice: row.issues_performa_invoice,
    paymentTermsMinDays: row.payment_terms_min_days,
    paymentTermsMaxDays: row.payment_terms_max_days,
    contacts,
    shipToAddresses,
    tradeNameHints,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function contactsPayload(contacts: CustomerInput["contacts"]) {
  return contacts.map((c) => ({
    name: c.name,
    phone: c.phone || null,
    email: c.email || null,
    role: c.role || null,
  }));
}

function shipToAddressesPayload(shipToAddresses: CustomerInput["shipToAddresses"]) {
  return shipToAddresses.map((a) => ({
    label: a.label || null,
    line1: a.line1,
    line2: a.line2 || null,
    city: a.city,
    state: a.state || null,
    postalCode: a.postalCode || null,
    country: a.country,
  }));
}

export async function createCustomerRecord(
  input: CustomerInput,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin().rpc("create_customer", {
    p_display_name: input.displayName,
    p_legal_name: input.legalName,
    p_billing_address_line1: input.billingAddress.line1,
    p_billing_address_line2: input.billingAddress.line2 || null,
    p_billing_address_city: input.billingAddress.city,
    p_billing_address_state: input.billingAddress.state || null,
    p_billing_address_postal_code: input.billingAddress.postalCode || null,
    p_billing_address_country: input.billingAddress.country,
    p_telephone: input.telephone || null,
    p_ntn_number: input.ntnNumber || null,
    p_sales_tax_registration_number: input.salesTaxRegistrationNumber || null,
    p_issues_performa_invoice: input.issuesPerformaInvoice,
    p_payment_terms_min_days: input.paymentTermsMinDays,
    p_payment_terms_max_days: input.paymentTermsMaxDays,
    p_contacts: contactsPayload(input.contacts),
    p_ship_to_addresses: shipToAddressesPayload(input.shipToAddresses),
    p_trade_name_ids: input.tradeNameHintIds,
    p_opening_balance_amount: input.openingBalance?.amount ?? null,
    p_opening_balance_type: input.openingBalance?.type ?? null,
    p_opening_balance_date: input.openingBalance?.asOfDate ?? null,
    p_user_id: userId,
  });
  if (error) throw error;
  return { id: data as string };
}

export async function updateCustomerRecord(
  id: string,
  input: CustomerUpdateInput,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("update_customer", {
    p_id: id,
    p_display_name: input.displayName,
    p_legal_name: input.legalName,
    p_billing_address_line1: input.billingAddress.line1,
    p_billing_address_line2: input.billingAddress.line2 || null,
    p_billing_address_city: input.billingAddress.city,
    p_billing_address_state: input.billingAddress.state || null,
    p_billing_address_postal_code: input.billingAddress.postalCode || null,
    p_billing_address_country: input.billingAddress.country,
    p_telephone: input.telephone || null,
    p_ntn_number: input.ntnNumber || null,
    p_sales_tax_registration_number: input.salesTaxRegistrationNumber || null,
    p_issues_performa_invoice: input.issuesPerformaInvoice,
    p_payment_terms_min_days: input.paymentTermsMinDays,
    p_payment_terms_max_days: input.paymentTermsMaxDays,
    p_contacts: contactsPayload(input.contacts),
    p_ship_to_addresses: shipToAddressesPayload(input.shipToAddresses),
    p_trade_name_ids: input.tradeNameHintIds,
    p_user_id: userId,
    // No opening-balance params — update_customer's signature has none at all (FR-013).
  });
  if (error) throw error;
}

export async function setCustomerStatusRecord(
  id: string,
  status: CustomerStatus,
  userId: string
): Promise<void> {
  // Unconditional set is a safe no-op when the customer is already in the target status
  // (spec Edge Cases): it succeeds without error either way.
  const { error } = await getSupabaseAdmin()
    .from("customers")
    .update({ status, updated_by: userId })
    .eq("id", id);
  if (error) throw error;
}

export interface ListCustomersFilters {
  status?: CustomerStatus;
}

export async function listCustomers(
  filters: ListCustomersFilters = {}
): Promise<CustomerListItem[]> {
  const status = filters.status ?? "active";
  const { data, error } = await getSupabaseAdmin()
    .from("customers")
    .select("id, display_name, status")
    .eq("status", status)
    .order("display_name", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    displayName: row.display_name as string,
    status: row.status as CustomerStatus,
  }));
}

/** Thin wrapper for pickers (e.g. 006-customer-purchase-orders' customer picker) — the
 * addition this feature's own contracts/server-actions.md already deferred to 006. */
export async function listActiveCustomersForSelect(): Promise<
  { id: string; displayName: string }[]
> {
  const customers = await listCustomers({ status: "active" });
  return customers.map(({ id, displayName }) => ({ id, displayName }));
}

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("customers")
    .select(CUSTOMER_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const customer = toCustomer(data as unknown as CustomerRow);
  const [ledgerBalance, productMappings] = await Promise.all([
    getCustomerLedgerBalance(id),
    listCustomerProductMappings(id),
  ]);
  return { ...customer, ledgerBalance, productMappings };
}
