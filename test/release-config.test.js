import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production and Pages are pnpm-powered Next builds with runtime World IDs and no Vite entrypoint', async () => {
  const [pages, container, dockerfile, rootPackage, demoPackage, runtimeConfig, providers, gamePage, client] = await Promise.all([
    source('.github/workflows/deploy-pages.yml'),
    source('.github/workflows/container.yml'),
    source('Dockerfile'),
    source('package.json'),
    source('apps/demo/package.json'),
    source('src/lib/runtime-config.ts'),
    source('src/providers/index.tsx'),
    source('src/app/(protected)/game/page.tsx'),
    source('src/components/CivilizationClient.tsx'),
  ]);
  assert.match(dockerfile, /COPY server \.\/server/);
  assert.match(dockerfile, /corepack prepare pnpm@11\.21\.0/);
  assert.doesNotMatch(dockerfile, /\bnpm\b/);
  assert.match(dockerfile, /\.next\/standalone/);
  assert.doesNotMatch(`${container}${dockerfile}`, /NEXT_PUBLIC_|--build-arg|build-args:/);
  assert.match(runtimeConfig, /process\.env\.WORLD_APP_ID/);
  assert.match(runtimeConfig, /process\.env\.WORLD_ID_APP_ID/);
  assert.match(providers, /worldAppId/);
  assert.doesNotMatch(providers, /process\.env/);
  assert.match(gamePage, /redirect\('\/'\)/);
  assert.doesNotMatch(gamePage, /@\/auth|CivilizationClient|walletAddress/);
  assert.match(client, /registerWalletWithMiniKit/);
  assert.match(pages, /build:demo/);
  assert.match(pages, /apps\/demo\/out/);
  assert.match(rootPackage, /"packageManager": "pnpm@/);
  assert.match(rootPackage, /"build": "next build"/);
  assert.match(demoPackage, /"build": "next build"/);
  assert.doesNotMatch(`${pages}${container}${dockerfile}${rootPackage}${demoPackage}`, /VITE_/);
  await assert.rejects(access(new URL('../vite.config.js', import.meta.url)));
  await assert.rejects(access(new URL('../index.html', import.meta.url)));
  await assert.rejects(access(new URL('../package-lock.json', import.meta.url)));
  await assert.rejects(access(new URL('../server/index.js', import.meta.url)));
});

test('Next deployment templates carry every Wallet Auth, RP, World, and challenge-store input', async () => {
  const [compose, truenas, example] = await Promise.all([
    source('compose.yaml'), source('deploy/truenas.yaml'), source('.env.example'),
  ]);
  for (const name of [
    'AUTH_SECRET', 'AUTH_URL', 'AUTH_TRUST_HOST', 'HMAC_SECRET_KEY',
    'RP_SIGNING_KEY', 'RP_ID', 'WORLD_APP_ID', 'WORLD_ID_APP_ID', 'WORLD_ID_ACTION',
    'WORLD_ID_PROOF_CONTEXT_URL', 'WORLD_ID_ENVIRONMENT', 'CIVILIZATION_CONTRACT_ADDRESS',
    'POSTGRES_PASSWORD',
  ]) {
    assert.match(compose, new RegExp(name));
    assert.match(truenas, new RegExp(name));
    assert.match(example, new RegExp(name));
  }
  assert.match(compose, /PGDATABASE: civilization/);
  assert.match(truenas, /PGDATABASE: civilization/);
  assert.match(example, /PGDATABASE=civilization/);
  assert.doesNotMatch(`${compose}${truenas}${example}`, /WORLD_ID_RP_|VITE_|NEXT_PUBLIC_/);
});

test('wallet-registration mainnet address is consistent across runtime and deployment templates', async () => {
  const address = '0x71564689Fa320bA010561A880CfE2896b6Dc8f8b';
  const files = await Promise.all([
    source('src/world-game.js'),
    source('src/lib/runtime-config.ts'),
    source('src/world.js'),
    source('compose.yaml'),
    source('deploy/truenas.yaml'),
    source('.env.example'),
    source('server/contract-status.js'),
  ]);
  for (const contents of files) assert.match(contents, new RegExp(address));
});

test('health routes validate runtime configuration and the Wallet Auth challenge store', async () => {
  const [challenge, healthz, readyz] = await Promise.all([
    source('src/lib/auth-challenge.js'), source('src/app/api/healthz/route.ts'), source('src/app/api/readyz/route.ts'),
  ]);
  assert.match(challenge, /export async function authChallengeReady/);
  assert.match(healthz, /authChallengeReady\(\)/);
  assert.match(readyz, /authChallengeReady\(\)/);
  assert.match(healthz, /runtimeConfiguration\(\)/);
  assert.match(readyz, /runtimeConfiguration\(\)/);
  assert.match(readyz, /status: ready \? 'ready' : 'not_ready'/);
  assert.doesNotMatch(`${healthz}${readyz}`, /game-store/);
});

