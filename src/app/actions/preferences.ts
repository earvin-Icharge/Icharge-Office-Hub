"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE } from "@/lib/session";

/** Remembers the business switch for this user (spec 4.1: profiles.default_business). */
export async function setDefaultBusiness(value: "all" | "icharge" | "iscreen") {
  if (!["all", "icharge", "iscreen"].includes(value)) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ default_business: value }).eq("id", user.id);
  revalidatePath("/", "layout");
}

/** Each user picks a language (spec 2). Saved on the profile and in a cookie. */
export async function setLanguage(value: "en" | "zh-Hans") {
  const locale = value === "zh-Hans" ? "zh-Hans" : "en";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ language: locale }).eq("id", user.id);
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
