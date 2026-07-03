"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { UrlInput } from "@/components/UrlInput";
import { MediaCard, MediaCardSkeleton } from "@/components/MediaCard";
import { FormatPicker } from "@/components/FormatPicker";
import { DownloadButton } from "@/components/DownloadButton";
import type { MediaInfo, OutputFormat, Quality, ApiErrorCode } from "@/types";

const SUPPORTED = ["YouTube", "Instagram", "TikTok", "Twitter/X", "Reddit", "Vimeo", "SoundCloud", "Archive.org", "1000+ sites"];

const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  invalid_url: "Please paste a valid URL",
  unsupported_site: "This site isn't supported yet. Try YouTube, Instagram, TikTok, Reddit, or Twitter.",
  private_video: "This video is private or restricted and can't be downloaded.",
  rate_limited: "You've hit the hourly limit. Try again in an hour.",
  download_failed: "Download failed. The platform may have changed. Try again shortly.",
  timeout: "Download timed out. Try a shorter video or lower quality.",
  merge_failed: "Couldn't merge video and audio. Try MP4 at 720p instead.",
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [format, setFormat] = useState<OutputFormat>("mp4");
  const [quality, setQuality] = useState<Quality>("1080p");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleFetch() {
    if (!url || loading) return;
    setLoading(true);
    setInfo(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(ERROR_MESSAGES[data.error as ApiErrorCode] ?? ERROR_MESSAGES.download_failed);
        return;
      }
      setInfo(data as MediaInfo);
    } catch {
      setErrorMsg(ERROR_MESSAGES.download_failed);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setUrl("");
    setInfo(null);
    setErrorMsg(null);
    setFormat("mp4");
    setQuality("1080p");
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-start px-4 py-16 gap-10">
      <AnimatedBackground />

      {/* Hero */}
      <motion.div
        className="text-center space-y-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Cas<span className="text-violet-400">cade</span>
        </h1>
        <p className="text-slate-400 text-base">
          Stream anything. Save everything. No signup.
        </p>
      </motion.div>

      {/* URL Input */}
      <motion.div
        className="w-full max-w-2xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <UrlInput
          value={url}
          onChange={(v) => { setUrl(v); setErrorMsg(null); }}
          onSubmit={handleFetch}
          isLoading={loading}
        />

        {/* Fetch error */}
        <AnimatePresence>
          {errorMsg && !info && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 text-center text-sm text-red-400"
            >
              {errorMsg}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Results area */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="skeleton"
            className="w-full max-w-2xl"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <MediaCardSkeleton />
          </motion.div>
        )}

        {info && (
          <motion.div
            key="result"
            className="w-full max-w-2xl space-y-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            {/* Glassmorphism card */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md space-y-5">
              <MediaCard info={info} />
              <FormatPicker
                format={format}
                quality={quality}
                onFormatChange={setFormat}
                onQualityChange={setQuality}
              />
              <DownloadButton
                request={{ url, format, quality }}
                title={info.title}
                onError={(code) => setErrorMsg(ERROR_MESSAGES[code])}
              />
            </div>

            <button
              onClick={reset}
              className="w-full text-center text-xs text-slate-600 hover:text-slate-400 transition-colors py-2"
            >
              ← Download another
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Supported platforms ticker */}
      {!info && !loading && (
        <motion.div
          className="flex flex-wrap justify-center gap-2 max-w-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {SUPPORTED.map((s) => (
            <span key={s} className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-500">
              {s}
            </span>
          ))}
        </motion.div>
      )}
    </main>
  );
}
