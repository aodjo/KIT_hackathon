/**
 * Echo logo mark
 * @return logo element
 */
export default function Logo() {
  return (
    <a href="/" className="inline-flex items-center gap-2.5 group">
      {/* concentric circles mark */}
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="2" fill="#0A0A0A" />
        <circle cx="11" cy="11" r="5.5" stroke="#0A0A0A" strokeWidth="1" opacity="0.55" />
        <circle cx="11" cy="11" r="9.5" stroke="#0A0A0A" strokeWidth="1" opacity="0.2" />
      </svg>
      <span className="font-display text-[22px] leading-none tracking-tight-display text-ink italic">
        Echo
      </span>
    </a>
  );
}
