/** Building blocks for tidy settings forms: one labelled row per setting, units, day buttons and on/off switches. */

export const inputCls = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] min-w-0";

export function SettingRow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 first:pt-0 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between min-[560px]:gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        {help && <p className="text-xs leading-relaxed text-muted">{help}</p>}
      </div>
      <div className="flex flex-none flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Number with its unit after it, e.g. [ 200 ] meters. */
export function NumberUnit({ name, value, unit, min = 0, step = 1, label }: { name: string; value: unknown; unit: string; min?: number; step?: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <input name={name} type="number" inputMode="decimal" min={min} step={step} defaultValue={value == null ? "" : String(value)} aria-label={label} className={`${inputCls} w-24 text-right`} />
      <span className="text-sm text-muted">{unit}</span>
    </span>
  );
}

export function TimeInput({ name, value, label }: { name: string; value: unknown; label: string }) {
  return <input name={name} type="time" defaultValue={typeof value === "string" ? value.slice(0, 5) : ""} aria-label={label} className={`${inputCls} w-[9.5rem]`} />;
}

/** Mon–Sun buttons; ticked days are sent as numbers 1–7. */
export function DayChips({ name, days, labels }: { name: string; days: number[]; labels: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5" role="group">
      {labels.map((l, i) => (
        <label key={l} className="cursor-pointer">
          <input type="checkbox" name={name} value={i + 1} defaultChecked={days.includes(i + 1)} className="peer sr-only" />
          <span className="flex h-10 min-w-11 items-center justify-center rounded-full border border-field bg-white px-2 text-[13px] font-semibold text-ink-2 peer-checked:border-forest peer-checked:bg-forest peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-charge-ring">{l}</span>
        </label>
      ))}
    </span>
  );
}

/** On/off switch (a real checkbox underneath). */
export function Switch({ name, on, label }: { name: string; on: boolean; label: string }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input type="checkbox" name={name} defaultChecked={on} aria-label={label} className="peer sr-only" />
      <span className="h-7 w-12 rounded-full bg-field transition-colors peer-checked:bg-leaf peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-charge-ring" />
      <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </label>
  );
}

export function SaveButton({ label }: { label: string }) {
  return <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{label}</button>;
}

/** A text box that wraps long text onto more lines instead of cutting it (for names and short texts). Enter is turned into a space when saved. */
export function WrapField({ name, value, label, placeholder, required = false, className = "" }: { name: string; value?: string | null; label: string; placeholder?: string; required?: boolean; className?: string }) {
  const len = (value ?? "").length;
  return (
    <textarea name={name} required={required} defaultValue={value ?? ""} aria-label={label} placeholder={placeholder}
      rows={Math.max(1, Math.ceil(len / 30))}
      className={`min-h-11 w-full resize-none rounded-[10px] border border-field bg-white px-3 py-2.5 text-[15px] leading-snug [field-sizing:content] ${className}`} />
  );
}

/** Pick one of a few options as buttons that wrap (instead of a dropdown that cuts long names). */
export function ChoiceList({ name, options, value, required = false }: { name: string; options: { value: string; label: string }[]; value?: string; required?: boolean }) {
  return (
    <span className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o, i) => (
        <label key={o.value} className="cursor-pointer">
          <input type="radio" name={name} value={o.value} required={required} defaultChecked={value ? value === o.value : i === 0} className="peer sr-only" />
          <span className="flex min-h-11 items-center rounded-[10px] border border-field bg-white px-3 py-2 text-sm leading-snug font-semibold text-ink-2 peer-checked:border-forest peer-checked:bg-forest peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-charge-ring">{o.label}</span>
        </label>
      ))}
    </span>
  );
}
