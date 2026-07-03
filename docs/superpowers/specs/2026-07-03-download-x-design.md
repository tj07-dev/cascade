# DownloadX — Design Spec
**Date:** 2026-07-03  
**Status:** Approved  

---

## Overview

DownloadX is a self-hosted Next.js web application that lets family and friends download publicly available video and audio content from 1000+ sites (YouTube, Instagram, TikTok, Twitter/X, Reddit, Archive.org, Wikimedia, and more). It wraps yt-dlp and ffmpeg behind a polished, mobile-first dark UI. Deployed on a single AWS EC2 instance in Mumbai for low latency to Indian users.

**Non-goals:**
- No user accounts or authentication
- No file storage (files go directly to user's browser)
- No public launch / monetisation
- No admin dashboard (Phase 1)

---

## Architecture

```
User Browser (India)
      │
      ▼
GoDaddy DNS (A record → EC2 Elastic IP)
      │
      ▼
AWS EC2 t3.micro — ap-south-1 (Mumbai)
      │
      ├── Nginx (ports 80/443) — SSL termination via Let's Encrypt (Certbot)
      │       │
      │       ▼
      └── Next.js App (Docker, port 3000)
              ├── UI Pages  (App Router)
              └── API Routes
                      ├── POST /api/info      → spawns yt-dlp --dump-json
                      └── GET  /api/download  → spawns yt-dlp, streams or redirects
                                                      │
                                                      ▼
                                                yt-dlp + ffmpeg
                                                (installed in Docker image)
```

**File delivery — smart fallback:**
1. API calls `yt-dlp --get-url` to extract the direct media URL
2. If a direct URL is returned → respond with `{ redirectUrl }` → browser downloads directly (fastest path, no bandwidth cost on server)
3. If platform blocks direct access → pipe `yt-dlp` stdout as a chunked HTTP stream through the server

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) | Single codebase for UI + API |
| Language | TypeScript | Type safety across UI and API |
| UI | Tailwind CSS + shadcn/ui | Rapid, consistent styling |
| Animations | Framer Motion | Smooth entrance + progress animations |
| Download engine | yt-dlp (Python binary) | Gold standard, 1000+ sites |
| Audio/video merge | ffmpeg | Required for YouTube 720p+ |
| Reverse proxy | Nginx + Certbot | SSL termination, HTTP→HTTPS redirect |
| Containerisation | Docker + Docker Compose | Reproducible deployment |
| Hosting | AWS EC2 t3.micro (ap-south-1) | Free tier 12 months, low latency India |
| DNS | GoDaddy → EC2 Elastic IP | User's existing domain |

---

## UI Design

### Visual Style
- **Background:** Deep dark (`#0a0a0f`) with animated purple/blue mesh gradient
- **Cards:** Glassmorphism — frosted glass effect with glowing borders that pulse on hover
- **Typography:** Clean sans-serif, high contrast white on dark
- **Accents:** Purple/violet gradient for interactive elements
- **Mode:** Dark only
- **Responsive:** Mobile-first

### States & Flow

**1. Idle**
- Centred URL input with glowing border
- Platform badge appears instantly as user types (detects YouTube/TikTok/etc. and shows logo + brand colour)
- "Fetch" button with shimmer hover effect

**2. Fetching Metadata**
- Skeleton loader card animates in
- yt-dlp `--dump-json` runs server-side

**3. Media Card**
- Thumbnail with play-button shimmer overlay
- Title, uploader, duration, platform badge
- Format pills: MP4 · WebM · MP3 · WAV (click to select)
- Quality dropdown: Best · 4K · 1080p · 720p · 480p · 360p · Audio Only
- Estimated file size shown per selection
- "Download Now" button — full width, gradient fill

**4. Downloading**
- Animated progress bar with real-time speed (MB/s) and ETA
- For direct-URL downloads: browser's native download dialog triggers instantly
- For streamed downloads: progress bar fills as chunks arrive

**5. Success**
- Card success state with confetti burst animation
- "Download another" resets to idle

**6. Error**
- Inline error below input — never a modal, never a page crash
- Clear human-readable message (see Error Handling section)

