import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Ping a host, retrying a few times before declaring it unreachable.
 * Returns true if any attempt succeeded.
 */
export async function pingHost(ipAddress: string, retries = 2): Promise<boolean> {
  const isWindows = process.platform === 'win32'
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const pingCmd = isWindows
        ? `ping -n 1 -w 2000 ${ipAddress}`
        : `ping -c 1 -W 2 ${ipAddress}`

      await execAsync(pingCmd, { timeout: 5000 })
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
