import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Flash } from "@/components/Flash";
import { getViewer } from "@/lib/viewer";
import { ProjectForm } from "../ProjectForm";

export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("projects");
  const { error } = await searchParams;
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("newProject").replace("+ ", "")}</h1>
      <Flash error={error} />
      <section className="max-w-[760px] rounded-[14px] border border-line bg-white p-5"><ProjectForm me={viewer.id} /></section>
    </>
  );
}
