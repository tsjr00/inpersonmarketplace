'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface BackLinkProps {
  fallbackHref: string
  fallbackLabel?: string
  style?: React.CSSProperties
}

export default function BackLink({
  fallbackHref,
  fallbackLabel = 'Back',
  style
}: BackLinkProps) {
  const router = useRouter()

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()

    // Check if we have history to go back to
    // window.history.length > 1 means there's somewhere to go back
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <Link
      href={fallbackHref}
      onClick={handleClick}
      style={{
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 44,
        padding: '8px 0',
        ...style
      }}
    >
      ← {fallbackLabel}
    </Link>
  )
}
