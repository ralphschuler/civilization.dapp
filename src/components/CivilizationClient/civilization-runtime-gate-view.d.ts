import type { RefObject } from "react";
import type { CivilizationGateState } from "./CivilizationRuntimeGate";

type CivilizationRuntimeGateViewProps = {
  gate: CivilizationGateState | null;
  heading?: RefObject<HTMLHeadingElement | null>;
  onRetry: (() => void) | null;
};

export function CivilizationRuntimeGateView(
  props: CivilizationRuntimeGateViewProps,
): React.ReactElement | null;
