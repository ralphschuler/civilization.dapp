'use client';

export default function GameError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <main className="world-id-gate">
    <div className="world-id-gate-card" role="alert">
      <span className="world-id-gate-mark">CD</span>
      <p>WORLD MINI APP</p>
      <h1>Etwas ist schiefgelaufen</h1>
      <span>Das Spiel konnte nicht geladen werden. Deine Verifizierung und Wallet bleiben geschützt.</span>
      <button className="world-access-action" onClick={reset}>Erneut versuchen</button>
    </div>
  </main>;
}
