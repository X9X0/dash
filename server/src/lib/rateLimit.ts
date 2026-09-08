import type { Request, Response, NextFunction } from 'express'

interface RateLimiterOptions {
  /** Length of the counting window. */
  windowMs: number
  /** Number of hits allowed per key per window before requests are rejected. */
  max: number
  /** Error message for rejected requests. */
  message: string
}

/**
 * Minimal fixed-window rate limiter keyed by client IP. Honours Express's
 * `trust proxy` setting, so behind nginx set TRUST_PROXY so real client
 * addresses are used (otherwise every client shares the proxy's address).
 *
 * `check` is the middleware; the route decides what counts by calling `hit`
 * (e.g. only failed logins) and `reset` (e.g. after a successful login).
 * In-memory state is fine for this single-process deployment.
 */
export function createRateLimiter({ windowMs, max, message }: RateLimiterOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  // Drop expired entries so the map cannot grow without bound.
  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key)
    }
  }, windowMs)
  sweeper.unref()

  const keyFor = (req: Request) => req.ip || 'unknown'

  return {
    check(req: Request, res: Response, next: NextFunction) {
      const entry = hits.get(keyFor(req))
      const now = Date.now()
      if (entry && entry.resetAt > now && entry.count >= max) {
        const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
        res.setHeader('Retry-After', String(retryAfter))
        return res.status(429).json({ error: message })
      }
      next()
    },
    hit(req: Request) {
      const key = keyFor(req)
      const now = Date.now()
      const entry = hits.get(key)
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs })
      } else {
        entry.count++
      }
    },
    reset(req: Request) {
      hits.delete(keyFor(req))
    },
  }
}
