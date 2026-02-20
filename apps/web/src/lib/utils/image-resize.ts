/**
 * Client-side image resize utility
 * Resizes images before upload for fast uploads and consistent display
 */

export interface ResizeOptions {
  maxDimension?: number  // Max width or height (default 1200)
  quality?: number       // JPEG quality 0-1 (default 0.8)
  outputType?: 'image/jpeg' | 'image/webp'  // Output format (default jpeg)
}

const DEFAULT_OPTIONS: Required<ResizeOptions> = {
  maxDimension: 1200,
  quality: 0.8,
  outputType: 'image/jpeg'
}

/**
 * Resize an image file to specified max dimension while maintaining aspect ratio
 * Returns a new File object with the resized image
 */
export async function resizeImage(
  file: File,
  options: ResizeOptions = {}
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Create image element to load the file
  const img = await loadImage(file)

  // Calculate new dimensions
  const { width, height } = calculateDimensions(
    img.naturalWidth,
    img.naturalHeight,
    opts.maxDimension
  )

  // If image is already small enough, just convert to JPEG for consistency
  const needsResize = img.naturalWidth > opts.maxDimension || img.naturalHeight > opts.maxDimension
  const finalWidth = needsResize ? width : img.naturalWidth
  const finalHeight = needsResize ? height : img.naturalHeight

  // Create canvas and draw resized image
  const canvas = document.createElement('canvas')
  canvas.width = finalWidth
  canvas.height = finalHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Draw the image
  ctx.drawImage(img, 0, 0, finalWidth, finalHeight)

  // Convert to blob
  const blob = await canvasToBlob(canvas, opts.outputType, opts.quality)

  // Create new File with original name but .jpg extension
  const extension = opts.outputType === 'image/webp' ? '.webp' : '.jpg'
  const newName = file.name.replace(/\.[^.]+$/, '') + extension

  return new File([blob], newName, { type: opts.outputType })
}

/**
 * Load a File as an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Revoke object URL to free memory
      URL.revokeObjectURL(img.src)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('Failed to load image'))
    }
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Calculate new dimensions maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number
): { width: number; height: number } {
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight }
  }

  const aspectRatio = originalWidth / originalHeight

  if (originalWidth > originalHeight) {
    // Landscape
    return {
      width: maxDimension,
      height: Math.round(maxDimension / aspectRatio)
    }
  } else {
    // Portrait or square
    return {
      width: Math.round(maxDimension * aspectRatio),
      height: maxDimension
    }
  }
}

/**
 * Convert canvas to Blob
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to convert canvas to blob'))
        }
      },
      type,
      quality
    )
  })
}

/**
 * Validate that a file is an acceptable image type
 */
export function isValidImageType(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  return validTypes.includes(file.type)
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
