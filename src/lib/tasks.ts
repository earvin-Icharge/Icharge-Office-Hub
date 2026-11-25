import "server-only";
import { createClient } from "@/lib/supabase/server";
import { manilaDayBounds, manilaWeekEnd } from "@/lib/time";

export type TaskRow = {
  id: string; ref: number; title: string; status: string; priority: string; due_at: string; business: "icharge" | "iscreen" | "company";
  owner_id: string; assigned_by: string; acknowledged_at: string | null; waiting_on: string | null; approval_state: string; assign_state: string;
  needs_approval: boolean; project_id: string | null;
  owner: { name: string } | null; assigner: { name: string } | null; project: { name: string } | null;
};

export const TASK_LIST_SELECT =
  "id, ref, title, status, priority, due_at, business, owner_id, assigned_by, acknowledged_at, waiting_on, approval_state, assign_state, needs_approval, project_id, " +
  "owner:profiles!tasks_owner_id_fkey(name), assigner:profiles!tasks_assigned_by_fkey(name), project:projects!tasks_project_id_fkey(name)";

export const OPEN = "(todo,in_progress,waiting)";

export function isOverdue(t: { status: string; due_at: string }) {
  return ["todo", "in_progress", "waiting"].includes(t.status) && new Date(t.due_at).getTime() < Date.now();
}

export type MyDayTab = "today" | "week" | "overdue" | "waiting" | "assigned";

/** My day lists (spec 4.5). */
export async function myDayTasks(me: string, business: string) {
  const supabase = await createClient();
  const today = manilaDayBounds();
  const nowIso = new Date().toISOString();
  const weekEnd = manilaWeekEnd();
  const base = () => {
    let q = supabase.from("tasks").select(TASK_LIST_SELECT).is("deleted_at", null).filter("status", "in", OPEN).eq("assign_state", "accepted");
    if (business !== "all") q = q.eq("business", business);
    return q;
  };
  const [todayR, weekR, overdueR, waitingR, assignedR] = await Promise.all([
    base().eq("owner_id", me).gte("due_at", today.start).lt("due_at", today.end).order("due_at"),
    base().eq("owner_id", me).gte("due_at", today.start).lt("due_at", weekEnd).order("due_at"),
    base().eq("owner_id", me).lt("due_at", nowIso).order("due_at"),
    base().eq("owner_id", me).eq("status", "waiting").order("due_at"),
    base().eq("assigned_by", me).neq("owner_id", me).order("due_at"),
  ]);
  const cast = (r: { data: unknown }) => (r.data ?? []) as TaskRow[];
  return { today: cast(todayR), week: cast(weekR), overdue: cast(overdueR), waiting: cast(waitingR), assigned: cast(assignedR) };
}
