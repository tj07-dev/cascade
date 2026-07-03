# DownloadX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Next.js 15 web app that lets family and friends download video/audio from YouTube, Instagram, TikTok, Twitter/X, Reddit, and 1000+ other sites via yt-dlp, with an impressive glassmorphism dark UI.

**Architecture:** Next.js 15 App Router serves both the UI and two API routes (`/api/info`, `/api/download`). API routes spawn `yt-dlp` as a child process — no separate backend. Smart delivery: try direct URL redirect first, fall back to piped streaming. Audio extraction uses `/tmp` intermediate files since ffmpeg re-encode can't be streamed.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v3, shadcn/ui, Framer Motion, yt-dlp (Python binary), ffmpeg, Nginx, Docker Compose, AWS EC2 t3.micro ap-south-1

## Global Constraints

- Node.js ≥ 22, Next.js 15.x, TypeScript strict mode
- App Router only — no Pages Router
- No `any` types
- yt-dlp binary available at `/usr/local/bin/yt-dlp` (installed via pip in Docker)
- ffmpeg binary available at `/usr/bin/ffmpeg` (installed via apk)
- Rate limit: 10 requests/hour per IP, shared across `/api/info` and `/api/download`
- All user-facing error messages must match the exact copy in the spec
- No database, no auth, no file storage (except `/tmp` for audio transcoding)
- `/tmp` audio files must be deleted after streaming completes or on error

---

## File Map

```
download-x/
├── app/
│   ├── layout.tsx                  # Root layout, fonts, metadata
│   ├── page.tsx                    # Main page — state machine orchestrator
│   ├── globals.css                 # Tailwind base + custom CSS variables
│   └── api/
│       ├── info/route.ts           # POST /api/info — metadata fetch
│       └── download/route.ts       # GET /api/download — stream/redirect
├── components/
│   ├── UrlInput.tsx                # URL input with platform detection badge
│   ├── MediaCard.tsx               # Thumbnail + title + metadata display
│   ├── FormatPicker.tsx            # Format pills + quality dropdown
│   ├── DownloadButton.tsx          # Download trigger + progress bar + speed
│   └── AnimatedBackground.tsx      # Mesh gradient background animation
├── lib/
│   ├── ytdlp.ts                    # child_process wrapper for yt-dlp
│   ├── rateLimit.ts                # In-memory IP rate limiter
│   └── platforms.ts                # Platform detection + logo/color map
├── types/
│   └── index.ts                    # Shared TypeScript types
├── public/
│   └── logos/                      # SVG platform logos
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .env.example
└── next.config.ts
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`, `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Produces: working `npm run dev`, Tailwind configured, shadcn/ui initialized

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/tanmay.jain/learning/download-x
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"
```

Expected: project files created, `npm run dev` works on port 3000.

- [ ] **Step 2: Install dependencies**

```bash
npm install framer-motion class-variance-authority clsx tailwind-merge lucide-react
npm install -D @types/node
```

- [ ] **Step 3: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

Select: Default style, Slate base color, CSS variables yes.

Then add components:
```bash
npx shadcn@latest add button input select badge skeleton
```

- [ ] **Step 4: Replace `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 240 10% 4%;
    --foreground: 0 0% 95%;
    --card: 240 10% 8%;
    --card-foreground: 0 0% 95%;
    --border: 240 10% 14%;
    --input: 240 10% 12%;
    --primary: 263 70% 60%;
    --primary-foreground: 0 0% 100%;
    --muted: 240 10% 14%;
    --muted-foreground: 240 5% 55%;
    --accent: 263 70% 60%;
    --accent-foreground: 0 0% 100%;
    --ring: 263 70% 60%;
    --radius: 0.75rem;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 5: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DownloadX — Download Anything",
  description: "Download videos and audio from YouTube, Instagram, TikTok, and 1000+ sites.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Create `.env.example`**

```bash
# Copy to .env.local for local development
# No secrets needed for Phase 1 — yt-dlp runs as a local process
NODE_ENV=development
```

- [ ] **Step 7: Update `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.ytimg.com" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.twimg.com" },
      { protocol: "https", hostname: "**.tiktokcdn.com" },
      { protocol: "https", hostname: "**.redd.it" },
      { protocol: "https", hostname: "i.vimeocdn.com" },
      { protocol: "https", hostname: "**.archive.org" },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: `ready on http://localhost:3000` with no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 project with Tailwind and shadcn/ui"
