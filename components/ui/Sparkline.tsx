// Minimal dependency-free SVG sparkline — a single trend line with a soft area
// fill and a dot on the latest point. Stroke + fill inherit `currentColor`, so
// colour it by setting a Tailwind text-* class on the element (default accent).
// Used by the /gym exercise progression cards; general enough to reuse anywhere.

type Props = {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
};

export function Sparkline({
  values,
  width = 120,
  height = 32,
  className = "text-accent",
  strokeWidth = 1.5,
}: Props) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        className={className}
        aria-hidden
        role="img"
      />
    );
  }

  const pad = strokeWidth + 1; // keep the stroke + end dot inside the viewBox
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const xy = pts.map((v, i) => {
    const x = pts.length === 1 ? width / 2 : pad + (i / (pts.length - 1)) * innerW;
    const y = pad + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${height - pad} L${xy[0][0].toFixed(1)},${height - pad} Z`;
  const [lastX, lastY] = xy[xy.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
      role="img"
    >
      <path d={area} fill="currentColor" fillOpacity={0.12} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={strokeWidth + 0.5} fill="currentColor" />
    </svg>
  );
}
