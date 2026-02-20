'use client'
import { useState } from 'react'
import Image from 'next/image'

interface Props {
  currentImageUrl?: string | null
  onUploadSuccess?: (url: string) => void
}

export default function ProfileImageUpload({ currentImageUrl, onUploadSuccess }: Props) {
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(currentImageUrl || '')
  const [error, setError] = useState('')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate
    const validProfileTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validProfileTypes.includes(file.type)) {
      setError('Please select a JPG, PNG, GIF, or WebP image')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB. Use squoosh.app to compress.')
      return
    }

    setError('')
    setUploading(true)

    try {
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string)
      }
      reader.readAsDataURL(file)

      // Upload
      const formData = new FormData()
      formData.append('image', file)

      const res = await fetch('/api/vendor/profile-image', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await res.json()
      setPreviewUrl(data.imageUrl)
      onUploadSuccess?.(data.imageUrl)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upload image'
      setError(message)
      setPreviewUrl(currentImageUrl || '')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: 12, fontWeight: 600, fontSize: 14 }}>
        Profile Image / Logo
      </label>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Preview */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 12,
            backgroundColor: '#f3f4f6',
            border: '2px dashed #d1d5db',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="Profile"
              fill
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: 40, opacity: 0.3 }}>📷</span>
          )}
        </div>

        {/* Upload controls */}
        <div style={{ flex: 1 }}>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
            id="profile-image-upload"
            style={{ display: 'none' }}
          />
          <label
            htmlFor="profile-image-upload"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1
            }}
          >
            {uploading ? 'Uploading...' : 'Choose Image'}
          </label>

          <p style={{
            margin: '8px 0 0',
            fontSize: 12,
            color: '#6b7280'
          }}>
            PNG, JPG, or WebP. Max 2MB. Square images work best.
          </p>
          <p style={{
            margin: '4px 0 0',
            fontSize: 11,
            color: '#9ca3af'
          }}>
            Large image? Compress it free at <a href="https://squoosh.app" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>squoosh.app</a>
          </p>

          {error && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#ef4444' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