```

---

### Task 2: Shared Types

**Files:**
- Create: `types/index.ts`

**Interfaces:**
- Produces: `MediaInfo`, `MediaFormat`, `DownloadRequest`, `ApiError`, `AppState` — used by all subsequent tasks

- [ ] **Step 1: Create `types/index.ts`**

```ts
export type Platform =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "reddit"
  | "facebook"
  | "vimeo"
  | "soundcloud"
  | "archive"
  | "wikimedia"
  | "dailymotion"
  | "unknown";

export type VideoFormat = "mp4" | "webm";
export type AudioFormat = "mp3" | "wav";
export type OutputFormat = VideoFormat | AudioFormat;

export type Quality =
  | "best"
  | "4k"
  | "1080p"
  | "720p"
  | "480p"
  | "360p"
  | "audio";

export interface MediaFormat {
  id: string;
  ext: string;
  quality: string;
  filesize: number | null;
}

export interface MediaInfo {
  title: string;
  thumbnail: string;
  duration: number;        // seconds
  uploader: string;
  platform: Platform;
  formats: MediaFormat[];
}

export interface DownloadRequest {
  url: string;
  format: OutputFormat;
  quality: Quality;
}

export type ApiErrorCode =
  | "invalid_url"
  | "unsupported_site"
  | "private_video"
  | "rate_limited"
  | "download_failed"
  | "timeout"
  | "merge_failed";

export interface ApiError {
  error: ApiErrorCode;
}

export type AppState =
  | { stage: "idle" }
  | { stage: "fetching" }
  | { stage: "ready"; info: MediaInfo; url: string }
  | { stage: "downloading"; progress: number; speed: number | null }
  | { stage: "done" }
  | { stage: "error"; code: ApiErrorCode };
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 3: Platform Detection Library

**Files:**
- Create: `lib/platforms.ts`
- Create: `public/logos/youtube.svg`, `tiktok.svg`, `instagram.svg`, `twitter.svg`, `reddit.svg`, `vimeo.svg`, `soundcloud.svg`, `archive.svg`, `generic.svg`

**Interfaces:**
- Consumes: `Platform` from `types/index.ts`
- Produces: `detectPlatform(url: string): Platform`, `getPlatformMeta(platform: Platform): { label: string; color: string; logo: string }`

- [ ] **Step 1: Create `lib/platforms.ts`**

```ts
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
```

- [ ] **Step 2: Add SVG logos to `public/logos/`**

Create `public/logos/generic.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
</svg>
```

Create `public/logos/youtube.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.55 3.5 12 3.5 12 3.5s-7.55 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.45 20.5 12 20.5 12 20.5s7.55 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
</svg>
```

Create `public/logos/instagram.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
</svg>
```

Create `public/logos/tiktok.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.29 6.29 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.22 8.22 0 0 0 4.81 1.54V6.79a4.84 4.84 0 0 1-1.04-.1z"/>
</svg>
```

Create `public/logos/twitter.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
</svg>
```

Create `public/logos/reddit.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
</svg>
```

Create `public/logos/vimeo.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.197c1.185-1.044 2.351-2.084 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.507.539 2.45 1.131 3.674 1.776 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.612-2.061-.574 0-1.167.121-1.777.391 1.186-3.868 3.434-5.757 6.762-5.637 2.473.06 3.628 1.664 3.478 4.807z"/>
</svg>
```

