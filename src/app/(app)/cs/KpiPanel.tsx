import { getTranslations } from "next-intl/server";
import { Battery } from "@/components/Battery";

type K = Record<string, number | null>;
const LOWER_IS_BETTER = new Set(["avg_solve_hours", "reopened"]);
const UNIT: Record<string, string> = { reply_15: "%", solved_in_target: "%", avg_solve_hours: " h", rating: "", reopened: "%" };

/** Each KPI: value, target and a battery — green on target, amber within 10 %, red below (spec 4.9). */
export async function KpiPanel({ kpis, targets }: { kpis: K; targets: Record<string, number> }) {
  const t = await getTranslations("cs");
  const rows = ["reply_15", "solved_in_target", "avg_solve_hours", "rating", "reopened"].map((k) => {
    const v = kpis[k], target = targets[k];
    let tone: "green" | "amber" | "red" | null = null, pct = 0;
    if (v != null && target != null) {
      const ratio = LOWER_IS_BETTER.has(k) ? (v === 0 ? 1 : target / v) : v / target;
      tone = ratio >= 1 ? "green" : ratio >= 0.9 ? "amber" : "red";
      pct = Math.min(100, ratio * 100);
    }
    return { k, v, target, tone, pct };
  });
  const toneText = { green: "text-[#166534]", amber: "text-[#92400E]", red: "text-danger" };
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <div key={r.k} className="flex flex-col gap-1.5 rounded-xl border border-line p-3">
          <span className="text-xs font-semibold text-muted">{t(`kpi.${r.k}`)}</span>
          <span className={`font-display text-2xl font-bold ${r.tone ? toneText[r.tone] : ""}`}>{r.v == null ? t("noData") : `${r.v}${UNIT[r.k]}`}</span>
          <Battery percent={r.pct} label={`${t(`kpi.${r.k}`)}: ${r.v ?? "—"}`} />
          <span className="text-xs text-muted">{t("target", { t: `${LOWER_IS_BETTER.has(r.k) ? "≤ " : "≥ "}${r.target}${UNIT[r.k]}` })}</span>
        </div>
      ))}
      <div className="flex flex-col gap-1.5 rounded-xl border border-line p-3">
        <span className="text-xs font-semibold text-muted">{t("kpi.handled")}</span>
        <span className="font-display text-2xl font-bold">{kpis.handled ?? 0}</span>
        {kpis.quality != null && <span className="text-xs text-muted">{t("kpi.quality")}: {kpis.quality}/5</span>}
      </div>
    </div>
  );
}
