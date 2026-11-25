"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveChannels(f: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ notify_email: f.get("notify_email") === "on", notify_telegram: f.get("notify_telegram") === "on" }).eq("id", user.id);
  revalidatePath("/profile");
}

export async function newTelegramCode() {
  const supabase = await createClient();
  await supabase.rpc("telegram_link_code");
  revalidatePath("/profile");
}
