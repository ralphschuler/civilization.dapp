import { NextResponse } from "next/server";
import { walletAuthSchemaReady } from "@/lib/database-schema-status";
import { resolveSchemaReadiness } from "@/lib/readyz-schema-status";
import { runtimeConfiguration } from "@/lib/runtime-config";
import { contractRuntimeStatus } from "../../../../server/contract-runtime-status.js";
import { readinessPayload } from "../../../../server/contract-runtime-projection.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const schema = await resolveSchemaReadiness(() => walletAuthSchemaReady());
  const configuration = runtimeConfiguration();
  const contract = await contractRuntimeStatus(configuration);
  const response = readinessPayload({ schema, configuration, contract });
  return NextResponse.json(response.body, {
    status: response.ready ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
