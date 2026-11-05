import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Readiness must not check the Task API (ADR-001, AC-001.8). */
export function GET() {
  return NextResponse.json({ status: "ready" });
}
