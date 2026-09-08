import { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { verifyToken } from '../lib/jwt.js'

const prisma = new PrismaClient()

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    name: string
    role: string
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  return header?.startsWith('Bearer ') ? header.substring(7) : null
}

async function loadUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  })
}

/**
 * Standard API authentication: a login token in the Authorization header.
 *
 * Tokens are deliberately NOT accepted from the query string here. URLs end up
 * in proxy access logs, browser history and Referer headers, and a login token
 * is valid for 7 days. Routes that must be loadable from an <img> tag use
 * `authenticateMedia` with a short-lived media token instead.
 */
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = bearerToken(req)
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const decoded = verifyToken(token)
    if (decoded.scope === 'media') {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const user = await loadUser(decoded.userId)
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

/**
 * Authentication for media routes (camera snapshots/streams, thumbnails) that
 * browsers request via <img src> and therefore cannot send headers for.
 * Accepts either a normal bearer header, or a media-scoped token (15 minute
 * lifetime, issued by GET /api/auth/media-token) in `?token=`.
 */
export const authenticateMedia = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const header = bearerToken(req)
    const query = typeof req.query.token === 'string' ? req.query.token : null
    const token = header ?? query
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const decoded = verifyToken(token)
    // Only short-lived media tokens may travel in the URL.
    if (!header && decoded.scope !== 'media') {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const user = await loadUser(decoded.userId)
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    next()
  }
}

export const requireOperator = requireRole('admin', 'operator')
export const requireAdmin = requireRole('admin')
