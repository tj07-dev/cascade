interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 10;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const store = new Map<string, RateLimitEntry>();

const EXEMPT_IPS = new Set(
  (process.env.RATE_LIMIT_EXEMPT_IPS ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
);

// Entries are only ever overwritten on the same IP's next request, so IPs
// that stop requesting would otherwise stay in memory forever.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (now - entry.windowStart > WINDOW_MS) store.delete(ip);
  }
}, SWEEP_INTERVAL_MS).unref();

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  if (EXEMPT_IPS.has(ip)) {
    return { allowed: true, remaining: MAX_REQUESTS };
  }

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

export function resetRateLimitStore(): void {
  store.clear();
}