test('RootLayout opts into request-time World configuration without an auth/session dependency', async () => {
  const layout = await source('src/app/layout.tsx');
  assert.match(layout, /import\s+\{\s*connection\s*\}\s+from\s+['"]next\/server['"]/);
  assert.match(layout, /export\s+default\s+async\s+function\s+RootLayout/);
  const connectionIndex = layout.indexOf('await connection()');
  const runtimeConfigurationIndex = layout.indexOf('runtimeConfiguration()');
  assert.ok(connectionIndex >= 0 && connectionIndex < runtimeConfigurationIndex);
  assert.doesNotMatch(layout, /\b(auth|session)\s*\(/);
  assert.doesNotMatch(layout, /from\s+['"]@\/auth['"]/);
});

test('official template Wallet Auth remains available while Auth.js consumes one-time login tickets', async () => {
  const [button, wallet, auth, challenge] = await Promise.all([
    source('src/components/AuthButton/index.tsx'),
    source('src/auth/wallet/index.ts'),
    source('src/auth/index.ts'),
    source('src/lib/auth-challenge.js'),
  ]);
  assert.match(button, /MiniKit\.isInWorldApp\(\)/);
  assert.match(button, /MiniKit\.install\(worldAppId\)/);
  assert.match(button, /isCommandAvailable\(Command\.WalletAuth\)/);
  assert.doesNotMatch(button, /useMiniKit/);
  assert.match(button, /MiniKit\.isInstalled\(\)/);
  assert.match(wallet, /MiniKit\.walletAuth/);
  assert.match(auth, /consumeWalletLoginTicket\(ticket\)/);
  assert.doesNotMatch(auth, /verifySiweMessage|signedNonce|finalPayloadJson/);
  assert.match(auth, /token\.walletAddress/);
  assert.doesNotMatch(auth, /token\.address/);
  assert.match(challenge, /consumed_at IS NULL/);
  assert.match(challenge, /UPDATE wallet_auth_challenges SET consumed_at/);
});

test('active client uses wallet registration while legacy World ID compatibility remains in the source and deployment preflight', async () => {
  const [client, world, rpRoute] = await Promise.all([
    source('src/components/CivilizationClient.tsx'), source('src/world.js'), source('src/app/api/rp-signature/route.ts'),
  ]);
  assert.match(client, /registerWalletWithMiniKit/);
  assert.match(client, /readCivilizationState\(walletAddress, contractAddress\)/);
  assert.doesNotMatch(client, /@worldcoin\/idkit|IDKitRequestWidget|proofOfHuman|rp_context/);
  assert.match(world, /result\.protocol_version === "3\.0"/);
  assert.match(world, /functionName: "registerWorldIdLegacy"/);
  assert.match(world, /decodeAbiParameters\(\[\{ type: "uint256\[8\]" \}\], response\.proof\)/);
  assert.match(world, /signature: rawContext\?\.signature \|\| rawContext\?\.sig/);
  assert.match(rpRoute, /LIVE_RP_ID/);
});

test('mainnet deployment requires explicit legacy router, app, and action and documents deployment configuration', async () => {
  const [deployment, example, readme, architecture] = await Promise.all([
    source('scripts/deploy-worldchain-mainnet.mjs'),
    source('contracts/world-id-deployment.example.json'),
    source('README.md'),
    source('docs/ONCHAIN_ARCHITECTURE.md'),
  ]);
  for (const field of ['worldIdLegacyRouterAddress', 'worldIdLegacyAppId', 'worldIdLegacyActionId']) {
    assert.match(deployment, new RegExp(`keys\\.${field}`));
    assert.match(example, new RegExp(field));
  }
  assert.match(deployment, /keys\.worldIdLegacyActionId !== keys\.worldActionId/);
  assert.match(deployment, /configuredLegacyRouter !== worldIdLegacyRouter/);
  assert.match(deployment, /configuredLegacyExternalNullifier !== worldIdLegacyExternalNullifier/);
  assert.doesNotMatch(deployment, /const WORLD_ID_LEGACY_ROUTER\s*=/);
  assert.match(`${readme}${architecture}`, /world\s*chain mainnet/i);
  assert.match(`${readme}${architecture}`, /WORLD_ID_APP_ID/);
  assert.match(`${readme}${architecture}`, /WORLD_ID_ACTION/);
});

test('the example mainnet proxy plan starts with the requested equal revenue split', async () => {
  const plan = JSON.parse(await source('contracts/proxy-deployment-plan.example.json'));
  assert.deepEqual(plan.revenueDistribution, {
    recipients: [
      '0x4338aa98a8C969CA0675A8B0DCC7Ed51F24aB886',
      '0x5e1c313f446B33E47b97E118ab130C6f07A7971b',
    ],
    bps: [5000, 5000],
  });
});

test('static demo sets its Pages asset root before dynamically importing shared game UI', async () => {
  const demo = await source('apps/demo/src/demo-client.tsx');
  const base = demo.indexOf('__CIVILIZATION_ASSET_BASE__');
  const imported = demo.indexOf("import('../../../src/app.js')");
  assert.ok(base >= 0 && imported > base);
});

test('production game state is contract-authoritative with no compatibility mutation API', async () => {
  const [client, app, adapter] = await Promise.all([
    source('src/components/CivilizationClient.tsx'),
    source('src/app.js'),
    source('src/world-game.js'),
  ]);
  assert.match(client, /createWorldGameAdapter/);
  assert.match(app, /worldAdapter\.execute/);
  assert.match(adapter, /previewPlayerState/);
  assert.match(adapter, /MiniKit\.sendTransaction/);
  assert.doesNotMatch(`${client}${app}${adapter}`, /\/api\/game\/(state|targets)/);
  await assert.rejects(access(new URL('../src/lib/game-store.js', import.meta.url)));
  await assert.rejects(access(new URL('../src/app/api/game/state/route.ts', import.meta.url)));
  await assert.rejects(access(new URL('../src/app/api/game/targets/route.ts', import.meta.url)));
});
