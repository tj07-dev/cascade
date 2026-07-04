import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import type {
  MediaInfo,
  MediaFormat,
  OutputFormat,
  AudioFormat,
  Quality,
  Platform,
} from "@/types";

const YTDLP = process.env.YTDLP_PATH ?? "yt-dlp";
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const COOKIES_PATH = process.env.YTDLP_COOKIES_PATH ?? "/app/cookies/cookies.txt";

// Sites (YouTube, Instagram, ...) increasingly require a logged-in session
// to serve metadata/formats to datacenter IPs. When a cookies.txt is mounted
// (see docker-compose.yml), pass it through so yt-dlp authenticates.
function cookieArgs(): string[] {
  return existsSync(COOKIES_PATH) ? ["--cookies", COOKIES_PATH] : [];
}

function isAuthError(stderr: string): boolean {
  // yt-dlp always suggests --cookies when a site requires an authenticated
  // session to serve the content (age/login-gated, bot checks, etc).
  return (
    stderr.includes("Sign in to confirm") ||
    stderr.includes("Account authentication is required") ||
    stderr.includes("empty media response") ||
    stderr.includes("--cookies")
  );
}

export function buildFormatString(format: OutputFormat, quality: Quality): string {
  if (format === "mp3" || format === "wav" || quality === "audio") {
    return "bestaudio/best";
  }
  const heightMap: Record<Quality, string> = {
    best:    `bestvideo[ext=${format}]+bestaudio/best[ext=${format}]/bestvideo+bestaudio/best`,
    "4k":    `bestvideo[height<=2160][ext=${format}]+bestaudio/best[height<=2160]`,
    "1080p": `bestvideo[height<=1080][ext=${format}]+bestaudio/best[height<=1080]`,
    "720p":  `bestvideo[height<=720][ext=${format}]+bestaudio/best[height<=720]`,
    "480p":  `bestvideo[height<=480][ext=${format}]+bestaudio/best[height<=480]`,
    "360p":  `bestvideo[height<=360][ext=${format}]+bestaudio/best[height<=360]`,
    audio:   "bestaudio/best",
  };
  return heightMap[quality];
}

export async function fetchMediaInfo(url: string): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      ...cookieArgs(),
      "--",
      url,
    ]);

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => { proc.kill(); reject(new Error("timeout")); }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        if (stderr.includes("Private video") || stderr.includes("This video is private")) {
          reject(new Error("private_video"));
        } else if (stderr.includes("not supported") || stderr.includes("Unsupported URL")) {
          reject(new Error("unsupported_site"));
        } else if (isAuthError(stderr)) {
          reject(new Error("auth_required"));
        } else {
          reject(new Error("download_failed"));
        }
        return;
      }
      try {
        const raw = JSON.parse(stdout) as Record<string, unknown>;
        const formats: MediaFormat[] = (
          (raw.formats as Record<string, unknown>[] | undefined) ?? []
        )
          .filter(
            (f: Record<string, unknown>) =>
              f.vcodec !== "none" || f.acodec !== "none"
          )
          .map((f: Record<string, unknown>) => ({
            id: String(f.format_id),
            ext: String(f.ext),
            quality: f.height
              ? `${String(f.height)}p`
              : f.abr
              ? `${String(f.abr)}kbps`
              : "unknown",
            filesize: typeof f.filesize === "number" ? f.filesize : null,
          }));

        resolve({
          title: String(raw.title ?? "Untitled"),
          thumbnail: String(raw.thumbnail ?? ""),
          duration: Number(raw.duration ?? 0),
          uploader: String(raw.uploader ?? raw.channel ?? "Unknown"),
          platform: (
            typeof raw.extractor_key === "string"
              ? raw.extractor_key.toLowerCase()
              : "unknown"
          ) as Platform,
          formats,
        });
      } catch {
        reject(new Error("download_failed"));
      }
    });
  });
}

export async function getDirectUrl(
  url: string,
  format: OutputFormat,
  quality: Quality
): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(YTDLP, [
      "--get-url",
      "--no-playlist",
      "-f", buildFormatString(format, quality),
      "--no-warnings",
      ...cookieArgs(),
      "--",
      url,
    ]);

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });

    const timer = setTimeout(() => { proc.kill(); resolve(null); }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || !stdout.trim()) { resolve(null); return; }
      const lines = stdout.trim().split("\n").filter(Boolean);
      // Multiple URLs = separate video+audio streams, can't redirect
      resolve(lines.length === 1 ? lines[0] : null);
    });
  });
}

export function spawnDownloadStream(
  url: string,
  format: OutputFormat,
  quality: Quality
): ChildProcess {
  return spawn(YTDLP, [
    "--no-playlist",
    "-f", buildFormatString(format, quality),
    "--merge-output-format", format === "webm" ? "webm" : "mp4",
    "-o", "-", // write to stdout
    "--no-warnings",
    ...cookieArgs(),
    "--",
    url,
  ]);
}

export async function spawnAudioToFile(
  url: string,
  format: AudioFormat,
  quality: Quality,
  outPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, [
      "--no-playlist",
      "-f", buildFormatString(format, quality),
      "--extract-audio",
      "--audio-format", format,
      "--audio-quality", "0",
      "-o", outPath,
      "--no-warnings",
      ...cookieArgs(),
      "--",
      url,
    ]);

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(
      () => { proc.kill(); reject(new Error("timeout")); },
      TIMEOUT_MS
    );

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const code_ = isAuthError(stderr)
          ? "auth_required"
          : stderr.includes("merge")
          ? "merge_failed"
          : "download_failed";
        reject(new Error(code_));
      } else {
        resolve();
      }
    });
  });
}
