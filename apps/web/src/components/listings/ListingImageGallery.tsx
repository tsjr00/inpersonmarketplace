'use client'

import { useState } from 'react'
import { colors, spacing, radius } from '@/lib/design-tokens'

interface ListingImage {
  id: string
  url: string
  is_primary: boolean
  display_order: number
}

interface ListingImageGalleryProps {
  images: ListingImage[]
  title: string
}

export default function ListingImageGallery({ images, title }: ListingImageGalleryProps) {
  // Sort images: primary first, then by display order
  const sortedImages = [...images].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1
    if (!a.is_primary && b.is_primary) return 1
    return a.display_order - b.display_order
  })

  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedImage = sortedImages[selectedIndex]

  if (sortedImages.length === 0) {
    // No images - show placeholder
    return (
      <div style={{
        aspectRatio: '1',
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.md,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        maxHeight: 500
      }}>
        <span style={{ fontSize: 80, color: colors.textMuted }}>📦</span>
      </div>
    )
  }

  return (
    <div>
      {/* Main Image */}
      <img
        src={selectedImage.url}
        alt={title}
        style={{
          width: '100%',
          aspectRatio: '1',
          objectFit: 'cover',
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
          maxHeight: 500
        }}
      />

      {/* Thumbnail Strip - only show if multiple images */}
      {sortedImages.length > 1 && (
        <div style={{
          display: 'flex',
          gap: spacing.xs,
          marginTop: spacing.xs,
          overflowX: 'auto'
        }}>
          {sortedImages.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setSelectedIndex(idx)}
              style={{
                padding: 0,
                border: idx === selectedIndex
                  ? `2px solid ${colors.primary}`
                  : `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                cursor: 'pointer',
                flexShrink: 0,
                background: 'none'
              }}
            >
              <img
                src={img.url}
                alt={`${title} - image ${idx + 1}`}
                style={{
                  width: 60,
                  height: 60,
                  objectFit: 'cover',
                  borderRadius: radius.sm,
                  display: 'block'
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
