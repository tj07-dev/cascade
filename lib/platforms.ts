import type { Platform } from "@/types";

const PLATFORM_PATTERNS: [RegExp, Platform][] = [
  [/youtube\.com|youtu\.be/, "youtube"],
  [/instagram\.com/, "instagram"],
  [/tiktok\.com/, "tiktok"],
  [/twitter\.com|x\.com/, "twitter"],
  [/reddit\.com|redd\.it/, "reddit"],
  [/facebook\.com|fb\.watch/, "facebook"],
  [/vimeo\.com/, "vimeo"],
  [/soundcloud\.com/, "soundcloud"],
  [/archive\.org/, "archive"],
  [/commons\.wikimedia\.org/, "wikimedia"],
  [/dailymotion\.com/, "dailymotion"],
];

export function detectPlatform(url: string): Platform {
  try {
    const { hostname } = new URL(url);
    for (const [pattern, platform] of PLATFORM_PATTERNS) {
      if (pattern.test(hostname)) return platform;
    }
  } catch {
    // invalid URL
  }
  return "unknown";
}

interface PlatformMeta {
  label: string;
  color: string;   // Tailwind text color class
  bgColor: string; // Tailwind bg color class
  logo: string;    // path under /logos/
}

const META: Record<Platform, PlatformMeta> = {
  youtube:    { label: "YouTube",    color: "text-red-400",    bgColor: "bg-red-500/10",    logo: "/logos/youtube.svg" },
  instagram:  { label: "Instagram",  color: "text-pink-400",   bgColor: "bg-pink-500/10",   logo: "/logos/instagram.svg" },
  tiktok:     { label: "TikTok",     color: "text-cyan-400",   bgColor: "bg-cyan-500/10",   logo: "/logos/tiktok.svg" },
  twitter:    { label: "Twitter/X",  color: "text-sky-400",    bgColor: "bg-sky-500/10",    logo: "/logos/twitter.svg" },
  reddit:     { label: "Reddit",     color: "text-orange-400", bgColor: "bg-orange-500/10", logo: "/logos/reddit.svg" },
  facebook:   { label: "Facebook",   color: "text-blue-400",   bgColor: "bg-blue-500/10",   logo: "/logos/generic.svg" },
  vimeo:      { label: "Vimeo",      color: "text-teal-400",   bgColor: "bg-teal-500/10",   logo: "/logos/vimeo.svg" },
  soundcloud: { label: "SoundCloud", color: "text-amber-400",  bgColor: "bg-amber-500/10",  logo: "/logos/soundcloud.svg" },
  archive:    { label: "Archive.org",color: "text-green-400",  bgColor: "bg-green-500/10",  logo: "/logos/archive.svg" },
  wikimedia:  { label: "Wikimedia",  color: "text-green-400",  bgColor: "bg-green-500/10",  logo: "/logos/generic.svg" },
  dailymotion:{ label: "Dailymotion",color: "text-blue-400",   bgColor: "bg-blue-500/10",   logo: "/logos/generic.svg" },
  unknown:    { label: "Website",    color: "text-slate-400",  bgColor: "bg-slate-500/10",  logo: "/logos/generic.svg" },
};

export function getPlatformMeta(platform: Platform): PlatformMeta {
  return META[platform];
}
