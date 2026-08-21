import { civilizationMessages } from "../../lib/civilization-locale.ts";

export function gameShell(ctx) {
  ctx = { copy: civilizationMessages(), ...ctx };
  const { state, runtimeMode, panel, copy, reducedMotion } = ctx;
  return `
    <section class="game-shell village-shell ${reducedMotion ? "motion-reduced" : ""}">
      <div data-game-shell-hud></div>
      <main class="command-layout">
        <div data-game-village-map></div>
        <aside class="command-rail">
<div data-game-command-navigation-mount="desktop"></div>
<section class="command-panel" id="game-command-panel">${panel}</section>
</aside>
      </main>
      <footer class="game-footer">
<span>
<i>
</i> ${runtimeMode === "world" ? copy.gameAuthority : copy.demoStorage}</span>
<span>${runtimeMode === "demo" ? copy.demoFooter(state.raids) : copy.worldFooter(state.prestigeCount)}</span>
${runtimeMode === "demo" ? `<button id="reset">${copy.demoReset}</button>` : ""}</footer>
      <div data-game-command-navigation-mount="mobile"></div>
      <div data-game-settings-dialog></div>
      <div data-wallet-review-dialog></div>
    </section>`;
}
