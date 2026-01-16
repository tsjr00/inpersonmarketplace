import Image from 'next/image'
import { VendorTierType } from '@/lib/constants'

interface Props {
  imageUrl?: string | null
  name: string
  size?: number
  tier?: VendorTierType
}

export default function VendorAvatar({ imageUrl, name, size = 48, tier }: Props) {
  // Get initials
  const initials = name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Border color based on tier
  const borderColor = tier === 'premium' ? '#3b82f6' :
                      tier === 'featured' ? '#f59e0b' : '#d1d5db'

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: imageUrl ? 'transparent' : '#3b82f6',
        border: `3px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 700,
        color: 'white',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0
      }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          style={{ objectFit: 'cover' }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  )
}
