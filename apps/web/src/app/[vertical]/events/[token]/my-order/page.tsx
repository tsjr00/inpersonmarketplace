'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'

interface OrderData {
  event: {
    company_name: string
    event_date: string
    event_start_time: string | null
    event_end_time: string | null
    address: string | null
    city: string
    state: string
    vertical_id: string
  }
  order: {
    id: string
    order_number: string
    status: string
    payment_model: string | null
    created_at: string
  }
  wave: {
    wave_number: number
    start_time: string
    end_time: string
  } | null
  items: Array<{
    id: string
    title: string
    image_url: string | null
    vendor_name: string
    quantity: number
    status: string
  }>
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function MyEventOrderPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const token = params.token as string
  const accent = vertical === 'food_trucks' ? '#ff5757' : '#2d5016'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<OrderData | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const qrGenerated = useRef(false)

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/events/${token}/my-order`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: '' }))
          if (res.status === 401) {
            setError('sign_in')
          } else {
            setError(err.error || 'Unable to find your order')
          }
          return
        }
        const orderData = await res.json()
        setData(orderData)
      } catch {
        setError('Connection error. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    fetchOrder()
  }, [token])

  // Generate QR code when order data loads
  useEffect(() => {
    if (!data?.order?.id || qrGenerated.current) return
    qrGenerated.current = true
    QRCode.toDataURL(data.order.id, {
      width: 280,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then(setQrDataUrl).catch(() => { /* QR generation failed — order number still visible */ })
  }, [data?.order?.id])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: statusColors.neutral500 }}>Loading your order...</p>
      </div>
    )
  }

  if (error === 'sign_in') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: spacing.lg, maxWidth: 400 }}>
          <h2 style={{ color: statusColors.neutral800, margin: `0 0 ${spacing.sm}` }}>Sign in to view your order</h2>
          <p style={{ color: statusColors.neutral500, margin: `0 0 ${spacing.md}`, fontSize: typography.sizes.sm }}>
            You need to be signed in with the same account you used to place your order.
          </p>
          <Link
            href={`/${vertical}/login?redirect=/${vertical}/events/${token}/my-order`}
            style={{
              display: 'inline-block',
              padding: `${spacing.xs} ${spacing.lg}`,
              backgroundColor: accent,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.md,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.sm,
            }}
          >
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: spacing.lg }}>
          <h2 style={{ color: statusColors.neutral700 }}>Order Not Found</h2>
          <p style={{ color: statusColors.neutral500, fontSize: typography.sizes.sm }}>{error}</p>
        </div>
      </div>
    )
  }

  const { event, order, wave, items } = data
  const isCompanyPaid = order.payment_model === 'company_paid'

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 440, margin: '0 auto', padding: `${spacing.lg} ${spacing.md}` }}>

        {/* Event Header */}
        <div style={{
          textAlign: 'center',
          padding: `${spacing.sm} 0`,
          borderBottom: `2px solid ${accent}`,
          marginBottom: spacing.lg,
        }}>
          <h1 style={{
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.bold,
            color: accent,
            margin: 0,
          }}>
            {event.company_name}
          </h1>
          <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: `${spacing['3xs']} 0 0` }}>
            {fmtDate(event.event_date)}
          </p>
          {event.address && (
            <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `${spacing['3xs']} 0 0` }}>
              {event.address}, {event.city}, {event.state}
            </p>
          )}
        </div>

        {/* Pick-Ticket Number — BIG */}
        <div style={{
          textAlign: 'center',
          padding: spacing.md,
          backgroundColor: 'white',
          borderRadius: radius.lg,
          border: `2px solid ${accent}`,
          marginBottom: spacing.md,
        }}>
          <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `0 0 ${spacing.xs}`, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: typography.weights.semibold }}>
            Your Order Number
          </p>
          <div style={{
            fontSize: '2.5rem',
            fontWeight: typography.weights.bold,
            color: accent,
            letterSpacing: '0.05em',
            lineHeight: 1,
            marginBottom: spacing.sm,
          }}>
            {order.order_number}
          </div>
          <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: 0 }}>
            Show this to pick up your order
          </p>
        </div>

        {/* QR Code */}
        {qrDataUrl && (
          <div style={{
            textAlign: 'center',
            padding: spacing.md,
            backgroundColor: 'white',
            borderRadius: radius.lg,
            border: `1px solid ${statusColors.neutral200}`,
            marginBottom: spacing.md,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt={`QR code for order ${order.order_number}`}
              style={{ width: 200, height: 200, margin: '0 auto', display: 'block' }}
            />
            <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral400, margin: `${spacing.xs} 0 0` }}>
              Vendor scans this for faster pickup
            </p>
          </div>
        )}

        {/* Wave Info */}
        {wave && (
          <div style={{
            padding: spacing.sm,
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: radius.md,
            marginBottom: spacing.md,
            textAlign: 'center',
          }}>
            <p style={{ fontSize: typography.sizes.xs, color: '#166534', fontWeight: typography.weights.semibold, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Your Time Slot
            </p>
            <p style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: statusColors.neutral800, margin: `${spacing['3xs']} 0 0` }}>
              Wave {wave.wave_number}: {formatTime(wave.start_time)} &ndash; {formatTime(wave.end_time)}
            </p>
          </div>
        )}

        {/* Order Items */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: radius.lg,
          border: `1px solid ${statusColors.neutral200}`,
          overflow: 'hidden',
          marginBottom: spacing.md,
        }}>
          <div style={{
            padding: `${spacing.xs} ${spacing.sm}`,
            backgroundColor: statusColors.neutral50,
            borderBottom: `1px solid ${statusColors.neutral200}`,
          }}>
            <p style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral600, margin: 0, textTransform: 'uppercase' }}>
              {isCompanyPaid ? 'Your Selection' : 'Order Details'}
            </p>
          </div>
          {items.map(item => (
            <div key={item.id} style={{
              padding: spacing.sm,
              borderBottom: `1px solid ${statusColors.neutral100}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.neutral800 }}>
                  {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.title}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, marginTop: 1 }}>
                  from {item.vendor_name}
                </div>
              </div>
              <span style={{
                fontSize: typography.sizes.xs,
                padding: `2px ${spacing.xs}`,
                borderRadius: radius.sm,
                backgroundColor: item.status === 'fulfilled' ? '#dcfce7' : item.status === 'confirmed' ? '#dbeafe' : statusColors.neutral100,
                color: item.status === 'fulfilled' ? '#166534' : item.status === 'confirmed' ? '#1e40af' : statusColors.neutral600,
                fontWeight: typography.weights.medium,
              }}>
                {item.status === 'fulfilled' ? 'Picked Up' : item.status === 'confirmed' ? 'Ready' : item.status}
              </span>
            </div>
          ))}
        </div>

        {/* Status footer */}
        <p style={{ textAlign: 'center', fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
          {isCompanyPaid
            ? 'This order is covered by your event organizer. No payment required.'
            : `Order placed ${new Date(order.created_at).toLocaleDateString()}`
          }
        </p>
      </div>
    </div>
  )
}
