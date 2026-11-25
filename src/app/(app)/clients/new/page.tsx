import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { ClientForm } from "../ClientForm";

export const metadata = { title: "New client" };
export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const supabase = await createClient();
  const { data: bdHead } = await supabase.rpc("is_bd_head");
  if (!(viewer.level === "leader" || bdHead || viewer.departmentCode === "bd")) notFound();
  const t = await getTranslations("clients");
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("newClient").replace("+ ", "")}</h1>
      <Flash error={(await searchParams).error} />
      <section className="max-w-[760px] rounded-[14px] border border-line bg-white p-5"><ClientForm canChangeOwner={viewer.level === "leader" || !!bdHead} /></section>
    </>
  );
}