### Components

```
app/
└── page.tsx                  # orchestrates all states

components/
├── UrlInput.tsx              # input + platform detection
├── MediaCard.tsx             # thumbnail + metadata display
├── FormatPicker.tsx          # format pills + quality dropdown
├── DownloadButton.tsx        # triggers download, shows progress
└── ProgressBar.tsx           # animated progress + speed + ETA
```

---

## API Routes

### `POST /api/info`

Fetches metadata for a given URL without downloading.

**Request:**
```json
{ "url": "https://www.youtube.com/watch?v=..." }
```

**Process:**
```bash
yt-dlp --dump-json --no-playlist --no-warnings "<url>"
```

**Response:**
```json
{
  "title": "Big Sur – WWDC 2020 Keynote",
  "thumbnail": "https://...",
  "duration": 7472,
  "uploader": "Apple",
  "platform": "youtube",
  "formats": [
    { "id": "137", "ext": "mp4", "quality": "1080p", "filesize": 1240000000 },
    { "id": "22",  "ext": "mp4", "quality": "720p",  "filesize": 680000000 },
    { "id": "140", "ext": "m4a", "quality": "audio", "filesize": null }
  ],
  "note": "filesize is null for many YouTube formats — show '~' estimate or omit when null"
}
```

**Error responses:**
```json
{ "error": "unsupported_site" }
{ "error": "private_video" }
{ "error": "invalid_url" }
```

---

### `GET /api/download`

Downloads and delivers the file to the browser.

**Query params:** `url`, `format` (mp4|webm|mp3|wav), `quality` (best|4k|1080p|720p|480p|360p|audio)

**Process:**
```
1. Validate url + params
2. Check rate limit (10 req/hr per IP)
3. Run: yt-dlp --get-url -f "<format_string>" "<url>"
4a. Direct URL returned → respond 200 { redirectUrl: "..." }
4b. No direct URL, video format → spawn yt-dlp with stdout pipe
    → set headers: Content-Disposition, Content-Type, Transfer-Encoding: chunked
    → pipe stdout to response stream
4c. Audio extraction (MP3/WAV) → cannot stream (ffmpeg re-encode requires full file)
    → download to /tmp/<uuid>.<ext>, then stream file to client, then delete
5. On yt-dlp exit code ≠ 0 → respond 500 with error code
6. /tmp cleanup: delete audio temp files after streaming completes or on error
```

**Format string mapping:**

| User selection | yt-dlp -f argument |
|---|---|
| MP4 + 1080p | `bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]` |
| MP4 + 720p | `bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]` |
| MP4 + Best | `bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]` |
| MP3 | `bestaudio --extract-audio --audio-format mp3` |
| WAV | `bestaudio --extract-audio --audio-format wav` |
| Audio Only | `bestaudio/best` |

**Response headers (streaming):**
```
Content-Disposition: attachment; filename="<sanitised-title>.<ext>"
Content-Type: video/mp4   (or audio/mpeg etc.)
Transfer-Encoding: chunked
X-Accel-Buffering: no     (tells Nginx not to buffer the stream)
```

---

## yt-dlp Integration

**Location:** `lib/ytdlp.ts`

**Key behaviours:**
- Spawned via `child_process.spawn` (not `exec`) to support streaming stdout
- stderr captured separately for logging — never exposed to the client
- Process killed after **10 minutes** (prevents zombie processes on slow/large downloads)
- `--no-playlist` flag always set (never accidentally download an entire playlist)
- `--no-warnings` for clean stderr parsing
- yt-dlp binary updated via `pip install -U yt-dlp` on each Docker build to stay current

**ffmpeg:**
- Installed in the Docker image (`apk add ffmpeg`)
- yt-dlp automatically invokes ffmpeg when merging video+audio streams
- No direct ffmpeg calls from the app code

---

## Rate Limiting

**Implementation:** In-memory Map in `lib/rateLimit.ts` — no Redis needed at this scale.

```
Map<ip: string, { count: number, windowStart: number }>
```

