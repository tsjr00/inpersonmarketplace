'use client'

import { useState, useRef, useCallback } from 'react'
import { resizeImage, isValidImageType } from '@/lib/utils/image-resize'

interface MarketBoxImageUploadProps {
  imageUrl: string | null
  onImageChange: (url: string | null) => void
  disabled?: boolean
}

export function MarketBoxImageUpload({
  imageUrl,
  onImageChange,
  disabled = false
}: MarketBoxImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // Validate file type
    if (!isValidImageType(file)) {
      setError('Please select a valid image file (JPEG, PNG, WebP)')
      return
    }

    try {
      setUploading(true)

      // Create preview
      const previewUrl = URL.createObjectURL(file)
      setPreview(previewUrl)

      // Resize image client-side
      const resizedFile = await resizeImage(file, {
        maxDimension: 1200,
        quality: 0.8,
        outputType: 'image/jpeg'
      })

      // Upload to server
      const formData = new FormData()
      formData.append('image', resizedFile)

      const response = await fetch('/api/vendor/market-box-image', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      const { imageUrl: newUrl } = await response.json()
      onImageChange(newUrl)

      // Clean up preview
      URL.revokeObjectURL(previewUrl)
      setPreview(null)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      if (preview) {
        URL.revokeObjectURL(preview)
        setPreview(null)
      }
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [onImageChange, preview])

  const handleRemove = useCallback(() => {
    onImageChange(null)
  }, [onImageChange])

  const displayUrl = preview || imageUrl

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
        Box Image
      </label>

      {error && (
        <div style={{
          padding: 12,
          marginBottom: 12,
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 6,
          color: '#dc2626',
          fontSize: 14
        }}>
          {error}
        </div>
      )}

      {displayUrl ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={displayUrl}
            alt="Market box"
            style={{
              width: 200,
              height: 200,
              objectFit: 'cover',
              borderRadius: 8,
              border: '1px solid #e5e7eb'
            }}
          />
          {uploading && (
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                width: 40,
                height: 40,
                border: '3px solid #e5e7eb',
                borderTopColor: '#22c55e',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            </div>
          )}
          {!uploading && !disabled && (
            <button
              type="button"
              onClick={handleRemove}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16
              }}
              title="Remove image"
            >
              ×
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          style={{
            width: 200,
            height: 200,
            border: '2px dashed #d1d5db',
            borderRadius: 8,
            backgroundColor: '#f9fafb',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#6b7280',
            transition: 'border-color 0.2s, background-color 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.borderColor = '#22c55e'
              e.currentTarget.style.backgroundColor = '#f0fdf4'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#d1d5db'
            e.currentTarget.style.backgroundColor = '#f9fafb'
          }}
        >
          <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span style={{ fontSize: 14 }}>Add Photo</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        disabled={disabled || uploading}
      />

      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
        Photo will be automatically optimized for fast loading.
      </p>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
