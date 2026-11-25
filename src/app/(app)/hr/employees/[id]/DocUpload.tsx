"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { finishDocUpload, startDocUpload } from "../../actions";

export function DocUpload({ profileId, label }: { profileId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [kind, setKind] = useState("contract");
  return (
    <div className="flex flex-wrap items-center gap-2" data-busy={busy ? "" : undefined}>
      <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Document type" className="h-10 rounded-[10px] border border-field bg-white px-2 text-sm">
        {["contract", "government_id", "certificate", "clearance", "other"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
      </select>
      <label className="inline-flex h-10 cursor-pointer items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">
        {busy ? "…" : label}
        <input type="file" className="sr-only" disabled={busy} onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true); setError(undefined);
          const st = await startDocUpload(profileId, file.name, file.size);
          if (!st.ok) { setError(st.error); setBusy(false); return; }
          const { error: up } = await createClient().storage.from("hr-documents").uploadToSignedUrl(st.path, st.token, file, { contentType: file.type || undefined });
          if (up) { setError(up.message); setBusy(false); return; }
          await finishDocUpload(profileId, st.path, file.name, file.size, kind);
          setBusy(false); router.refresh();
        }} />
      </label>
      {error && <span role="alert" className="text-sm text-danger">{error}</span>}
    </div>
  );
}
