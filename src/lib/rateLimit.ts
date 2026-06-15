export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

function safeKeyPart(value: string | undefined, fallback = "unknown") {
  const cleaned = (value ?? fallback)
    .replace(/[^a-zA-Z0-9:._@-]/g, "_")
    .slice(0, 120);
  return cleaned || fallback;
}

export function requestIp(req: Request) {
  const headers = req.headers;
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return safeKeyPart(
    headers.get("cf-connecting-ip") ??
      headers.get("x-real-ip") ??
      forwardedFor ??
      "unknown",
  );
}

export async function rateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const safeKey = key.replace(/[^a-zA-Z0-9:._@-]/g, "_").slice(0, 512);
  const stored = await kv.get<RateLimitBucket>(safeKey, "json");
  const bucket =
    stored && stored.resetAt > now
      ? stored
      : { count: 0, resetAt: now + windowSeconds };

  bucket.count += 1;
  await kv.put(safeKey, JSON.stringify(bucket), {
    expirationTtl: Math.max(windowSeconds, bucket.resetAt - now),
  });

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}
