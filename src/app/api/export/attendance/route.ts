import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { toCsv } from "@/lib/csv";

/** Monthly attendance export for payroll: HR, Finance, Leader (and a Manager for their team). Never GPS points or selfies. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Not allowed", { status: 403 });
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("Bad month", { status: 400 });
  const supabase = await createClient();
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const { data } = await supabase.from("attendance").select("day, mode, time_in, time_out, late_minutes, undertime_minutes, location_ok, in_distance_m, flags, profile:profiles!attendance_profile_id_fkey(name, employee_id)")
    .gte("day", `${month}-01`).lt("day", `${next}-01`).order("day");
  const fmt = (x: string | null) => (x ? new Date(new Date(x).getTime() + 8 * 3600_000).toISOString().slice(11, 16) : "");
  const rows = ((data ?? []) as unknown as { day: string; mode: string; time_in: string; time_out: string | null; late_minutes: number; undertime_minutes: number; location_ok: boolean | null; in_distance_m: number | null; flags: string[]; profile: { name: string; employee_id: string | null } | null }[])
    .map((a) => [a.profile?.employee_id ?? "", a.profile?.name ?? "", a.day, a.mode, fmt(a.time_in), fmt(a.time_out), a.late_minutes, a.undertime_minutes, a.location_ok ? "verified" : a.in_distance_m != null ? `${a.in_distance_m} m away` : "", a.flags.join(" ")]);
  const csv = toCsv(["Employee ID", "Name", "Date", "Mode", "Time in", "Time out", "Late (min)", "Undertime (min)", "Location", "Flags"], rows);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${month}_Attendance.csv"` } });
}