Create `public/logos/soundcloud.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M1.175 12.225c-.017 0-.033.002-.05.003.012-.166.023-.333.034-.499.05-.666.112-1.332.178-1.997.067-.665.135-1.33.208-1.994.027-.242.11-.456.317-.6.31-.21.69-.168.95.102.18.189.25.42.25.676v5.309c0 .389-.324.645-.675.645-.047 0-.094-.007-.14-.018a.616.616 0 0 1-.072-.627zm1.506 1.49c.055.006.11.01.167.01.547 0 .99-.44.99-.987V9.626a.987.987 0 0 0-1.974 0v3.122c0 .504.368.916.817.967zm2.064.287c.066.01.133.015.2.015.523 0 .952-.427.952-.953V9.35a.953.953 0 0 0-1.903 0v3.714c0 .491.35.897.751.938zm2.064-.014c.065.006.13.01.196.01a.916.916 0 0 0 .916-.916V9.086a.916.916 0 0 0-1.832 0v3.996c0 .473.338.864.72.906zm2.085-.24a.878.878 0 0 0 .178.018c.484 0 .877-.392.877-.876V8.694a.877.877 0 0 0-1.753 0v4.196c0 .454.32.826.698.858zm2.064.033a.84.84 0 0 0 .16.015c.463 0 .839-.376.839-.838V8.47a.839.839 0 0 0-1.677 0v4.488c0 .433.307.79.678.823zm2.064-.007c.051.004.103.007.155.007a.803.803 0 0 0 .803-.803V8.316a.803.803 0 0 0-1.605 0v4.722c0 .414.294.756.647.788zm2.087-.02c.047.003.095.005.143.005a.765.765 0 0 0 .765-.764V8.2a.765.765 0 0 0-1.529 0v4.888c0 .394.278.72.621.752zm1.74-5.5c-.37-1.838-1.99-3.22-3.94-3.22-1.09 0-2.08.44-2.8 1.15A4.974 4.974 0 0 0 12 6.1a4.95 4.95 0 0 0-3.558 1.51A4.93 4.93 0 0 0 7 11.1a4.95 4.95 0 0 0 4.95 4.95h8.1A2.95 2.95 0 0 0 23 13.1a2.952 2.952 0 0 0-2.152-2.846z"/>
</svg>
```

Create `public/logos/archive.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.82-1h12l.93 1H5.12z"/>
</svg>
```

- [ ] **Step 3: Commit**

```bash
git add lib/platforms.ts public/logos/ types/index.ts
git commit -m "feat: add platform detection and SVG logos"
```

---

### Task 4: Rate Limiter

**Files:**
- Create: `lib/rateLimit.ts`

**Interfaces:**
- Produces: `checkRateLimit(ip: string): { allowed: boolean; remaining: number }`

- [ ] **Step 1: Create `lib/rateLimit.ts`**

```ts
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 10;

const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - entry.count };
}
```

- [ ] **Step 2: Write tests**

Create `lib/__tests__/rateLimit.test.ts`:
```ts
import { checkRateLimit } from "../rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows first request", () => {
    const result = checkRateLimit("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("blocks after 10 requests", () => {
    const ip = "5.6.7.8";
    for (let i = 0; i < 10; i++) checkRateLimit(ip);
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const ip = "9.10.11.12";
    for (let i = 0; i < 10; i++) checkRateLimit(ip);
    jest.advanceTimersByTime(61 * 60 * 1000);
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 3: Install jest and run tests**

```bash
npm install -D jest @types/jest ts-jest
npx ts-jest config:init
npx jest lib/__tests__/rateLimit.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/rateLimit.ts lib/__tests__/rateLimit.test.ts jest.config.js
git commit -m "feat: add in-memory IP rate limiter with tests"
```

---

### Task 5: yt-dlp Wrapper

**Files:**
- Create: `lib/ytdlp.ts`

**Interfaces:**
- Consumes: `MediaInfo`, `MediaFormat`, `OutputFormat`, `Quality` from `types/index.ts`
- Produces:
  - `fetchMediaInfo(url: string): Promise<MediaInfo>`
  - `getDirectUrl(url: string, format: OutputFormat, quality: Quality): Promise<string | null>`
  - `spawnDownloadStream(url: string, format: OutputFormat, quality: Quality): ChildProcess`
  - `spawnAudioToFile(url: string, format: AudioFormat, quality: Quality, outPath: string): Promise<void>`
  - `buildFormatString(format: OutputFormat, quality: Quality): string`

- [ ] **Step 1: Create `lib/ytdlp.ts`**

```ts
import { spawn, type ChildProcess } from "child_process";
import type { MediaInfo, MediaFormat, OutputFormat, AudioFormat, Quality, Platform } from "@/types";

