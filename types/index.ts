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
