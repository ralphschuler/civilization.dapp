import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      // Liveness deliberately does not depend on PostgreSQL or configuration.
      service: "running",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
