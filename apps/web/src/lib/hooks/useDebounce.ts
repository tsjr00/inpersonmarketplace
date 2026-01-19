import { useState, useEffect } from 'react'

/**
 * Debounce a value - delays updating until user stops changing it
 * Great for search inputs to avoid querying on every keystroke
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default 300ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * Debounced callback - delays calling a function until user stops triggering it
 *
 * @param callback - The function to debounce
 * @param delay - Delay in milliseconds (default 300ms)
 * @returns A debounced version of the callback
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay = 300
): T {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null)

  const debouncedCallback = ((...args: unknown[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    const newTimeoutId = setTimeout(() => {
      callback(...args)
    }, delay)

    setTimeoutId(newTimeoutId)
  }) as T

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [timeoutId])

  return debouncedCallback
}
