// Raid content is rendered by the typed React island so inputs and countdown
// always come from the runtime instead of imperative DOM reads.
export function raidPanel() {
  return "<div data-game-raid-panel></div>";
}
