import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Flash } from "@/components/Flash";
import { getViewer } from "@/lib/viewer";
import { MeetingForm } from "../MeetingForm";

export const metadata = { title: "New meeting" };
export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("meetings");
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("newMeeting").replace("+ ", "")}</h1>
      <Flash error={(await searchParams).error} />
      <section className="max-w-[760px] rounded-[14px] border border-line bg-white p-5"><MeetingForm me={viewer.id} /></section>
    </>
  );
}
