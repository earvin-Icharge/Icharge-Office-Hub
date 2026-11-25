"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { sendPush } from "@/lib/push";

export async function askEveryoneToUpdate() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("require_update_now");
  redirect(error ? `/settings/updates?error=${encodeURIComponent(error.message)}` : `/settings/updates?asked=${encodeURIComponent(String(data))}`);
}

export async function remindToUpdate(f: FormData) {
  const viewer = await getViewer();
  if (viewer?.level !== "leader") redirect("/settings/updates");
  const t = await getTranslations("updates");
  const sent = await sendPush(String(f.get("profile_id")), { title: t("remindTitle"), body: t("remindBody"), url: "/today" });
  redirect(`/settings/updates?reminded=${sent}`);
}
