/** Persistent classification marking (PRD §11.1, §11.4). Colour reflects the
 *  level; hazard ticks at each end read as a controlled document band. */
export function ClassificationBanner({ text, edge = "top" }: { text: string; edge?: "top" | "bottom" }) {
  const level = text.toUpperCase();
  const band = level.includes("SECRET")
    ? "bg-band-secret"
    : level.includes("RESTRICTED") || level.includes("CONFIDENTIAL")
      ? "bg-band-restricted"
      : "bg-band-unclass";
  return (
    <div
      className={`${band} relative flex h-6 items-center justify-center text-white`}
      role="note"
      aria-label={`Classification ${text}`}
    >
      <Ticks side="left" />
      <span className="font-mono text-[10px] font-semibold uppercase tracking-widest2">{text}</span>
      <Ticks side="right" />
      <span className={`pointer-events-none absolute inset-x-0 ${edge === "top" ? "bottom-0" : "top-0"} h-px bg-white/25`} />
    </div>
  );
}

function Ticks({ side }: { side: "left" | "right" }) {
  return (
    <span className={`absolute ${side === "left" ? "left-2" : "right-2"} flex gap-1 opacity-70`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="h-2.5 w-0.5 -skew-x-12 bg-white/60" />
      ))}
    </span>
  );
}
