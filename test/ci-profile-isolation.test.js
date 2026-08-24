import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(".github/workflows/container.yml", "utf8");

test("container release tags are branch-isolated", () => {
  assert.match(workflow, /branches: \[master, develop\]/);
  assert.match(workflow, /github\.ref_name \}\}" = "master"/);
  assert.match(workflow, /release=latest/);
  assert.match(workflow, /github\.ref_name \}\}" = "develop"/);
  assert.match(workflow, /release=dev/);
  assert.match(workflow, /steps\.tags\.outputs\.release/);
});

test("master publishes precisely the container image whose runtime verification passed", () => {
  assert.match(
    workflow,
    /Gate master delivery[\s\S]*?civilization-dapp-release-gate:ci[\s\S]*?Publish the verified master image[\s\S]*?docker tag civilization-dapp-release-gate:ci ghcr\.io\/ralphschuler\/civilization\.dapp:\$\{\{ steps\.tags\.outputs\.release \}\}/,
  );
  assert.match(
    workflow,
    /uses: docker\/build-push-action@[\s\S]*?\n        if: github\.ref_name == 'develop'/,
  );
});
