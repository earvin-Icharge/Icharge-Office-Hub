/** Countdown to a target (spec 4.7 / 4.9): amber at 75 % used, red when missed. */
export function timer(startIso: string, dueIso: string, stoppedIso?: string | null) {
  const start = new Date(startIso).getTime();
  const due = new Date(dueIso).getTime();
  const end = stoppedIso ? new Date(stoppedIso).getTime() : Date.now();
  const used = (end - start) / Math.max(1, due - start);
  const tone: "green" | "amber" | "red" = end > due ? "red" : used >= 0.75 ? "amber" : "green";
  return { tone, met: !!stoppedIso && end <= due, msLeft: due - end, pct: Math.min(100, Math.max(0, used * 100)) };
}

export function humanDuration(ms: number) {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export const TONE_CLS = { green: "bg-[#DCFCE7] text-[#166534]", amber: "bg-[#FEF3C7] text-[#92400E]", red: "bg-danger-soft text-danger" } as const;
