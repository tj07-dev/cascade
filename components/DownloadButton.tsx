"use client";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, CheckCircle, AlertCircle } from "lucide-react";
import type { DownloadRequest, ApiErrorCode } from "@/types";

interface Props {
  request: DownloadRequest;
  title: string;
  onError: (code: ApiErrorCode) => void;
}

const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  invalid_url: "Please paste a valid URL",
  unsupported_site: "This site isn't supported yet. Try YouTube, Instagram, TikTok, Reddit, or Twitter.",
  private_video: "This video is private or restricted and can't be downloaded.",
  rate_limited: "You've hit the hourly limit. Try again in an hour.",
  download_failed: "Download failed. The platform may have changed. Try again shortly.",
  auth_required: "This platform is blocking anonymous requests right now. Please try again later.",
  timeout: "Download timed out. Try a shorter video or lower quality.",
  merge_failed: "Couldn't merge video and audio. Try MP4 at 720p instead.",
  server_busy: "Server is at capacity right now. Please try again in a moment.",
};

export function DownloadButton({ request, title, onError }: Props) {
  const [state, setState] = useState<"idle" | "downloading" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);
  const bytesRef = useRef<number>(0);

  async function handleDownload() {
    setErrorMsg(null);
    setState("downloading");
    setProgress(0);
    setSpeed(null);

    const params = new URLSearchParams({
      url: request.url,
      format: request.format,
      quality: request.quality,
      title,
    });

    const abort = new AbortController();
    abortRef.current = abort;
    startTimeRef.current = Date.now();
    bytesRef.current = 0;

    try {
      const res = await fetch(`/api/download?${params}`, { signal: abort.signal });

      if (!res.ok) {
        const data = await res.json() as { error?: ApiErrorCode };
        const code: ApiErrorCode = data.error ?? "download_failed";
        setErrorMsg(ERROR_MESSAGES[code]);
        setState("idle");
        onError(code);
        return;
      }

      const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";

      // Direct URL redirect
      if (contentType.includes("application/json")) {
        const { redirectUrl } = await res.json() as { redirectUrl: string };
        const a = document.createElement("a");
        a.href = redirectUrl;
        a.download = `${title}.${request.format}`;
        a.click();
        setState("done");
        setTimeout(() => setState("idle"), 3000);
        return;
      }

      // Streamed download — collect chunks and create blob
      const contentLength = res.headers.get("Content-Length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      const reader = res.body!.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value as Uint8Array<ArrayBuffer>);
        received += value.byteLength;
        bytesRef.current = received;

        if (total) setProgress(Math.round((received / total) * 100));

        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        if (elapsed > 0) {
          const bps = received / elapsed;
          setSpeed(bps > 1_000_000 ? `${(bps / 1_000_000).toFixed(1)} MB/s` : `${(bps / 1_000).toFixed(0)} KB/s`);
        }
      }

      const blob = new Blob(chunks, { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${title}.${request.format}`;
      a.click();
      URL.revokeObjectURL(blobUrl);

      setState("done");
      setTimeout(() => { setState("idle"); setProgress(0); setSpeed(null); }, 3000);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrorMsg(ERROR_MESSAGES.download_failed);
      setState("idle");
    }
  }

  return (
    <div className="space-y-3">
      <motion.button
        onClick={handleDownload}
        disabled={state === "downloading"}
        whileHover={{ scale: state === "idle" ? 1.01 : 1 }}
        whileTap={{ scale: state === "idle" ? 0.99 : 1 }}
        className={`relative w-full overflow-hidden rounded-2xl py-4 text-sm font-semibold text-white transition-all ${
          state === "done"
            ? "bg-emerald-600"
            : state === "downloading"
            ? "bg-violet-800 cursor-not-allowed"
            : "bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-lg shadow-violet-900/30"
        }`}
      >
        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.span key="idle" className="flex items-center justify-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Download className="h-4 w-4" /> Download Now
            </motion.span>
          )}
          {state === "downloading" && (
            <motion.span key="dl" className="flex items-center justify-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Downloading… {progress > 0 && `${progress}%`} {speed && `· ${speed}`}
            </motion.span>
          )}
          {state === "done" && (
            <motion.span key="done" className="flex items-center justify-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CheckCircle className="h-4 w-4" /> Done!
            </motion.span>
          )}
        </AnimatePresence>

        {/* Progress fill */}
        {state === "downloading" && progress > 0 && (
          <motion.div
            className="absolute bottom-0 left-0 h-1 bg-violet-400"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ ease: "linear" }}
          />
        )}
      </motion.button>

      {/* Error message */}
      <AnimatePresence>
        {errorMsg && (
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
