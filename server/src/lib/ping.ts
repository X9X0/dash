import { execFile } from 'child_process'
import { promisify } from 'util'
import net from 'net'

const execFileAsync = promisify(execFile)

// RFC 1123 hostname: dot-separated labels of letters, digits and hyphens that
// neither start nor end with a hyphen. Allows a trailing dot (FQDN form).
const HOSTNAME_RE =
  /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$/

/**
 * True if `target` is an IP address or a syntactically valid hostname.
 *
 * Every string that reaches a subprocess (ping, host, nmblookup, ...) must pass
 * this check. Hostnames can come from untrusted places: user input, and reverse
 * lookups of names that other devices on the LAN chose for themselves (mDNS,
 * NetBIOS, PTR records). Combined with execFile (no shell) this also blocks
 * option injection such as a "hostname" of `-f`.
 */
export function isSafeHostTarget(target: unknown): target is string {
  if (typeof target !== 'string' || target.length === 0 || target.startsWith('-')) return false
  return net.isIP(target) !== 0 || HOSTNAME_RE.test(target)
}

/**
 * Ping a host, retrying a few times before declaring it unreachable.
 * Returns true if any attempt succeeded. Unsafe targets are treated as unreachable.
 */
export async function pingHost(target: string, retries = 2): Promise<boolean> {
  if (!isSafeHostTarget(target)) {
    console.warn(`[Ping] Refusing to ping invalid target: ${JSON.stringify(target)}`)
    return false
  }

  const isWindows = process.platform === 'win32'
  const args = isWindows ? ['-n', '1', '-w', '2000', target] : ['-c', '1', '-W', '2', target]

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await execFileAsync('ping', args, { timeout: 5000 })
      return true
    } catch {
      // If not the last attempt, wait briefly before retrying
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }
  return false
}
