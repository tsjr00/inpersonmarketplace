'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { VerticalBranding } from '@/lib/branding'
import { term } from '@/lib/vertical'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface BrowseFiltersPopupProps {
  vertical: string
  currentView: 'listings' | 'market-boxes'
  isAvailableNow: boolean
  currentMenu?: string
  branding: VerticalBranding
}

interface FilterGroup {
  label: string
  param: string
  options: Array<{ value: string; label: string }>
  current: string
}

export default function BrowseFiltersPopup({
  vertical,
  currentView,
  isAvailableNow,
  currentMenu,
  branding,
}: BrowseFiltersPopupProps) {
  const locale = getClientLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  const isFoodTruck = vertical === 'food_trucks'

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Build filter groups
  const groups: FilterGroup[] = [
    {
      label: t('browse.view_label', locale),
      param: 'view',
      options: [
        { value: '', label: t('browse.products_bundles', locale, { products: term(vertical, 'products', locale) }) },
        { value: 'market-boxes', label: term(vertical, 'market_boxes', locale) },
      ],
      current: currentView === 'market-boxes' ? 'market-boxes' : '',
    },
    {
      label: t('browse.show_label', locale),
      param: 'available',
      options: [
        { value: '', label: t('browse.all_listings', locale) },
        { value: 'true', label: t('browse.available_now', locale) },
      ],
      current: isAvailableNow ? 'true' : '',
    },
  ]

  // Menu type filter — FT only, listings view only
  if (isFoodTruck) {
    groups.push({
      label: t('browse.menu_label', locale),
      param: 'menu',
      options: [
        { value: '', label: t('browse.all_items', locale) },
        { value: 'daily', label: t('browse.daily_menu', locale) },
        { value: 'catering', label: t('browse.catering_menu', locale) },
      ],
      current: currentMenu || '',
    })
  }

  // Count active filters (non-default selections)
  const activeCount = groups.filter(g => g.current !== '').length

  const applyFilter = (param: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    if (value) {
      params.set(param, value)
    } else {
      params.delete(param)
    }
    const qs = params.toString()
    router.push(`/${vertical}/browse${qs ? '?' + qs : ''}`)
  }

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    params.delete('view')
    params.delete('available')
    params.delete('menu')
    const qs = params.toString()
    router.push(`/${vertical}/browse${qs ? '?' + qs : ''}`)
    setOpen(false)
  }

  return (
    <div ref={popupRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing['2xs'],
          padding: `${spacing['2xs']} ${spacing.sm}`,
          backgroundColor: open || activeCount > 0 ? colors.textMuted : 'white',
          color: open || activeCount > 0 ? 'white' : colors.textPrimary,
          border: `1px solid ${open || activeCount > 0 ? colors.textMuted : branding.colors.secondary}`,
          borderRadius: radius.md,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.medium,
          cursor: 'pointer',
          minHeight: 38,
        }}
      >
        <span>{t('browse.filters', locale)}</span>
        {activeCount > 0 && (
          <span style={{
            backgroundColor: 'white',
            color: colors.textMuted,
            borderRadius: radius.full,
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: typography.weights.bold,
          }}>
            {activeCount}
          </span>
        )}
        {/* 3-dot icon */}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: open || activeCount > 0 ? 'white' : colors.textMuted }} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: open || activeCount > 0 ? 'white' : colors.textMuted }} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: open || activeCount > 0 ? 'white' : colors.textMuted }} />
        </span>
      </button>

      {/* Popup */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: spacing['2xs'],
          backgroundColor: 'white',
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          minWidth: 240,
          zIndex: 50,
          overflow: 'hidden',
        }}>
          {groups.map((group, gi) => (
            <div key={group.param}>
              {gi > 0 && <div style={{ height: 1, backgroundColor: colors.borderMuted }} />}
              <div style={{ padding: `${spacing.xs} ${spacing.sm}` }}>
                <div style={{
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.semibold,
                  color: colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: spacing['2xs'],
                }}>
                  {group.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
                  {group.options.map(opt => {
                    const isSelected = group.current === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          applyFilter(group.param, opt.value)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.xs,
                          padding: `${spacing['3xs']} ${spacing['2xs']}`,
                          backgroundColor: isSelected ? colors.primaryLight : 'transparent',
                          border: 'none',
                          borderRadius: radius.sm,
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                          fontSize: typography.sizes.sm,
                          color: isSelected ? colors.primaryDark : colors.textPrimary,
                          fontWeight: isSelected ? typography.weights.semibold : typography.weights.normal,
                        }}
                      >
                        {/* Radio indicator */}
                        <span style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: `2px solid ${isSelected ? colors.textMuted : colors.textMuted}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {isSelected && (
                            <span style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: colors.textMuted,
                            }} />
                          )}
                        </span>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Clear + Done footer */}
          <div style={{
            height: 1,
            backgroundColor: colors.borderMuted,
          }} />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: `${spacing.xs} ${spacing.sm}`,
          }}>
            {activeCount > 0 ? (
              <button
                onClick={clearAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.textMuted,
                  fontSize: typography.sizes.sm,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {t('browse.clear', locale)}
              </button>
            ) : <span />}
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: `${spacing['3xs']} ${spacing.sm}`,
                backgroundColor: colors.textMuted,
                color: 'white',
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
