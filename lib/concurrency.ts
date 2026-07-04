// The box this runs on has 2 vCPUs and <1GB RAM (see docker-compose.yml mem
// limits). The hourly rate limit alone doesn't stop a client from firing
// several requests in parallel and saturating the instance, so cap in-flight
// yt-dlp/ffmpeg work independently of the request-count limit.
const MAX_PER_IP = 2;
const MAX_GLOBAL = 3;

let globalCount = 0;
const perIp = new Map<string, number>();

export function tryAcquire(ip: string): boolean {
  const ipCount = perIp.get(ip) ?? 0;
  if (globalCount >= MAX_GLOBAL || ipCount >= MAX_PER_IP) return false;
  globalCount += 1;
  perIp.set(ip, ipCount + 1);
  return true;
}

export function release(ip: string): void {
  globalCount = Math.max(0, globalCount - 1);
  const ipCount = perIp.get(ip) ?? 0;
  if (ipCount <= 1) perIp.delete(ip);
  else perIp.set(ip, ipCount - 1);
}
