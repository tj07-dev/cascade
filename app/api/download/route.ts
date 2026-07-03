import { NextRequest, NextResponse } from "next/server";
import { createReadStream, unlink } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { checkRateLimit } from "@/lib/rateLimit";
import { getDirectUrl, spawnDownloadStream, spawnAudioToFile } from "@/lib/ytdlp";
import type { ApiError, ApiErrorCode, AudioFormat, OutputFormat, Quality } from "@/types";

const VALID_FORMATS = new Set<OutputFormat>(["mp4", "webm", "mp3", "wav"]);
const VALID_QUALITIES = new Set<Quality>(["best", "4k", "1080p", "720p", "480p", "360p", "audio"]);
const MIME: Record<OutputFormat, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s\-_.]/g, "").trim().slice(0, 120) || "download";
}

const AUDIO_ERROR_CODES = new Set<ApiErrorCode>(["merge_failed", "timeout", "download_failed"]);

export async function GET(req: NextRequest) {
  const ip = getIp(req);
  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json<ApiError>({ error: "rate_limited" }, { status: 429 });
  }

  const { searchParams } = req.nextUrl;
  const url = searchParams.get("url") ?? "";
  const format = (searchParams.get("format") ?? "mp4") as OutputFormat;
  const quality = (searchParams.get("quality") ?? "best") as Quality;
  const title = searchParams.get("title") ?? "download";

  if (!url || !VALID_FORMATS.has(format) || !VALID_QUALITIES.has(quality)) {
    return NextResponse.json<ApiError>({ error: "invalid_url" }, { status: 400 });
  }

  const filename = `${sanitizeFilename(title)}.${format}`;
  const isAudio = format === "mp3" || format === "wav";

  // Audio: must write to /tmp first (ffmpeg re-encode), then stream the file
  if (isAudio) {
    // yt-dlp appends the extension itself — pass base path without extension
    const tmpBase = join("/tmp", randomUUID());
    const tmpPath = `${tmpBase}.${format}`;

    try {
      await spawnAudioToFile(url, format as AudioFormat, quality, tmpBase);

      const fileStream = createReadStream(tmpPath);
      const readableStream = new ReadableStream<Uint8Array>({
        start(controller) {
          fileStream.on("data", (chunk) => {
            controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
          });
          fileStream.on("end", () => {
            controller.close();
            unlink(tmpPath, () => {});
          });
          fileStream.on("error", (e) => {
            controller.error(e);
            unlink(tmpPath, () => {});
          });
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": MIME[format],
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Accel-Buffering": "no",
        },
      });
    } catch (err) {
      unlink(tmpPath, () => {}); // best-effort cleanup on error
      const code = err instanceof Error ? err.message : "download_failed";
      const errorCode: ApiErrorCode = AUDIO_ERROR_CODES.has(code as ApiErrorCode)
        ? (code as ApiErrorCode)
        : "download_failed";
      return NextResponse.json<ApiError>({ error: errorCode }, { status: 500 });
    }
  }

  // Video: try direct URL redirect first (avoids proxying large file through server)
  try {
    const directUrl = await getDirectUrl(url, format, quality);
    if (directUrl) {
      return NextResponse.json({ redirectUrl: directUrl });
    }
  } catch {
    // fall through to streaming
  }

  // Video: stream via yt-dlp stdout when direct URL is unavailable
  const proc = spawnDownloadStream(url, format, quality);
  const readableStream = new ReadableStream<Uint8Array>({
    start(controller) {
      proc.stdout!.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      proc.stdout!.on("end", () => controller.close());
      proc.stdout!.on("error", (e) => controller.error(e));
      proc.stderr!.on("data", () => {}); // drain stderr silently to prevent backpressure
    },
    cancel() {
      proc.kill();
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Transfer-Encoding": "chunked",
      "X-Accel-Buffering": "no",
    },
  });
}
