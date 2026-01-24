'use client'

import { useState, useRef, useCallback } from 'react'
import { resizeImage, isValidImageType, formatFileSize } from '@/lib/utils/image-resize'

export interface ListingImage {
  id: string
  url: string
  storage_path: string
  display_order: number
  is_primary: boolean
}

interface ListingImageUploadProps {
  listingId: string
  images: ListingImage[]
  onImagesChange: (images: ListingImage[]) => void
  maxImages?: number
  disabled?: boolean
}

interface UploadingImage {
  id: string
  file: File
  preview: string
  progress: number
  error?: string
}

export function ListingImageUpload({
  listingId,
  images,
  onImagesChange,
  maxImages = 5,
  disabled = false
}: ListingImageUploadProps) {
  const [uploading, setUploading] = useState<UploadingImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canAddMore = images.length + uploading.length < maxImages

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setError(null)
    const filesToProcess = Array.from(files).slice(0, maxImages - images.length - uploading.length)

    for (const file of filesToProcess) {
      // Validate file type
      if (!isValidImageType(file)) {
        setError(`${file.name} is not a valid image file`)
        continue
      }

      // Create temporary preview and upload tracking
      const tempId = crypto.randomUUID()
      const preview = URL.createObjectURL(file)

      setUploading(prev => [...prev, {
        id: tempId,
        file,
        preview,
        progress: 0
      }])

      // Process and upload
      try {
        // Resize image client-side
        setUploading(prev => prev.map(u =>
          u.id === tempId ? { ...u, progress: 20 } : u
        ))

        const resizedFile = await resizeImage(file, {
          maxDimension: 1200,
          quality: 0.8,
          outputType: 'image/jpeg'
        })

        setUploading(prev => prev.map(u =>
          u.id === tempId ? { ...u, progress: 50 } : u
        ))

        // Upload to server
        const formData = new FormData()
        formData.append('image', resizedFile)

        const response = await fetch(`/api/vendor/listings/${listingId}/images`, {
          method: 'POST',
          body: formData
        })

        setUploading(prev => prev.map(u =>
          u.id === tempId ? { ...u, progress: 90 } : u
        ))

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Upload failed')
        }

        const { image } = await response.json()

        // Add to images list
        onImagesChange([...images, image])

        // Remove from uploading
        setUploading(prev => prev.filter(u => u.id !== tempId))
        URL.revokeObjectURL(preview)

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed'
        setUploading(prev => prev.map(u =>
          u.id === tempId ? { ...u, error: message, progress: 0 } : u
        ))
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [listingId, images, uploading.length, maxImages, onImagesChange])

  const handleDelete = useCallback(async (imageId: string) => {
    try {
      const response = await fetch(`/api/vendor/listings/${listingId}/images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Delete failed')
      }

      // Remove from images list
      const newImages = images.filter(img => img.id !== imageId)

      // If we deleted the primary, make first one primary
      if (newImages.length > 0 && !newImages.some(img => img.is_primary)) {
        newImages[0].is_primary = true
      }

      onImagesChange(newImages)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed'
      setError(message)
    }
  }, [listingId, images, onImagesChange])

  const handleSetPrimary = useCallback(async (imageId: string) => {
    try {
      const response = await fetch(`/api/vendor/listings/${listingId}/images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId, is_primary: true })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Update failed')
      }

      // Update local state
      onImagesChange(images.map(img => ({
        ...img,
        is_primary: img.id === imageId
      })))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed'
      setError(message)
    }
  }, [listingId, images, onImagesChange])

  const removeUploadingItem = useCallback((tempId: string) => {
    setUploading(prev => {
      const item = prev.find(u => u.id === tempId)
      if (item) {
        URL.revokeObjectURL(item.preview)
      }
      return prev.filter(u => u.id !== tempId)
    })
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Product Images
        </label>
        <span className="text-sm text-gray-500">
          {images.length}/{maxImages}
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-800 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Image Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {/* Existing Images */}
        {images.map((image) => (
          <div
            key={image.id}
            className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group"
          >
            <img
              src={image.url}
              alt=""
              className="w-full h-full object-cover"
            />

            {/* Primary badge */}
            {image.is_primary && (
              <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-green-600 text-white text-xs rounded">
                Primary
              </div>
            )}

            {/* Hover overlay with actions */}
            {!disabled && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!image.is_primary && (
                  <button
                    onClick={() => handleSetPrimary(image.id)}
                    className="p-2 bg-white rounded-full hover:bg-gray-100"
                    title="Set as primary"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => handleDelete(image.id)}
                  className="p-2 bg-white rounded-full hover:bg-red-100 text-red-600"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Uploading Images */}
        {uploading.map((item) => (
          <div
            key={item.id}
            className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"
          >
            <img
              src={item.preview}
              alt=""
              className="w-full h-full object-cover opacity-50"
            />

            {item.error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50/90 p-2">
                <svg className="w-6 h-6 text-red-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs text-red-600 text-center">{item.error}</span>
                <button
                  onClick={() => removeUploadingItem(item.id)}
                  className="mt-1 text-xs text-red-800 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-4 border-green-200 border-t-green-600 animate-spin" />
              </div>
            )}
          </div>
        ))}

        {/* Add Button */}
        {canAddMore && !disabled && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-green-500 hover:bg-green-50 transition-colors flex flex-col items-center justify-center text-gray-400 hover:text-green-600"
          >
            <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="text-xs">Add Photo</span>
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || !canAddMore}
      />

      {/* Help text */}
      <p className="text-xs text-gray-500">
        Photos are automatically optimized for fast loading. The first image will be shown on your listing card.
      </p>
    </div>
  )
}
