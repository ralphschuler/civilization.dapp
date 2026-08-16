import { signRequest } from "@worldcoin/idkit/signing";
import { NextResponse } from "next/server";
import { readWalletAuthJson } from "@/lib/wallet-auth-verify-core";
import { runtimeConfiguration } from "@/lib/runtime-config";
import {
  isRpSigningConfigured,
  rpContextResponse,
  validateRpSignatureRequest,
} from "@/lib/rp-signature-core";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };
const unavailable = () =>
  NextResponse.json(
    { error: "world_id_rp_not_configured" },
    { status: 503, headers: noStoreHeaders },
  );
const invalidPayload = () =>
  NextResponse.json(
    { error: "invalid_payload" },
    { status: 400, headers: noStoreHeaders },
  );

export async function POST(req: Request) {
  // Read configuration per request: import-time values can otherwise pin a
  // container to a stale secret during managed runtime configuration changes.
  const configuration = runtimeConfiguration();
  const signingKey = process.env.RP_SIGNING_KEY;
  const rpId = process.env.RP_ID;
  if (!configuration.ready || !isRpSigningConfigured({ signingKey, rpId }))
    return unavailable();

  const parsed = await readWalletAuthJson(req);
  if (parsed.kind !== "json") return invalidPayload();
  const validation = validateRpSignatureRequest(parsed.value, {
    action: configuration.world.worldIdAction,
  });
  if (validation.kind === "invalid_payload") return invalidPayload();
  if (validation.kind === "invalid_action")
    return NextResponse.json(
      { error: "invalid_action" },
      { status: 400, headers: noStoreHeaders },
    );
  if (validation.kind === "invalid_signal")
    return NextResponse.json(
      { error: "invalid_signal" },
      { status: 400, headers: noStoreHeaders },
    );
  // The normalized wallet is the signal the proof is bound to; it grants no state without on-chain registration.
  const sig = signRequest({
    action: configuration.world.worldIdAction,
    signingKeyHex: signingKey!,
  });

  return NextResponse.json(rpContextResponse(rpId!, sig), {
    headers: noStoreHeaders,
  });
}
