import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { toCsv } from "@/lib/csv";

const d8 = (x: string | null) => (x ? new Date(new Date(x).getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ") : "");

/**
 * /api/export/report?kind=tasks|projects|issues|attendance|leave|performance&business&dept&person&from&to
 * Rows come through the signed-in person's own access rules (RLS), so each export holds only what they may see.
 */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Not allowed", { status: 403 });
  const q = request.nextUrl.searchParams;
  const kind = q.get("kind") ?? "tasks", business = q.get("business") ?? "all", dept = q.get("dept") ?? "", person = q.get("person") ?? "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.get("from") ?? "") ? q.get("from")! : "2000-01-01";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.get("to") ?? "") ? q.get("to")! : "2999-12-31";
  const supabase = await createClient();
  const { data: profs } = await supabase.from("profiles").select("id, name, employee_id, department_id");
  const byId = new Map((profs ?? []).map((p) => [p.id, p]));
  const inScope = (pid: string | null) => !!pid && (!person || pid === person) && (!dept || byId.get(pid)?.department_id === dept);
  const name = (pid: string | null) => (pid ? byId.get(pid)?.name ?? "" : "");
  let header: string[] = [];
  let rows: (string | number | null)[][] = [];

  if (kind === "tasks") {
    let r = supabase.from("tasks").select("ref, title, business, status, priority, owner_id, assigned_by, due_at, completed_at, acknowledged_at, project:projects!tasks_project_id_fkey(name)")
      .is("deleted_at", null).gte("due_at", `${from}T00:00:00+08:00`).lte("due_at", `${to}T23:59:59+08:00`).order("due_at");
    if (business !== "all") r = r.eq("business", business);
    const data = ((await r).data ?? []) as unknown as { ref: number; title: string; business: string; status: string; priority: string; owner_id: string; assigned_by: string; due_at: string; completed_at: string | null; acknowledged_at: string | null; project: { name: string } | null }[];
    header = ["Task", "Title", "Business", "Project", "Owner", "Assigned by", "Due", "Status", "Priority", "Acknowledged", "Completed", "On time"];
    rows = data.filter((x) => inScope(x.owner_id)).map((x) => [`T-${x.ref}`, x.title, x.business, x.project?.name ?? "", name(x.owner_id), name(x.assigned_by), d8(x.due_at), x.status, x.priority,
      d8(x.acknowledged_at), d8(x.completed_at), x.completed_at ? (x.completed_at <= x.due_at ? "yes" : "no") : ""]);
  } else if (kind === "projects") {
    let r = supabase.from("projects").select("name, business, status, priority, owner_id, start_date, due_date").is("deleted_at", null);
    if (business !== "all") r = r.eq("business", business);
    header = ["Project", "Business", "Status", "Priority", "Owner", "Start", "Due"];
    rows = ((await r).data ?? []).filter((x) => inScope(x.owner_id)).map((x) => [x.name, x.business, x.status, x.priority, name(x.owner_id), x.start_date, x.due_date]);
  } else if (kind === "issues") {
    let r = supabase.from("issues").select("ref, title, business, status, severity, kiosk_id, location, owner_id, reported_at, resolved_at, fix_due, type:issue_types(name)")
      .is("deleted_at", null).gte("reported_at", `${from}T00:00:00+08:00`).lte("reported_at", `${to}T23:59:59+08:00`);
    if (business !== "all") r = r.eq("business", business);
    header = ["Issue", "Title", "Type", "Business", "Kiosk / location", "Severity", "Owner", "Reported", "Resolved", "Within fix target", "Status"];
    rows = (((await r).data ?? []) as unknown as { ref: number; title: string; business: string; status: string; severity: string; kiosk_id: string | null; location: string | null; owner_id: string | null; reported_at: string; resolved_at: string | null; fix_due: string; type: { name: string } | null }[])
      .filter((x) => !person && !dept ? true : inScope(x.owner_id))
      .map((x) => [`ISS-${x.ref}`, x.title, x.type?.name ?? "", x.business, x.kiosk_id ?? x.location ?? "", x.severity, name(x.owner_id), d8(x.reported_at), d8(x.resolved_at), x.resolved_at ? (x.resolved_at <= x.fix_due ? "yes" : "no") : "", x.status]);
  } else if (kind === "attendance") {
    const data = (await supabase.from("attendance").select("profile_id, day, mode, time_in, time_out, late_minutes, undertime_minutes, location_ok, in_distance_m, flags").gte("day", from).lte("day", to).order("day")).data ?? [];
    header = ["Employee ID", "Name", "Date", "Mode", "Time in", "Time out", "Late (min)", "Undertime (min)", "Location", "Flags"];
    rows = data.filter((x) => inScope(x.profile_id)).map((x) => [byId.get(x.profile_id)?.employee_id ?? "", name(x.profile_id), x.day, x.mode, d8(x.time_in).slice(11), d8(x.time_out).slice(11), x.late_minutes, x.undertime_minutes,
      x.location_ok ? "verified" : x.in_distance_m != null ? `${x.in_distance_m} m away` : "", (x.flags ?? []).join(" ")]);
  } else if (kind === "leave") {
    const year = Number(to.slice(0, 4));
    header = ["Employee ID", "Name", "Leave type", "Entitled", "Adjustment", "Used", "Pending", "Available"];
    for (const p of (profs ?? []).filter((x) => inScope(x.id))) {
      const { data } = await supabase.rpc("leave_summary", { p_profile: p.id, p_year: year });
      for (const r of (data ?? []) as { name: string; entitled: number; adjustment: number; used: number; pending: number; available: number }[]) rows.push([p.employee_id ?? "", p.name, r.name, r.entitled, r.adjustment, r.used, r.pending, r.available]);
    }
  } else if (kind === "performance") {
    header = ["Employee ID", "Name", "Month", "Tasks completed", "On time %", "Overdue", "Reopened", "Issues handled", "Issues within target %", "Late days", "Late min", "Undertime min", "Absences", "Outside location"];
    const month = `${to.slice(0, 7)}-01`;
    for (const p of (profs ?? []).filter((x) => inScope(x.id))) {
      const { data } = await supabase.rpc("performance_snapshot", { p_profile: p.id, p_month: month });
      if (!data) continue;
      const s = data as Record<string, number | null>;
      rows.push([p.employee_id ?? "", p.name, month.slice(0, 7), s.tasks_completed, s.on_time_pct, s.overdue, s.reopened, s.issues_handled, s.issues_in_target_pct, s.lates, s.late_minutes, s.undertime_minutes, s.absences, s.outside_location]);
    }
  } else return new NextResponse("Unknown report", { status: 400 });

  const csv = toCsv(header, rows);
  const file = `${new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)}_iCharge_${kind}.csv`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` } });
}
