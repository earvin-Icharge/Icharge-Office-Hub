/** Shown at once when a page is opened, while its data loads (instead of nothing happening). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex animate-pulse flex-col gap-4">
      <div className="h-8 w-48 rounded-lg bg-line" />
      <div className="h-4 w-72 max-w-full rounded bg-line" />
      <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-[14px] bg-white" />)}
      </div>
      <div className="h-64 rounded-[14px] bg-white" />
    </div>
  );
}
