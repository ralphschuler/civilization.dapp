export function gameShell(ctx = {}) {
  const { panel, reducedMotion } = ctx;
  return `
    <section class="game-shell village-shell ${reducedMotion ? "motion-reduced" : ""}">
      <div data-game-shell-hud></div>
      <div data-entry-guide-mount></div>
      <main class="command-layout">
        <div data-game-village-map></div>
        <aside class="command-rail">
<div data-game-command-navigation-mount="desktop"></div>
<section class="command-panel" id="game-command-panel">${panel}</section>
</aside>
      </main>
      <div data-game-footer></div>
      <div data-game-command-navigation-mount="mobile"></div>
      <div data-game-settings-dialog></div>
      <div data-wallet-review-dialog></div>
    </section>`;
}
