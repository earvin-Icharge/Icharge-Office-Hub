import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { trashAction } from "../settings/actions";

export const metadata = { title: "Trash" };

/** Soft-deleted items for 30 days; only the Leader restores or deletes permanently (spec 10). */
export default async function TrashPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (viewer?.level !== "leader") notFound();
  const t = await getTranslations("trash");
  const format = await getFormatter();
  const sp = await searchParams;
  const { data } = await (await createClient()).rpc("trash_items");
  const rows = (data ?? []) as { kind: string; id: string; title: string; deleted_at: string }[];
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      <p className="text-sm text-muted">{t("help")}</p>
      <Flash ok={sp.ok ? "✓" : null} error={sp.error} />
      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        {rows.length === 0 ? <p className="p-4 text-sm text-muted">{t("none")}</p> : (
          <ul>{rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 first:border-t-0">
              <span className="text-sm"><b>{t(`kind.${r.kind}`)}</b> · {r.title} <span className="text-xs text-muted">· {format.dateTime(new Date(r.deleted_at), { day: "numeric", month: "short" })} · {Math.max(0, 30 - Math.floor((Date.now() - new Date(r.deleted_at).getTime()) / 86400_000))} d</span></span>
              <span className="flex gap-2">
                <form action={trashAction}><input type="hidden" name="kind" value={r.kind} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="restore" value="1" /><button className="h-9 rounded-[10px] bg-charge px-3 text-sm font-bold text-forest">{t("restore")}</button></form>
                <form action={trashAction}><input type="hidden" name="kind" value={r.kind} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="restore" value="0" /><button className="h-9 rounded-[10px] border border-[#FCA5A5] bg-white px-3 text-sm font-semibold text-danger">{t("delete")}</button></form>
              </span>
            </li>))}</ul>
        )}
      </section>
    </>
  );
}
