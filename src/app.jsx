import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { IDKitRequestWidget, proofOfHuman } from "@worldcoin/idkit";
import { MiniKitProvider } from "@worldcoin/minikit-js/minikit-provider";
import { MiniKit } from "@worldcoin/minikit-js";
import { startCivilizationApp, stopCivilizationApp } from "./app.js";
import { isExplicitDemoLocation } from "./world-gate.js";
import { authenticateWorldWallet, buildWorldIdRegistration, confirmWorldIdRegistration, getWorldIdConfig, isWorldAppBridgePresent, prepareWorldIdProofContext, submitWorldIdRegistration } from "./world.js";

const BRIDGE_RETRY_MS = 100;
const REGISTRATION_CONFIRMATION_ATTEMPTS = 21;

function useWorldAppRuntime() {
  const [runtime, setRuntime] = useState(() => isExplicitDemoLocation(globalThis.location) ? "browser" : "world_required");

  useEffect(() => {
    if (isExplicitDemoLocation(globalThis.location)) return undefined;

    let cancelled = false;
    const detect = () => {
      if (isWorldAppBridgePresent()) {
        // The bridge determines the environment. Installation success or
        // failure must never classify this production page as a browser demo.
        try { MiniKit.install(import.meta.env.VITE_WORLD_APP_ID); } catch { /* gate stays closed */ }
        if (!cancelled) setRuntime("world");
        return true;
      }
      if (!cancelled) setRuntime("world_required");
      return false;
    };

    if (detect()) return () => { cancelled = true; };
    const retry = setInterval(() => {
      if (detect()) clearInterval(retry);
    }, BRIDGE_RETRY_MS);
    return () => {
      cancelled = true;
      clearInterval(retry);
    };
  }, []);

  return runtime;
}

