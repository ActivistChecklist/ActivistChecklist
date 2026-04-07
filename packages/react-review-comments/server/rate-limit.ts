const buckets = new Map<string, { count: number; resetAt: number }>();

function getKey(request: Request, action: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `${action}:${ip}`;
}

export function checkRateLimit(
  request: Request,
  action: string,
  max: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const key = getKey(request, action);
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= max,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}
