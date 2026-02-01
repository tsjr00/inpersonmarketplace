/**
 * Marketing - Social Media Sharing Utilities
 *
 * This module handles social media sharing functionality.
 * Kept separate from order processing code as per architectural guidelines.
 */

export type SharePlatform = 'facebook' | 'twitter' | 'copy' | 'native'

export interface ShareData {
  url: string
  title: string
  text?: string
}

/**
 * Get the share URL for a specific platform
 */
export function getShareUrl(platform: SharePlatform, data: ShareData): string | null {
  const encodedUrl = encodeURIComponent(data.url)
  const encodedTitle = encodeURIComponent(data.title)
  const encodedText = encodeURIComponent(data.text || data.title)

  switch (platform) {
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`

    case 'twitter':
      return `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`

    case 'copy':
    case 'native':
      return null // Handled differently

    default:
      return null
  }
}

/**
 * Check if native Web Share API is available
 */
export function canUseNativeShare(): boolean {
  return typeof navigator !== 'undefined' && 'share' in navigator
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textArea)
    return success
  } catch {
    return false
  }
}

/**
 * Share using native Web Share API
 */
export async function nativeShare(data: ShareData): Promise<boolean> {
  if (!canUseNativeShare()) {
    return false
  }

  try {
    await navigator.share({
      title: data.title,
      text: data.text || data.title,
      url: data.url
    })
    return true
  } catch (error) {
    // User cancelled or error
    if (error instanceof Error && error.name === 'AbortError') {
      return false // User cancelled, not an error
    }
    return false
  }
}

/**
 * Open share URL in a new popup window
 */
export function openSharePopup(url: string, platform: string): void {
  const width = 600
  const height = 400
  const left = (window.screen.width - width) / 2
  const top = (window.screen.height - height) / 2

  window.open(
    url,
    `share_${platform}`,
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
  )
}

/**
 * Build a shareable URL for different content types
 */
export function buildShareableUrl(
  baseUrl: string,
  vertical: string,
  contentType: 'vendor-profile' | 'listing' | 'market-box' | 'schedule',
  contentId: string
): string {
  const paths: Record<typeof contentType, string> = {
    'vendor-profile': `/${vertical}/vendor/${contentId}/profile`,
    'listing': `/${vertical}/listing/${contentId}`,
    'market-box': `/${vertical}/market-box/${contentId}`,
    'schedule': `/${vertical}/vendor/${contentId}/schedule`
  }

  return `${baseUrl}${paths[contentType]}`
}

/**
 * Platform display info
 */
export const SHARE_PLATFORMS = [
  {
    id: 'facebook' as const,
    name: 'Facebook',
    icon: 'facebook',
    color: '#1877F2'
  },
  {
    id: 'twitter' as const,
    name: 'X (Twitter)',
    icon: 'twitter',
    color: '#000000'
  },
  {
    id: 'copy' as const,
    name: 'Copy Link',
    icon: 'link',
    color: '#6B7280'
  }
] as const

/**
 * Get all available share platforms (includes native on mobile)
 */
export function getAvailablePlatforms(): typeof SHARE_PLATFORMS[number][] {
  const platforms = [...SHARE_PLATFORMS]
  return platforms
}
