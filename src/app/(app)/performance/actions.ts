"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveReview(f: FormData) {
  const who = s(f, "profile_id");
  const ratings = Object.fromEntries(["quality", "timeliness", "teamwork", "communication", "initiative"].map((k) => [k, Number(s(f, k) || 3)]));
  const { error } = await (await createClient()).rpc("save_review", { p_profile: who, p_quarter: s(f, "quarter"), p_ratings: ratings, p_comments: s(f, "comments") });
  revalidatePath("/performance");
  redirect(`/performance?who=${who}&${error ? `error=${encodeURIComponent(error.message)}` : "ok=saved"}`);
}
export async function signReview(f: FormData) {
  const { error } = await (await createClient()).rpc("sign_review", { p_id: s(f, "id") });
  redirect(`/performance?who=${s(f, "profile_id")}&${error ? `error=${encodeURIComponent(error.message)}` : "ok=saved"}`);
}
