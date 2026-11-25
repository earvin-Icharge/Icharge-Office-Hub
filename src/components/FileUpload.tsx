"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { finishUpload, startUpload } from "@/app/(app)/tasks/actions";

/** Uploads straight to the private bucket with a one-time link (max 20 MB). */
export function FileUpload({ entity, entityId }: { entity: "task" | "project"; entityId: string }) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(undefined);
    const start = await startUpload(entity, entityId, file.name, file.size);
    if (!start.ok) { setError(start.error); setBusy(false); return; }
    const { error: upErr } = await createClient().storage.from("attachments").uploadToSignedUrl(start.path, start.token, file, { contentType: file.type || undefined });
    if (upErr) { setError(upErr.message); setBusy(false); return; }
    await finishUpload(entity, entityId, start.path, file.name, file.size, file.type);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5" data-busy={busy ? "" : undefined}>
      <label className="inline-flex h-10 w-fit cursor-pointer items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">
        {busy ? t("uploading") : t("upload")}
        <input ref={input} type="file" className="sr-only" disabled={busy} onChange={onPick} />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
