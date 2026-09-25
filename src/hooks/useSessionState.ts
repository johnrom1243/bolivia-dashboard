'use client'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * useState that survives navigating away and back (and page reloads) for the
 * life of the browser tab, via sessionStorage.
 *
 * Hydration-safe: the first render always uses `initial` (matching the server
 * HTML); the stored value is applied right after mount.
 * `skipRestore` lets a caller ignore the stored value, e.g. when a URL param
 * should win.
 */
export function useSessionState<T>(
  key: string,
  initial: T,
  opts?: { skipRestore?: () => boolean },
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial)
  const restored = useRef(false)

  // Write effect is declared first so it does not overwrite storage with
  // `initial` on the mount pass (restored is still false then).
  useEffect(() => {
    if (!restored.current) return
    try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
  }, [key, value])

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (opts?.skipRestore?.()) return
    try {
      const raw = sessionStorage.getItem(key)
      if (raw !== null) setValue(JSON.parse(raw) as T)
    } catch { /* ignore corrupt / unavailable storage */ }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue]
}
