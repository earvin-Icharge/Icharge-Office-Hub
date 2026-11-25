/** Green "done" or red error message after an action (?ok= / ?error= in the address). */
export function Flash({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) return <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger">{error}</p>;
  if (ok) return <p role="status" className="rounded-[10px] border border-charge-line bg-charge-soft px-3 py-2.5 text-sm font-semibold">{ok}</p>;
  return null;
}
