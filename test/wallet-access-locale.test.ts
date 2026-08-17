import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWalletDuration,
  formatWalletNumber,
  formatWalletToken,
  walletAccessMessages,
} from "../src/lib/wallet-access-locale.ts";

test("WalletAccess messages provide the German baseline and English test locale", () => {
  assert.equal(
    walletAccessMessages().login.action,
    "Mit World Wallet fortfahren",
  );
  assert.equal(
    walletAccessMessages("en-US").registration.heading,
    "Create your village",
  );
});

test("WalletAccess format helpers are explicit and locale-stable", () => {
  assert.equal(formatWalletNumber(1234.5, "de-DE"), "1.234,5");
  assert.equal(formatWalletNumber(1234.5, "en-US"), "1,234.5");
  assert.equal(formatWalletToken(1234.5, "WLD", "en-US"), "1,234.5 WLD");
  assert.equal(formatWalletDuration(125), "02:05");
});
