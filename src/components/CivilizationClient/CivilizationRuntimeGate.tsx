"use client";

import { useEffect, useRef } from "react";
import { CivilizationRuntimeGateView } from "@/components/CivilizationClient/civilization-runtime-gate-view";

export type CivilizationGateState =
  | {
      kind: "access";
      detail: string;
      title: string;
    }
  | {
      kind: "runtime";
      feedback: string;
      loading: boolean;
      retryLabel: string;
      title: string;
    };

type CivilizationRuntimeGateProps = {
  gate: CivilizationGateState | null;
  onRetry: (() => void) | null;
};

export function CivilizationRuntimeGate({
  gate,
  onRetry,
}: CivilizationRuntimeGateProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (gate) heading.current?.focus();
  }, [gate]);

  return (
    <CivilizationRuntimeGateView
      gate={gate}
      heading={heading}
      onRetry={onRetry}
    />
  );
}
