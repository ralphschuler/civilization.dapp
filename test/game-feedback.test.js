import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("game-map feedback escapes attacker-controlled HTML before innerHTML rendering", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const helperLine = appSource.split("\n").find((line) => line.startsWith("function escapeHtml("));
  assert.ok(helperLine, "the game renderer must retain its HTML escaping helper");

  const escapeHtml = new Function(`return (${helperLine})`)();
  const attackerControlledFeedback = "<img src=x onerror=alert(1)>";
  const renderedFeedback = escapeHtml(attackerControlledFeedback);

  assert.equal(renderedFeedback, "&lt;img src=x onerror=alert(1)&gt;");
  assert.doesNotMatch(renderedFeedback, /<img\b/i);
  assert.match(appSource, /class="map-feedback" aria-live="polite">\$\{escapeHtml\(feedback\)\}<\/p>/);
});
