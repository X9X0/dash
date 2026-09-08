import api from './api'
import { useAuthStore } from '@/store/authStore'

// Short-lived, media-only token for URLs the browser loads via <img src>
// (camera snapshots/streams, print thumbnails), which cannot carry an
// Authorization header. The 7-day login token must never be put in a URL:
// URLs end up in proxy logs, browser history and Referer headers.

interface MediaTokenResponse {
  token: string
  expiresIn: number // seconds
}

let cached: { token: string; expiresAt: number } | null = null
let inflight: Promise<string | null> | null = null

// Refresh this long before expiry so an <img> requested "now" never races the cutoff.
const REFRESH_MARGIN_MS = 2 * 60 * 1000

/** Currently cached media token, or null if none/expired. Synchronous, for URL builders. */
export function getMediaToken(): string | null {
  if (cached && cached.expiresAt > Date.now()) return cached.token
  return null
}

/** Ensure a media token is cached (fetching one if missing or close to expiry). */
export async function ensureMediaToken(): Promise<string | null> {
  if (!useAuthStore.getState().token) return null
  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) return cached.token

  if (!inflight) {
    inflight = api
      .get<MediaTokenResponse>('/auth/media-token')
      .then(({ data }) => {
        cached = { token: data.token, expiresAt: Date.now() + data.expiresIn * 1000 }
        return data.token
      })
      .catch(() => null)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function clearMediaToken(): void {
  cached = null
}

// A media token belongs to one login session; drop it when the session changes.
useAuthStore.subscribe((state, prev) => {
  if (state.token !== prev.token) clearMediaToken()
})
