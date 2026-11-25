"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function submitRequest(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_access_request", {
    p_full_name: get("full_name"),
    p_department_id: get("department_id") || null,
    p_position: get("position"),
    p_supervisor_id: get("supervisor_id") || null,
    p_mobile: get("mobile"),
  });
  if (error) redirect(`/welcome?error=${encodeURIComponent(error.message.includes("check constraint") ? "Please fill in every field." : error.message)}`);
  redirect("/pending");
}