const YTDLP = process.env.YTDLP_PATH ?? "yt-dlp";
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function buildFormatString(format: OutputFormat, quality: Quality): string {
  if (format === "mp3" || format === "wav" || quality === "audio") {
    return "bestaudio/best";
  }
  const heightMap: Record<Quality, string> = {
    best:  `bestvideo[ext=${format}]+bestaudio/best[ext=${format}]/bestvideo+bestaudio/best`,
    "4k":  `bestvideo[height<=2160][ext=${format}]+bestaudio/best[height<=2160]`,
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
        } else {
          reject(new Error("download_failed"));
        }
        return;
      }
      try {
        const raw = JSON.parse(stdout);
        const formats: MediaFormat[] = (raw.formats ?? [])
          .filter((f: Record<string, unknown>) => f.vcodec !== "none" || f.acodec !== "none")
          .map((f: Record<string, unknown>) => ({
            id: String(f.format_id),
            ext: String(f.ext),
            quality: f.height ? `${f.height}p` : (f.abr ? `${f.abr}kbps` : "unknown"),
            filesize: typeof f.filesize === "number" ? f.filesize : null,
          }));

        resolve({
          title: String(raw.title ?? "Untitled"),
          thumbnail: String(raw.thumbnail ?? ""),
          duration: Number(raw.duration ?? 0),
          uploader: String(raw.uploader ?? raw.channel ?? "Unknown"),
          platform: (raw.extractor_key?.toLowerCase() ?? "unknown") as Platform,
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
      "-f", buildFormatString(format, quality),
      "--no-warnings",
      url,
    ]);

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });

    const timer = setTimeout(() => { proc.kill(); resolve(null); }, 15_000);

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
    "-f", buildFormatString(format, quality),
    "--merge-output-format", format === "webm" ? "webm" : "mp4",
    "-o", "-",   // write to stdout
    "--no-warnings",
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
      "-f", buildFormatString(format, quality),
      "--extract-audio",
      "--audio-format", format,
      "--audio-quality", "0",
      "-o", outPath,
      "--no-warnings",
      url,
    ]);

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => { proc.kill(); reject(new Error("timeout")); }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(stderr.includes("merge") ? "merge_failed" : "download_failed"));
      else resolve();
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ytdlp.ts
git commit -m "feat: add yt-dlp child_process wrapper"
```

---

### Task 6: API Route — `/api/info`

**Files:**
- Create: `app/api/info/route.ts`

**Interfaces:**
- Consumes: `fetchMediaInfo` from `lib/ytdlp.ts`, `checkRateLimit` from `lib/rateLimit.ts`
- Produces: `POST /api/info` → `MediaInfo` JSON or `ApiError` JSON

- [ ] **Step 1: Create `app/api/info/route.ts`**

```ts
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
    const body = await req.json();
    url = body?.url;
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
    const code = (["private_video", "unsupported_site", "download_failed", "timeout"] as const)
      .includes(message as never) ? message : "download_failed";
    const status = code === "private_video" ? 403 : code === "unsupported_site" ? 400 : 500;
    return NextResponse.json<ApiError>({ error: code as ApiError["error"] }, { status });
  }
}
```

- [ ] **Step 2: Test manually**

```bash
npm run dev &
curl -X POST http://localhost:3000/api/info \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

Expected: JSON with `title`, `thumbnail`, `duration`, `formats` array.

```bash
curl -X POST http://localhost:3000/api/info \
  -H "Content-Type: application/json" \
  -d '{"url":"not-a-url"}'
```

Expected: `{"error":"invalid_url"}` with status 400.

- [ ] **Step 3: Commit**

```bash
git add app/api/info/route.ts
git commit -m "feat: add POST /api/info route with rate limiting"
```

---

### Task 7: API Route — `/api/download`

**Files:**
- Create: `app/api/download/route.ts`

**Interfaces:**
- Consumes: `getDirectUrl`, `spawnDownloadStream`, `spawnAudioToFile`, `buildFormatString` from `lib/ytdlp.ts`; `checkRateLimit` from `lib/rateLimit.ts`
- Produces: `GET /api/download?url=&format=&quality=` → redirect JSON or chunked stream

