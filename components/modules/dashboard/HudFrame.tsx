// Decorative HUD chrome layered inside every dashboard Panel: a charged top
// edge, four targeting-bracket corners, and a hover interrogation sweep. Purely
// presentational and server-safe — the reactive bits key off `.hud-panel:hover`
// on the host, so the host element must carry the `hud-panel` class.
export function HudFrame() {
  return (
    <>
      <span aria-hidden className="hud-topline" />
      <span aria-hidden className="hud-scanbar" />
      <span aria-hidden className="hud-bracket hud-bracket-tl" />
      <span aria-hidden className="hud-bracket hud-bracket-tr" />
      <span aria-hidden className="hud-bracket hud-bracket-bl" />
      <span aria-hidden className="hud-bracket hud-bracket-br" />
    </>
  );
}
