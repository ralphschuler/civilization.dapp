import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CivilizationRuntimeGateView } from "../src/components/CivilizationClient/civilization-runtime-gate-view.js";
import {
  createGateRetryHandle,
  deriveGateState,
} from "../src/game-ui/gate-state.js";

const copy = {
  accessDetail: "Open the World Mini App to continue.",
  accessRequired: "World access required",
  loadingWorld: "Loading World",
  retry: "Retry",
  worldUnavailable: "World unavailable",
};

test("gate state distinguishes access, loading, unavailable, and ready runtime", () => {
  assert.deepEqual(
    deriveGateState({
      access: false,
      mode: "world",
      ready: false,
      state: null,
      loading: true,
      feedback: "ignored",
      copy,
    }),
    {
      kind: "access",
      detail: copy.accessDetail,
      title: copy.accessRequired,
    },
  );
  assert.deepEqual(
    deriveGateState({
      access: true,
      mode: "world",
      ready: false,
      state: null,
      loading: true,
      feedback: "Loading provider",
      copy,
    }),
    {
      kind: "runtime",
      feedback: "Loading provider",
      loading: true,
      retryLabel: copy.retry,
      title: copy.loadingWorld,
    },
  );
  assert.equal(
    deriveGateState({
      access: true,
      mode: "world",
      ready: false,
      state: null,
      loading: false,
      feedback: "RPC unavailable",
      copy,
    })?.title,
    copy.worldUnavailable,
  );
  assert.equal(
    deriveGateState({
      access: true,
      mode: "world",
      ready: true,
      state: {},
      loading: false,
      feedback: "ready",
      copy,
    }),
    null,
  );
});

test("gate retry handle invokes the runtime refresh exactly once", () => {
  let refreshes = 0;
  createGateRetryHandle(() => {
    refreshes += 1;
  })();
  assert.equal(refreshes, 1);
});

test("hostile runtime feedback is rendered as React text", () => {
  const hostile = '<img src=x onerror="globalThis.pwned=1">';
  const markup = renderToStaticMarkup(
    createElement(CivilizationRuntimeGateView, {
      gate: {
        kind: "runtime",
        feedback: hostile,
        loading: false,
        retryLabel: "Retry",
        title: "World unavailable",
      },
      onRetry: () => {},
    }),
  );
  assert.match(
    markup,
    /&lt;img src=x onerror=&quot;globalThis\.pwned=1&quot;&gt;/,
  );
  assert.doesNotMatch(markup, /<img src=x/);
});