- [ ] **Step 1: Create `app/api/download/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createReadStream, unlink } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { checkRateLimit } from "@/lib/rateLimit";
import { getDirectUrl, spawnDownloadStream, spawnAudioToFile } from "@/lib/ytdlp";
import type { ApiError, OutputFormat, Quality } from "@/types";

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

  // Audio: must write to /tmp first (ffmpeg re-encode)
  if (isAudio) {
    // yt-dlp appends the extension itself — pass base path, read <base>.<format>
    const tmpBase = join("/tmp", randomUUID());
    const tmpPath = `${tmpBase}.${format}`;
    try {
      await spawnAudioToFile(url, format as import("@/types").AudioFormat, quality, tmpBase);
      const fileStream = createReadStream(tmpPath);
      const readableStream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => controller.enqueue(chunk));
          fileStream.on("end", () => { controller.close(); unlink(tmpPath, () => {}); });
          fileStream.on("error", (e) => { controller.error(e); unlink(tmpPath, () => {}); });
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
      unlink(tmpPath, () => {}); // best-effort cleanup
      const code = err instanceof Error ? err.message : "download_failed";
      return NextResponse.json<ApiError>(
        { error: (["merge_failed","timeout","download_failed"].includes(code) ? code : "download_failed") as ApiError["error"] },
        { status: 500 }
      );
    }
  }

  // Video: try direct URL first
  try {
    const directUrl = await getDirectUrl(url, format, quality);
    if (directUrl) {
      return NextResponse.json({ redirectUrl: directUrl });
    }
  } catch {
    // fall through to streaming
  }

  // Video: stream via yt-dlp stdout
  const proc = spawnDownloadStream(url, format, quality);
  const readableStream = new ReadableStream({
    start(controller) {
      proc.stdout!.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      proc.stdout!.on("end", () => controller.close());
      proc.stdout!.on("error", (e) => controller.error(e));
      proc.stderr!.on("data", () => {}); // drain stderr silently
    },
    cancel() { proc.kill(); },
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
```

- [ ] **Step 2: Test manually (requires yt-dlp installed locally)**

```bash
# Install yt-dlp locally for testing
pip install yt-dlp

curl "http://localhost:3000/api/download?url=https://www.reddit.com/r/videos/comments/EXAMPLE&format=mp4&quality=720p&title=test"
```

Expected: either `{"redirectUrl":"https://..."}` or a video file stream.

- [ ] **Step 3: Commit**

```bash
git add app/api/download/route.ts
git commit -m "feat: add GET /api/download with smart redirect/stream fallback"
```

---

### Task 8: Animated Background Component

**Files:**
- Create: `components/AnimatedBackground.tsx`

**Interfaces:**
- Produces: `<AnimatedBackground />` — full-screen fixed dark mesh gradient with subtle animation

- [ ] **Step 1: Create `components/AnimatedBackground.tsx`**

```tsx
"use client";
import { motion } from "framer-motion";

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#0a0a0f]">
      {/* Primary orb */}
      <motion.div
        className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)",
        }}
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Secondary orb */}
      <motion.div
        className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)",
        }}
        animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      {/* Noise grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/AnimatedBackground.tsx
git commit -m "feat: add animated mesh gradient background"
```

---

### Task 9: UrlInput Component

**Files:**
- Create: `components/UrlInput.tsx`

**Interfaces:**
- Consumes: `detectPlatform`, `getPlatformMeta` from `lib/platforms.ts`; `Platform` from `types/index.ts`
- Produces: `<UrlInput value onChange onSubmit isLoading />` — URL input with live platform badge and glowing border

- [ ] **Step 1: Create `components/UrlInput.tsx`**

```tsx
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
        }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="relative flex items-center gap-3 rounded-2xl bg-[#0f0f1a] px-4 py-4">
          {/* Platform badge */}
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
                <Image src={meta.logo} alt={meta.label} width={14} height={14} className="opacity-80" />
                {meta.label}
              </motion.div>
            ) : (
              <motion.div
                key="search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Search className="h-5 w-5 text-slate-500 shrink-0" />
              </motion.div>
            )}
          </AnimatePresence>

          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => e.key === "Enter" && !isLoading && value && onSubmit()}
            placeholder="Paste a YouTube, Instagram, TikTok, or any video URL..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
            disabled={isLoading}
            autoFocus
          />

          {/* Clear button */}
          {value && !isLoading && (
            <button
              onClick={() => onChange("")}
              className="text-slate-600 hover:text-slate-400 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          )}

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
```

- [ ] **Step 2: Commit**

```bash
git add components/UrlInput.tsx
git commit -m "feat: add URL input with live platform detection badge"
```

---

### Task 10: FormatPicker Component

**Files:**
- Create: `components/FormatPicker.tsx`

**Interfaces:**
- Consumes: `OutputFormat`, `Quality` from `types/index.ts`
- Produces: `<FormatPicker format quality onFormatChange onQualityChange />` — pill selectors

