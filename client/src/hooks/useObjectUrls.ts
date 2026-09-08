import { useEffect, useState } from 'react'

/**
 * Object URLs for a list of files, for <img src> previews.
 *
 * URLs are created in an effect when `files` changes and revoked when the
 * list changes again or the component unmounts, so no blob URL leaks and
 * nothing is allocated during render.
 */
export function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file))
    setUrls(next)
    return () => {
      next.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [files])

  return urls
}
