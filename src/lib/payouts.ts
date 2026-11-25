import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PayoutRow = { client: string; owner: string; kiosks: number; rentals: number; sales: number; venueRate: string; venueDue: number | null; bdRate: string; bdDue: number | null };

/** Venue share due per client and BD share per person for a month (spec 4.8), from the usage upload. */
export async function payoutRows(month: string): Promise<PayoutRow[]> {
  const supabase = await createClient();
  const first = `${month}-01`;
  const [{ data: clients }, { data: usage }] = await Promise.all([
    supabase.from("clients").select("id, name, owner:profiles!clients_owner_id_fkey(name), client_kiosks(kiosk_id), client_terms(kind, value, unit, basis, status)").is("deleted_at", null).order("name"),
    supabase.from("kiosk_usage_monthly").select("kiosk_id, rentals, sales").eq("month", first),
  ]);
  const byKiosk = new Map((usage ?? []).map((u) => [u.kiosk_id, u]));
  type C = { id: string; name: string; owner: { name: string } | null; client_kiosks: { kiosk_id: string }[]; client_terms: { kind: string; value: number; unit: string; basis: string | null; status: string }[] };
  return ((clients ?? []) as unknown as C[]).map((c) => {
    const ks = c.client_kiosks.map((k) => byKiosk.get(k.kiosk_id)).filter(Boolean) as { rentals: number; sales: number }[];
    const rentals = ks.reduce((a, k) => a + k.rentals, 0);
    const sales = ks.reduce((a, k) => a + Number(k.sales), 0);
    const term = (kind: string) => c.client_terms.find((x) => x.kind === kind && x.status === "active");
    const v = term("venue_share"), b = term("bd_share");
    const due = (x?: { value: number; unit: string; basis: string | null }) => x && x.unit === "percent" && x.basis === "gross_rental_sales" ? Math.round(sales * Number(x.value)) / 100 : null;
    const rate = (x?: { value: number; unit: string; basis: string | null }) => (x ? `${x.value}${x.unit === "percent" ? "%" : ""} ${x.basis ?? ""}`.trim() : "—");
    return { client: c.name, owner: c.owner?.name ?? "—", kiosks: c.client_kiosks.length, rentals, sales, venueRate: rate(v), venueDue: due(v), bdRate: rate(b), bdDue: due(b) };
  });
}
