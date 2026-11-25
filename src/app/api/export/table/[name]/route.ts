import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";
import { BACKUP_TABLES } from "@/lib/backup";
import { toCsv } from "@/lib/csv";

const HIDDEN = new Set(["pin_hash", "passkey_public_key", "passkey_credential_id", "telegram_link_code"]);

/** Leader only. Every download is logged. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const viewer = await getViewer();
  const { name } = await params;
  if (viewer?.level !== "leader" || !(BACKUP_TABLES as readonly string[]).includes(name)) return new NextResponse("Not allowed", { status: 403 });
  const db = createAdminClient();
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(name).select("*").range(from, from + 999);
    if (error) return new NextResponse(error.message, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  await db.from("audit_log").insert({ actor_id: viewer.id, action: "view_sensitive", table_name: name, new: { viewed: `backup of ${name}` } });
  const cols = Object.keys(rows[0] ?? {}).filter((c) => !HIDDEN.has(c));
  const csv = toCsv(cols, rows.map((r) => cols.map((c) => { const v = r[c]; return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : (v as string | number); })));
  const date = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${date}_Backup_${name}.csv"` } });
}
