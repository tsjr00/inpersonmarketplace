'use client'

import ShareButton from '@/components/marketing/ShareButton'

interface ListingShareButtonProps {
  listingId: string
  listingTitle: string
  vertical: string
}

export default function ListingShareButton({ listingId, listingTitle, vertical }: ListingShareButtonProps) {
  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : ''
  const shareUrl = `${baseUrl}/${vertical}/listing/${listingId}`

  if (!shareUrl) {
    return null
  }

  return (
    <ShareButton
      url={shareUrl}
      title={listingTitle}
      text={`Check out ${listingTitle}!`}
      variant="action"
    />
  )
}
