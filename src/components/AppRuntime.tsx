"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_VERSION, BUILD_ID, compareVersions } from "@/lib/version";
import { flushQueue } from "@/lib/clock-send";
import { updateApp } from "@/lib/update-app";
import { saveFcmToken } from "@/app/actions/quick";
import { hasNativeAlerts, nativeAlertToken } from "@/lib/native";

const CHECK_EVERY_MS = 5 * 60 * 1000;
const WHATS_NEW_PENDING = "oh_whats_new_pending";
const SEEN_VERSION = "oh_seen_version";

type VersionInfo = { version: string; build: string; minVersion: string | null; whatsNew: { version: string; en: string; zh: string } | null };

function store(op: "get" | "set" | "del", k: string, v = "") {
  try {
    if (op === "get") return localStorage.getItem(k);
    if (op === "set") localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* private mode */
  }
  return null;
}

/** True while someone is typing in a form that isn't sent yet, or a screen marks itself busy (time-in, selfie). */
function useBusy() {
  const dirty = useRef(false);
  useEffect(() => {
    const onInput = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.closest("form")) dirty.current = true;
    };
    const onSubmit = () => { dirty.current = false; };
    document.addEventListener("input", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);
  return useCallback(() => dirty.current || !!document.querySelector("[data-busy]"), []);
}

/**
 * Runs in every signed-in page:
 *  - service worker (install, offline page, notifications)
 *  - check-in: lock after 12 h, removed device, app version for Settings › App updates
 *  - "New version ready · Update now" (never while busy), minimum version, What's new (spec 3.6)
 */
export function AppRuntime() {
  const t = useTranslations("runtime");
  const locale = useLocale();
  const isBusy = useBusy();
  const [updateReady, setUpdateReady] = useState(false);
  const [mustUpdate, setMustUpdate] = useState(false);
  const [busyNow, setBusyNow] = useState(false);
  const [whatsNew, setWhatsNew] = useState<{ version: string; text: string } | null>(null);

  const heartbeat = useCallback(async () => {
    try {
      const r = await fetch("/api/heartbeat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: APP_VERSION }) });
      const { gate } = (await r.json()) as { gate: string };
      if (gate === "unlock") window.location.assign("/unlock");
      else if (gate === "reauth") window.location.assign("/auth/reauth?why=device");
      else if (gate === "signedOut" || gate === "inactive") window.location.assign("/login");
    } catch {
      /* offline: try again later */
    }
  }, []);

  const checkVersion = useCallback(async () => {
    try {
      const r = await fetch("/api/version", { cache: "no-store" });
      const info = (await r.json()) as VersionInfo;
      if (info.build && info.build !== BUILD_ID) setUpdateReady(true);
      if (info.minVersion && compareVersions(APP_VERSION, info.minVersion) < 0) setMustUpdate(true);
    } catch {
      /* offline */
    }
    setBusyNow(isBusy());
  }, [isBusy]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    heartbeat();
    checkVersion();
    // Time records saved with no signal are sent as soon as the phone is back online (spec 5.2).
    const flush = () => { if (navigator.onLine) flushQueue().catch(() => undefined); };
    flush();
    window.addEventListener("online", flush);
    const id = setInterval(() => { heartbeat(); checkVersion(); flush(); }, CHECK_EVERY_MS);
    const busyId = setInterval(() => setBusyNow(isBusy()), 2000);
    const onVisible = () => { if (document.visibilityState === "visible") { heartbeat(); checkVersion(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); clearInterval(busyId); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", flush); };
  }, [heartbeat, checkVersion, isBusy]);

  // Android app: refresh this install's alert token each time the app opens (only if alerts are allowed; never asks).
  useEffect(() => {
    if (!hasNativeAlerts()) return;
    nativeAlertToken().then((token) => { if (token) saveFcmToken(token).catch(() => undefined); }).catch(() => undefined);
  }, []);

  // What's new: after tapping Update, or the first time this version opens on this device.
  useEffect(() => {
    const pending = store("get", WHATS_NEW_PENDING);
    const seen = store("get", SEEN_VERSION);
    store("set", SEEN_VERSION, APP_VERSION);
    if (!pending && (!seen || seen === APP_VERSION)) return;
    store("del", WHATS_NEW_PENDING);
    fetch(`/api/version?v=${APP_VERSION}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((info: VersionInfo) => {
        if (info.whatsNew) setWhatsNew({ version: info.whatsNew.version, text: locale === "zh-Hans" ? info.whatsNew.zh : info.whatsNew.en });
      })
      .catch(() => undefined);
  }, [locale]);

  const doUpdate = useCallback(() => updateApp(), []);

  return (
    <>
      {updateReady && !mustUpdate && !busyNow && (
        <div role="status" className="fixed inset-x-3 bottom-24 z-30 mx-auto flex max-w-[520px] flex-wrap items-center justify-between gap-3 rounded-[14px] bg-forest px-4 py-3 text-white shadow-lg min-[700px]:bottom-6">
          <span className="text-sm font-semibold">{t("newVersion")}</span>
          <button type="button" onClick={doUpdate} className="h-10 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("updateNow")}</button>
        </div>
      )}
      {mustUpdate && !busyNow && (
        <div role="dialog" aria-modal="true" aria-labelledby="oh-must-update" className="fixed inset-0 z-40 flex items-center justify-center bg-forest/80 p-4">
          <div className="flex w-full max-w-[400px] flex-col items-center gap-3 rounded-[20px] bg-white p-6 text-center">
            <h2 id="oh-must-update" className="font-display text-xl font-bold">{t("mustUpdateTitle")}</h2>
            <p className="text-sm text-ink-2">{t("mustUpdateBody")}</p>
            <button type="button" onClick={doUpdate} className="h-12 w-full rounded-xl bg-charge text-base font-bold text-forest">{t("updateNow")}</button>
          </div>
        </div>
      )}
      {whatsNew && (
        <div role="dialog" aria-modal="true" aria-labelledby="oh-whats-new" className="fixed inset-0 z-40 flex items-center justify-center bg-forest/60 p-4">
          <div className="flex w-full max-w-[420px] flex-col gap-3 rounded-[20px] bg-white p-6">
            <h2 id="oh-whats-new" className="font-display text-xl font-bold">{t("whatsNewTitle", { version: whatsNew.version })}</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-2">
              {whatsNew.text.split("\n").filter(Boolean).map((line, i) => <li key={i}>{line}</li>)}
            </ul>
            <button type="button" onClick={() => setWhatsNew(null)} className="mt-1 h-11 rounded-xl bg-charge text-base font-bold text-forest">{t("gotIt")}</button>
          </div>
        </div>
      )}
    </>
  );
}
