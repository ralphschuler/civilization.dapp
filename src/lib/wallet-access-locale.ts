import {
  CIVILIZATION_LOCALES,
  civilizationMessages,
  formatCivilizationNumber,
  type CivilizationLocale,
} from "./civilization-locale.ts";

/** @deprecated Wallet copy is owned by the shared Civilization catalog. */
export const WALLET_ACCESS_LOCALES = CIVILIZATION_LOCALES;
/** @deprecated Use CivilizationLocale. */
export type WalletAccessLocale = CivilizationLocale;

export function walletAccessMessages(locale: WalletAccessLocale = "en-US") {
  return civilizationMessages(locale);
}

export function formatWalletNumber(
  value: number,
  locale: WalletAccessLocale = "en-US",
) {
  return formatCivilizationNumber(value, locale, { maximumFractionDigits: 1 });
}

export function formatWalletDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatWalletToken(
  value: number,
  token: string,
  locale: WalletAccessLocale = "en-US",
) {
  return `${formatWalletNumber(value, locale)} ${token}`;
}
