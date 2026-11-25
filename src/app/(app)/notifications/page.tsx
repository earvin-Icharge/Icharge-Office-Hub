import { revalidatePath } from "next/cache";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Notifications" };

async function markAllRead() {
  "use server";
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: null });
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("notifications");
  const format = await getFormatter();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, title, body, created_at, read_at, urgent").order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <form action={markAllRead}><button className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("markAll")}</button></form>
      </div>
      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        {(data ?? []).length === 0 && <p className="p-4 text-sm text-muted">{t("none")}</p>}
        <ul>
          {(data ?? []).map((n) => (
            <li key={n.id} className={`border-t border-line first:border-t-0 ${n.read_at ? "" : "bg-charge-soft"}`}>
              <a href={`/notifications/open/${n.id}`} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {!n.read_at && <span aria-label={t("unread")} className="h-2 w-2 flex-none rounded-full bg-leaf" />}
                  {n.urgent && <span className="text-xs font-bold text-danger">{t("urgent")}</span>}
                  {n.title}
                </span>
                {n.body && <span className="text-sm text-ink-2">{n.body}</span>}
                <span className="text-xs text-muted">{format.dateTime(new Date(n.created_at), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
