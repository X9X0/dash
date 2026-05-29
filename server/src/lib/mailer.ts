import nodemailer, { type Transporter } from 'nodemailer'

// SMTP is configured via environment variables (see .env.example). If the
// required vars are missing, email is silently disabled and sendMail() becomes
// a no-op that logs a warning — the rest of the app keeps working.

let transporter: Transporter | null = null
let initialized = false

function getTransporter(): Transporter | null {
  if (initialized) return transporter
  initialized = true

  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    console.log('[Mailer] SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS); email disabled.')
    return null
  }

  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587
  const secure = process.env.SMTP_SECURE === 'true'

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })

  console.log(`[Mailer] SMTP configured (${host}:${port}, secure=${secure}).`)
  return transporter
}

export function isMailerConfigured(): boolean {
  return getTransporter() !== null
}

interface SendMailOptions {
  to: string[]
  subject: string
  text: string
  html?: string
}

/**
 * Send an email to the given recipients. Returns true if the message was
 * handed off to the SMTP server, false if mail is disabled or sending failed.
 */
export async function sendMail({ to, subject, text, html }: SendMailOptions): Promise<boolean> {
  const tx = getTransporter()
  if (!tx) return false

  const recipients = to.map((addr) => addr.trim()).filter(Boolean)
  if (recipients.length === 0) {
    console.warn('[Mailer] sendMail called with no recipients; skipping.')
    return false
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER

  try {
    await tx.sendMail({ from, to: recipients, subject, text, html })
    console.log(`[Mailer] Sent "${subject}" to ${recipients.join(', ')}`)
    return true
  } catch (error) {
    console.error('[Mailer] Failed to send email:', error)
    return false
  }
}

/** Parse a newline/comma-separated recipient string into a deduped address list. */
export function parseRecipients(raw: string | null | undefined): string[] {
  if (!raw) return []
  const list = raw
    .split(/[\n,;]+/)
    .map((addr) => addr.trim())
    .filter(Boolean)
  return [...new Set(list)]
}
