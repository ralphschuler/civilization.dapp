'use client';
import { walletAuth } from '@/auth/wallet';
import { Button, LiveFeedback } from '@worldcoin/mini-apps-ui-kit-react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useMiniKit } from '@worldcoin/minikit-js/minikit-provider';
import { useCallback, useEffect, useState } from 'react';

/**
 * This component is an example of how to authenticate a user
 * We will use Next Auth for this example, but you can use any auth provider
 * Read More: https://docs.world.org/mini-apps/commands/wallet-auth
 */
export const AuthButton = ({ worldAppId }: { worldAppId: string }) => {
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<'failed' | 'success' | undefined>();
  const [walletReady, setWalletReady] = useState(false);
  const { isInstalled: providerInstalled } = useMiniKit();

  useEffect(() => {
    const detectWallet = () => {
      if (providerInstalled) {
        setWalletReady(true);
        return true;
      }
      if (!MiniKit.isInWorldApp()) {
        setWalletReady(false);
        return false;
      }
      if (MiniKit.isInstalled()) {
        setWalletReady(true);
        return true;
      }

      // MiniKitProvider reports false when any supported command is missing,
      // even though it has installed the bridge and Wallet Auth is available.
      MiniKit.install(worldAppId);
      const ready = MiniKit.isInstalled();
      setWalletReady(ready);
      return ready;
    };

    if (detectWallet()) return;
    const timer = window.setInterval(() => { if (detectWallet()) window.clearInterval(timer); }, 250);
    return () => window.clearInterval(timer);
  }, [providerInstalled, worldAppId]);

  const onClick = useCallback(async () => {
    if (!walletReady || isPending) return;
    setIsPending(true);
    setFeedback(undefined);
    try {
      await walletAuth();
      setFeedback('success');
    } catch (error) {
      console.error('Wallet authentication button error', error);
      setFeedback('failed');
    } finally {
      setIsPending(false);
    }
  }, [walletReady, isPending]);

  return (
    <LiveFeedback
      label={{
        failed: 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.',
        pending: 'World Wallet wird bestätigt …',
        success: 'Angemeldet. Dorf wird geöffnet …',
      }}
      state={isPending ? 'pending' : feedback}
    >
      <Button
        onClick={onClick}
        disabled={isPending || !walletReady}
        size="lg"
        variant="primary"
      >
        {walletReady ? 'Mit World Wallet anmelden' : 'World App wird geladen …'}
      </Button>
    </LiveFeedback>
  );
};
