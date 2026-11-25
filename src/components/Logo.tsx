type Props = { size?: number; subtitle?: string; wordmarkClass?: string };

/** Round lightning-bolt logo + "icharge" wordmark (spec 2). */
export function LogoMark({ size = 40, label = true }: { size?: number; label?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className="flex-none"
      {...(label ? { role: "img", "aria-label": "iCharge logo" } : { "aria-hidden": true })}
    >
      <circle cx="20" cy="20" r="20" fill="#8FD220" />
      <path d="M27.6 10.4 A12 12 0 1 0 31.2 17.2" fill="none" stroke="#FFFFFF" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M22.5 8.5 L13.5 21.5 H19.5 L17.5 31 L27 17.5 H21 Z" fill="#FFFFFF" />
    </svg>
  );
}

export function Logo({ size = 40, subtitle, wordmarkClass = "text-[23px]" }: Props) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="flex flex-col leading-[1.1]">
        <span className={`font-display font-extrabold tracking-[-0.5px] text-white ${wordmarkClass}`}>
          i<span className="text-charge">charge</span>
        </span>
        {subtitle && <span className="text-[11px] font-semibold tracking-[2px] text-sage">{subtitle}</span>}
      </span>
    </span>
  );
}
