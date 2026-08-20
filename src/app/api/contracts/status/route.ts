import { NextResponse } from "next/server";
import { CONTRACT_STATUS } from "../../../../../server/contract-status.js";
import { contractRuntimeStatus } from "../../../../../server/contract-runtime-status.js";
import { runtimeConfiguration } from "@/lib/runtime-config";
import { contractStatusPayload } from "../../../../../server/contract-runtime-projection.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const verification = await contractRuntimeStatus(runtimeConfiguration());
  return NextResponse.json(
    contractStatusPayload(CONTRACT_STATUS, verification),
    {
      headers: { "cache-control": "no-store" },
    },
  );
}
