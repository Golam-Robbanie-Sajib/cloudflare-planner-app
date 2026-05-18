// lib/rate-limit.ts
//
// Token-bucket rate limiter for the Hono edge routes. Strictly in-memory:
// works inside a single edge isolate (Vercel Edge / Cloudflare Worker)
// across the few seconds it stays warm, which catches the common abuse
// pattern of a single bad client hammering the same endpoint.
//
// Limitations to be honest about:
//   * Each edge region / worker isolate has its own bucket — a distributed
//     attacker can pin a higher floor.
//   * The state evaporates when the isolate is recycled.
//
// For real distributed rate limiting, swap the Map for Cloudflare KV (with
// short TTLs and the increment-via-atomic-set pattern) or Vercel KV. The
// interface here (`hit(key, limit, windowSec)`) is the same — only the
// backing store needs to change.

interface Bucket {
  count: number
  resetAt: number // epoch ms
}

const buckets = new Map<string, Bucket>()

// Janitor: prune expired buckets every ~1000 calls. Avoids unbounded growth
// across the isolate's lifetime.
let opsSinceCleanup = 0
function maybeCleanup() {
  opsSinceCleanup++
  if (opsSinceCleanup < 1000) return
  opsSinceCleanup = 0
  const now = Date.now()
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number // ms until the window resets
}

export function hit(key: string, limit: number, windowSec: number): RateLimitResult {
  maybeCleanup()
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowSec * 1000 }
    buckets.set(key, fresh)
    return { allowed: true, remaining: limit - 1, resetMs: windowSec * 1000 }
  }
  existing.count++
  const remaining = Math.max(0, limit - existing.count)
  const allowed = existing.count <= limit
  return { allowed, remaining, resetMs: existing.resetAt - now }
}

// Builds a key from the request's Authorization header (preferred — ties
// the limit to the signed-in user) falling back to the IP. The IP fallback
// is weak on Cloudflare/Vercel (header is set by the platform) but better
// than no key at all.
export function keyForRequest(headers: Headers, route: string): string {
  const auth = headers.get("authorization") || ""
  if (auth.startsWith("Bearer ")) {
    // Use a short suffix to avoid storing the full token; SHA would be safer
    // but a substring is plenty for keyspace separation in a hot map.
    return `auth:${auth.slice(-24)}:${route}`
  }
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("cf-connecting-ip")
    || "unknown"
  return `ip:${ip}:${route}`
}