- [ ] **Step 1: Create `components/FormatPicker.tsx`**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add components/FormatPicker.tsx
git commit -m "feat: add format and quality pill selector component"
```

---

### Task 11: MediaCard Component

**Files:**
- Create: `components/MediaCard.tsx`

**Interfaces:**
- Consumes: `MediaInfo` from `types/index.ts`; `getPlatformMeta` from `lib/platforms.ts`
- Produces: `<MediaCard info />` — thumbnail, title, metadata display with skeleton loading state

- [ ] **Step 1: Create `components/MediaCard.tsx`**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add components/MediaCard.tsx
git commit -m "feat: add MediaCard with thumbnail, metadata, and skeleton"
```

---

### Task 12: DownloadButton + ProgressBar Component

**Files:**
- Create: `components/DownloadButton.tsx`

**Interfaces:**
- Consumes: `DownloadRequest`, `AppState` from `types/index.ts`
- Produces: `<DownloadButton request title onStart onDone onError />` — handles fetch to `/api/download`, shows progress, speed

- [ ] **Step 1: Create `components/DownloadButton.tsx`**

```tsx
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
  timeout: "Download timed out. Try a shorter video or lower quality.",
  merge_failed: "Couldn't merge video and audio. Try MP4 at 720p instead.",
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
        const data = await res.json();
        const code: ApiErrorCode = data.error ?? "download_failed";
        setErrorMsg(ERROR_MESSAGES[code]);
        setState("idle");
        onError(code);
        return;
      }

      const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";

      // Direct URL redirect
      if (contentType.includes("application/json")) {
        const { redirectUrl } = await res.json();
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
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
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
```

- [ ] **Step 2: Commit**

```bash
git add components/DownloadButton.tsx
git commit -m "feat: add DownloadButton with progress, speed, and error display"
```

---

### Task 13: Main Page

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: All components; `AppState`, `MediaInfo`, `OutputFormat`, `Quality` from `types/index.ts`
- Produces: Complete single-page app wiring all states together

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
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
          Download<span className="text-violet-400">X</span>
        </h1>
        <p className="text-slate-400 text-base">
          Download videos &amp; audio. Fast. Private. No signup.
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
```

- [ ] **Step 2: Test the full UI flow**

```bash
npm run dev
# Open http://localhost:3000
# 1. Paste a YouTube URL → verify platform badge appears
# 2. Click Fetch → verify skeleton → verify MediaCard appears
# 3. Select MP4 + 720p → click Download Now
# 4. Verify download starts (either browser dialog or progress bar)
# 5. Paste invalid URL → verify error message
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire up main page with all states and components"
```

---

### Task 14: Dockerfile & Docker Compose

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `.dockerignore`

**Interfaces:**
- Produces: `docker compose up -d --build` → app running at port 80/443

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache python3 py3-pip ffmpeg
RUN pip install yt-dlp --break-system-packages

ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Update `next.config.ts` to enable standalone output**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.ytimg.com" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.twimg.com" },
      { protocol: "https", hostname: "**.tiktokcdn.com" },
      { protocol: "https", hostname: "**.redd.it" },
      { protocol: "https", hostname: "i.vimeocdn.com" },
      { protocol: "https", hostname: "**.archive.org" },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    networks:
      - web

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/www/certbot:/var/www/certbot:ro
    depends_on:
      - app
    restart: unless-stopped
    networks:
      - web

networks:
  web:
    driver: bridge
```

- [ ] **Step 4: Create `nginx.conf`**

```nginx
events { worker_connections 1024; }

http {
  upstream app { server app:3000; }

  # Redirect HTTP to HTTPS
  server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
      root /var/www/certbot;
    }

    location / {
      return 301 https://$host$request_uri;
    }
  }

  server {
    listen 443 ssl;
    server_name YOUR_DOMAIN_HERE;

    ssl_certificate     /etc/letsencrypt/live/YOUR_DOMAIN_HERE/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN_HERE/privkey.pem;

    # Disable buffering for download streams
    proxy_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;

    location / {
      proxy_pass http://app;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
  }
}
```

- [ ] **Step 5: Create `.dockerignore`**

```
node_modules
.next
.git
*.md
.env*
docs/
```

- [ ] **Step 6: Test Docker build locally**

```bash
docker build -t downloadx .
docker run -p 3000:3000 downloadx
# Open http://localhost:3000 — verify app loads
```

- [ ] **Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml nginx.conf .dockerignore next.config.ts
git commit -m "feat: add Dockerfile, docker-compose, and nginx config"
```

---

### Task 15: AWS EC2 Setup & Deploy

**Files:**
- Create: `docs/deploy.md` (deployment runbook)

**Interfaces:**
- Produces: Live app accessible at `https://yourdomain.com`