function WorldAccessScreen({ onConfirmed }) {
  const config = useMemo(() => getWorldIdConfig(), []);
  const [status, setStatus] = useState(config.configured ? "login" : "configuration_required");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState("wallet");
  const [walletAddress, setWalletAddress] = useState(null);
  const [proofRequest, setProofRequest] = useState(null);
  const [proofOpen, setProofOpen] = useState(false);
  const registrationConfirmed = useRef(false);

  const checkExistingRegistration = useCallback(async (wallet) => {
    setStatus("checking_existing");
    const existing = await confirmWorldIdRegistration({ config, walletAddress: wallet, attempts: 1, retryDelayMs: 0 });
    if (existing.ok) {
      onConfirmed(wallet);
      return;
    }
    if (existing.reason !== "registration_not_confirmed") {
      setRetry("existing");
      setError(existing.reason);
      setStatus("error");
      return;
    }
    setRetry("proof");
    setStatus("world_id_ready");
  }, [config, onConfirmed]);

  const beginWalletAuth = useCallback(async () => {
    if (!config.configured) return;
    setError("");
    setRetry("wallet");
    setStatus("wallet_auth");
    const walletAuth = await authenticateWorldWallet({ proofContextEndpoint: config.proofContextEndpoint });
    if (!walletAuth.ok) {
      setError(walletAuth.reason);
      setStatus("error");
      return;
    }
    setWalletAddress(walletAuth.walletAddress);
    await checkExistingRegistration(walletAuth.walletAddress);
  }, [checkExistingRegistration, config]);

  const beginWorldId = useCallback(async () => {
    if (!walletAddress) return;
    setError("");
    setRetry("proof");
    setStatus("preparing_proof");
    const prepared = await prepareWorldIdProofContext({ config, walletAddress });
    if (!prepared.ok) {
      setError(prepared.reason);
      setStatus("error");
      return;
    }
    registrationConfirmed.current = false;
    setProofRequest(prepared);
    setStatus("proof");
    setProofOpen(true);
  }, [config, walletAddress]);

  const registerAndConfirmProof = useCallback(async (result) => {
    if (!proofRequest) throw new Error("proof_request_missing");
    setStatus("submitting");
    try {
      const registration = buildWorldIdRegistration({ config, walletAddress: proofRequest.signal, result });
      const submission = await submitWorldIdRegistration(registration);
      if (!submission.ok) throw new Error(submission.reason);
      // The contract read is the sole authority. Give the World user operation
      // a bounded 30-second inclusion window without starting an unbounded
      // receipt poll in the background.
      const confirmed = await confirmWorldIdRegistration({
        config,
        walletAddress: proofRequest.signal,
        attempts: REGISTRATION_CONFIRMATION_ATTEMPTS,
      });
      if (!confirmed.ok) {
        setRetry("existing");
        throw new Error(confirmed.reason);
      }
      registrationConfirmed.current = true;
    } catch (failure) {
      const registrationError = failure instanceof Error ? failure : new Error("registration_failed");
      setError(registrationError.message);
      setStatus("error");
      throw registrationError;
    }
  }, [config, proofRequest]);

  const completeWorldId = useCallback(() => {
    if (!registrationConfirmed.current || !proofRequest) return;
    setProofOpen(false);
    onConfirmed(proofRequest.signal);
  }, [onConfirmed, proofRequest]);

  const handleWorldIdError = useCallback((code) => {
    if (registrationConfirmed.current) return;
    setProofOpen(false);
    setRetry((current) => current === "existing" ? current : "proof");
    setError((current) => current || String(code));
    setStatus("error");
  }, []);

  const busy = ["wallet_auth", "checking_existing", "preparing_proof", "submitting"].includes(status);
  const detail = {
    login: "Melde zuerst deine World Wallet an. World ID ist danach ein eigener Nachweis und kein Login-Ersatz.",
    wallet_auth: "Bestätige die Wallet-Anmeldung in World App.",
    checking_existing: "Bestehende Registrierung wird auf World Chain geprüft.",
    world_id_ready: "Wallet bestätigt. Verifiziere jetzt deine World ID, damit der Smart Contract dein Dorf freischalten kann.",
    preparing_proof: "World-ID-Anfrage wird vorbereitet.",
    proof: "Bestätige den World-ID-v4-Nachweis in World App.",
    submitting: "Registrierung wird an World Chain gesendet und bestätigt.",
    configuration_required: "World ID ist für diese Mini App noch nicht vollständig konfiguriert.",
    error: `Der Zugang konnte nicht bestätigt werden${error ? ` (${error})` : ""}.`,
  }[status];

  const title = walletAddress ? "Mit World ID verifizieren" : "Bei Civilization anmelden";
  const retryExisting = () => walletAddress && checkExistingRegistration(walletAddress);
  const action = status === "login"
    ? { label: "Mit World Wallet anmelden", run: beginWalletAuth }
    : status === "world_id_ready"
      ? { label: "Mit World ID verifizieren", run: beginWorldId }
      : status === "error"
        ? retry === "existing"
          ? { label: "Registrierung erneut prüfen", run: retryExisting }
          : retry === "proof"
            ? { label: "World ID erneut verifizieren", run: beginWorldId }
            : { label: "Wallet-Anmeldung erneut versuchen", run: beginWalletAuth }
        : null;

  return <section className="world-id-gate" aria-labelledby="world-id-gate-title">
    <div className="world-id-gate-card">
      <span className="world-id-gate-mark">CD</span>
      <p>WORLD MINI APP</p>
      <h1 id="world-id-gate-title">{title}</h1>
      <div className="world-access-steps" aria-label="Anmeldung in zwei Schritten">
        <span className={walletAddress ? "is-complete" : "is-active"}><b>1</b> World Wallet</span>
        <span className={walletAddress ? "is-active" : ""}><b>2</b> World ID</span>
      </div>
      <span aria-live="polite">{detail}</span>
      {action && <button className="world-access-action" type="button" onClick={action.run} disabled={busy}>{action.label}</button>}
      {proofRequest && <IDKitRequestWidget
        open={proofOpen}
        onOpenChange={(open) => {
          setProofOpen(open);
          if (!open) setStatus((current) => current === "proof" ? "world_id_ready" : current);
        }}
        app_id={config.appId}
        action={config.action}
        rp_context={proofRequest.rpContext}
        allow_legacy_proofs={false}
        environment={config.environment}
        preset={proofOfHuman({ signal: proofRequest.signal })}
        handleVerify={registerAndConfirmProof}
        onSuccess={completeWorldId}
        onError={handleWorldIdError}
      />}
    </div>
  </section>;
}

function CivilizationApp() {
  const root = useRef(null);
  const runtime = useWorldAppRuntime();
  const [worldAccessWallet, setWorldAccessWallet] = useState(null);
  const worldAccessConfirmed = Boolean(worldAccessWallet);
  const shouldStartGame = runtime === "browser" || (runtime === "world" && worldAccessConfirmed);
  const confirmWorldAccess = useCallback((wallet) => setWorldAccessWallet(wallet || "confirmed"), []);

  useEffect(() => {
    if (!shouldStartGame) return undefined;
    startCivilizationApp({ root: root.current, worldAppInstalled: runtime === "world", worldAccessConfirmed, worldWalletAddress: worldAccessWallet });
    return () => stopCivilizationApp();
  }, [runtime, shouldStartGame, worldAccessConfirmed, worldAccessWallet]);

  if (runtime === "world_required") return <section className="world-id-gate"><div className="world-id-gate-card"><p>WORLD MINI APP</p><h1>World App erforderlich</h1><span>Öffne Civilization in World App. Diese Produktionsseite startet außerhalb von World App nicht.</span></div></section>;
  if (runtime === "world" && !worldAccessConfirmed) return <WorldAccessScreen onConfirmed={confirmWorldAccess} />;
  return <div ref={root} />;
}

const mount = document.querySelector("#app");
if (!mount) throw new Error("app_mount_missing");

createRoot(mount).render(<MiniKitProvider props={{ appId: import.meta.env.VITE_WORLD_APP_ID }}><CivilizationApp /></MiniKitProvider>);
