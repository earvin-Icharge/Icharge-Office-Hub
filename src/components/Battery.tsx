/** Progress bar drawn as a battery (spec 2). */
export function Battery({ percent, label }: { percent: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="flex items-center gap-1">
      <div role="img" aria-label={label} className="flex h-[26px] flex-1 rounded-lg border-2 border-charge p-[3px]">
        <div className="h-full rounded bg-charge" style={{ width: `${pct}%` }} />
      </div>
      <div aria-hidden className="h-3 w-[5px] rounded-r-[3px] bg-charge" />
    </div>
  );
}
