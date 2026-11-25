import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { saveQuality } from "../actions";

export const metadata = { title: "Quality reviews" };

/** CS lead reviews 5 random solved cases per person per month (spec 4.9). */
export default async function QualityPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const supabase = await createClient();
  const { data: lead } = await supabase.rpc("is_cs_lead");
  if (!(lead || viewer.level === "leader")) notFound();
  const t = await getTranslations("cs");
  const sp = await searchParams;
  const monthStart = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7) + "-01";
  const [{ data: solved }, { data: reviews }, people] = await Promise.all([
    supabase.from("cs_cases").select("id, ref, owner_id, type_code").gte("solved_at", `${monthStart}T00:00:00+08:00`).is("deleted_at", null),
    supabase.from("cs_quality_reviews").select("case_id, score").eq("month", monthStart),
    getPeople(),
  ]);
  const reviewed = new Map((reviews ?? []).map((r) => [r.case_id, r.score]));
  const byOwner = new Map<string, { id: string; ref: number }[]>();
  for (const c of solved ?? []) byOwner.set(c.owner_id, [...(byOwner.get(c.owner_id) ?? []), c]);
  // Stable "random" pick per month: sort by a hash of id + month.
  const pick = (xs: { id: string; ref: number }[]) => [...xs].sort((a, b) => (a.id + monthStart).localeCompare(b.id + monthStart)).slice(0, 5);
  return (
    <>
      <Link href="/cs" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("quality")}</h1>
      <p className="text-sm text-muted">{t("qualityHelp")}</p>
      <Flash ok={sp.ok ? t("ok.saved") : null} error={sp.error} />
      {[...byOwner].map(([owner, cases]) => (
        <section key={owner} className="flex max-w-[760px] flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
          <h2 className="text-base font-bold">{people.find((p) => p.id === owner)?.name ?? "—"}</h2>
          {pick(cases).map((c) => (
            <form key={c.id} action={saveQuality} className="flex flex-wrap items-center gap-2"><input type="hidden" name="case_id" value={c.id} />
              <Link href={`/cs/${c.id}`} className="min-w-[90px] text-sm font-semibold text-leaf">#{c.ref}</Link>
              <select name="score" defaultValue={reviewed.get(c.id) ?? 5} aria-label={t("score")} className="h-9 rounded-[10px] border border-field bg-white px-2 text-sm">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
              <input name="note" placeholder={t("note")} aria-label={t("note")} className="h-9 min-w-[160px] flex-1 rounded-[10px] border border-field px-3 text-sm" />
              <button className="h-9 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{reviewed.has(c.id) ? "✓ " : ""}{t("save")}</button></form>
          ))}
        </section>
      ))}
    </>
  );
}
