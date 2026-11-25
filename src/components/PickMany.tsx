/** Pick several (people, departments): tick boxes that work the same on phones and computers. */
export function PickMany({ label, name, options, defaultValue = [], help }: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string[];
  help?: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold">
      <legend className="mb-1.5">{label}</legend>
      <div className="max-h-52 overflow-y-auto rounded-[10px] border border-field bg-white p-1">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-[15px] font-normal hover:bg-paper">
            <input type="checkbox" name={name} value={o.value} defaultChecked={defaultValue.includes(o.value)} className="h-5 w-5 flex-none accent-[#2f6b0a]" />
            <span className="min-w-0">{o.label}</span>
          </label>
        ))}
      </div>
      {help && <span className="text-xs font-normal text-muted">{help}</span>}
    </fieldset>
  );
}
