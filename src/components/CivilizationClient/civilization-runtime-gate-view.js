import { createElement } from "react";

/** @typedef {import("./CivilizationRuntimeGate").CivilizationGateState} CivilizationGateState */

/**
 * @typedef {object} CivilizationRuntimeGateViewProps
 * @property {CivilizationGateState | null} gate
 * @property {(() => void) | null} onRetry
 * @property {import("react").RefObject<HTMLHeadingElement | null>} [heading]
 */

/**
 * @param {CivilizationRuntimeGateViewProps} props
 */
export function CivilizationRuntimeGateView({ gate, onRetry, heading }) {
  if (!gate) return null;

  const canRetry = gate.kind === "runtime" && !gate.loading && onRetry;
  const message = gate.kind === "access" ? gate.detail : gate.feedback;

  return createElement(
    "section",
    {
      className: "game-access-gate",
      "aria-busy": gate.kind === "runtime" && gate.loading,
      "aria-labelledby": "civilization-runtime-gate-title",
    },
    createElement(
      "div",
      { className: "game-access-card" },
      createElement("span", { className: "game-access-mark" }, "CD"),
      createElement(
        "p",
        null,
        gate.kind === "access" ? "WORLD MINI APP" : "WORLD CHAIN",
      ),
      createElement(
        "h1",
        {
          id: "civilization-runtime-gate-title",
          ref: heading,
          tabIndex: -1,
        },
        gate.title,
      ),
      createElement(
        "span",
        { role: "status", "aria-live": "polite", "aria-atomic": "true" },
        message,
      ),
      canRetry
        ? createElement(
            "button",
            { className: "game-access-action", onClick: onRetry },
            gate.retryLabel,
          )
        : null,
    ),
  );
}
