type WalletVillageRegistrationGateProps = {
  busy: boolean;
  checked: boolean;
  onRegisterVillage: () => void;
  status: string;
};

export function WalletVillageRegistrationGate({
  busy,
  checked,
  onRegisterVillage,
  status,
}: WalletVillageRegistrationGateProps) {
  return (
    <main className="game-access-gate" aria-busy={busy}>
      <div className="game-access-card">
        <span className="game-access-mark">CD</span>
        <p>WORLD MINI APP</p>
        <h1>Dein Dorf erstellen</h1>
        <span role="status" aria-live="polite" aria-atomic="true">
          {status}
        </span>
        <button
          className="game-access-action"
          onClick={onRegisterVillage}
          disabled={busy || !checked}
        >
          {busy ? "Dorf wird erstellt …" : "Dorf on-chain erstellen"}
        </button>
      </div>
    </main>
  );
}
