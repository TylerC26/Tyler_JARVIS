// Ambient atmosphere behind the dashboard: two slow counter-rotating reticles
// and soft colour blooms anchored off-screen. Fixed + negative z so it sits
// behind all content yet above the base canvas; fully decorative.
export function HudBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute -right-40 -top-48 size-[40rem] rounded-full bg-accent/[0.06] blur-[130px]" />
      <div className="absolute -bottom-52 -left-52 size-[36rem] rounded-full bg-info/[0.05] blur-[130px]" />

      {/* upper-right reticle */}
      <svg
        viewBox="0 0 400 400"
        fill="none"
        stroke="currentColor"
        className="spin-slow absolute -right-36 -top-44 size-[46rem] text-accent/[0.06]"
      >
        <circle cx="200" cy="200" r="198" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="156" strokeWidth="0.5" strokeDasharray="2 10" />
        <circle cx="200" cy="200" r="112" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="64" strokeWidth="0.5" strokeDasharray="1 6" />
        <line x1="200" y1="2" x2="200" y2="398" strokeWidth="0.5" />
        <line x1="2" y1="200" x2="398" y2="200" strokeWidth="0.5" />
        {Array.from({ length: 24 }, (_, i) => (
          <line
            key={i}
            x1="200"
            y1="2"
            x2="200"
            y2="16"
            strokeWidth="0.6"
            transform={`rotate(${i * 15} 200 200)`}
          />
        ))}
      </svg>

      {/* lower-left crosshair, counter-rotating */}
      <svg
        viewBox="0 0 400 400"
        fill="none"
        stroke="currentColor"
        className="spin-rev absolute -bottom-52 -left-44 size-[42rem] text-info/[0.05]"
      >
        <circle cx="200" cy="200" r="190" strokeWidth="0.5" strokeDasharray="4 12" />
        <circle cx="200" cy="200" r="130" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="78" strokeWidth="0.5" strokeDasharray="2 8" />
        <line x1="200" y1="20" x2="200" y2="380" strokeWidth="0.5" />
        <line x1="20" y1="200" x2="380" y2="200" strokeWidth="0.5" />
      </svg>
    </div>
  );
}
