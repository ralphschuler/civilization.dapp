import { NextResponse } from "next/server";
import { CONTRACT_STATUS } from "../../../../../server/contract-status.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(CONTRACT_STATUS, {
    headers: { "cache-control": "no-store" },
  });
}
