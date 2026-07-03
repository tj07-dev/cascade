"use client";
import { motion } from "framer-motion";
import type { OutputFormat, Quality } from "@/types";

const FORMATS: { value: OutputFormat; label: string; icon: string }[] = [
  { value: "mp4",  label: "MP4",  icon: "🎬" },
  { value: "webm", label: "WebM", icon: "📹" },
  { value: "mp3",  label: "MP3",  icon: "🎵" },
  { value: "wav",  label: "WAV",  icon: "🎙️" },
];

const QUALITIES: { value: Quality; label: string }[] = [
  { value: "best",  label: "Best" },
  { value: "4k",    label: "4K" },
  { value: "1080p", label: "1080p" },
  { value: "720p",  label: "720p" },
  { value: "480p",  label: "480p" },
  { value: "360p",  label: "360p" },
  { value: "audio", label: "Audio Only" },
];

interface Props {
  format: OutputFormat;
  quality: Quality;
  onFormatChange: (f: OutputFormat) => void;
  onQualityChange: (q: Quality) => void;
}

export function FormatPicker({ format, quality, onFormatChange, onQualityChange }: Props) {
  const isAudio = format === "mp3" || format === "wav";

  return (
    <div className="space-y-4">
      {/* Format pills */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">Format</p>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <motion.button
              key={f.value}
              whileTap={{ scale: 0.96 }}
              onClick={() => onFormatChange(f.value)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                format === f.value
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{f.icon}</span>
              {f.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Quality pills — hidden for audio formats */}
      {!isAudio && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">Quality</p>
          <div className="flex flex-wrap gap-2">
            {QUALITIES.filter((q) => q.value !== "audio").map((q) => (
              <motion.button
                key={q.value}
                whileTap={{ scale: 0.96 }}
                onClick={() => onQualityChange(q.value)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                  quality === q.value
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40"
                    : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {q.label}
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
