import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { toCsv } from "@/lib/csv";

/** Unused incentive leave per employee for a year, for payroll's cash conversion: HR, Finance, Leader (checked in the database too). */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.hr || viewer.finance || viewer.level === "leader")) return new NextResponse("Not allowed", { status: 403 });
  const year = Number(request.nextUrl.searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return new NextResponse("Bad year", { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unused_incentive_leave", { p_year: year });
  if (error) return new NextResponse("Not allowed", { status: 403 });
  const rows = ((data ?? []) as { employee_id: string | null; name: string; department: string | null; entitled: number; used: number; pending: number; unused: number }[])
    .map((r) => [r.employee_id ?? "", r.name, r.department ?? "", r.entitled, r.used, r.pending, r.unused]);
  const csv = toCsv(["Employee ID", "Name", "Department", "Incentive leave days", "Used", "Pending (not yet approved)", "Unused (for cash)"], rows);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${year}_Unused_Incentive_Leave.csv"` } });
}
