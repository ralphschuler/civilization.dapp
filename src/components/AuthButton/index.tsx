'use client';
import { walletAuth } from '@/auth/wallet';
import { Button, LiveFeedback } from '@worldcoin/mini-apps-ui-kit-react';
import { MiniKit } from '@worldcoin/minikit-js';
import { Command, isCommandAvailable } from '@worldcoin/minikit-js/commands';
import { useCallback, useEffect, useState } from 'react';
import { getWalletReadiness, WalletAuthClientError, WalletReadiness } from '@/auth/wallet/client-flow';

const MAX_BRIDGE_CHECKS = 12;

const readinessText: Record<string, string> = {
  [WalletReadiness.OutsideWorldApp]: 'Öffne Civilization direkt in World App.',
  [WalletReadiness.Initializing]: 'World App wird geladen …',
  [WalletReadiness.BridgeUnavailable]: 'Die World-App-Verbindung ist nicht verfügbar. Bitte World App erneut öffnen.',
  [WalletReadiness.Unsupported]: 'Wallet-Anmeldung wird von dieser World-App-Version nicht unterstützt. Bitte aktualisieren.',
  [WalletReadiness.Ready]: 'Mit World Wallet anmelden',
};

const errorText: Record<string, string> = {
  bridge_unavailable: 'Die World-App-Verbindung ist nicht verfügbar. Bitte World App erneut öffnen.',
  wallet_auth_unsupported: 'Wallet-Anmeldung wird von dieser World-App-Version nicht unterstützt. Bitte aktualisieren.',
  nonce_unavailable: 'Die Anmeldeanfrage konnte nicht vorbereitet werden. Bitte erneut versuchen.',
  native_rejected: 'Die Wallet-Anmeldung wurde abgebrochen oder abgelehnt. Bitte erneut versuchen.',
  malformed_response: 'Die Antwort der Wallet ist ungültig. Bitte erneut versuchen.',
  credentials_rejected: 'Die Anmeldung wurde nicht akzeptiert. Bitte erneut versuchen.',
  session_cookie_rejected: 'Die Sitzung konnte nicht bestätigt werden. Bitte Cookies prüfen und erneut versuchen.',
};

/**
 * This component is an example of how to authenticate a user
 * We will use Next Auth for this example, but you can use any auth provider
 * Read More: https://docs.world.org/mini-apps/commands/wallet-auth
 */
export const AuthButton = ({ worldAppId }: { worldAppId: string }) => {
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<'failed' | 'success' | undefined>();
  const [readiness, setReadiness] = useState<string>(WalletReadiness.Initializing);
  const [failureText, setFailureText] = useState('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');

  useEffect(() => {
    let attempts = 0;
    let timer: number | undefined;
    const detectWallet = () => {
      const inWorldApp = MiniKit.isInWorldApp();
      let miniKitInstalled = inWorldApp && MiniKit.isInstalled();
      // install() mutates MiniKit's internal readiness state. Retry only while
      // waiting for the bridge, and never keep invoking it after this probe ends.
      if (inWorldApp && !miniKitInstalled && attempts < MAX_BRIDGE_CHECKS) {
        try { MiniKit.install(worldAppId); } catch { /* Report a stable readiness state below. */ }
        miniKitInstalled = MiniKit.isInstalled();
      }
      const nextReadiness = getWalletReadiness({
        inWorldApp,
        miniKitInstalled,
        walletAuthAvailable: isCommandAvailable(Command.WalletAuth),
        attempts,
        maxAttempts: MAX_BRIDGE_CHECKS,
        supportedCommands: (window as Window & {
          WorldApp?: { supported_commands?: unknown };
        }).WorldApp?.supported_commands,
      });
      setReadiness(nextReadiness);
      if (nextReadiness === WalletReadiness.Ready || nextReadiness === WalletReadiness.OutsideWorldApp
        || nextReadiness === WalletReadiness.BridgeUnavailable || nextReadiness === WalletReadiness.Unsupported) return true;
      attempts += 1;
      return false;
    };

    const stopProbe = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const startProbe = () => {
      if (timer !== undefined) return;
      attempts = 0;
      if (detectWallet()) return;
      timer = window.setInterval(() => { if (detectWallet()) stopProbe(); }, 250);
    };
    const retryVisibleProbe = () => {
      if (document.visibilityState === 'visible') startProbe();
    };

    startProbe();
    window.addEventListener('focus', startProbe);
    document.addEventListener('visibilitychange', retryVisibleProbe);
    return () => {
      stopProbe();
      window.removeEventListener('focus', startProbe);
      document.removeEventListener('visibilitychange', retryVisibleProbe);
    };
  }, [worldAppId]);

  const onClick = useCallback(async () => {
    if (readiness !== WalletReadiness.Ready || isPending) return;
    setIsPending(true);
    setFeedback(undefined);
    try {
      await walletAuth();
      setFeedback('success');
    } catch (error) {
      const stage = error instanceof WalletAuthClientError ? error.stage : 'native_rejected';
      const reason = error instanceof WalletAuthClientError ? error.reason : undefined;
      console.warn('wallet_auth_failed', { stage, reason: reason ?? 'unspecified' });
      setFailureText(errorText[stage] ?? 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
      setFeedback('failed');
    } finally {
      setIsPending(false);
    }
  }, [readiness, isPending]);

  return (
    <LiveFeedback
      label={{
        failed: failureText,
        pending: 'World Wallet wird bestätigt …',
        success: 'Angemeldet. Dorf wird geöffnet …',
      }}
      state={isPending ? 'pending' : feedback}
    >
      <Button
        onClick={onClick}
        disabled={isPending || readiness !== WalletReadiness.Ready}
        size="lg"
        variant="primary"
      >
        {readinessText[readiness]}
      </Button>
    </LiveFeedback>
  );
};
