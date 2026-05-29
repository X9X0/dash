import dotenv from 'dotenv'
import { sendMail, isMailerConfigured, parseRecipients } from '../lib/mailer.js'

// Load .env from the current working directory (run this from the server/ dir,
// same as the dev/start scripts) so it uses the exact SMTP config the app uses.
dotenv.config()

async function main() {
  // Recipient(s): first CLI arg, else SMTP_TEST_TO, else SMTP_FROM/SMTP_USER.
  const argTo = process.argv[2]
  const fallback = process.env.SMTP_TEST_TO || process.env.SMTP_FROM || process.env.SMTP_USER || ''
  const recipients = parseRecipients(argTo || fallback)

  if (!isMailerConfigured()) {
    console.error(
      '\n[testEmail] SMTP is NOT configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS in server/.env, then retry.\n'
    )
    process.exit(1)
  }

  if (recipients.length === 0) {
    console.error(
      '\n[testEmail] No recipient. Pass one as an argument:\n' +
        '    npm run test:email -- you@example.com\n'
    )
    process.exit(1)
  }

  console.log(`[testEmail] Sending test email to: ${recipients.join(', ')}`)

  const ok = await sendMail({
    to: recipients,
    subject: '[Dash] Test email',
    text:
      'This is a test email from Dash.\n\n' +
      'If you received this, SMTP is configured correctly and offline alerts will be delivered.',
  })

  if (ok) {
    console.log('[testEmail] Sent successfully. Check the inbox (and spam).')
    process.exit(0)
  } else {
    console.error('[testEmail] sendMail returned false — see the [Mailer] log line above for the reason.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[testEmail] Unexpected error:', err)
  process.exit(1)
})
