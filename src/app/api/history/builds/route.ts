import { database } from "@/lib/database.mjs";
import {
  expiredWalletAuthSessionCookie,
  readWalletAuthSession,
} from "@/lib/wallet-auth-session";
import { runtimeConfiguration } from "@/lib/runtime-config";
import {
  parseBuildHistoryQuery,
  readPersonalBuildHistory,
} from "../../../../../server/chain-indexer-build-history.js";
import { createBuildHistoryGet } from "../../../../../server/chain-indexer-build-history-route.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createBuildHistoryGet({
  database,
  expiredWalletAuthSessionCookie,
  parseBuildHistoryQuery,
  readPersonalBuildHistory,
  readWalletAuthSession,
  runtimeConfiguration,
});
