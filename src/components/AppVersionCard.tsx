"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, RefreshCw } from "lucide-react";
import { ANDROID_APP, APP_VERSION, BUILD_ID } from "@/lib/version";
import { updateApp } from "@/lib/update-app";

/** Settings: this Office Hub version, "Update now" when a newer one is live, and the Android app version. */
export function AppVersionCard() {
  const t = useTranslations("version");
  const [state, setState] = useState<"checking" | "latest" | "update" | "offline">("checking");
  const [live, setLive] = useState<string>();
  const [android, setAndroid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setState("checking");
    try {
      const r = await fetch("/api/version", { cache: "no-store" });
      const info = (await r.json()) as { version: string; build: string };
      setLive(info.version);
      setState(info.build && info.build !== BUILD_ID ? "update" : "latest");
    } catch {
      setState("offline");
    }
  }, []);

  useEffect(() => {
    check();
    const m = navigator.userAgent.match(/OfficeHubApp\/(\d+)/);
    setAndroid(m ? Number(m[1]) : null);
  }, [check]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("current", { v: APP_VERSION })}</p>
          <p className="text-sm text-muted">
            {state === "checking" ? t("checking") : state === "update" ? t("newReady", { v: live ?? "" }) : state === "offline" ? t("offline") : (
              <span className="inline-flex items-center gap-1 text-leaf"><CheckCircle2 aria-hidden size={16} />{t("upToDate")}</span>
            )}
          </p>
        </div>
        {state === "update" ? (
          <button type="button" disabled={busy} onClick={() => { setBusy(true); updateApp(); }} className="h-11 rounded-[10px] bg-charge px-5 text-sm font-bold text-forest disabled:opacity-60">{t("updateNow")}</button>
        ) : (
          <button type="button" disabled={state === "checking"} onClick={check} className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold disabled:opacity-60">
            <RefreshCw aria-hidden size={16} className={state === "checking" ? "animate-spin" : ""} />{t("check")}
          </button>
        )}
      </div>
      {android !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="min-w-0 text-sm">
            {android >= ANDROID_APP.code ? (
              <span className="inline-flex items-center gap-1 text-leaf"><CheckCircle2 aria-hidden size={16} />{t("androidLatest", { v: ANDROID_APP.name })}</span>
            ) : t("androidOld", { v: ANDROID_APP.name })}
          </p>
          {android < ANDROID_APP.code && (
            <Link href="/download" className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest"><Download aria-hidden size={16} />{t("androidGet")}</Link>
          )}
        </div>
      )}
    </div>
  );
}
