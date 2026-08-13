import { NativeWalletAuthDiagnostic } from '../components/NativeWalletAuthDiagnostic';

export default function Home() {
  return (
    <main className="world-id-gate"><div className="world-id-gate-card">
      <span className="world-id-gate-mark">CD</span><p>WORLD MINI APP · DIAGNOSE</p><h1>Native Wallet Auth</h1><span>Dieser temporäre Test ruft nur den nativen Wallet-Auth-Befehl auf und zeigt dessen Callback direkt an.</span>
        <NativeWalletAuthDiagnostic />
      </div></main>
  );
}
