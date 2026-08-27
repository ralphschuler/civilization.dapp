import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("the runtime emits a typed frame through its owning React clients", async () => {
  const [app, client, demo, e2e] = await Promise.all([
    source("../src/app.js"),
    source("../src/components/CivilizationClient.tsx"),
    source("../apps/demo/src/demo-client.tsx"),
    source("../src/components/WalletAccess/WalletAccessE2eHarness.tsx"),
  ]);
  assert.match(
    app,
    /onFrameChange: \(frame: import\("react"\)\.ReactNode \| null\) => void/,
  );
  assert.match(app, /runtime\.onFrameChange\(null\)/);
  assert.match(app, /runtime\.onFrameChange\(frame\(\)\)/);
  assert.doesNotMatch(app, /createRoot|replaceChildren|shellRoot/);
  for (const consumer of [client, demo, e2e]) {
    assert.match(consumer, /useState<ReactNode>\(null\)/);
    assert.match(consumer, /onFrameChange: setFrame/);
    assert.match(consumer, /\{frame\}/);
    assert.match(consumer, /stopCivilizationApp/);
  }
});

test("BuildPanel defaults active callers while hidden drafts skip World reads", async () => {
  const [panel, frame] = await Promise.all([
    source("../src/components/BuildPanel.tsx"),
    source("../src/components/GameShellFrame.tsx"),
  ]);
  assert.match(panel, /active\?: boolean/);
  assert.match(
    panel,
    /export function BuildPanel\(\{ active = true, \.\.\.props \}: BuildPanelProps\)/,
  );
  assert.match(panel, /useEffect\(\(\) => \{\s*if \(active && plan\)/);
  assert.match(
    panel,
    /function BuildHistory\(\{\s*active,[\s\S]*?const wasActive = useRef\(active\);[\s\S]*?useEffect\(\(\) => \{\s*const becameActive = active && !wasActive\.current;[\s\S]*?if \(!becameActive\) return;[\s\S]*?\}, \[active, load\]\)/,
  );
  assert.match(panel, /<BuildHistory active=\{active\} props=\{props\} \/>/);
  assert.match(
    frame,
    /<BuildPanel\s+\{\.\.\.props\.build\}\s+active=\{props\.activePanel === "build"\}\s*\/>/,
  );
});
