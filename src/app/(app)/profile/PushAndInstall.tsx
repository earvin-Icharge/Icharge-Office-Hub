"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { removeFcmToken, removePushSubscription, saveFcmToken, savePushSubscription, sendTestPush } from "@/app/actions/quick";
import { hasNativeAlerts, inOfficeHubApp, nativeAlertDisable, nativeAlertEnable, nativeAlertStatus, nativeAlertToken } from "@/lib/native";

function urlB64ToUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Phone notifications on this device (spec 2, 7). */
export function PushToggle() {
  const t = useTranslations("push");
  const [state, setState] = useState<"loading" | "app" | "appOld" | "unsupported" | "blocked" | "off" | "on">("loading");
  const [native, setNative] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();
  const [iphone, setIphone] = useState(false);

  useEffect(() => {
    if (inOfficeHubApp()) {
      // Android app: alerts through the app itself (Firebase).
      if (!hasNativeAlerts()) { setState("appOld"); return; }
      setNative(true);
      nativeAlertStatus().then(async (st) => {
        if (!st?.ready) { setState("app"); return; }
        if (!st.granted) { setState("off"); return; }
        const token = await nativeAlertToken();
        if (token) { await saveFcmToken(token); setState("on"); } else setState("off");
      });
      return;
    }
    setIphone(/iPhone|iPad/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches);
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("blocked"); return; }
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off")).catch(() => setState("off"));
  }, []);

  function turnOn() {
    setMsg(undefined);
    if (native) {
      start(async () => {
        const r = await nativeAlertEnable();
        if (r.token) { const saved = await saveFcmToken(r.token); setState(saved.ok ? "on" : "off"); }
        else setState(r.error === "denied" ? "blocked" : "off");
      });
      return;
    }
    start(async () => {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "blocked" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) });
      const r = await savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      setState(r.ok ? "on" : "off");
    });
  }

  function turnOff() {
    if (native) {
      start(async () => {
        const token = await nativeAlertToken();
        if (token) await removeFcmToken(token);
        await nativeAlertDisable();
        setState("off");
      });
      return;
    }
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      setState("off");
    });
  }

  function test() {
    start(async () => {
      const r = await sendTestPush(t("testTitle"), t("testBody"));
      setMsg(r.ok && r.sent > 0 ? t("testSent") : t("testNone"));
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm text-muted">{t("help")}</p>
      {iphone && <p className="rounded-[10px] bg-charge-soft px-3 py-2 text-[13px]">{t("iphoneHint")}</p>}
      {state === "app" && <p className="rounded-[10px] bg-charge-soft px-3 py-2 text-[13px]">{t("inApp")}</p>}
      {state === "appOld" && <p className="rounded-[10px] bg-charge-soft px-3 py-2 text-[13px]">{t("appOld")} <Link href="/download" className="font-semibold text-leaf underline">{t("getUpdate")}</Link></p>}
      {state === "unsupported" && <p className="text-sm text-muted">{t("unsupported")}</p>}
      {state === "blocked" && <p className="text-sm text-danger">{native ? t("blockedApp") : t("blocked")}</p>}
      {(state === "off" || state === "on") && (
        <div className="flex flex-wrap items-center gap-2">
          {state === "off" ? (
            <button type="button" disabled={pending} onClick={turnOn} className="h-10 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("turnOn")}</button>
          ) : (
            <>
              <span className="rounded-full bg-charge-soft px-2.5 py-0.5 text-xs font-bold text-leaf">{t("on")}</span>
              <button type="button" disabled={pending} onClick={test} className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("test")}</button>
              <button type="button" disabled={pending} onClick={turnOff} className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("turnOff")}</button>
            </>
          )}
        </div>
      )}
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Install app" (Android/desktop Chrome) or Add to Home Screen steps (iPhone). */
export function InstallApp() {
  const t = useTranslations("install");
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || inOfficeHubApp());
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (installed) return <p className="text-sm text-leaf">{t("installed")}</p>;
  return (
    <div className="flex flex-col gap-2">
      {evt && <button type="button" onClick={async () => { await evt.prompt(); setEvt(null); }} className="h-10 w-fit rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("button")}</button>}
      <p className="text-sm text-muted">{t("iphone")}</p>
      <p className="text-sm text-muted">{t("android")}</p>
      <Link href="/download" className="text-sm font-semibold text-leaf underline">{t("androidApp")}</Link>
    </div>
  );
}
