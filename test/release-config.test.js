import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("runtime profiles default to production and development rejects production fallbacks", async () => {
  const source = await readFile(
    new URL("../src/lib/runtime-config.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /CIVILIZATION_ENV === "development" \? "development" : "production"/,
  );
  assert.match(source, /DEVELOPMENT_WORLD_ID_ACTION/);
  assert.match(source, /DEVELOPMENT_RP_ID/);
  assert.match(source, /hasHttpsOrigin\(authUrl, DEVELOPMENT_ORIGIN\)/);
  assert.match(
    source,
    /getAddress\(world\.civilizationContractAddress\) === getAddress\(LIVE_CONTRACT\)/,
  );
  assert.match(source, /expectedContext = `\$\{authUrl\}\/api\/rp-signature`/);
  assert.match(source, /PGDATABASE/);
});

test("container CI verifies both branches and assigns explicit dev/latest release tags", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/container.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /branches: \[master, develop\]/);
  assert.match(workflow, /if: github\.event_name == 'push'/);
  assert.match(workflow, /echo "release=latest"/);
  assert.match(workflow, /echo "release=dev"/);
  assert.doesNotMatch(workflow, /&& 'latest' \|\| 'dev'/);
});

test("production template remains separate while the Dev template has a dedicated port, database and volume", async () => {
  const [production, development, docs] = await Promise.all([
    readFile(new URL("../deploy/truenas.yaml", import.meta.url), "utf8"),
    readFile(
      new URL("../deploy/truenas.dev.example.yaml", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../docs/DEV_DEPLOYMENT.md", import.meta.url), "utf8"),
  ]);
  assert.match(production, /:latest/);
  assert.match(production, /"31057:31057"/);
  assert.match(development, /:dev/);
  assert.match(development, /"31058:31057"/);
  assert.match(development, /civilization_dev_postgres/);
  assert.match(development, /PGDATABASE: civilization_dev/);
  assert.match(docs, /GitHub Pages remains a walletless UI preview/);
});

test("production and Pages are pnpm-powered Next builds with runtime World IDs and no Vite entrypoint", async () => {
  const [
    pages,
    container,
    dockerfile,
    rootPackage,
    demoPackage,
    runtimeConfig,
    providers,
    gamePage,
    registration,
    nextConfig,
  ] = await Promise.all([
    source(".github/workflows/deploy-pages.yml"),
    source(".github/workflows/container.yml"),
    source("Dockerfile"),
    source("package.json"),
    source("apps/demo/package.json"),
    source("src/lib/runtime-config.ts"),
    source("src/providers/index.tsx"),
    source("src/app/(protected)/game/page.tsx"),
    source("src/components/CivilizationClient/useWalletVillageRegistration.ts"),
    source("next.config.ts"),
  ]);
  assert.match(dockerfile, /COPY server \.\/server/);
  assert.match(dockerfile, /corepack prepare pnpm@11\.21\.0/);
  assert.doesNotMatch(dockerfile, /\bnpm\b/);
  assert.match(dockerfile, /\.next\/standalone/);
  assert.doesNotMatch(
    `${container}${dockerfile}`,
    /NEXT_PUBLIC_|--build-arg|build-args:/,
  );
  assert.match(runtimeConfig, /value\(env, "WORLD_APP_ID"\)/);
  assert.match(runtimeConfig, /value\(env, "WORLD_ID_APP_ID"\)/);
  assert.match(providers, /worldAppId/);
  assert.doesNotMatch(providers, /process\.env/);
  assert.match(gamePage, /redirect\(["']\/['"]\)/);
  assert.doesNotMatch(gamePage, /@\/auth|CivilizationClient|walletAddress/);
  assert.match(registration, /registerWalletWithMiniKit/);
  assert.match(nextConfig, /reactStrictMode:\s*true/);
  assert.match(pages, /build:demo/);
  assert.match(pages, /apps\/demo\/out/);
  assert.match(rootPackage, /"packageManager": "pnpm@/);
  assert.match(rootPackage, /"build": "next build"/);
  assert.match(demoPackage, /"build": "next build"/);
  assert.doesNotMatch(
    `${pages}${container}${dockerfile}${rootPackage}${demoPackage}`,
    /VITE_/,
  );
  await assert.rejects(access(new URL("../vite.config.js", import.meta.url)));
  await assert.rejects(access(new URL("../index.html", import.meta.url)));
  await assert.rejects(
    access(new URL("../package-lock.json", import.meta.url)),
  );
  await assert.rejects(access(new URL("../server/index.js", import.meta.url)));
});

test("release channels keep the Dev Pages Mini App separate from production and Dev containers", async () => {
  const [pages, container, readme] = await Promise.all([
    source(".github/workflows/deploy-pages.yml"),
    source(".github/workflows/container.yml"),
    source("README.md"),
  ]);
  assert.match(pages, /name: Deploy Civilization Dev Mini App to GitHub Pages/);
  assert.match(pages, /push:\s*\n\s*branches: \[develop\]/);
  assert.match(pages, /pull_request:\s*\n\s*branches: \[develop\]/);
  assert.match(pages, /group: civilization-pages-dev/);
  assert.match(pages, /if: github\.event_name != 'pull_request'/);
  assert.doesNotMatch(pages, /branches: \[master\]/);
  assert.match(container, /branches: \[master, develop\]/);
  assert.match(
    readme,
    /develop.*:dev.*master.*:latest.*https:\/\/civilization\.nyphon\.de.*https:\/\/nyphon\.de\/civilization\.dapp\//s,
  );
});

test("Next deployment templates carry every Wallet Auth, RP, World, and challenge-store input", async () => {
  const [compose, truenas, example] = await Promise.all([
    source("compose.yaml"),
    source("deploy/truenas.yaml"),
    source(".env.example"),
  ]);
  for (const name of [
    "AUTH_SECRET",
    "AUTH_URL",
    "AUTH_TRUST_HOST",
    "HMAC_SECRET_KEY",
    "RP_SIGNING_KEY",
    "RP_ID",
    "WORLD_APP_ID",
    "WORLD_ID_APP_ID",
    "WORLD_ID_ACTION",
    "WORLD_ID_PROOF_CONTEXT_URL",
    "WORLD_ID_ENVIRONMENT",
    "CIVILIZATION_CONTRACT_ADDRESS",
    "POSTGRES_PASSWORD",
  ]) {
    assert.match(compose, new RegExp(name));
    assert.match(truenas, new RegExp(name));
    assert.match(example, new RegExp(name));
  }
  assert.match(compose, /PGDATABASE: civilization/);
  assert.match(truenas, /PGDATABASE: civilization/);
  assert.match(example, /PGDATABASE=civilization/);
  assert.match(compose, /civilization-migrate/);
  assert.match(truenas, /civilization-migrate/);
  assert.match(compose, /scripts\/db-migrate\.mjs/);
  assert.match(truenas, /scripts\/db-migrate\.mjs/);
  assert.doesNotMatch(
    `${compose}${truenas}${example}`,
    /WORLD_ID_RP_|VITE_|NEXT_PUBLIC_/,
  );
});

test("wallet-registration mainnet address is consistent across runtime and deployment templates", async () => {
  const address = "0x0E6689d0649Ad9037465d178231b10F18518D2b0";
  const files = await Promise.all([
    source("src/lib/runtime-config.ts"),
    source("src/world-game/constants.js"),
    source("compose.yaml"),
    source("deploy/truenas.yaml"),
    source(".env.example"),
    source("server/contract-status.js"),
  ]);
  for (const contents of files) assert.match(contents, new RegExp(address));
});

test("healthz is cheap liveness while readyz read-only checks configuration and schema", async () => {
  const [schemaStatus, healthz, readyz] = await Promise.all([
    source("src/lib/database-schema-status.js"),
    source("src/app/api/healthz/route.ts"),
    source("src/app/api/readyz/route.ts"),
  ]);
  assert.match(schemaStatus, /export async function walletAuthSchemaReady/);
  assert.match(schemaStatus, /SELECT version FROM schema_migrations/);
  assert.match(readyz, /walletAuthSchemaReady\(\)/);
  assert.doesNotMatch(healthz, /database|runtimeConfiguration/);
  assert.match(readyz, /runtimeConfiguration\(\)/);
  assert.match(readyz, /status: ready \? ["']ready["'] : ["']not_ready["']/);
  assert.doesNotMatch(
    `${healthz}${readyz}${schemaStatus}`,
    /\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX)\b/i,
  );
});

test("RootLayout opts into request-time World configuration without an auth/session dependency", async () => {
  const layout = await source("src/app/layout.tsx");
  assert.match(
    layout,
    /import\s+\{\s*connection\s*\}\s+from\s+['"]next\/server['"]/,
  );
  assert.match(layout, /export\s+default\s+async\s+function\s+RootLayout/);
  const connectionIndex = layout.indexOf("await connection()");
  const runtimeConfigurationIndex = layout.indexOf("runtimeConfiguration()");
  assert.ok(
    connectionIndex >= 0 && connectionIndex < runtimeConfigurationIndex,
  );
  assert.doesNotMatch(layout, /\b(auth|session)\s*\(/);
  assert.doesNotMatch(layout, /from\s+['"]@\/auth['"]/);
});

test("Auth.js compatibility still consumes one-time login tickets", async () => {
  const [auth, challenge] = await Promise.all([
    source("src/auth/index.ts"),
    source("src/lib/auth-challenge.js"),
  ]);
  assert.match(auth, /consumeWalletLoginTicket\(ticket\)/);
  assert.doesNotMatch(auth, /verifySiweMessage|signedNonce|finalPayloadJson/);
  assert.match(auth, /token\.walletAddress/);
  assert.doesNotMatch(auth, /token\.address/);
  assert.match(challenge, /consumed_at IS NULL/);
  assert.match(challenge, /UPDATE wallet_auth_challenges SET consumed_at/);
});

test("active client uses wallet registration while legacy World ID compatibility remains in contract and deployment preflight", async () => {
  const [registration, contract, deployment, rpRoute] = await Promise.all([
    source("src/components/CivilizationClient/useWalletVillageRegistration.ts"),
    source("contracts/src/CivilizationGame.sol"),
    source("scripts/deploy-worldchain-mainnet.mjs"),
    source("src/app/api/rp-signature/route.ts"),
  ]);
  assert.match(registration, /registerWalletWithMiniKit/);
  assert.match(
    registration,
    /readCivilizationState\(walletAddress, contractAddress\)/,
  );
  assert.doesNotMatch(
    registration,
    /@worldcoin\/idkit|IDKitRequestWidget|proofOfHuman|rp_context/,
  );
  assert.match(contract, /function registerWorldIdLegacy/);
  assert.match(contract, /function registerWorldId\(/);
  assert.match(deployment, /worldIdLegacyRouterAddress/);
  assert.match(rpRoute, /runtimeConfiguration\(\)/);
  assert.match(rpRoute, /process\.env\.RP_ID/);
});

test("mainnet deployment requires explicit legacy router, app, and action and documents deployment configuration", async () => {
  const [deployment, example, readme, architecture] = await Promise.all([
    source("scripts/deploy-worldchain-mainnet.mjs"),
    source("contracts/world-id-deployment.example.json"),
    source("README.md"),
    source("docs/ONCHAIN_ARCHITECTURE.md"),
  ]);
  for (const field of [
    "worldIdLegacyRouterAddress",
    "worldIdLegacyAppId",
    "worldIdLegacyActionId",
  ]) {
    assert.match(deployment, new RegExp(`keys\\.${field}`));
    assert.match(example, new RegExp(field));
  }
  assert.match(
    deployment,
    /keys\.worldIdLegacyActionId !== keys\.worldActionId/,
  );
  assert.match(deployment, /configuredLegacyRouter !== worldIdLegacyRouter/);
  assert.match(
    deployment,
    /configuredLegacyExternalNullifier !== worldIdLegacyExternalNullifier/,
  );
  assert.doesNotMatch(deployment, /const WORLD_ID_LEGACY_ROUTER\s*=/);
  assert.match(`${readme}${architecture}`, /world\s*chain mainnet/i);
  assert.match(`${readme}${architecture}`, /WORLD_ID_APP_ID/);
  assert.match(`${readme}${architecture}`, /WORLD_ID_ACTION/);
});

test("the example mainnet proxy plan starts with the requested equal revenue split", async () => {
  const plan = JSON.parse(
    await source("contracts/proxy-deployment-plan.example.json"),
  );
  assert.deepEqual(plan.revenueDistribution, {
    recipients: [
      "0x4338aa98a8C969CA0675A8B0DCC7Ed51F24aB886",
      "0x5e1c313f446B33E47b97E118ab130C6f07A7971b",
    ],
    bps: [5000, 5000],
  });
});

test("static demo sets its Pages asset root before dynamically importing shared game UI", async () => {
  const demo = await source("apps/demo/src/demo-client.tsx");
  const base = demo.indexOf("__CIVILIZATION_ASSET_BASE__");
  const imported = demo.indexOf('import("../../../src/app.js")');
  assert.ok(base >= 0 && imported > base);
});

test("production game state is contract-authoritative with no compatibility mutation API", async () => {
  const [registration, app, worldRuntime, adapter, reads, actions] =
    await Promise.all([
      source(
        "src/components/CivilizationClient/useWalletVillageRegistration.ts",
      ),
      source("src/app.js"),
      source("src/game-world-runtime.js"),
      source("src/world-game.js"),
      source("src/world-game/reads.js"),
      source("src/world-game/actions.js"),
    ]);
  assert.match(registration, /createWorldGameAdapter/);
  assert.match(worldRuntime, /adapter\.execute/);
  assert.match(reads, /previewPlayerState/);
  assert.match(actions, /miniKit\.sendTransaction/);
  assert.doesNotMatch(
    `${registration}${app}${worldRuntime}${adapter}${reads}${actions}`,
    /\/api\/game\/(state|targets)/,
  );
  await assert.rejects(
    access(new URL("../src/lib/game-store.js", import.meta.url)),
  );
  await assert.rejects(
    access(new URL("../src/app/api/game/state/route.ts", import.meta.url)),
  );
  await assert.rejects(
    access(new URL("../src/app/api/game/targets/route.ts", import.meta.url)),
  );
});

test("development compose grants the migration job database-only access", async () => {
  const [development, ignored, env] = await Promise.all([
    readFile(
      new URL("../deploy/truenas.dev.example.yaml", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../.env.development.example", import.meta.url), "utf8"),
  ]);
  const migration = development.slice(
    development.indexOf("civilization-dev-migrate:"),
    development.indexOf("  civilization-dev:\n"),
  );
  assert.match(migration, /PGPASSWORD: REPLACE_DEV_POSTGRES_PASSWORD/);
  assert.doesNotMatch(migration, /AUTH_SECRET|RP_SIGNING_KEY|WORLD_APP_ID/);
  assert.match(development, /NODE_ENV: production/);
  assert.match(development, /restart: unless-stopped/);
  assert.match(ignored, /!\.env\.development\.example/);
  assert.match(env, /^PGPASSWORD=/m);
  assert.match(env, /^POSTGRES_PASSWORD=/m);
});
