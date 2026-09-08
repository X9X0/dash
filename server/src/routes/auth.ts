import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, AuthRequest } from '../middleware/auth.js'
import { signAccessToken, signMediaToken, MEDIA_TOKEN_TTL_SECONDS } from '../lib/jwt.js'
import { createRateLimiter } from '../lib/rateLimit.js'
import { isUniqueViolation } from '../lib/errors.js'

const router = Router()

// Brute-force protection. Only FAILED logins count, so legitimate users behind
// a shared address are never locked out by each other's successful logins.
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many failed login attempts. Try again in 15 minutes.',
})
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many registration attempts. Try again later.',
})

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const ROLES = ['admin', 'operator', 'viewer'] as const

/**
 * Role given to self-registered users (the very first account is always admin).
 * Defaults to the least-privileged role; an admin promotes people from the
 * Users page. Override with REGISTRATION_ROLE=operator if open sign-up should
 * grant machine control.
 */
function registrationRole(): (typeof ROLES)[number] {
  const configured = process.env.REGISTRATION_ROLE
  return configured && (ROLES as readonly string[]).includes(configured)
    ? (configured as (typeof ROLES)[number])
    : 'viewer'
}

router.post('/register', registerLimiter.check, async (req, res) => {
  registerLimiter.hit(req)
  try {
    const { email, password, name } = registerSchema.parse(req.body)

    // The first user can always register (they become admin). After that,
    // ALLOW_REGISTRATION=false turns self sign-up off entirely.
    const userCount = await prisma.user.count()
    if (userCount > 0 && process.env.ALLOW_REGISTRATION === 'false') {
      return res.status(403).json({ error: 'Registration is disabled. Ask an administrator to create your account.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    // Count and create in one transaction so two simultaneous first
    // registrations cannot both become admin.
    const user = await prisma.$transaction(async (tx) => {
      const count = await tx.user.count()
      const role = count === 0 ? 'admin' : registrationRole()
      return tx.user.create({
        data: { email, passwordHash, name, role },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      })
    })

    res.status(201).json({ user, token: signAccessToken(user.id) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message })
    }
    if (isUniqueViolation(error)) {
      return res.status(400).json({ error: 'Email already registered' })
    }
    console.error('Register error:', error)
    res.status(500).json({ error: 'Failed to register' })
  }
})

router.post('/login', loginLimiter.check, async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email } })
    const validPassword = user ? await bcrypt.compare(password, user.passwordHash) : false
    if (!user || !validPassword) {
      loginLimiter.hit(req)
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    loginLimiter.reset(req)

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      token: signAccessToken(user.id),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message })
    }
    console.error('Login error:', error)
    res.status(500).json({ error: 'Failed to login' })
  }
})

// Short-lived token for <img>-loaded media (camera snapshots/streams, thumbnails).
// See authenticateMedia in middleware/auth.ts.
router.get('/media-token', authenticate, (req: AuthRequest, res) => {
  res.json({
    token: signMediaToken(req.user!.id),
    expiresIn: MEDIA_TOKEN_TTL_SECONDS,
  })
})

export { router as authRouter }
