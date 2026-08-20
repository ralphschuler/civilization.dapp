import { NextResponse } from "next/server";

/**
 * CSP reports are deliberately accepted only during report-only rollout. The
 * ingress should forward this endpoint's aggregate status/count telemetry to
 * the approved observability sink; this route neither persists nor reflects
 * browser-supplied report content.
 */
export async function POST() {
  return new NextResponse(null, { status: 204 });
}
