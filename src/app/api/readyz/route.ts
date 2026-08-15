import { NextResponse } from "next/server";
import { walletAuthSchemaReady } from "@/lib/database-schema-status";
import { resolveSchemaReadiness } from "@/lib/readyz-schema-status";
import { runtimeConfiguration } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const schema = await resolveSchemaReadiness(() => walletAuthSchemaReady());
  const configuration = runtimeConfiguration();
  const ready = schema && configuration.ready;
  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      database: schema ? "ok" : "schema_unavailable_or_outdated",
      configuration: configuration.ready ? "ok" : "incomplete",
      missing: configuration.missing,
    },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
