'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function StripeRefreshPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string

  useEffect(() => {
    // Redirect back to stripe page to retry
    router.push(`/${vertical}/vendor/dashboard/stripe`)
  }, [router, vertical])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8f9fa'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 40,
          height: 40,
          border: '4px solid #e0e0e0',
          borderTop: '4px solid #333',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 15px'
        }} />
        <p>Redirecting...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
