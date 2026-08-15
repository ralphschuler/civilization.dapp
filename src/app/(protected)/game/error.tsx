"use client";

export default function GameError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="game-access-gate">
      <div className="game-access-card" role="alert">
        <span className="game-access-mark">CD</span>
        <p>WORLD MINI APP</p>
        <h1>Etwas ist schiefgelaufen</h1>
        <span>
          Das Spiel konnte nicht geladen werden. Deine Wallet-Verbindung bleibt
          geschützt.
        </span>
        <button className="game-access-action" onClick={reset}>
          Erneut versuchen
        </button>
      </div>
    </main>
  );
}
