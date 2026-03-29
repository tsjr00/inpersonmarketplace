/**
 * Image content moderation using Google Cloud Vision SafeSearch.
 *
 * Checks uploaded images for adult, violence, and racy content.
 * Call after image resize but before saving URL to database.
 *
 * Requires: GOOGLE_CLOUD_VISION_API_KEY env var.
 * Free tier: 1,000 images/month.
 *
 * If API key is not set or API call fails, images pass through
 * (fail-open — don't block uploads when moderation is unavailable).
 */

type Likelihood = 'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY'

interface SafeSearchAnnotation {
  adult: Likelihood
  violence: Likelihood
  racy: Likelihood
  spoof: Likelihood
  medical: Likelihood
}

interface ModerationResult {
  passed: boolean
  reason: string | null
  scores: SafeSearchAnnotation | null
}

// These levels trigger rejection
const BLOCK_THRESHOLD: Likelihood[] = ['LIKELY', 'VERY_LIKELY']

/**
 * Check an image for inappropriate content.
 * Accepts either a public URL or base64-encoded image data.
 *
 * Returns { passed: true } if image is acceptable.
 * Returns { passed: false, reason: '...' } if image is flagged.
 *
 * Fail-open: returns passed=true if API key missing or API errors.
 */
export async function moderateImage(
  imageSource: { url: string } | { base64: string }
): Promise<ModerationResult> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY
  if (!apiKey) {
    // No API key — fail open, log warning
    console.warn('[image-moderation] GOOGLE_CLOUD_VISION_API_KEY not set — skipping image moderation')
    return { passed: true, reason: null, scores: null }
  }

  try {
    const image = 'url' in imageSource
      ? { source: { imageUri: imageSource.url } }
      : { content: imageSource.base64 }

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image,
            features: [{ type: 'SAFE_SEARCH_DETECTION' }],
          }],
        }),
      }
    )

    if (!response.ok) {
      console.error('[image-moderation] Google Vision API error:', response.status, await response.text())
      // API error — fail open
      return { passed: true, reason: null, scores: null }
    }

    const data = await response.json()
    const annotation: SafeSearchAnnotation | undefined = data.responses?.[0]?.safeSearchAnnotation

    if (!annotation) {
      console.warn('[image-moderation] No SafeSearch annotation returned')
      return { passed: true, reason: null, scores: null }
    }

    // Check adult content
    if (BLOCK_THRESHOLD.includes(annotation.adult)) {
      return {
        passed: false,
        reason: 'This image appears to contain adult content and cannot be uploaded. Please choose a different image.',
        scores: annotation,
      }
    }

    // Check violence
    if (BLOCK_THRESHOLD.includes(annotation.violence)) {
      return {
        passed: false,
        reason: 'This image appears to contain violent content and cannot be uploaded. Please choose a different image.',
        scores: annotation,
      }
    }

    // Racy content — allow POSSIBLE, block LIKELY/VERY_LIKELY
    // This is intentionally more lenient — food truck beach events, etc.
    if (annotation.racy === 'VERY_LIKELY') {
      return {
        passed: false,
        reason: 'This image has been flagged as inappropriate and cannot be uploaded. Please choose a different image.',
        scores: annotation,
      }
    }

    return { passed: true, reason: null, scores: annotation }
  } catch (error) {
    console.error('[image-moderation] Error checking image:', error)
    // Network/parse error — fail open
    return { passed: true, reason: null, scores: null }
  }
}

/**
 * Check a Supabase Storage URL for inappropriate content.
 * Convenience wrapper for images already uploaded to storage.
 */
export async function moderateStorageImage(publicUrl: string): Promise<ModerationResult> {
  return moderateImage({ url: publicUrl })
}