- [ ] **Step 1: Launch EC2 instance via AWS Console**

1. Go to EC2 → Launch Instance
2. Name: `downloadx`
3. AMI: **Amazon Linux 2023**
4. Instance type: `t3.micro` (free tier)
5. Create a new key pair → download `.pem` file → save to `~/.ssh/downloadx.pem`
6. Security Group — add inbound rules:
   - SSH (22) from My IP
   - HTTP (80) from Anywhere
   - HTTPS (443) from Anywhere
7. Storage: 20GB gp3
8. Launch

- [ ] **Step 2: Allocate and attach Elastic IP**

EC2 → Elastic IPs → Allocate → Associate with your instance.
Note the IP: `<EC2_IP>`

- [ ] **Step 3: Point GoDaddy DNS to EC2**

GoDaddy → DNS → Add records:
```
Type: A   Name: @    Value: <EC2_IP>   TTL: 600
Type: A   Name: www  Value: <EC2_IP>   TTL: 600
```

Wait 5-10 minutes for propagation. Verify:
```bash
nslookup yourdomain.com
# Should return <EC2_IP>
```

- [ ] **Step 4: SSH in and install dependencies**

```bash
chmod 400 ~/.ssh/downloadx.pem
ssh -i ~/.ssh/downloadx.pem ec2-user@<EC2_IP>

# On the server:
sudo yum update -y
sudo yum install -y git docker

# Start Docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ec2-user

# Install Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Re-login to apply docker group
exit
ssh -i ~/.ssh/downloadx.pem ec2-user@<EC2_IP>
```

- [ ] **Step 5: Clone repo and configure domain**

```bash
git clone <your-repo-url> download-x
cd download-x

# Replace YOUR_DOMAIN_HERE in nginx.conf
sed -i 's/YOUR_DOMAIN_HERE/yourdomain.com/g' nginx.conf
```

- [ ] **Step 6: Get SSL certificate (HTTP-only first)**

```bash
# Start nginx only (no SSL yet) for certbot challenge
docker compose up -d nginx

# Install certbot
sudo yum install -y certbot

# Get certificate
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --non-interactive \
  --agree-tos \
  -m your@email.com
```

- [ ] **Step 7: Start full stack**

```bash
docker compose up -d --build
# Wait ~3 minutes for build

docker compose ps
# Both app and nginx should show "Up"
```

- [ ] **Step 8: Verify**

```bash
# From your laptop:
curl https://yourdomain.com
# Should return HTML

# Test API:
curl -X POST https://yourdomain.com/api/info \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
# Should return JSON with title, thumbnail, etc.
```

- [ ] **Step 9: Set up SSL auto-renewal**

```bash
# On EC2:
sudo crontab -e
# Add this line:
0 0 * * 0 certbot renew --quiet && docker compose -f /home/ec2-user/download-x/docker-compose.yml restart nginx
```

- [ ] **Step 10: Create deploy runbook**

Create `docs/deploy.md`:
```markdown
# Deployment Runbook

## Update the app

```bash
ssh -i ~/.ssh/downloadx.pem ec2-user@<EC2_IP>
cd download-x
git pull
docker compose up -d --build
```

## View logs

```bash
docker compose logs app -f
docker compose logs nginx -f
```

## Restart services

```bash
docker compose restart
```

## Check yt-dlp version

```bash
docker compose exec app yt-dlp --version
# Update: docker compose exec app pip install -U yt-dlp
```
```

- [ ] **Step 11: Final commit**

```bash
git add docs/deploy.md nginx.conf
git commit -m "docs: add deployment runbook"
```

---

## Summary

| Task | Deliverable |
|---|---|
| 1 | Next.js scaffold, Tailwind, shadcn/ui |
| 2 | Shared TypeScript types |
| 3 | Platform detection + SVG logos |
| 4 | In-memory rate limiter + tests |
| 5 | yt-dlp child_process wrapper |
| 6 | POST /api/info route |
| 7 | GET /api/download route |
| 8 | Animated glassmorphism background |
| 9 | URL input with platform badge |
| 10 | Format/quality pill selector |
| 11 | MediaCard + skeleton |
| 12 | Download button + progress + speed |
| 13 | Main page wiring all components |
| 14 | Dockerfile + docker-compose + nginx |
| 15 | AWS EC2 setup + live deploy |
