import { database } from "@/lib/database.mjs";
import {
  expiredWalletAuthSessionCookie,
  readWalletAuthSession,
} from "@/lib/wallet-auth-session";
import { runtimeConfiguration } from "@/lib/runtime-config";
import {
  readVillageAppearance,
  saveVillageAppearance,
} from "../../../../server/village-appearance.js";
import { createVillageAppearanceRoute } from "../../../../server/village-appearance-route.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const route = createVillageAppearanceRoute({
  database,
  expiredWalletAuthSessionCookie,
  readVillageAppearance,
  readWalletAuthSession,
  runtimeConfiguration,
  saveVillageAppearance,
});

export const { GET, PUT } = route;
