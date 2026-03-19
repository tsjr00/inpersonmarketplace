'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface MarketFiltersPopupProps {
  vertical?: string
  currentState?: string
  currentCity?: string
  currentType?: string
  currentSearch?: string
  states: string[]
  cities: string[]
}

interface FilterGroup {
  label: string
  param: string
  options: Array<{ value: string; label: string }>
  current: string
}

export default function MarketFiltersPopup({
  vertical,
  currentState,
  currentCity,
  currentType,
  currentSearch,
  states,
  cities,
}: MarketFiltersPopupProps) {
  const locale = getClientLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

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

  const groups: FilterGroup[] = []

  if (states.length > 0) {
    groups.push({
      label: t('markets.state_label', locale),
      param: 'state',
      options: [
        { value: '', label: t('markets.all_states', locale) },
        ...states.map(s => ({ value: s, label: s })),
      ],
      current: currentState || '',
    })
  }

  if (cities.length > 0) {
    groups.push({
      label: t('markets.city_label', locale),
      param: 'city',
      options: [
        { value: '', label: t('markets.all_cities', locale) },
        ...cities.sort().map(c => ({ value: c, label: c })),
      ],
      current: currentCity || '',
    })
  }

  groups.push({
    label: t('markets.type_label', locale),
    param: 'type',
    options: [
      { value: '', label: t('markets.all_types', locale) },
      { value: 'traditional', label: vertical === 'food_trucks' ? t('markets.ft_parks', locale) : t('markets.fm_markets', locale) },
      { value: 'event', label: t('markets.events', locale) },
    ],
    current: currentType || '',
  })

  const activeCount = groups.filter(g => g.current !== '').length

  const applyFilter = (param: string, value: string) => {
    const params = new URLSearchParams()
    // Preserve existing filters
    if (currentSearch) params.set('search', currentSearch)

    // State
    if (param === 'state') {
      if (value) params.set('state', value)
      // Clear city when state changes
    } else {
      if (currentState) params.set('state', currentState)
      // City
      if (param === 'city') {
        if (value) params.set('city', value)
      } else {
        if (currentCity) params.set('city', currentCity)
      }
    }

    // Type
    if (param === 'type') {
      if (value) params.set('type', value)
    } else {
      if (currentType) params.set('type', currentType)
    }

    const qs = params.toString()
    router.push(`${pathname}${qs ? '?' + qs : ''}`)
  }

  const clearAll = () => {
    const params = new URLSearchParams()
    if (currentSearch) params.set('search', currentSearch)
    router.push(`${pathname}${params.toString() ? '?' + params.toString() : ''}`)
    setOpen(false)
  }

  return (
    <div ref={popupRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing['2xs'],
          padding: `${spacing['2xs']} ${spacing.sm}`,
          backgroundColor: open || activeCount > 0 ? colors.textMuted : 'white',
          color: open || activeCount > 0 ? 'white' : colors.textPrimary,
          border: `1px solid ${open || activeCount > 0 ? colors.textMuted : colors.border}`,
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
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: open || activeCount > 0 ? 'white' : colors.textMuted }} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: open || activeCount > 0 ? 'white' : colors.textMuted }} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: open || activeCount > 0 ? 'white' : colors.textMuted }} />
        </span>
      </button>

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'], maxHeight: 200, overflowY: 'auto' }}>
                  {group.options.map(opt => {
                    const isSelected = group.current === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => applyFilter(group.param, opt.value)}
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
                        <span style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: `2px solid ${isSelected ? colors.textMuted : colors.borderMuted}`,
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

          <div style={{ height: 1, backgroundColor: colors.borderMuted }} />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: `${spacing.xs} ${spacing.sm}`,
          }}>
            {activeCount > 0 ? (
              <button
                onClick={clearAll}
                style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: typography.sizes.sm, cursor: 'pointer', padding: 0 }}
              >
                Clear
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
