"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, X } from "lucide-react";
import Image from "next/image";
import { detectPlatform, getPlatformMeta } from "@/lib/platforms";
import type { Platform } from "@/types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function UrlInput({ value, onChange, onSubmit, isLoading }: Props) {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform(value));
  }, [value]);

  const meta = getPlatformMeta(platform);
  const showBadge = platform !== "unknown" && value.length > 0;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <motion.div
        className="relative rounded-2xl p-[1px]"
        style={{
          background: focused
            ? "linear-gradient(135deg, rgba(124,58,237,0.8), rgba(59,130,246,0.8))"
            : "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(59,130,246,0.3))",
          boxShadow: focused
            ? "0 0 24px rgba(124,58,237,0.35), 0 0 48px rgba(59,130,246,0.15)"
            : "0 0 0px transparent",
          transition: "box-shadow 0.25s ease, background 0.25s ease",
        }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="relative flex items-center gap-3 rounded-2xl bg-[#0f0f1a] px-4 py-4">
          {/* Platform badge / Search icon */}
          <AnimatePresence mode="wait">
            {showBadge ? (
              <motion.div
                key={platform}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ${meta.bgColor} ${meta.color} shrink-0`}
              >
                <Image
                  src={meta.logo}
                  alt={meta.label}
                  width={14}
                  height={14}
                  className="opacity-80"
                />
                {meta.label}
              </motion.div>
            ) : (
              <motion.div
                key="search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Search className="h-5 w-5 text-slate-500 shrink-0" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* URL input */}
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading && value) {
                onSubmit();
              }
            }}
            placeholder="Paste a YouTube, Instagram, TikTok, or any video URL..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
            disabled={isLoading}
            autoFocus
          />

          {/* Clear button */}
          <AnimatePresence>
            {value && !isLoading && (
              <motion.button
                key="clear"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                onClick={() => onChange("")}
                className="text-slate-600 hover:text-slate-400 transition-colors shrink-0"
                aria-label="Clear URL"
              >
                <X className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Fetch button */}
          <motion.button
            onClick={onSubmit}
            disabled={!value || isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="shrink-0 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-violet-500 transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Fetching…
              </>
            ) : (
              "Fetch"
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
