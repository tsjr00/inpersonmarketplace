'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FullPageLoading } from '@/components/shared/Spinner'

export default function StripeRefreshPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string

  useEffect(() => {
    // Redirect back to stripe page to retry
    router.push(`/${vertical}/vendor/dashboard/stripe`)
  }, [router, vertical])

  return <FullPageLoading message="Redirecting..." />
}
