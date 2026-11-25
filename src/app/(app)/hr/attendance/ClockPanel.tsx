"use client";

import { Camera, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { enqueue, queued } from "@/lib/offline-queue";
import { flushQueue, sendClock } from "@/lib/clock-send";

type Site = { id: string; name: string };
type Pos = { lat: number; lng: number; accuracy: number };

/**
 * Time in: choose Office / WFH / Field → step 1 location (read once) → step 2 live selfie from the front camera
 * (no gallery). With no signal the record is kept on the phone and sent later (spec 5.2).
 */
export function ClockPanel({ mode: initialMode, sites, timedIn, selfieRequired }: { mode: "in" | "out"; sites: Site[]; timedIn: boolean; selfieRequired: boolean }) {
  const t = useTranslations("att");
  const router = useRouter();
  const [mode, setMode] = useState<"office" | "wfh" | "field">("office");
  const [site, setSite] = useState("");
  const [other, setOther] = useState("");
  const [reason, setReason] = useState("");
  const [pos, setPos] = useState<Pos | null>(null);
  const [locState, setLocState] = useState<"idle" | "busy" | "denied" | "error">("idle");
  const [camOn, setCamOn] = useState(false);
  const [camDenied, setCamDenied] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const out = initialMode === "out";

  useEffect(() => {
    queued().then((q) => setPending(q.length)).catch(() => undefined);
    return () => stream.current?.getTracks().forEach((x) => x.stop());
  }, []);

  function locate() {
    if (!("geolocation" in navigator)) { setLocState("error"); return; }
    setLocState("busy");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }); setLocState("idle"); },
      (e) => setLocState(e.code === e.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 } }, audio: false });
      stream.current = s;
      setCamOn(true);
      setCamDenied(false);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; void video.current.play(); } });
    } catch {
      setCamDenied(true);
    }
  }

  function capture() {
    const v = video.current;
    if (!v) return;
    const c = document.createElement("canvas");
    const w = Math.min(720, v.videoWidth || 720);
    c.width = w;
    c.height = Math.round((v.videoHeight || 960) * (w / (v.videoWidth || 720)));
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (!b) return;
      setPhoto({ blob: b, url: URL.createObjectURL(b) });
      stream.current?.getTracks().forEach((x) => x.stop());
      setCamOn(false);
    }, "image/jpeg", 0.8);
  }

  async function submit() {
    setBusy(true);
    setMsg(undefined);
    const payload = {
      mode, field_site_id: mode === "field" ? site : "", field_other_reason: mode === "field" && !site ? other : "",
      lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracy: pos?.accuracy ?? null, device_time: new Date().toISOString(), reason,
    };
    const selfie = out ? undefined : photo?.blob;
    try {
      if (!navigator.onLine) throw new Error("offline");
      await flushQueue();
      const r = await sendClock(out ? "out" : "in", payload, selfie);
      if (!r.ok) { setMsg({ ok: false, text: r.error }); setBusy(false); return; }
      const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setMsg({ ok: true, text: out ? t("doneOut", { time }) : t("done", { time }) });
      router.refresh();
    } catch {
      await enqueue({ id: crypto.randomUUID(), kind: out ? "out" : "in", payload, selfie, created: Date.now() });
      setPending((n) => n + 1);
      setMsg({ ok: true, text: t("savedOffline") });
    }
    setBusy(false);
  }

  const needsGps = mode !== "office" || out;
  const ready = (!needsGps || !!pos) && (out || !selfieRequired || !!photo) && (mode !== "field" || out || !!site || other.trim().length > 2);
  const btn = "h-11 rounded-xl px-4 text-sm font-semibold";
  const working = busy || locState === "busy" || camOn || (!!photo && !msg);

  if (timedIn && !out) return null;
  return (
    <div className="flex flex-col gap-4" data-busy={working ? "" : undefined}>
      {pending > 0 && <p className="rounded-[10px] bg-[#FEF3C7] px-3 py-2 text-sm font-semibold text-[#92400E]">{t("queued", { n: pending })}</p>}
      {!out && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t("where")}</legend>
          <div className="flex flex-wrap gap-2">
            {(["office", "wfh", "field"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                className={`h-12 flex-1 rounded-xl text-base font-bold ${mode === m ? "bg-forest text-white" : "border border-field bg-white"}`}>{t(m)}</button>
            ))}
          </div>
          {mode === "field" && (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold">{t("site")}
                <select value={site} onChange={(e) => setSite(e.target.value)} className="h-11 rounded-[10px] border border-field bg-white px-3 text-sm">
                  <option value="">{t("other")}</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></label>
              {!site && <label className="flex flex-col gap-1 text-xs font-semibold">{t("otherReason")}<input value={other} onChange={(e) => setOther(e.target.value)} className="h-11 rounded-[10px] border border-field px-3 text-sm" /></label>}
            </div>
          )}
        </fieldset>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t("step1")}</h3>
        <button type="button" onClick={locate} disabled={locState === "busy"} className={`${btn} inline-flex w-fit items-center gap-2 border border-field bg-white`}>
          <MapPin aria-hidden size={18} />{locState === "busy" ? t("locating") : t("getLocation")}
        </button>
        {pos && <p className="text-sm text-leaf">{t("located", { acc: pos.accuracy })}</p>}
        {(locState === "denied" || locState === "error") && (
          <div role="alert" className="rounded-[10px] bg-danger-soft p-3 text-sm text-danger">
            <b>{t("locOff")}</b><br />{t("locHelpIphone")}<br />{t("locHelpAndroid")}
          </div>
        )}
      </section>

      {!out && selfieRequired && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("step2")}</h3>
          {photo ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-28 w-28 rounded-xl object-cover" />
              <button type="button" onClick={() => { setPhoto(null); void startCamera(); }} className={`${btn} border border-field bg-white`}>{t("retake")}</button>
            </div>
          ) : camOn ? (
            <div className="flex flex-col gap-2">
              <video ref={video} playsInline muted className="aspect-[3/4] w-full max-w-[320px] rounded-xl bg-forest object-cover [transform:scaleX(-1)]" />
              <button type="button" onClick={capture} className={`${btn} w-fit bg-charge font-bold text-forest`}>{t("capture")}</button>
            </div>
          ) : (
            <button type="button" onClick={startCamera} className={`${btn} inline-flex w-fit items-center gap-2 border border-field bg-white`}><Camera aria-hidden size={18} />{t("startCamera")}</button>
          )}
          {camDenied && <p role="alert" className="rounded-[10px] bg-danger-soft p-3 text-sm text-danger"><b>{t("camOff")}</b> {t("camHelp")}</p>}
        </section>
      )}

      <label className="flex flex-col gap-1 text-xs font-semibold">{t("reason")}<input value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 rounded-[10px] border border-field px-3 text-sm" /></label>
      <button type="button" disabled={!ready || busy} onClick={submit} className="h-14 rounded-2xl bg-charge text-lg font-bold text-forest disabled:opacity-50">
        {busy ? t("saving") : out ? t("confirmOut") : t("confirm")}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-[10px] px-3 py-2.5 text-sm font-semibold ${msg.ok ? "bg-charge-soft" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
