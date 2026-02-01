'use client'

import { useState, useEffect } from 'react'
import ShareButton from '@/components/marketing/ShareButton'

interface ListingShareButtonProps {
  listingId: string
  listingTitle: string
  vertical: string
}

export default function ListingShareButton({ listingId, listingTitle, vertical }: ListingShareButtonProps) {
  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    // Construct URL on client side
    const baseUrl = `${window.location.protocol}//${window.location.host}`
    setShareUrl(`${baseUrl}/${vertical}/listing/${listingId}`)
  }, [listingId, vertical])

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
