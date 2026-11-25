import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PersonLite = { id: string; name: string; position: string | null; department_id: string | null; access_level: string; active: boolean };

/** Active employee directory (everyone active may read it). */
export async function getPeople(): Promise<PersonLite[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, name, position, department_id, access_level, active").eq("active", true).order("name");
  return (data ?? []) as PersonLite[];
}

export async function getDepartments() {
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("id, name, code, head_id").order("name");
  return (data ?? []) as { id: string; name: string; code: string; head_id: string | null }[];
}
