import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'

// Values that must never be used as a signing secret. Anyone who has read the
// repo or .env.example knows them, so tokens signed with them can be forged.
const PLACEHOLDER_SECRETS = new Set([
  'change-this-to-a-random-secret-key',
  'fallback-secret',
  'secret',
  'changeme',
])

function resolveSecret(): string {
  const configured = process.env.JWT_SECRET?.trim()
  const isProduction = process.env.NODE_ENV === 'production'
  const unusable = !configured || PLACEHOLDER_SECRETS.has(configured)

  if (unusable) {
    if (isProduction) {
      console.error(
        '[Auth] FATAL: JWT_SECRET is missing or still set to a placeholder.\n' +
          '       Generate one with `openssl rand -base64 32` and set it in server/.env.'
      )
      process.exit(1)
    }
    console.warn(
      '[Auth] WARNING: JWT_SECRET is missing or a placeholder. Using a random secret for this run;\n' +
        '       every login will be invalidated when the server restarts. Set JWT_SECRET in server/.env.'
    )
    return randomBytes(32).toString('base64')
  }

  if (configured.length < 16) {
    console.warn('[Auth] WARNING: JWT_SECRET is shorter than 16 characters. Use `openssl rand -base64 32`.')
  }
  return configured
}

export const JWT_SECRET = resolveSecret()

/** Lifetime of a normal login token. */
export const ACCESS_TOKEN_TTL = '7d'
/**
 * Lifetime of a media token. These are the only tokens allowed in a URL query
 * string (for <img> tags that cannot set an Authorization header), so they are
 * short-lived and cannot be used against the regular API.
 */
export const MEDIA_TOKEN_TTL_SECONDS = 15 * 60

export interface TokenPayload {
  userId: string
  scope?: 'media'
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL })
}

export function signMediaToken(userId: string): string {
  return jwt.sign({ userId, scope: 'media' }, JWT_SECRET, { expiresIn: MEDIA_TOKEN_TTL_SECONDS })
}

/** Verify a token's signature and expiry. Throws on any failure. */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET)
  if (typeof decoded !== 'object' || decoded === null || typeof decoded.userId !== 'string') {
    throw new Error('Malformed token payload')
  }
  return decoded as TokenPayload
}
