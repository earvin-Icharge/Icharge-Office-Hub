import "server-only";

export type Term = { id: string; kind: string; value: number; unit: string; basis: string | null; payout_timing: string | null; term_text: string | null;
  valid_from: string; valid_to: string | null; status: string; set_by: string; reason: string | null; approved_bd_head_by: string | null; approved_leader_by: string | null; created_at: string };

/** Days until the contract ends (negative when ended) and the countdown colour (spec 4.8). */
export function countdown(endDate: string | null | undefined) {
  if (!endDate) return null;
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const days = Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400_000);
  const tone = days > 90 ? "green" : days > 30 ? "amber" : "red";
  return { days, tone } as const;
}

export const PRE_SIGN = ["prospect", "proposal_sent", "negotiating", "waiting_signature"];
