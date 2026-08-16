import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("production retains WalletAuth registration while development has an explicit v4 registration mode", async () => {
  const [client, registration, gate, development, developmentFlow] =
    await Promise.all([
      readFile(
        new URL("../src/components/CivilizationClient.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../src/components/CivilizationClient/useWalletVillageRegistration.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../src/components/CivilizationClient/WalletVillageRegistrationGate.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../src/components/CivilizationClient/DevelopmentWorldIdRegistration.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../src/lib/world-id-registration.js", import.meta.url),
        "utf8",
      ),
    ]);
  assert.match(
    client,
    /useWalletVillageRegistration\(walletAddress, contractAddress\)/,
  );
  assert.match(
    registration,
    /registerWalletWithMiniKit\(\{[\s\S]*?walletAddress,[\s\S]*?contractAddress,[\s\S]*?pollReceipt,[\s\S]*?pendingUserOpHash: pendingRegistrationHash\.current/,
  );
  assert.match(
    registration,
    /readCivilizationState\(walletAddress, contractAddress\)/,
  );
  assert.match(gate, /Dorf on-chain erstellen/);
  assert.match(registration, /registrationInFlight\.current/);
  assert.match(registration, /pendingRegistrationHash\.current = hash/);
  assert.match(client, /environment === "development"/);
  assert.match(development, /IDKitRequestWidget/);
  assert.match(development, /proofOfHuman\(\{\s*signal: walletAddress\s*\}\)/);
  assert.match(development, /1\. World ID bestätigen/);
  assert.match(development, /2\. World ID on-chain registrieren/);
  assert.match(development, /On-chain-Transaktionen und eingesetzte/);
  assert.match(developmentFlow, /encodeWorldIdRegistration/);
  assert.match(developmentFlow, /validUserOpHash/);
  assert.match(developmentFlow, /readCivilizationState/);
  assert.match(developmentFlow, /pendingUserOpHash/);
});

test("WalletAuth is completed before CivilizationClient is loaded", async () => {
  const client = await readFile(
    new URL("../src/components/CivilizationClient.tsx", import.meta.url),
    "utf8",
  );
  const stage9 = await readFile(
    new URL("../src/components/WalletAccess/index.tsx", import.meta.url),
    "utf8",
  );
  assert.match(stage9, /verifyWalletForDirectGame/);
  assert.match(
    stage9,
    /if \(walletAddress\)[\s\S]*?<CivilizationClient[\s\S]*?walletAddress=\{walletAddress\}[\s\S]*?contractAddress=\{contractAddress\}/,
  );
  assert.match(client, /server has verified WalletAuth\/SIWE/);
});

test("wallet access presents accessible, retryable authentication states", async () => {
  const [access, styles] = await Promise.all([
    readFile(
      new URL("../src/components/WalletAccess/index.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(
    access,
    /type AccessStatus = "idle" \| "pending" \| "success" \| "cancelled" \| "failure"/,
  );
  assert.match(access, /attemptInFlight\.current/);
  assert.match(access, /error\.code === "user_rejected"/);
  assert.match(access, /aria-busy=\{isPending\}/);
  assert.match(
    access,
    /role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-atomic="true"/,
  );
  assert.match(access, /aria-describedby="wallet-access-status"/);
  assert.match(access, /environment === "development"/);
  assert.match(
    access,
    /niemals nach deiner Seed Phrase oder deinem\s+privaten Schlüssel/,
  );
  assert.doesNotMatch(access, /WORLD MINI APP · DEVELOPMENT/);
  assert.match(styles, /min-height: 2\.75rem/);
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /prefers-reduced-transparency/);
  assert.match(styles, /prefers-contrast: more/);
  assert.match(styles, /:focus-visible/);
});

test("wallet registration retry always rereads on-chain state before a new MiniKit transaction", async () => {
  const registration = await readFile(
    new URL(
      "../src/components/CivilizationClient/useWalletVillageRegistration.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    registration,
    /registerWalletWithMiniKit always reads first, including every retry/,
  );
  assert.match(
    registration,
    /Das Dorf wurde noch nicht bestätigt\.[\s\S]*?versuche es bei Bedarf erneut/,
  );
});

test("legacy game URL returns to the same-page WalletAuth flow without Auth.js", async () => {
  const [layout, page] = await Promise.all([
    readFile(
      new URL("../src/app/(protected)/layout.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/app/(protected)/game/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.doesNotMatch(
    `${layout}${page}`,
    /from ['"]@\/auth['"]|\bauth\(\)|SessionProvider/,
  );
  assert.match(page, /redirect\(["']\/["']\)/);
});

test("game route has a safe client error boundary with a retry action", async () => {
  const boundary = await readFile(
    new URL("../src/app/(protected)/game/error.tsx", import.meta.url),
    "utf8",
  );
  assert.match(boundary, /["']use client["'];/);
  assert.match(boundary, /reset: \(\) => void/);
  assert.match(boundary, /onClick=\{reset\}/);
  assert.doesNotMatch(boundary, /error\.message/);
});
