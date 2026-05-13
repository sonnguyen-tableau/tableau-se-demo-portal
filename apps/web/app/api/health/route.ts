import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json({
    status: "ok",
    service: "tableau-ai-portal",
    phase: 1,
    timestamp: new Date().toISOString(),
  });
}
