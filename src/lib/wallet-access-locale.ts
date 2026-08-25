export const WALLET_ACCESS_LOCALES = ["de-DE", "en-US"] as const;

export type WalletAccessLocale = (typeof WALLET_ACCESS_LOCALES)[number];

const messages = {
  "de-DE": {
    login: {
      action: "Mit World Wallet fortfahren",
      pendingAction: "Wallet-Bestätigung wird geöffnet …",
      successAction: "Wallet bestätigt",
      retryAction: "Erneut versuchen",
      pending: "Bestätige den Zugang sicher in deiner World App.",
      success: "Deine Wallet wurde bestätigt. Civilization wird geöffnet …",
      miniKitUnavailable:
        "Öffne Civilization in der World App und versuche es erneut.",
      nonceUnavailable:
        "Der sichere Zugang ist gerade nicht verfügbar. Bitte versuche es erneut.",
      siweRejected:
        "Die Wallet-Bestätigung wurde abgelehnt. Du kannst es erneut versuchen.",
      cancelled:
        "Die Wallet-Bestätigung wurde abgebrochen. Du kannst es erneut versuchen.",
      failure:
        "Die Wallet-Bestätigung war nicht möglich. Bitte versuche es noch einmal.",
    },
    registration: {
      heading: "Dein Dorf erstellen",
      checkingHeading: "On-chain-Dorf wird geprüft",
      unavailableHeading: "On-chain-Status nicht verfügbar",
      action: "Dorf on-chain erstellen",
      pendingAction: "Dorf wird erstellt …",
      checkingAction: "On-chain-Status wird geprüft …",
      retryCheckAction: "Status erneut prüfen",
      checking:
        "Der registrierte Dorfstatus deiner bestätigten Wallet wird on-chain geladen.",
      loaded: "On-chain-Dorf geladen …",
      rechecking: "Registrierungsstatus wird erneut geprüft …",
      unavailable:
        "Der On-chain-Status konnte nicht gelesen werden. Prüfe deine Verbindung und versuche es erneut.",
      ready:
        "Deine Wallet ist bestätigt. Erstelle jetzt einmalig dein On-chain-Dorf.",
      created: "Dorf erstellt. On-chain-Spielstand wird geladen …",
      pending: "Registrierung wird in deiner World Wallet bestätigt …",
      cancelled:
        "Die Bestätigung wurde abgebrochen. Du kannst dieselbe Registrierung erneut prüfen.",
      walletRequired:
        "Öffne Civilization in der World App und versuche es erneut.",
      transactionFailed:
        "Die On-chain-Registrierung ist fehlgeschlagen. Du kannst es erneut versuchen.",
      walletMismatch:
        "Die bestätigte Wallet stimmt nicht mit der Transaktion überein. Bestätige den Zugang erneut.",
      notConfirmed:
        "Die Registrierung ist noch nicht on-chain bestätigt. Prüfe den Status erneut; es wird keine zweite Registrierung gesendet.",
      rejected:
        "Die Registrierung wurde nicht bestätigt. Du kannst es erneut versuchen.",
    },
  },
  "en-US": {
    login: {
      action: "Continue with World Wallet",
      pendingAction: "Opening wallet confirmation …",
      successAction: "Wallet confirmed",
      retryAction: "Try again",
      pending: "Confirm access securely in your World App.",
      success: "Your wallet is confirmed. Civilization is opening …",
      miniKitUnavailable: "Open Civilization in the World App and try again.",
      nonceUnavailable:
        "Secure access is unavailable right now. Please try again.",
      siweRejected: "Wallet confirmation was rejected. You can try again.",
      cancelled: "Wallet confirmation was cancelled. You can try again.",
      failure: "Wallet confirmation was unavailable. Please try again.",
    },
    registration: {
      heading: "Create your village",
      checkingHeading: "Checking your on-chain village",
      unavailableHeading: "On-chain status unavailable",
      action: "Create village on-chain",
      pendingAction: "Creating village …",
      checkingAction: "Checking on-chain status …",
      retryCheckAction: "Check status again",
      checking:
        "Loading the registered village status for your confirmed wallet from the chain.",
      loaded: "On-chain village loaded …",
      rechecking: "Checking registration status again …",
      unavailable:
        "The on-chain status could not be read. Check your connection and try again.",
      ready: "Your wallet is confirmed. Create your on-chain village once.",
      created: "Village created. Loading on-chain game state …",
      pending: "Confirming registration in your World Wallet …",
      cancelled:
        "Confirmation was cancelled. You can check the same registration again.",
      walletRequired: "Open Civilization in the World App and try again.",
      transactionFailed: "The on-chain registration failed. You can try again.",
      walletMismatch:
        "The confirmed wallet does not match the transaction. Confirm access again.",
      notConfirmed:
        "Registration is not confirmed on-chain yet. Check status again; no second registration will be sent.",
      rejected: "Registration was not confirmed. You can try again.",
    },
  },
} as const;

export function walletAccessMessages(locale: WalletAccessLocale = "de-DE") {
  return messages[locale];
}

export function formatWalletNumber(
  value: number,
  locale: WalletAccessLocale = "de-DE",
) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatWalletDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatWalletToken(
  value: number,
  token: string,
  locale: WalletAccessLocale = "de-DE",
) {
  return `${formatWalletNumber(value, locale)} ${token}`;
}
