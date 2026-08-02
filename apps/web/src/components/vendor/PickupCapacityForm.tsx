'use client'
import { useState } from 'react'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'

interface Props {
  vendorId: string
  /** Vendor's prep lead time — ALSO the slot length (time-slots.ts:49). 15 or 30. */
  slotMinutes: number
  current: {
    total_per_slot: number | null
    app_orders: number | null
    avg_items: number | null
    items: number | null
    slot_minutes: number | null
  }
  /** profile_data.event_readiness.max_headcount_per_wave — people per 30-min wave. */
  eventHeadcountPerWave?: number | null | undefined
}

/**
 * Pickup Capacity (mig 216) — how many app pre-orders a truck accepts per slot.
 *
 * Three plain questions → two derived, editable caps. We deliberately never ask
 * for "prep minutes per item": vendors guess badly at that, and average order
 * size is a question they can actually answer.
 *
 * Q1 asks TOTAL pace including walk-ups, on purpose. Food trucks are walk-up /
 * cash-first; the app is additive. Asking "app orders after walk-ups" inverts
 * their mental model and they answer with whole-service capacity.
 *
 * Slot length is the vendor's own lead time (15 or 30) — never hardcode 15.
 */
export default function PickupCapacityForm({ vendorId, slotMinutes, current, eventHeadcountPerWave }: Props) {
  // Q1 pre-fills from the event-readiness answer when present. That number is
  // people per 30-min wave, so halve it for a 15-min slot.
  const prefillQ1 = eventHeadcountPerWave
    ? Math.max(1, Math.round(eventHeadcountPerWave * (slotMinutes / 30)))
    : ''
  const usedPrefill = current.total_per_slot == null && prefillQ1 !== ''

  const [q1, setQ1] = useState<number | ''>(current.total_per_slot ?? prefillQ1)
  const [q2, setQ2] = useState<number | ''>(current.app_orders ?? '')
  const [q3, setQ3] = useState<number | ''>(current.avg_items ?? '')
  const [itemsOverride, setItemsOverride] = useState<number | ''>(current.items ?? '')
  const [showAdjust, setShowAdjust] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const derivedItems = typeof q2 === 'number' && typeof q3 === 'number' ? q2 * q3 : ''
  const effectiveItems = itemsOverride !== '' ? itemsOverride : derivedItems
  const isConfigured = typeof q2 === 'number' && q2 > 0
  const q2ExceedsQ1 = typeof q1 === 'number' && typeof q2 === 'number' && q2 > q1

  // Set for a different slot length than the vendor now runs → caps are stale.
  const staleForSlot =
    current.slot_minutes != null && current.slot_minutes !== slotMinutes && current.app_orders != null

  const save = async (clear = false) => {
    setSaving(true); setMessage('')
    try {
      const res = await fetch('/api/vendor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          pickup_capacity: clear ? null : {
            total_per_slot: q1 === '' ? null : q1,
            app_orders: q2 === '' ? null : q2,
            avg_items: q3 === '' ? null : q3,
            items: effectiveItems === '' ? null : effectiveItems,
            slot_minutes: slotMinutes,
          },
        }),
      })
      if (res.ok) {
        setMessage(clear ? 'Capacity limit removed.' : 'Capacity saved!')
        if (clear) { setQ1(''); setQ2(''); setQ3(''); setItemsOverride('') }
        setTimeout(() => setMessage(''), 4000)
      } else {
        setMessage((await res.json()).error || 'Failed to save')
      }
    } catch {
      setMessage('Error saving capacity')
    } finally { setSaving(false) }
  }

  const label = { display: 'block', fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: 4 }
  const hint = { fontSize: typography.sizes.xs, color: colors.textMuted, margin: `0 0 ${spacing.xs} 0`, lineHeight: 1.5 }
  const input = { width: 90, padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.base }

  return (
    <div style={{ backgroundColor: 'white', borderRadius: Number(radius.md.replace('px', '')), padding: spacing.md, border: `1px solid ${colors.border}` }}>
      <h2 style={{ margin: `0 0 ${spacing.xs} 0`, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
        Pickup Capacity
      </h2>
      <p style={{ margin: `0 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm, color: colors.textMuted, lineHeight: 1.5 }}>
        How many <strong>app pre-orders</strong> you&apos;ll accept in each <strong>{slotMinutes}-minute</strong> time slot,
        so they spread across your service instead of all landing at once.
      </p>
      <p style={{ margin: `0 0 ${spacing.md} 0`, fontSize: typography.sizes.sm, color: colors.textPrimary, fontWeight: typography.weights.medium }}>
        This only paces app orders — your walk-up line is never limited by it.
      </p>

      {staleForSlot && (
        <div style={{ padding: spacing.sm, marginBottom: spacing.md, borderRadius: radius.sm, background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', fontSize: typography.sizes.sm, lineHeight: 1.5 }}>
          <strong>Your order capacity is set based on your order lead time — your order capacity probably needs to be
          changed to match your new lead time.</strong><br />
          Your slots changed from {current.slot_minutes} to {slotMinutes} minutes. The numbers below were set for
          {' '}{current.slot_minutes}-minute slots.
        </div>
      )}

      {/* Q1 */}
      <div style={{ marginBottom: spacing.md }}>
        <label style={label}>Your normal pace</label>
        <p style={hint}>
          During a typical service, about how many orders do you complete in <strong>{slotMinutes} minutes</strong> —
          everyone, walk-ups included? <em>Cooked and handed out, not just handed out. Your steady pace, not your
          best-ever burst.</em>
        </p>
        <input type="number" min={1} max={500} style={input} value={q1}
          onChange={(e) => setQ1(e.target.value === '' ? '' : Number(e.target.value))} />
        {usedPrefill && (
          <p style={{ ...hint, marginTop: 4, fontStyle: 'italic' }}>
            Pre-filled from your Event Readiness answer (you serve ~{eventHeadcountPerWave} people per 30-minute wave at
            events). Day-to-day is usually different — change it if this isn&apos;t right.
          </p>
        )}
      </div>

      {/* Q2 */}
      <div style={{ marginBottom: spacing.md }}>
        <label style={label}>Your app slice</label>
        <p style={hint}>
          Of those {q1 === '' ? '—' : q1}, how many can be app pre-orders? <em>Walk-ups will still be your main source
          of customers until people get used to ordering through the app. Set aside a slice you can comfortably hit
          today, and raise it as more of your regulars start ordering ahead.</em>
        </p>
        <input type="number" min={1} max={500} style={{ ...input, borderColor: q2ExceedsQ1 ? '#f59e0b' : colors.border }}
          value={q2} onChange={(e) => setQ2(e.target.value === '' ? '' : Number(e.target.value))} />
        {q2ExceedsQ1 && (
          <p style={{ ...hint, color: '#92400e', marginTop: 4 }}>
            That&apos;s more than the {q1} total orders you said you complete — leave room for your walk-up line.
          </p>
        )}
      </div>

      {/* Q3 */}
      <div style={{ marginBottom: spacing.md }}>
        <label style={label}>Typical order size</label>
        <p style={hint}>About how many items are in a normal order? <em>Your average, not your biggest.</em></p>
        <input type="number" min={1} max={100} style={input} value={q3}
          onChange={(e) => setQ3(e.target.value === '' ? '' : Number(e.target.value))} />
      </div>

      {/* Shown math — the pattern from the event form (vendor/events/[marketId]:790-800) */}
      {isConfigured && (
        <div style={{ padding: spacing.sm, marginBottom: spacing.md, background: colors.surfaceMuted, borderRadius: radius.sm, fontSize: typography.sizes.sm, lineHeight: 1.6 }}>
          <div style={{ fontWeight: typography.weights.semibold, marginBottom: 4 }}>Here&apos;s what that means</div>
          {q1 !== '' && <>You complete about <strong>{q1} orders</strong> in a normal <strong>{slotMinutes} minutes</strong>.<br /></>}
          You&apos;re setting aside <strong>{q2}</strong> of those for app pre-orders.<br />
          {q3 !== '' && <>A typical order is <strong>{q3} items</strong> → about <strong>{derivedItems} items</strong>.<br /></>}
          <div style={{ marginTop: spacing.xs }}>
            <strong>We&apos;ll hold each {slotMinutes}-minute slot to {q2} app orders{effectiveItems !== '' ? ` or ${effectiveItems} items` : ''} — whichever comes first.</strong>
            {' '}When a slot reaches either, app buyers see it as <strong>Full</strong> and pick another time.
            Walk-ups keep coming as normal.
          </div>
          <button type="button" onClick={() => setShowAdjust(s => !s)}
            style={{ marginTop: spacing.xs, background: 'none', border: 'none', color: colors.primary, cursor: 'pointer', fontSize: typography.sizes.xs, padding: 0 }}>
            {showAdjust ? 'Hide' : 'Adjust'} ▾
          </button>
          {showAdjust && (
            <div style={{ marginTop: spacing.xs }}>
              <label style={{ fontSize: typography.sizes.xs, color: colors.textSecondary }}>
                Items per slot (override){' '}
                <input type="number" min={1} max={2000} style={{ ...input, width: 80 }}
                  value={itemsOverride} placeholder={String(derivedItems)}
                  onChange={(e) => setItemsOverride(e.target.value === '' ? '' : Number(e.target.value))} />
              </label>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, lineHeight: 1.6, marginBottom: spacing.md }}>
        <p style={{ margin: `0 0 ${spacing.xs} 0` }}>
          <strong>Set it too high</strong> and the pacing stops working — everyone picks 12:00, you get slammed, orders
          run late, and the skip-the-line promise your app customers paid for breaks.<br />
          <strong>Set it too low</strong> and you turn away the app customers you do have — they&apos;ll see Full and
          order somewhere else.
        </p>
        <p style={{ margin: `0 0 ${spacing.xs} 0` }}>
          <strong>Start conservative.</strong> App ordering builds slowly at first; it&apos;s easy to raise this once you
          see how it actually runs.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Turn it down when:</strong> short-staffed, running a slower or more complex menu, or working a new
          location. <strong>Turn it up when:</strong> fully staffed, running a fast menu, or slots keep going Full early
          in the service.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <button onClick={() => save(false)} disabled={saving || !isConfigured || q2ExceedsQ1}
          style={{
            padding: `${spacing.xs} ${spacing.md}`, borderRadius: radius.sm, border: 'none',
            backgroundColor: isConfigured && !q2ExceedsQ1 ? colors.primary : colors.border,
            color: isConfigured && !q2ExceedsQ1 ? 'white' : colors.textMuted,
            fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm,
            cursor: isConfigured && !q2ExceedsQ1 ? 'pointer' : 'default', minHeight: 40, opacity: saving ? 0.6 : 1,
          }}>
          {saving ? 'Saving...' : 'Save capacity'}
        </button>
        {current.app_orders != null && (
          <button onClick={() => save(true)} disabled={saving}
            style={{ padding: `${spacing.xs} ${spacing.md}`, borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textSecondary, fontSize: typography.sizes.sm, cursor: 'pointer', minHeight: 40 }}>
            Remove limit
          </button>
        )}
        {message && (
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, color: message.includes('Fail') || message.includes('Error') ? statusColors.danger : statusColors.success }}>
            {message}
          </span>
        )}
      </div>
      <p style={{ margin: `${spacing.xs} 0 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted, fontStyle: 'italic' }}>
        No limit set = unlimited app orders per slot (how it works today).
      </p>
    </div>
  )
}
