"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { requestWfh } from "./actions";

export function WfhRequest() {
  const t = useTranslations("att");
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <details className="flex flex-col gap-2">
      <summary className="cursor-pointer text-sm font-semibold text-leaf">{t("wfhChange")}</summary>
      <p className="text-xs text-muted">{t("wfhHelp")}</p>
      <input value={address} onChange={(e) => setAddress(e.target.value)} aria-label={t("wfhAddress")} placeholder={t("wfhAddress")} className="h-10 rounded-[10px] border border-field px-3 text-sm" />
      <button type="button" disabled={busy || address.trim().length < 5} className="h-10 w-fit rounded-[10px] bg-charge px-4 text-sm font-bold text-forest disabled:opacity-50"
        onClick={() => { setBusy(true); navigator.geolocation.getCurrentPosition(async (p) => {
          const r = await requestWfh(address, p.coords.latitude, p.coords.longitude); setMsg(r.ok ? t("ok.wfh") : r.error); setBusy(false);
        }, () => { setMsg(t("locOff")); setBusy(false); }, { enableHighAccuracy: true, timeout: 20000 }); }}>{t("wfhSend")}</button>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </details>
  );
}