- **Limit:** 10 requests per hour per IP (covers both /api/info and /api/download)
- **Window:** Rolling 1-hour window
- **Response on limit:** HTTP 429 `{ error: "rate_limited" }`
- **Reset:** Automatic — entries expire after the window passes
- **Note:** Map is in-memory, resets on server restart. Acceptable for family/friends scale.

---

## Error Handling

| Scenario | HTTP | Client error code | User message |
|---|---|---|---|
| Non-URL input | 400 | `invalid_url` | "Please paste a valid URL" |
| Unsupported platform | 400 | `unsupported_site` | "This site isn't supported yet. Try YouTube, Instagram, TikTok, Reddit, or Twitter." |
| Private/restricted video | 403 | `private_video` | "This video is private or restricted and can't be downloaded." |
| Rate limited | 429 | `rate_limited` | "You've hit the hourly limit. Try again in an hour." |
| yt-dlp crash | 500 | `download_failed` | "Download failed. The platform may have changed. Try again shortly." |
| Timeout (>10 min) | 504 | `timeout` | "Download timed out. Try a shorter video or lower quality." |
| ffmpeg merge failure | 500 | `merge_failed` | "Couldn't merge video and audio. Try MP4 at 720p instead." |

Server-side: all yt-dlp stderr output is written to `/var/log/downloadx/app.log` with rotating logs (7-day retention).

---

## Project Structure

```
download-x/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/
│       ├── info/
│       │   └── route.ts
│       └── download/
│           └── route.ts
├── components/
│   ├── UrlInput.tsx
│   ├── MediaCard.tsx
│   ├── FormatPicker.tsx
│   ├── DownloadButton.tsx
│   └── ProgressBar.tsx
├── lib/
│   ├── ytdlp.ts
│   ├── rateLimit.ts
│   └── platforms.ts
├── public/
│   └── logos/          # platform logos (YouTube, TikTok, etc.)
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .env.example
└── package.json
```

---

## Infrastructure & Deployment

### AWS Setup
1. Launch EC2 t3.micro in `ap-south-1` (Mumbai), Amazon Linux 2023
2. Allocate and associate an **Elastic IP**
3. Security Group inbound rules: port 22 (SSH), 80 (HTTP), 443 (HTTPS)
4. 20GB EBS gp3 volume (included in free tier)

### GoDaddy DNS
```
A record:  yourdomain.com      → <EC2 Elastic IP>
A record:  www.yourdomain.com  → <EC2 Elastic IP>
TTL: 600
```

### Docker Compose
```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    restart: unless-stopped
    environment:
      - NODE_ENV=production

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/www/certbot:/var/www/certbot:ro
    depends_on: [app]
    restart: unless-stopped

  certbot:
    image: certbot/certbot
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt
      - /var/www/certbot:/var/www/certbot
```

### Dockerfile
```dockerfile
FROM node:22-alpine
RUN apk add --no-cache python3 py3-pip ffmpeg
RUN pip install yt-dlp --break-system-packages
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Deploy Commands
```bash
# First time
git clone <repo> && cd download-x
docker compose up -d --build
certbot certonly --webroot -w /var/www/certbot -d yourdomain.com

# Updates
git pull && docker compose up -d --build
```

---

## Phase 2 (Future — Not in scope now)

- **Telegram storage:** After download, bot uploads file to a private Telegram channel and returns a Telegram CDN link. Handles files up to 2GB. Useful for sharing links with family without re-downloading.
- **Playlist support:** Download entire YouTube playlists as a zip
- **Admin dashboard:** Simple password-protected page showing download history and server health

---

## Supported Platforms (Key subset)

| Platform | Type | Delivery |
|---|---|---|
| YouTube | Video + Audio | Stream (anti-bot) |
| Instagram | Video + Reels | Direct URL |
| TikTok | Video | Direct URL |
| Twitter / X | Video | Direct URL |
| Reddit | Video | Direct URL |
| Facebook | Video | Stream |
| Vimeo | Video | Direct URL |
| SoundCloud | Audio | Direct URL |
| Archive.org | Video + Audio | Direct URL |
| Wikimedia Commons | Video + Audio | Direct URL |
| Dailymotion | Video | Direct URL |
| 990+ more | Various | Via yt-dlp |
