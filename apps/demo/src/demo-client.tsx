"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function DemoClient() {
  const root = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<ReactNode>(null);
  useEffect(() => {
    (
      globalThis as typeof globalThis & { __CIVILIZATION_ASSET_BASE__: string }
    ).__CIVILIZATION_ASSET_BASE__ = "/civilization.dapp";
    let disposed = false;
    let stop: undefined | (() => void);
    import("../../../src/app.js").then(
      ({ startCivilizationApp, stopCivilizationApp }) => {
        if (disposed) {
          return;
        }
        stop = stopCivilizationApp;
        startCivilizationApp({
          root: root.current,
          runtimeMode: "demo",
          onFrameChange: setFrame,
        });
      },
    );
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  return <div ref={root}>{frame}</div>;
}
