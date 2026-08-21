// The imperative shell owns this stable mount point. Dynamic market content is
// rendered by MarketPanel so form state cannot drift from a submitted quote.
export function marketPanel() {
  return "<div data-game-market-panel></div>";
}
