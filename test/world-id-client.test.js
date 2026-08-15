import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Civilization client uses only the WalletAuth-established wallet registration path", async () => {
  const [client, registration, gate] = await Promise.all([
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
  assert.doesNotMatch(`${client}${registration}${gate}`, /errorText|\$\{error/);
  assert.doesNotMatch(
    `${client}${registration}${gate}`,
    /@worldcoin\/idkit|IDKit|WorldId|World ID|rp_context|proofOfHuman/,
  );
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
