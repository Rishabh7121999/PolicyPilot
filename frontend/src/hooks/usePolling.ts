import { useEffect, useRef } from 'react'

export function usePolling(callback: () => void, intervalMs: number, active: boolean): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!active) return

    const id = setInterval(() => callbackRef.current(), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, active])
}
