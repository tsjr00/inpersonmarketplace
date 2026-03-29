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
      const errorBody = await response.text()
      console.error('[image-moderation] Google Vision API error:', response.status, errorBody)
      // Notify admin that image moderation is failing
      await notifyModerationFailure(`Google Vision API returned ${response.status}: ${errorBody.slice(0, 200)}`)
      return { passed: true, reason: null, scores: null }
    }

    const data = await response.json()
    const annotation: SafeSearchAnnotation | undefined = data.responses?.[0]?.safeSearchAnnotation

    if (!annotation) {
      console.warn('[image-moderation] No SafeSearch annotation returned')
      await notifyModerationFailure('Google Vision API returned no SafeSearch annotation — response may be malformed')
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
    await notifyModerationFailure(`Network/parse error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return { passed: true, reason: null, scores: null }
  }
}

// Track consecutive failures to avoid spamming admin
let _failureCount = 0
let _lastNotifiedAt = 0

/**
 * Notify admin when image moderation fails.
 * Rate-limited: only sends once per 30 minutes to avoid spam during outages.
 */
async function notifyModerationFailure(details: string): Promise<void> {
  _failureCount++
  const now = Date.now()
  const thirtyMinutes = 30 * 60 * 1000

  // Only notify once per 30 minutes
  if (now - _lastNotifiedAt < thirtyMinutes) {
    return
  }
  _lastNotifiedAt = now

  try {
    // Send email to admin alert address
    const alertEmail = process.env.ADMIN_ALERT_EMAIL
    if (!alertEmail) return

    const { Resend } = await import('resend')
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return

    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: 'updates@mail.farmersmarketing.app',
      to: alertEmail,
      subject: `[ALERT] Image moderation is failing (${_failureCount} failures)`,
      html: `
        <h3>Image Moderation Alert</h3>
        <p><strong>Status:</strong> Image moderation is not working. Uploads are passing through unscreened.</p>
        <p><strong>Failures since last alert:</strong> ${_failureCount}</p>
        <p><strong>Latest error:</strong> ${details}</p>
        <p><strong>Action needed:</strong> Check the Google Cloud Vision API key and billing status at
        <a href="https://console.cloud.google.com">console.cloud.google.com</a>.</p>
        <p style="color: #666; font-size: 12px;">This alert is rate-limited to once per 30 minutes.</p>
      `,
    })
    _failureCount = 0 // Reset after successful notification
  } catch {
    // If we can't even send the alert, just log it
    console.error('[image-moderation] Failed to send admin alert for moderation failure')
  }
}

/**
 * Check a Supabase Storage URL for inappropriate content.
 * Convenience wrapper for images already uploaded to storage.
 */
export async function moderateStorageImage(publicUrl: string): Promise<ModerationResult> {
  return moderateImage({ url: publicUrl })
}
