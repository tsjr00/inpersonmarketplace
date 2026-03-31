'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCart, CartItem } from '@/lib/hooks/useCart'
import { calculateDisplayPrice, formatPrice } from '@/lib/constants'
import { formatPickupDate } from '@/types/pickup'
import { term } from '@/lib/vertical'
import { spacing, typography, radius, sizing, statusColors } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

export function CartDrawer() {
  const router = useRouter()
  const params = useParams()
  const vertical = params?.vertical as string
  const { items, removeFromCart, updateQuantity, itemCount, isOpen, setIsOpen, loading, hasScheduleIssues, hasMarketBoxItems } = useCart()
  const locale = getClientLocale()

  // Calculate display total with percentage fee only
  // Flat fee ($0.15) is added at checkout, not in cart
  const baseSubtotal = items.reduce((sum, item) => {
    if (item.itemType === 'market_box') {
      return sum + (item.termPriceCents || item.price_cents || 0)
    }
    return sum + (item.price_cents || 0) * item.quantity
  }, 0)
  const displayTotal = calculateDisplayPrice(baseSubtotal)

  function handleCheckout() {
    setIsOpen(false)
    router.push(`/${vertical}/checkout`)
  }

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEsc)
      return () => window.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, setIsOpen])

  if (!isOpen) return null

  // Separate items by type for display
  const listingItems = items.filter(i => i.itemType !== 'market_box')
  const marketBoxItems = items.filter(i => i.itemType === 'market_box')

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setIsOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: 420,
        backgroundColor: 'white',
        zIndex: 1000,
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: `${spacing.sm} ${spacing.md}`,
          borderBottom: `1px solid ${statusColors.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{t('cart.title', locale)}</h2>
            <p style={{ margin: '5px 0 0', color: '#666', fontSize: 14 }}>
              {itemCount} {itemCount === 1 ? t('cart.item_one', locale) : t('cart.items_other', locale)}
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#666',
              padding: 5,
            }}
          >
            x
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: spacing.md,
        }}>
          {loading ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#999',
            }}>
              <p>{t('cart.loading', locale)}</p>
            </div>
          ) : items.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#999',
            }}>
              <div style={{ fontSize: 60, marginBottom: 15, opacity: 0.3 }}>🛒</div>
              <p>{t('cart.empty', locale)}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {/* Warning banner for schedule issues */}
              {hasScheduleIssues && (
                <div style={{
                  padding: spacing.xs,
                  backgroundColor: statusColors.dangerLight,
                  border: `1px solid ${statusColors.dangerBorder}`,
                  borderRadius: radius.md,
                  color: statusColors.dangerDark,
                  fontSize: typography.sizes.sm,
                }}>
                  <strong>{t('cart.schedule_warning_title', locale)}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {t('cart.schedule_warning_desc', locale)}
                  </p>
                </div>
              )}

              {/* Market box notice */}
              {hasMarketBoxItems && listingItems.length > 0 && (
                <div style={{
                  padding: spacing.xs,
                  backgroundColor: statusColors.infoLight,
                  border: `1px solid ${statusColors.infoBorder}`,
                  borderRadius: radius.md,
                  color: statusColors.infoDark,
                  fontSize: typography.sizes.xs,
                }}>
                  {t('cart.mb_notice', locale, { market_box: term(vertical, 'market_box', locale) })}
                </div>
              )}

              {/* Listing items */}
              {listingItems.map(item => (
                <CartItemCard
                  key={item.id}
                  item={item}
                  onRemove={removeFromCart}
                  onUpdateQuantity={updateQuantity}
                />
              ))}

              {/* Market box items section */}
              {marketBoxItems.length > 0 && (
                <>
                  {listingItems.length > 0 && (
                    <div style={{
                      borderTop: '1px solid #e5e7eb',
                      paddingTop: 10,
                      marginTop: 5,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      {t('cart.mb_subscriptions', locale, { market_box: term(vertical, 'market_box', locale) })}
                    </div>
                  )}
                  {marketBoxItems.map(item => (
                    <MarketBoxCartItemCard
                      key={item.id}
                      item={item}
                      onRemove={removeFromCart}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{
            padding: spacing.md,
            borderTop: `1px solid ${statusColors.neutral200}`,
            backgroundColor: statusColors.neutral50,
          }}>
            <div style={{ marginBottom: spacing.xs }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 18,
                fontWeight: 'bold',
              }}>
                <span>{t('cart.total', locale)}</span>
                <span>{formatPrice(displayTotal)}</span>
              </div>
            </div>

            <button
              onClick={handleCheckout}
              style={{
                width: '100%',
                ...sizing.cta,
                fontWeight: typography.weights.semibold,
                backgroundColor: statusColors.neutral800,
                color: 'white',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {t('cart.proceed', locale)}
            </button>
            {!items.some(i => i.market_type === 'event') && (
              <button
                onClick={() => { setIsOpen(false); router.push(`/${vertical}/browse`) }}
                style={{
                  width: '100%',
                  ...sizing.control,
                  padding: `${spacing.xs} ${spacing.md}`,
                  fontWeight: typography.weights.medium,
                  backgroundColor: 'transparent',
                  color: statusColors.neutral500,
                  border: `1px solid ${statusColors.neutral300}`,
                  cursor: 'pointer',
                  marginTop: spacing['2xs'],
                }}
              >
                {t('cart.continue_shopping', locale)}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── Regular listing cart item card ──────────────────────────────────────

function CartItemCard({
  item,
  onRemove,
  onUpdateQuantity,
}: {
  item: CartItem
  onRemove: (cartItemId: string) => Promise<void>
  onUpdateQuantity: (cartItemId: string, quantity: number) => Promise<void>
}) {
  const [updatingQty, setUpdatingQty] = useState(false)
  const locale = getClientLocale()
  const displayPriceCents = calculateDisplayPrice(item.price_cents || 0)
  const itemTotalCents = displayPriceCents * item.quantity
  const hasIssue = Boolean(item.schedule_issue)

  const handleQuantityChange = async (newQty: number) => {
    setUpdatingQty(true)
    try {
      await onUpdateQuantity(item.id, newQty)
    } finally {
      setUpdatingQty(false)
    }
  }

  return (
    <div style={{
      padding: spacing.sm,
      border: hasIssue ? '2px solid #fca5a5' : '1px solid #eee',
      borderRadius: 8,
      backgroundColor: hasIssue ? '#fef2f2' : 'white',
    }}>
      {/* Schedule issue warning */}
      {item.schedule_issue && (
        <div style={{
          marginBottom: 10,
          padding: '8px 10px',
          backgroundColor: '#fee2e2',
          borderRadius: 6,
          fontSize: 12,
          color: '#991b1b',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>⚠️</span>
          <span>{item.schedule_issue}</span>
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {item.title || 'Unknown Item'}
          </h4>
          <p style={{
            margin: '4px 0 0',
            fontSize: 13,
            color: '#888',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {item.vendor_name || 'Unknown Vendor'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 500 }}>
            {formatPrice(displayPriceCents)} {t('cart.each', locale)}
          </p>
        </div>
        <button
          onClick={() => onRemove(item.id)}
          style={{
            background: 'none',
            border: 'none',
            color: hasIssue ? '#dc2626' : '#999',
            cursor: 'pointer',
            padding: 5,
            fontSize: 18,
          }}
          title={t('cart.remove_item', locale)}
        >
          🗑️
        </button>
      </div>

      {/* Pickup info */}
      {item.pickup_display && (
        <div style={{
          marginBottom: 10,
          padding: '6px 10px',
          backgroundColor: hasIssue ? '#fee2e2' : '#f0f9ff',
          borderRadius: 6,
          fontSize: 12,
          color: hasIssue ? '#7f1d1d' : '#0369a1',
        }}>
          <span style={{ fontWeight: 600 }}>{t('cart.pickup', locale)}</span>{' '}
          {item.pickup_date ? formatPickupDate(item.pickup_date) : item.pickup_display.date_formatted}
          {item.pickup_display.time_formatted && (
            <span> · {item.pickup_display.time_formatted}</span>
          )}
          {item.market_name && (
            <span style={{ display: 'block', marginTop: 2, color: hasIssue ? '#991b1b' : '#6b7280' }}>
              @ {item.market_name}
            </span>
          )}
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button
            onClick={() => handleQuantityChange(item.quantity - 1)}
            disabled={updatingQty}
            style={{
              width: 28,
              height: 28,
              border: '1px solid #ddd',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: updatingQty ? 'default' : 'pointer',
              fontSize: 16,
              opacity: updatingQty ? 0.5 : 1,
            }}
          >
            -
          </button>
          <span style={{
            width: 32,
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 500,
          }}>
            {item.quantity}
          </span>
          <button
            onClick={() => handleQuantityChange(item.quantity + 1)}
            disabled={updatingQty}
            style={{
              width: 28,
              height: 28,
              border: '1px solid #ddd',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: updatingQty ? 'default' : 'pointer',
              fontSize: 16,
              opacity: updatingQty ? 0.5 : 1,
            }}
          >
            +
          </button>
        </div>
        <span style={{ fontSize: 16, fontWeight: 'bold' }}>
          {formatPrice(itemTotalCents)}
        </span>
      </div>
    </div>
  )
}

// ── Market box cart item card ───────────────────────────────────────────

function MarketBoxCartItemCard({
  item,
  onRemove,
}: {
  item: CartItem
  onRemove: (cartItemId: string) => Promise<void>
}) {
  const locale = getClientLocale()
  const displayPrice = calculateDisplayPrice(item.termPriceCents || item.price_cents || 0)
  const hasIssue = Boolean(item.schedule_issue)

  return (
    <div style={{
      padding: spacing.sm,
      border: hasIssue ? '2px solid #fca5a5' : '1px solid #dbeafe',
      borderRadius: 8,
      backgroundColor: hasIssue ? '#fef2f2' : '#f8fafc',
    }}>
      {item.schedule_issue && (
        <div style={{
          marginBottom: 10,
          padding: '8px 10px',
          backgroundColor: '#fee2e2',
          borderRadius: 6,
          fontSize: 12,
          color: '#991b1b',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>⚠️</span>
          <span>{item.schedule_issue}</span>
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
          }}>
            <span style={{ fontSize: 14 }}>📦</span>
            <h4 style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {item.offeringName || item.title || 'Market Box'}
            </h4>
          </div>
          <p style={{
            margin: '2px 0 0',
            fontSize: 13,
            color: '#888',
          }}>
            {item.vendor_name} · {t('cart.subscription', locale, { term: String(item.termWeeks === 8 ? 8 : 4) })}
          </p>
        </div>
        <button
          onClick={() => onRemove(item.id)}
          style={{
            background: 'none',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            padding: 5,
            fontSize: 18,
          }}
          title={t('cart.remove_from_cart', locale)}
        >
          🗑️
        </button>
      </div>

      {/* Pickup schedule info */}
      <div style={{
        marginBottom: 10,
        padding: '6px 10px',
        backgroundColor: '#eff6ff',
        borderRadius: 6,
        fontSize: 12,
        color: '#1e40af',
      }}>
        <span style={{ fontWeight: 600 }}>{t('cart.pickup', locale)}</span>{' '}
        {item.pickup_display?.day_name || 'TBD'}s
        {item.pickup_display?.time_formatted && (
          <span> · {item.pickup_display.time_formatted}</span>
        )}
        {item.market_name && (
          <span style={{ display: 'block', marginTop: 2, color: '#6b7280' }}>
            @ {item.market_name}
          </span>
        )}
        {item.startDate && (
          <span style={{ display: 'block', marginTop: 2, color: '#6b7280' }}>
            {t('cart.starting', locale, { date: new Date(item.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })}
          </span>
        )}
      </div>

      {/* Price — no quantity controls for market boxes */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {t('cart.week_total', locale, { term: String(item.termWeeks === 8 ? 8 : 4) })}
        </span>
        <span style={{ fontSize: 16, fontWeight: 'bold' }}>
          {formatPrice(displayPrice)}
        </span>
      </div>
    </div>
  )
}
