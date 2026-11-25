"use client";

import { createClient } from "@/lib/supabase/client";
import { clockIn, clockOut, startSelfieUpload, type ClockPayload } from "@/app/(app)/hr/attendance/actions";
import { dequeue, queued, type Queued } from "@/lib/offline-queue";

/** Upload the selfie (if any) and send the time record. Throws on network failure so the caller can keep it offline. */
export async function sendClock(kind: "in" | "out", payload: ClockPayload, selfie?: Blob) {
  const p: ClockPayload = { ...payload };
  if (selfie) {
    const up = await startSelfieUpload();
    if (!up.ok) throw new Error(up.error);
    const { error } = await createClient().storage.from("selfies").uploadToSignedUrl(up.path, up.token, selfie, { contentType: "image/jpeg" });
    if (error) throw new Error(error.message);
    p.selfie_path = up.path;
  }
  return kind === "in" ? clockIn(p) : clockOut(p);
}

/** Send everything saved while offline. Records the server refuses are dropped (and reported). */
export async function flushQueue(): Promise<{ sent: number; errors: string[] }> {
  let sent = 0;
  const errors: string[] = [];
  let items: Queued[] = [];
  try { items = await queued(); } catch { return { sent, errors }; }
  for (const q of items.sort((a, b) => a.created - b.created)) {
    try {
      const r = await sendClock(q.kind, q.payload as ClockPayload, q.selfie);
      await dequeue(q.id);
      if (r.ok) sent++; else errors.push(r.error);
    } catch {
      break; // still offline
    }
  }
  return { sent, errors };
}
