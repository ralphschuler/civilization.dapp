// The imperative shell owns this stable mount point. Dynamic build content is
// rendered by BuildPanel so game data never crosses an HTML interpolation boundary.
export function buildPanel(_context) {
  void _context;
  return "<div data-game-build-panel></div>";
}
