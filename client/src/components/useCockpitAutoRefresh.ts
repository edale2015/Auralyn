import { useEffect, useRef, useState } from "react"

export function useCockpitAutoRefresh(
  refetchFn: () => void,
  intervalMs = 5000,
  enabled = true
) {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      refetchFn()
      setLastRefreshedAt(new Date())
    }, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, intervalMs])

  const refresh = () => {
    refetchFn()
    setLastRefreshedAt(new Date())
  }

  return { lastRefreshedAt, refresh }
}
