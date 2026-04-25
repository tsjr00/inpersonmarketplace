'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { getMapsUrl } from '@/lib/utils/maps-link'
import { colors } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface Pickup {
  id: string
  week_number: number
  scheduled_date: string
  status: string
  ready_at: string | null
  picked_up_at: string | null
  missed_at: string | null
  rescheduled_to: string | null
  is_extension?: boolean
  skipped_by_vendor_at?: string | null
  skip_reason?: string | null
  buyer_confirmed_at: string | null
  vendor_confirmed_at: string | null
  confirmation_window_expires_at: string | null
}

interface Subscription {
  id: string
  start_date: string
  status: string
  weeks_completed: number
  term_weeks?: number
  extended_weeks?: number
  total_weeks?: number
  pickup_frequency?: string
  pickup_count?: number
  total_paid_cents: number
  buyer_paid_cents?: number
  created_at: string
  offering: {
    id: string
    name: string
    description: string | null
    price_cents: number
    pickup_day_of_week: number
    pickup_start_time: string
    pickup_end_time: string
    market: {
      id: string
      name: string
      address: string
      city: string
      state: string
    } | null
    vendor: {
      id: string
      name: string
    }
  }
  pickups?: Pickup[]
}

export default function BuyerSubscriptionDetailPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const subscriptionId = params.id as string
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const locale = getClientLocale()

  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [confirmingPickup, setConfirmingPickup] = useState<string | null>(null)
  const [waitingForVendor, setWaitingForVendor] = useState<string | null>(null)
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null)

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await fetch(`/api/buyer/market-boxes/${subscriptionId}`)
      const data = await res.json()

      if (!res.ok) {
        setError({
          message: data.error || 'Failed to fetch subscription',
          code: data.code,
          traceId: data.traceId
        })
        return
      }

      // API returns separate objects - combine into expected structure
      setSubscription({
        ...data.subscription,
        offering: {
          ...data.offering,
          vendor: data.vendor,
          market: data.market,
        },
        pickups: data.pickups,
      })
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to load subscription' })
    } finally {
      setLoading(false)
    }
  }, [subscriptionId])

  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  // Poll for pickup completion when waiting for vendor
  useEffect(() => {
    if (!waitingForVendor) return
    const interval = setInterval(() => {
      fetchSubscription().then(() => {
        // Check if the pickup we're waiting on is now complete
        const pickup = subscription?.pickups?.find(p => p.id === waitingForVendor)
        if (pickup?.status === 'picked_up') {
          setWaitingForVendor(null)
          setConfirmMessage(t('sub_detail.both_confirmed', locale))
          setTimeout(() => setConfirmMessage(null), 5000)
        }
      })
    }, 3000)
    // Stop polling after 35 seconds (window is 30s + buffer)
    const timeout = setTimeout(() => {
      setWaitingForVendor(null)
      clearInterval(interval)
    }, 35000)
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [waitingForVendor, fetchSubscription, subscription?.pickups])

  const handleConfirmPickup = async (pickupId: string) => {
    setConfirmingPickup(pickupId)
    setConfirmMessage(null)
    try {
      const res = await fetch(`/api/buyer/market-boxes/${subscriptionId}/confirm-pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickup_id: pickupId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setConfirmMessage(data.error || 'Failed to confirm pickup')
        return
      }

      if (data.completed) {
        setConfirmMessage(t('sub_detail.both_confirmed', locale))
        fetchSubscription()
        setTimeout(() => setConfirmMessage(null), 5000)
      } else {
        setConfirmMessage(t('sub_detail.waiting_30s', locale))
        setWaitingForVendor(pickupId)
      }
    } catch (err) {
      setConfirmMessage(err instanceof Error ? err.message : 'Failed to confirm')
    } finally {
      setConfirmingPickup(null)
    }
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US'

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(dateLocale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(dateLocale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return { bg: '#dcfce7', text: '#166534' }
      case 'completed': return { bg: '#e0e7ff', text: '#3730a3' }
      case 'cancelled': return { bg: '#fee2e2', text: '#991b1b' }
      default: return { bg: '#f3f4f6', text: '#374151' }
    }
  }

  const getPickupStatusColor = (status: string, loc: string) => {
    switch (status) {
      case 'scheduled': return { bg: '#f3f4f6', text: '#374151', label: t('sub_detail.status_scheduled', loc) }
      case 'ready': return { bg: '#fef3c7', text: '#92400e', label: t('sub_detail.status_ready', loc) }
      case 'picked_up': return { bg: '#dcfce7', text: '#166534', label: t('sub_detail.status_picked_up', loc) }
      case 'missed': return { bg: '#fee2e2', text: '#991b1b', label: t('sub_detail.status_missed', loc) }
      case 'skipped': return { bg: '#fee2e2', text: '#991b1b', label: t('sub_detail.status_skipped', loc) }
      case 'rescheduled': return { bg: '#f3e8ff', text: '#6b21a8', label: t('sub_detail.status_rescheduled', loc) }
      default: return { bg: '#f3f4f6', text: '#374151', label: status }
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', paddingTop: 100 }}>
          {t('subs.loading', locale)}
        </div>
      </div>
    )
  }

  if (error || !subscription || !subscription.offering) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {error ? (
            <ErrorDisplay error={error} verticalId={vertical} />
          ) : (
            <div style={{
              padding: 24,
              backgroundColor: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#991b1b',
              textAlign: 'center'
            }}>
              {subscription && !subscription.offering
                ? t('sub_detail.data_incomplete', locale)
                : t('sub_detail.not_found', locale)}
            </div>
          )}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link href={`/${vertical}/buyer/subscriptions`} style={{ color: branding.colors.primary }}>
              {t('sub_detail.back', locale)}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const statusColor = getStatusColor(subscription.status)
  const today = new Date().toISOString().split('T')[0]
  const nextPickup = (subscription.pickups || []).find(
    p => p.scheduled_date >= today && (p.status === 'scheduled' || p.status === 'ready')
  )
  const termWeeks = subscription.term_weeks || 4
  const totalWeeks = subscription.total_weeks || (termWeeks + (subscription.extended_weeks || 0))
  // Buyer-facing prices include buyer fees. Falls back to total_paid_cents
  // (food subtotal) if buyer_paid_cents isn't returned by the API.
  const buyerPaidCents = subscription.buyer_paid_cents ?? subscription.total_paid_cents
  const pickupCount = subscription.pickup_count || (subscription.pickups?.length ?? totalWeeks)
  const isBiweekly = subscription.pickup_frequency === 'biweekly'

  return (
    <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href={`/${vertical}/buyer/subscriptions`}
            style={{ color: branding.colors.primary, textDecoration: 'none', fontSize: 14 }}
          >
            {t('sub_detail.back', locale)}
          </Link>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 16, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ color: branding.colors.primary, margin: 0, fontSize: 28 }}>
                  {subscription.offering.name}
                </h1>
                {isBiweekly && (
                  <span style={{
                    padding: '4px 12px',
                    backgroundColor: '#fce7f3',
                    color: '#9d174d',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>
                    {t('mbd.cadence_biweekly', locale)}
                  </span>
                )}
                <span style={{
                  padding: '4px 12px',
                  backgroundColor: statusColor.bg,
                  color: statusColor.text,
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase'
                }}>
                  {subscription.status}
                </span>
              </div>
              <p style={{ color: '#666', margin: '8px 0 0 0', fontSize: 14 }}>
                {t('subs.by_vendor', locale, { name: subscription.offering.vendor?.name || 'Vendor' })}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: branding.colors.primary }}>
                {formatPrice(buyerPaidCents)}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {t('subs.pickups_progress', locale, { completed: String(subscription.weeks_completed), total: String(pickupCount) })}
              </div>
            </div>
          </div>
        </div>

        {/* Next Pickup Banner */}
        {nextPickup && (
          <div style={{
            padding: 20,
            marginBottom: 24,
            backgroundColor: nextPickup.status === 'ready' ? '#fef3c7' : '#eff6ff',
            border: `1px solid ${nextPickup.status === 'ready' ? '#fcd34d' : '#bfdbfe'}`,
            borderRadius: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: nextPickup.status === 'ready' ? '#92400e' : '#1e40af', marginBottom: 4 }}>
                  {nextPickup.status === 'ready' ? t('sub_detail.ready_for_pickup', locale) : t('sub_detail.next_pickup', locale)}
                </div>
                <div style={{ fontWeight: 600, color: nextPickup.status === 'ready' ? '#92400e' : '#1e40af', fontSize: 20 }}>
                  {formatDate(nextPickup.scheduled_date)}
                </div>
                <div style={{ fontSize: 14, color: nextPickup.status === 'ready' ? '#b45309' : '#3b82f6', marginTop: 4 }}>
                  {subscription.offering.pickup_start_time === subscription.offering.pickup_end_time
                    ? t('sub_detail.pickup_at', locale, { time: formatTime(subscription.offering.pickup_start_time) })
                    : `${formatTime(subscription.offering.pickup_start_time)} - ${formatTime(subscription.offering.pickup_end_time)}`}
                </div>
              </div>
              <div style={{
                padding: '8px 16px',
                backgroundColor: 'white',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: '#374151'
              }}>
                {t('sub_detail.week_of', locale, { current: String(nextPickup.week_number), total: String(totalWeeks) })}
              </div>
            </div>
          </div>
        )}

        {/* Pickup Location */}
        {subscription.offering.market && (
          <div style={{
            padding: 20,
            marginBottom: 24,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: 16 }}>{t('sub_detail.pickup_location', locale)}</h3>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              {subscription.offering.market.name}
            </div>
            <a
              href={getMapsUrl(subscription.offering.market.address, subscription.offering.market.city, subscription.offering.market.state)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', fontSize: 14, color: '#6b7280', textDecoration: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
            >
              {subscription.offering.market.address}
              <br />
              {subscription.offering.market.city}, {subscription.offering.market.state}
            </a>
            <div style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>
              {t('sub_detail.every_day', locale, { day: t('day.' + subscription.offering.pickup_day_of_week, locale) })}, {subscription.offering.pickup_start_time === subscription.offering.pickup_end_time
                ? t('sub_detail.pickup_at', locale, { time: formatTime(subscription.offering.pickup_start_time) })
                : `${formatTime(subscription.offering.pickup_start_time)} - ${formatTime(subscription.offering.pickup_end_time)}`}
            </div>
          </div>
        )}

        {/* Confirmation message */}
        {confirmMessage && (
          <div style={{
            padding: '12px 16px',
            marginBottom: 16,
            backgroundColor: confirmMessage.includes('both parties') ? colors.primaryLight : confirmMessage.includes('Waiting') ? '#fef3c7' : '#fee2e2',
            border: `1px solid ${confirmMessage.includes('both parties') ? colors.primary : confirmMessage.includes('Waiting') ? '#fcd34d' : '#fecaca'}`,
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            color: confirmMessage.includes('both parties') ? colors.primaryDark : confirmMessage.includes('Waiting') ? '#92400e' : '#991b1b',
          }}>
            {confirmMessage}
          </div>
        )}

        {/* Pickup Schedule */}
        <div style={{
          padding: 20,
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 8
        }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: 16 }}>{t('sub_detail.pickup_schedule', locale)}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(subscription.pickups || []).map(pickup => {
              const pickupStatus = getPickupStatusColor(pickup.status, locale)
              const isToday = pickup.scheduled_date === today
              const isPast = pickup.scheduled_date < today
              // Extension weeks get green tint, skipped weeks get red tint
              const rowBg = pickup.is_extension
                ? colors.primaryLight
                : pickup.status === 'skipped'
                  ? '#fef2f2'
                  : pickupStatus.bg

              return (
                <div
                  key={pickup.id}
                  style={{
                    padding: 16,
                    backgroundColor: rowBg,
                    border: isToday ? `2px solid ${branding.colors.primary}` : pickup.is_extension ? `1px solid ${colors.primary}` : pickup.status === 'skipped' ? '1px solid #fecaca' : '1px solid transparent',
                    borderRadius: 8,
                    opacity: pickup.status === 'missed' ? 0.7 : 1
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, color: pickupStatus.text }}>
                          {t('subs.week', locale, { number: String(pickup.week_number) })}
                        </span>
                        {pickup.is_extension && (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: colors.primaryLight,
                            color: colors.primaryDark,
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600
                          }}>
                            {t('subs.extension', locale)}
                          </span>
                        )}
                        {isToday && (
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: branding.colors.primary,
                            color: 'white',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600
                          }}>
                            {t('sub_detail.today', locale)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, color: pickupStatus.text, marginTop: 4 }}>
                        {formatDate(pickup.scheduled_date)}
                      </div>
                      {pickup.rescheduled_to && (
                        <div style={{ fontSize: 13, color: '#6b21a8', marginTop: 4 }}>
                          {t('sub_detail.rescheduled_to', locale, { date: formatDate(pickup.rescheduled_to) })}
                        </div>
                      )}
                      {pickup.status === 'skipped' && pickup.skip_reason && (
                        <div style={{ fontSize: 13, color: '#991b1b', marginTop: 4 }}>
                          {t('sub_detail.reason', locale, { reason: pickup.skip_reason! })}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <span style={{
                        padding: '4px 12px',
                        backgroundColor: 'white',
                        color: pickupStatus.text,
                        borderRadius: 16,
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {pickupStatus.label}
                      </span>
                      {pickup.picked_up_at && (
                        <div style={{ fontSize: 12, color: colors.primaryDark }}>
                          {t('sub_detail.picked_up', locale, { date: formatDateTime(pickup.picked_up_at!) })}
                        </div>
                      )}
                      {pickup.missed_at && (
                        <div style={{ fontSize: 12, color: '#991b1b' }}>
                          {t('sub_detail.marked_missed', locale, { date: formatDateTime(pickup.missed_at!) })}
                        </div>
                      )}
                      {/* Confirm Pickup button for ready pickups */}
                      {pickup.status === 'ready' && !pickup.buyer_confirmed_at && (
                        <button
                          onClick={() => handleConfirmPickup(pickup.id)}
                          disabled={confirmingPickup === pickup.id || waitingForVendor === pickup.id}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: waitingForVendor === pickup.id ? '#9ca3af' : colors.primaryDark,
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: confirmingPickup === pickup.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {confirmingPickup === pickup.id ? t('sub_detail.confirming', locale)
                            : waitingForVendor === pickup.id ? t('sub_detail.waiting_vendor', locale)
                            : t('sub_detail.confirm_pickup', locale)}
                        </button>
                      )}
                      {/* Waiting state after buyer confirmed */}
                      {pickup.status === 'ready' && pickup.buyer_confirmed_at && !pickup.vendor_confirmed_at && (
                        <div style={{ fontSize: 12, color: '#92400e', fontWeight: 500 }}>
                          {t('sub_detail.waiting_vendor_confirm', locale)}
                        </div>
                      )}
                      {/* Vendor confirmed first, waiting for buyer */}
                      {pickup.status === 'ready' && pickup.vendor_confirmed_at && !pickup.buyer_confirmed_at && (
                        <button
                          onClick={() => handleConfirmPickup(pickup.id)}
                          disabled={confirmingPickup === pickup.id}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#b45309',
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {confirmingPickup === pickup.id ? t('sub_detail.confirming', locale) : t('sub_detail.vendor_waiting', locale)}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Subscription Info */}
        <div style={{
          padding: 20,
          marginTop: 24,
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 8
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: 16 }}>{t('sub_detail.details_title', locale)}</h3>
          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b7280' }}>{t('sub_detail.started', locale)}</span>
              <span style={{ color: '#374151' }}>{formatDate(subscription.start_date)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b7280' }}>{t('sub_detail.total_paid', locale)}</span>
              <span style={{ color: '#374151', fontWeight: 600 }}>{formatPrice(buyerPaidCents)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b7280' }}>{t('sub_detail.per_pickup', locale)}</span>
              <span style={{ color: '#374151' }}>{formatPrice(Math.round(buyerPaidCents / pickupCount))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
