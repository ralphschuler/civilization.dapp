import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWalletDuration,
  formatWalletNumber,
  formatWalletToken,
  walletAccessMessages,
} from "../src/lib/wallet-access-locale.ts";
import {
  civilizationMessages,
  formatCivilizationDateTime,
  formatCivilizationNumber,
  localeLanguageTag,
  resolveCivilizationLocale,
} from "../src/lib/civilization-locale.ts";

test("WalletAccess messages provide the German baseline and English test locale", () => {
  assert.equal(
    walletAccessMessages().login.action,
    "Mit World Wallet fortfahren",
  );
  assert.equal(
    walletAccessMessages("en-US").registration.heading,
    "Create your village",
  );
  assert.equal(
    walletAccessMessages().registration.rejected,
    "Die Registrierung wurde nicht bestätigt. Du kannst es erneut versuchen.",
  );
  assert.equal(
    walletAccessMessages("en-US").registration.unavailable,
    "The on-chain status could not be read. Check your connection and try again.",
  );
  assert.equal(
    walletAccessMessages().login.miniKitUnavailable,
    "Öffne Civilization in der World App und versuche es erneut.",
  );
  assert.equal(
    walletAccessMessages("en-US").login.miniKitUnavailable,
    "Open Civilization in the World App and try again.",
  );
  assert.equal(
    walletAccessMessages().login.nonceUnavailable,
    "Der sichere Zugang ist gerade nicht verfügbar. Bitte versuche es erneut.",
  );
  assert.equal(
    walletAccessMessages("en-US").login.nonceUnavailable,
    "Secure access is unavailable right now. Please try again.",
  );
  assert.equal(
    walletAccessMessages().login.siweRejected,
    "Die Wallet-Bestätigung wurde abgelehnt. Du kannst es erneut versuchen.",
  );
  assert.equal(
    walletAccessMessages("en-US").login.siweRejected,
    "Wallet confirmation was rejected. You can try again.",
  );
  assert.match(
    walletAccessMessages().registration.notConfirmed,
    /keine zweite Registrierung/,
  );
  assert.equal(
    civilizationMessages("de-DE").unavailable,
    "Civilization ist vorübergehend nicht verfügbar.",
  );
  assert.equal(
    civilizationMessages("en-US").unavailableDetail,
    "The secure World Chain configuration is missing or invalid.",
  );
});

test("WalletAccess format helpers are explicit and locale-stable", () => {
  assert.equal(formatWalletNumber(1234.5, "de-DE"), "1.234,5");
  assert.equal(formatWalletNumber(1234.5, "en-US"), "1,234.5");
  assert.equal(formatWalletToken(1234.5, "WLD", "en-US"), "1,234.5 WLD");
  assert.equal(formatWalletDuration(125), "02:05");
});

test("shared Civilization locale boundary defaults to English and has complete English dynamic copy", () => {
  assert.equal(resolveCivilizationLocale(undefined), "en-US");
  assert.equal(resolveCivilizationLocale("en"), "en-US");
  assert.equal(localeLanguageTag("en-US"), "en");
  assert.equal(
    civilizationMessages("en-US").collectingIn("01:05"),
    "Collect in 01:05",
  );
  assert.equal(formatCivilizationNumber(1234.5, "de-DE"), "1.234,5");
  assert.equal(formatCivilizationNumber(1234.5, "en-US"), "1,234.5");
  assert.equal(
    formatCivilizationDateTime(new Date("2026-08-17T15:30:00Z"), "en-US"),
    "Aug 17, 2026, 3:30 PM",
  );
});
