'use client'

import { useState } from 'react'
import Image from 'next/image'
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
        maxHeight: 400
      }}>
        <span style={{ fontSize: 80, color: colors.textMuted }}>📦</span>
      </div>
    )
  }

  return (
    <div>
      {/* Main Image - using next/image with fill for responsive sizing */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        maxHeight: 400,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: colors.surfaceMuted,
      }}>
        <Image
          src={selectedImage.url}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 500px"
          style={{ objectFit: 'cover' }}
          priority={selectedIndex === 0}
        />
      </div>

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
                background: 'none',
                position: 'relative',
                width: 60,
                height: 60,
                overflow: 'hidden',
              }}
            >
              <Image
                src={img.url}
                alt={`${title} - image ${idx + 1}`}
                width={60}
                height={60}
                sizes="60px"
                style={{
                  objectFit: 'cover',
                  borderRadius: radius.sm,
                  display: 'block'
                }}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
