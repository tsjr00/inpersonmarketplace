'use client'

import { useState, useEffect, useCallback } from 'react'

interface UseLocationAreaNameOptions {
  // Skip fetching if false
  enabled?: boolean
  // Timeout before giving up (ms)
  timeout?: number
}

interface UseLocationAreaNameResult {
  areaName: string | null
  isLoading: boolean
  error: string | null
  // Time taken to get the area name (ms)
  loadTime: number | null
}

const SESSION_STORAGE_KEY = 'userAreaName'
const SESSION_STORAGE_COORDS_KEY = 'userAreaCoords'

export function useLocationAreaName(
  options: UseLocationAreaNameOptions = {}
): UseLocationAreaNameResult {
  const { enabled = true, timeout = 10000 } = options

  const [areaName, setAreaName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadTime, setLoadTime] = useState<number | null>(null)

  const fetchAreaName = useCallback(async () => {
    if (!enabled) return

    const startTime = Date.now()
    setIsLoading(true)
    setError(null)

    try {
      // Check session storage first for cached result
      if (typeof window !== 'undefined') {
        const cached = sessionStorage.getItem(SESSION_STORAGE_KEY)
        const cachedCoords = sessionStorage.getItem(SESSION_STORAGE_COORDS_KEY)
        if (cached && cachedCoords) {
          setAreaName(cached)
          setLoadTime(Date.now() - startTime)
          setIsLoading(false)
          return
        }
      }

      // Check if geolocation is available
      if (!navigator.geolocation) {
        setError('Geolocation not supported')
        setIsLoading(false)
        return
      }

      // Get current position with timeout
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Location timeout'))
        }, timeout)

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timeoutId)
            resolve(pos)
          },
          (err) => {
            clearTimeout(timeoutId)
            reject(err)
          },
          {
            enableHighAccuracy: false,
            timeout: timeout,
            maximumAge: 300000 // 5 minutes - reuse recent position
          }
        )
      })

      const { latitude, longitude } = position.coords

      // Fetch area name from reverse geocoding API
      const controller = new AbortController()
      const apiTimeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(
        `/api/buyer/location/reverse-geocode?lat=${latitude}&lng=${longitude}`,
        { signal: controller.signal }
      )

      clearTimeout(apiTimeoutId)

      if (!response.ok) {
        throw new Error('Failed to get area name')
      }

      const data = await response.json()

      if (data.areaName) {
        setAreaName(data.areaName)
        // Cache in session storage
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(SESSION_STORAGE_KEY, data.areaName)
          sessionStorage.setItem(SESSION_STORAGE_COORDS_KEY, `${latitude},${longitude}`)
        }
      }

      setLoadTime(Date.now() - startTime)
    } catch (err: unknown) {
      // Handle specific geolocation errors silently - these are expected on many devices
      if (err instanceof GeolocationPositionError) {
        // User denied or location unavailable - not an error state, just no data
      } else if (err instanceof Error && err.name === 'AbortError') {
        // Location request aborted — expected during cleanup
      } else if (err instanceof Error && err.message === 'Location timeout') {
        // Timeout is common on slow connections, don't treat as error
      } else {
        console.error('Error getting area name:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoadTime(Date.now() - startTime)
    } finally {
      setIsLoading(false)
    }
  }, [enabled, timeout])

  useEffect(() => {
    fetchAreaName()
  }, [fetchAreaName])

  return { areaName, isLoading, error, loadTime }
}
