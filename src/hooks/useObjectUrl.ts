import { useEffect, useState } from 'react'

export function useObjectUrl(blob: Blob | null | undefined): string | undefined {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    if (!blob) {
      // The object URL is an external resource, so the effect is the correct owner.
      // oxlint-disable-next-line react/set-state-in-effect
      setUrl(undefined)
      return
    }

    const nextUrl = URL.createObjectURL(blob)
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(nextUrl)

    return () => URL.revokeObjectURL(nextUrl)
  }, [blob])

  return url
}
