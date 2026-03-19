'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import MarketScheduleSelector from '@/components/vendor/MarketScheduleSelector'
import ErrorDisplay from '@/components/shared/ErrorDisplay'
import { term } from '@/lib/vertical'
import { colors, statusColors } from '@/lib/design-tokens'
import type { Market, MarketSuggestion, MarketLimits, ErrorState } from '@/components/vendor/markets/types'
import { DAYS, getDefaultCutoffHours, getCutoffDisplay } from '@/components/vendor/markets/utils'

const MarketSuggestionSection = dynamic(() => import('@/components/vendor/markets/MarketSuggestionSection'), { ssr: false })
const EventMarketsSection = dynamic(() => import('@/components/vendor/markets/EventMarketsSection'), { ssr: false })
const PrivatePickupSection = dynamic(() => import('@/components/vendor/markets/PrivatePickupSection'), { ssr: false })

export default function VendorMarketsPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string

  const [fixedMarkets, setFixedMarkets] = useState<Market[]>([])
  const [eventMarkets, setEventMarkets] = useState<Market[]>([])
  const [privatePickupMarkets, setPrivatePickupMarkets] = useState<Market[]>([])
  const [marketSuggestions, setMarketSuggestions] = useState<MarketSuggestion[]>([])
  const [limits, setLimits] = useState<MarketLimits | null>(null)
  const [homeMarketId, setHomeMarketId] = useState<string | null>(null)
  const [vendorTier, setVendorTier] = useState<string>('standard')
  const [vendorStatus, setVendorStatus] = useState<string>('pending')
  const [isPremium, setIsPremium] = useState(false)
  const [changingHomeMarket, setChangingHomeMarket] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ErrorState>(null)
  const [selectedMarketForSchedule, setSelectedMarketForSchedule] = useState<Market | null>(null)
  const [expandedMarketIds, setExpandedMarketIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchMarkets()
  }, [vertical])

  const fetchMarkets = async () => {
    try {
      const res = await fetch(`/api/vendor/markets?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        setFixedMarkets(data.fixedMarkets || [])
        setEventMarkets(data.eventMarkets || [])
        setPrivatePickupMarkets(data.privatePickupMarkets || [])
        setMarketSuggestions(data.marketSuggestions || [])
        setLimits(data.limits)
        setHomeMarketId(data.homeMarketId || null)
        setVendorTier(data.vendorTier || 'free')
        setVendorStatus(data.vendorStatus || 'pending')
        setIsPremium(data.isPremium || false)
      } else if (res.status === 404) {
        router.push(`/${vertical}/vendor-signup`)
      }
    } catch (err) {
      console.error('Error fetching markets:', err)
      setError({ error: 'Failed to load markets' })
    } finally {
      setLoading(false)
    }
  }

  const handleSetHomeMarket = async (marketId: string) => {
    if (isPremium) return

    setChangingHomeMarket(true)
    setError(null)

    try {
      const res = await fetch('/api/vendor/home-market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical, marketId })
      })

      const data = await res.json()

      if (!res.ok) {
        setError({
          error: data.error || 'Failed to change home market',
          code: data.code,
          traceId: data.traceId,
          details: data.details
        })
        return
      }

      await fetchMarkets()
    } catch (err) {
      console.error('Error changing home market:', err)
      setError({ error: 'Failed to change home market' })
    } finally {
      setChangingHomeMarket(false)
    }
  }

  const isFoodTruck = vertical === 'food_trucks'

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: statusColors.neutral50
      }}>
        <p>Loading {term(vertical, 'markets').toLowerCase()}...</p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: statusColors.neutral50,
      padding: '24px 16px'
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12
        }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 'bold' }}>My {term(vertical, 'markets')}</h1>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              padding: '10px 20px',
              backgroundColor: statusColors.neutral500,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            Back to Dashboard
          </Link>
        </div>

        {/* Error Message */}
        {error && (
          <ErrorDisplay
            error={error}
            onDismiss={() => setError(null)}
          />
        )}

        {/* Onboarding Banner for Non-Approved Vendors */}
        {vendorStatus !== 'approved' && (
          <div style={{
            padding: 16,
            backgroundColor: statusColors.warningLight,
            border: `1px solid ${statusColors.warningBorder}`,
            borderRadius: 8,
            marginBottom: 24,
          }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: statusColors.warningDark }}>
              {'⚠️'} Complete Your Setup
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: statusColors.warningDark, lineHeight: 1.5 }}>
              Your vendor account is pending approval. You can browse available {term(vertical, 'markets').toLowerCase()} while you wait.
              Once approved, you&apos;ll be able to join {term(vertical, 'markets').toLowerCase()} and start accepting orders.
            </p>
            <Link
              href={`/${vertical}/vendor/dashboard`}
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '6px 16px',
                backgroundColor: statusColors.warningDark,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600
              }}
            >
              Back to Dashboard
            </Link>
          </div>
        )}

        {/* Single Truck Locations first for FT (vendors toggle these most frequently) */}
        {isFoodTruck && (
          <PrivatePickupSection
            vertical={vertical}
            isFoodTruck={isFoodTruck}
            privatePickupMarkets={privatePickupMarkets}
            limits={limits}
            isPremium={isPremium}
            setError={setError}
            fetchMarkets={fetchMarkets}
          />
        )}

        {/* Traditional Markets Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: `1px solid ${statusColors.neutral200}`,
          padding: 24,
          marginBottom: 24
        }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 600 }}>
              {term(vertical, 'traditional_markets')}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: statusColors.neutral500 }}>
              {isFoodTruck
                ? 'Food truck parks and event locations where you can set up.'
                : 'Traditional schedule farmers markets.'}
              {limits && ` You can join ${limits.traditionalMarkets} ${limits.traditionalMarkets > 1 ? term(vertical, 'traditional_markets').toLowerCase() : term(vertical, 'traditional_market').toLowerCase()} (${limits.currentFixedMarketCount} of ${limits.traditionalMarkets} used).`}
              {limits && !limits.canAddFixed && (
                <span style={{ color: statusColors.danger, marginLeft: 8 }}>
                  Limit reached. <a href={`/${vertical}/settings`} style={{ color: statusColors.info }}>Upgrade</a> for more {term(vertical, 'markets').toLowerCase()}.
                </span>
              )}
            </p>
          </div>

          {fixedMarkets.length === 0 ? (
            <p style={{ color: statusColors.neutral400, fontStyle: 'italic', margin: 0 }}>
              No {term(vertical, 'traditional_markets').toLowerCase()} available yet. Check back soon!
            </p>
          ) : (() => {
            const activeMarkets = fixedMarkets.filter(m => m.isHomeMarket || expandedMarketIds.has(m.id))
            const availableMarkets = fixedMarkets.filter(m => !m.isHomeMarket && !expandedMarketIds.has(m.id))
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeMarkets.map(market => (
                <div
                  key={market.id}
                  style={{
                    padding: 12,
                    border: market.isHomeMarket ? `2px solid ${statusColors.info}` : `1px solid ${statusColors.neutral200}`,
                    borderRadius: 8,
                    backgroundColor: market.isHomeMarket ? statusColors.infoLight : 'white'
                  }}
                >
                  {/* Market name — full width across top, with collapse button for non-home */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                      {market.name}
                    </h3>
                    {!market.isHomeMarket && (
                      <button
                        onClick={() => setExpandedMarketIds(prev => { const next = new Set(prev); next.delete(market.id); return next })}
                        style={{
                          padding: '2px 8px',
                          backgroundColor: 'transparent',
                          color: statusColors.neutral400,
                          border: `1px solid ${statusColors.neutral300}`,
                          borderRadius: 4,
                          fontSize: 11,
                          cursor: 'pointer',
                          flexShrink: 0
                        }}
                      >
                        Collapse
                      </button>
                    )}
                  </div>

                  {/* Home market badge + helper OR set-as-home button */}
                  {market.isHomeMarket && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        backgroundColor: statusColors.info,
                        color: 'white',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        flexShrink: 0
                      }}>
                        🏠 {vertical === 'food_trucks' ? 'Home Park' : 'Home Market'}
                      </span>
                      <span style={{ fontSize: 12, color: statusColors.neutral500, fontStyle: 'italic' }}>
                        Your home location — used as your primary position in geographic search results.
                      </span>
                    </div>
                  )}
                  {!isPremium && !market.isHomeMarket && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <button
                        onClick={() => handleSetHomeMarket(market.id)}
                        disabled={changingHomeMarket}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: changingHomeMarket ? statusColors.neutral400 : statusColors.neutral100,
                          color: statusColors.neutral700,
                          border: `1px solid ${statusColors.neutral300}`,
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: changingHomeMarket ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {changingHomeMarket ? 'Changing...' : (vertical === 'food_trucks' ? 'Set as Home Park' : 'Set as Home Market')}
                      </button>
                      {!changingHomeMarket && (
                        <span style={{ fontSize: 11, color: statusColors.neutral400 }}>
                          Sets this as your primary location for geographic search ranking
                        </span>
                      )}
                    </div>
                  )}

                  {/* Address — single line */}
                  <p style={{ margin: '0 0 4px 0', fontSize: 13, color: statusColors.neutral500 }}>
                    {market.address}, {market.city}, {market.state} {market.zip}
                  </p>
                  {market.day_of_week !== null && market.day_of_week !== undefined && (
                    <p style={{ margin: '0 0 6px 0', fontSize: 13, color: statusColors.neutral500 }}>
                      {DAYS[market.day_of_week]} {market.start_time} - {market.end_time}
                    </p>
                  )}
                  {/* Cutoff time for traditional markets */}
                  {market.day_of_week !== null && market.day_of_week !== undefined && market.start_time && (() => {
                    const cutoffHrs = market.cutoff_hours ?? getDefaultCutoffHours(vertical, 'traditional')
                    const display = getCutoffDisplay(market.day_of_week!, market.start_time!, cutoffHrs)
                    return display ? (
                      <div style={{
                        padding: '4px 8px',
                        backgroundColor: statusColors.warningLight,
                        borderRadius: 4,
                        fontSize: 11,
                        color: statusColors.warningDark,
                        marginBottom: 8,
                        display: 'inline-block'
                      }}>
                        <strong>Order cutoff:</strong> {display}
                      </div>
                    ) : (
                      <div style={{
                        padding: '4px 8px',
                        backgroundColor: colors.primaryLight,
                        borderRadius: 4,
                        fontSize: 11,
                        color: colors.primaryDark,
                        marginBottom: 8,
                        display: 'inline-block'
                      }}>
                        Orders accepted until pickup time
                      </div>
                    )
                  })()}

                  {/* Attendance prompt for markets without schedule set */}
                  {!market.hasAttendance && (
                    <div style={{
                      marginBottom: 8,
                      padding: '6px 10px',
                      backgroundColor: statusColors.warningLight,
                      border: `1px solid ${statusColors.warningBorder}`,
                      borderRadius: 6,
                      fontSize: 12,
                      color: statusColors.warningDark,
                    }}>
                      Set your schedule to start accepting orders at this {vertical === 'food_trucks' ? 'park' : 'market'}.
                    </div>
                  )}

                  {/* Action buttons — side by side */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => router.push(`/${vertical}/vendor/listings?market=${market.id}`)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: statusColors.info,
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Manage Listings
                    </button>
                    <button
                      onClick={() => setSelectedMarketForSchedule(market)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: !market.hasAttendance ? statusColors.warning : colors.primary,
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {!market.hasAttendance ? 'Set Schedule' : 'Manage Schedule'}
                    </button>
                    <Link
                      href={`/${vertical}/vendor/markets/${market.id}/prep`}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'transparent',
                        color: colors.primary,
                        border: `1px solid ${colors.primary}`,
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'inline-block'
                      }}
                    >
                      📋 Prep Sheet
                    </Link>
                  </div>

                  {/* Schedule Selector - shown inline when this market is selected */}
                  {selectedMarketForSchedule?.id === market.id && (
                    <div style={{ marginTop: 12 }}>
                      <MarketScheduleSelector
                        marketId={market.id}
                        marketName={market.name}
                        vertical={vertical}
                        marketType={market.market_type as 'traditional' | 'private_pickup' | 'event'}
                        onClose={() => { setSelectedMarketForSchedule(null); fetchMarkets() }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* Available markets — compact rows for markets not yet attended */}
              {availableMarkets.length > 0 && (
                <div style={{
                  marginTop: 4,
                  border: `1px solid ${statusColors.neutral200}`,
                  borderRadius: 8,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '8px 12px',
                    backgroundColor: statusColors.neutral100,
                    fontSize: 13,
                    fontWeight: 600,
                    color: statusColors.neutral700,
                    borderBottom: `1px solid ${statusColors.neutral200}`
                  }}>
                    Available {term(vertical, 'traditional_markets')} ({availableMarkets.length})
                  </div>
                  {availableMarkets.map((market, idx) => (
                    <div
                      key={market.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderBottom: idx < availableMarkets.length - 1 ? `1px solid ${statusColors.neutral100}` : 'none',
                        cursor: 'pointer',
                        backgroundColor: market.hasAttendance ? statusColors.successLight : 'white'
                      }}
                      onClick={() => setExpandedMarketIds(prev => { const next = new Set(prev); next.add(market.id); return next })}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => setExpandedMarketIds(prev => { const next = new Set(prev); next.add(market.id); return next })}
                        style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{market.name}</span>
                        <span style={{ fontSize: 12, color: statusColors.neutral400, marginLeft: 8 }}>
                          {market.city}, {market.state}
                        </span>
                      </div>
                      {market.hasAttendance && (
                        <span style={{
                          fontSize: 11,
                          color: statusColors.success,
                          fontWeight: 600,
                          flexShrink: 0
                        }}>
                          Active
                        </span>
                      )}
                    </div>
                  ))}
                  <div style={{ padding: '6px 12px', fontSize: 11, color: statusColors.neutral400, backgroundColor: statusColors.neutral50 }}>
                    Click a {term(vertical, 'traditional_market').toLowerCase()} to expand details and manage schedule
                  </div>
                </div>
              )}
            </div>
            )
          })()}
        </div>

        {/* Lazy-loaded sections */}
        <MarketSuggestionSection
          vertical={vertical}
          isFoodTruck={isFoodTruck}
          marketSuggestions={marketSuggestions}
          setError={setError}
          fetchMarkets={fetchMarkets}
        />

        <EventMarketsSection
          vertical={vertical}
          eventMarkets={eventMarkets}
          setError={setError}
          fetchMarkets={fetchMarkets}
          selectedMarketForSchedule={selectedMarketForSchedule}
          setSelectedMarketForSchedule={setSelectedMarketForSchedule}
        />

        {/* Private pickups at bottom for FM (FT renders them at top) */}
        {!isFoodTruck && (
          <PrivatePickupSection
            vertical={vertical}
            isFoodTruck={isFoodTruck}
            privatePickupMarkets={privatePickupMarkets}
            limits={limits}
            isPremium={isPremium}
            setError={setError}
            fetchMarkets={fetchMarkets}
          />
        )}
      </div>
    </div>
  )
}
