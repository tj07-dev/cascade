"use client";
import { motion } from "framer-motion";
import Image from "next/image";
import { Clock, User } from "lucide-react";
import { getPlatformMeta } from "@/lib/platforms";
import type { MediaInfo } from "@/types";

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MediaCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm animate-pulse">
      <div className="flex gap-4">
        <div className="h-24 w-40 shrink-0 rounded-xl bg-white/10" />
        <div className="flex-1 space-y-3 py-1">
          <div className="h-4 w-3/4 rounded bg-white/10" />
          <div className="h-3 w-1/2 rounded bg-white/10" />
          <div className="h-3 w-1/3 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

interface Props { info: MediaInfo }

export function MediaCard({ info }: Props) {
  const meta = getPlatformMeta(info.platform);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
    >
      <div className="flex gap-4">
        {/* Thumbnail */}
        {info.thumbnail ? (
          <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-xl">
            <Image
              src={info.thumbnail}
              alt={info.title}
              fill
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </div>
        ) : (
          <div className="h-24 w-40 shrink-0 rounded-xl bg-white/10 flex items-center justify-center text-3xl">
            🎬
          </div>
        )}

        {/* Meta */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <h2 className="text-sm font-semibold text-white leading-snug line-clamp-2">
            {info.title}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            {info.uploader && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> {info.uploader}
              </span>
            )}
            {info.duration > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatDuration(info.duration)}
              </span>
            )}
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${meta.bgColor} ${meta.color}`}>
              {meta.label}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
