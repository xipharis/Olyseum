/** Osyleum wordmark: an amber ring mark beside the name, set in the display face. */
export function BrandImage({ mark = false, alt = "Osyleum", className = "" }: { mark?: boolean; alt?: string; className?: string }) {
  return (
    <span className={`brand-image inline-flex items-center gap-2 ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-signal)" strokeWidth="4" />
        <circle cx="12" cy="12" r="2.5" fill="var(--color-fg)" />
      </svg>
      {!mark && <span className="display text-[22px] leading-none text-fg">osyleum</span>}
    </span>
  );
}
