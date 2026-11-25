import { getTranslations } from "next-intl/server";
import { PickMany } from "@/components/PickMany";
import { getPeople } from "@/lib/people";
import { toManilaInput } from "@/lib/time";
import { saveMeeting } from "./actions";

const field = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] min-w-0";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";
type M = { id?: string; title?: string; meeting_at?: string; location?: string | null; agenda?: string | null; notes?: string | null; attendees?: string[] };

export async function MeetingForm({ meeting, me }: { meeting?: M; me: string }) {
  const t = await getTranslations("meetings");
  const people = await getPeople();
  const m = meeting ?? {};
  return (
    <form action={saveMeeting} className="flex flex-col gap-3.5">
      {m.id && <input type="hidden" name="id" value={m.id} />}
      <label className={label}>{t("f.title")}<input name="title" required minLength={2} defaultValue={m.title ?? ""} className={field} /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>{t("f.when")}<input type="datetime-local" name="meeting_at" required defaultValue={toManilaInput(m.meeting_at)} className={field} /></label>
        <label className={label}>{t("f.location")}<input name="location" defaultValue={m.location ?? ""} className={field} /></label>
      </div>
      <PickMany label={t("f.attendees")} name="attendees" defaultValue={m.attendees ?? [me]} options={people.map((p) => ({ value: p.id, label: p.name }))} help={t("f.multiHelp")} />
      <label className={label}>{t("f.agenda")}<textarea name="agenda" rows={3} defaultValue={m.agenda ?? ""} className="rounded-[10px] border border-field px-3 py-2 text-[15px]" /></label>
      <label className={label}>{t("f.notes")}<textarea name="notes" rows={6} defaultValue={m.notes ?? ""} className="rounded-[10px] border border-field px-3 py-2 text-[15px]" /></label>
      <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{m.id ? t("save") : t("create")}</button>
    </form>
  );
}
