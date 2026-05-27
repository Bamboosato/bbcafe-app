import { NextResponse } from "next/server";
import { getAppVersion } from "@/lib/app-version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    {
      data: {
        version: getAppVersion(),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
