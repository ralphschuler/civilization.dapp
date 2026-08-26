import { database } from "@/lib/database.mjs";
import {
  expiredWalletAuthSessionCookie,
  readWalletAuthSession,
} from "@/lib/wallet-auth-session";
import { runtimeConfiguration } from "@/lib/runtime-config";
import {
  parseRaidHistoryQuery,
  readPersonalRaidHistory,
} from "../../../../../server/chain-indexer-raid-history.js";
import { createRaidHistoryGet } from "../../../../../server/chain-indexer-raid-history-route.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createRaidHistoryGet({
  database,
  expiredWalletAuthSessionCookie,
  parseRaidHistoryQuery,
  readPersonalRaidHistory,
  readWalletAuthSession,
  runtimeConfiguration,
});
