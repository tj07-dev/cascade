import { NextRequest, NextResponse } from "next/server";
import { fetchMediaInfo } from "@/lib/ytdlp";
import { checkRateLimit } from "@/lib/rateLimit";
import type { ApiError } from "@/types";

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isValidUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  const { allowed } = checkRateLimit(ip);

  if (!allowed) {
    return NextResponse.json<ApiError>({ error: "rate_limited" }, { status: 429 });
  }

  let url: string;
  try {
    const body = await req.json() as Record<string, unknown>;
    url = typeof body?.url === "string" ? body.url : "";
  } catch {
    return NextResponse.json<ApiError>({ error: "invalid_url" }, { status: 400 });
  }

  if (!url || !isValidUrl(url)) {
    return NextResponse.json<ApiError>({ error: "invalid_url" }, { status: 400 });
  }

  try {
    const info = await fetchMediaInfo(url);
    return NextResponse.json(info);
  } catch (err) {
    const message = err instanceof Error ? err.message : "download_failed";
    const validCodes = ["private_video", "unsupported_site", "download_failed", "timeout"] as const;
    type ValidCode = (typeof validCodes)[number];
    const code: ValidCode = (validCodes as readonly string[]).includes(message)
      ? (message as ValidCode)
      : "download_failed";
    const status =
      code === "private_video" ? 403 : code === "unsupported_site" ? 400 : 500;
    return NextResponse.json<ApiError>({ error: code }, { status });
  }
}
