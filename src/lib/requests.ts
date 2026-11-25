import "server-only";
import { createClient } from "@/lib/supabase/server";

export type MyRequest = {
  id: string;
  full_name: string;
  position: string;
  status: "pending" | "proposed" | "approved" | "declined" | "sent_back";
  decline_reason: string | null;
  created_at: string;
  department: { name: string } | null;
  supervisor: { name: string } | null;
};

/** The signed-in person's latest access request, if any. */
export async function getMyLatestRequest(): Promise<MyRequest | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("access_requests")
    .select("id, full_name, position, status, decline_reason, created_at, department:departments!access_requests_department_id_fkey(name), supervisor:profiles!access_requests_supervisor_id_fkey(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<MyRequest>();
  return data;
}

export function isOpen(r: MyRequest | null) {
  return !!r && (r.status === "pending" || r.status === "proposed" || r.status === "sent_back");
}
