'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

/**
 * Manager-editable schedule card on the manager dashboard.
 *
 * Combines two concepts that both belong to "how this market runs":
 *   - market_schedules rows: per-day-of-week active toggle + start/end time
 *   - markets.season_start + season_end: when the market operates each year
 *
 * v1 rules (locked 2026-05-19):
 *   - One slot per day of week (the API enforces this — no DB constraint).
 *   - Saving requires acknowledging 3 responsibility bullets in a confirm
 *     dialog before the change goes through.
 *   - After a successful save, every approved vendor at the market gets
 *     an in-app + email notification. The platform does NOT issue refunds
 *     for schedule changes — that's between the manager and the affected
 *     vendors.
 *
 * Data flow: receives initial state via props from the dashboard page
 * (server-side fetch). On Save, PUTs the full new state to the API and
 * router.refresh() to update server-rendered surfaces.
 *
 * Empty state (no schedule entries yet) is handled the same as edit mode
 * — 7 day rows render with active=false defaults; manager toggles on the
 * day(s) they operate and fills in times.
 */
interface ScheduleRow {
  day_of_week: number
  start_time: string | null
  end_time: string | null
  active: boolean | null
}

interface MarketScheduleCardProps {
  marketId: string
  initialSchedules: ScheduleRow[]
  initialSeasonStart: string | null
  initialSeasonEnd: string | null
  /** True when a schedule change would notify someone (approved
   *  market_vendors OR paid weekly_booth_rentals for upcoming weeks).
   *  When false, save bypasses the acknowledgment dialog — the
   *  responsibility/refund warning copy doesn't apply to a market
   *  with no active stakeholders. Defaults to true (conservative). */
  hasScheduleChangeRecipients?: boolean
}

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function formatTimeDisplay(t: string | null): string {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
}

/** Normalize a TIME column value (which may be "HH:MM:SS") to "HH:MM"
 *  for the type="time" HTML input. */
function timeForInput(t: string | null): string {
  if (!t) return ''
  // Strip seconds if present
  return t.length >= 5 ? t.substring(0, 5) : t
}

interface DayState {
  active: boolean
  start_time: string  // "HH:MM" for the input control; empty when inactive
  end_time: string
}

/** Build a 7-element DayState array from existing schedule rows. */
function buildDayStates(rows: ScheduleRow[]): DayState[] {
  const states: DayState[] = Array.from({ length: 7 }, () => ({
    active: false,
    start_time: '',
    end_time: '',
  }))
  for (const r of rows) {
    if (r.day_of_week < 0 || r.day_of_week > 6) continue
    states[r.day_of_week] = {
      active: r.active !== false,
      start_time: timeForInput(r.start_time),
      end_time: timeForInput(r.end_time),
    }
  }
  return states
}

export default function MarketScheduleCard({
  marketId,
  initialSchedules,
  initialSeasonStart,
  initialSeasonEnd,
  hasScheduleChangeRecipients = true,
}: MarketScheduleCardProps) {
  const router = useRouter()

  const [days, setDays] = useState<DayState[]>(() => buildDayStates(initialSchedules))
  const [seasonStart, setSeasonStart] = useState<string>(initialSeasonStart ?? '')
  const [seasonEnd, setSeasonEnd] = useState<string>(initialSeasonEnd ?? '')

  // Saved baseline — used to (a) reset on Cancel and (b) show in view mode
  const [savedDays, setSavedDays] = useState<DayState[]>(() => buildDayStates(initialSchedules))
  const [savedSeasonStart, setSavedSeasonStart] = useState<string>(initialSeasonStart ?? '')
  const [savedSeasonEnd, setSavedSeasonEnd] = useState<string>(initialSeasonEnd ?? '')

  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  function startEdit() {
    setEditing(true)
    setError(null)
    setSavedFlash(false)
  }

  function cancelEdit() {
    setDays(savedDays.map((d) => ({ ...d })))
    setSeasonStart(savedSeasonStart)
    setSeasonEnd(savedSeasonEnd)
    setEditing(false)
    setError(null)
  }

  function updateDay(index: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  // Client-side validation before opening the confirm dialog.
  function validateForSave(): string | null {
    if (seasonStart && seasonEnd && seasonStart > seasonEnd) {
      return 'Season start must be on or before season end.'
    }
    for (let i = 0; i < 7; i++) {
      const d = days[i]
      if (!d.active) continue
      if (!d.start_time || !d.end_time) {
        return `${DAYS[i]}: set both start and end time, or mark the day inactive.`
      }
      if (d.start_time >= d.end_time) {
        return `${DAYS[i]}: start time must be before end time.`
      }
    }
    return null
  }

  function requestSave() {
    const v = validateForSave()
    if (v) {
      setError(v)
      return
    }
    setError(null)
    // Skip the acknowledgment dialog when no one would be notified by
    // the change. The dialog's bullets are about vendor outreach +
    // refund responsibility — none of that applies to a market with
    // zero approved vendors and zero paid booth renters (typically a
    // brand-new market mid-onboarding).
    if (!hasScheduleChangeRecipients) {
      // No dialog — no one to notify, no responsibility copy to read.
      // performSaveCore skips the acknowledgment-state gate.
      void performSaveCore()
      return
    }
    setAcknowledged(false)
    setConfirming(true)
  }

  async function performSave() {
    if (!acknowledged) return
    await performSaveCore()
  }

  async function performSaveCore() {
    setConfirming(false)
    setSaving(true)
    setError(null)
    try {
      // Build the schedule payload — send all days that have times set,
      // active or inactive. Inactive rows with times = "manager toggled
      // off a day that previously had hours" → API will UPDATE active=false
      // while preserving the times so toggling back on later is one click.
      // Days with no times yet (never set up) are skipped — nothing to
      // store in market_schedules (start_time / end_time are NOT NULL).
      // The API does per-day soft-upsert; NEVER deletes. See schedules/route.ts
      // header for the full rationale (verification-discipline Rule 5).
      const schedules = days
        .map((d, i) => ({
          day_of_week: i,
          start_time: d.start_time,
          end_time: d.end_time,
          active: d.active,
        }))
        .filter((d) => Boolean(d.start_time && d.end_time))

      const res = await fetch(`/api/market-manager/${marketId}/schedules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedules,
          season_start: seasonStart || null,
          season_end: seasonEnd || null,
          acknowledged: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Save failed. Please try again.')
        return
      }
      // Persist the new baseline.
      setSavedDays(days.map((d) => ({ ...d })))
      setSavedSeasonStart(seasonStart)
      setSavedSeasonEnd(seasonEnd)
      setEditing(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
      router.refresh()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── View mode ──────────────────────────────────────────────────────
  if (!editing) {
    const activeDays = savedDays
      .map((d, i) => ({ ...d, day_of_week: i }))
      .filter((d) => d.active)
      .sort((a, b) => a.day_of_week - b.day_of_week)

    return (
      <div style={cardOuterStyle}>
        <div style={cardHeaderRowStyle}>
          <h2 style={cardHeaderStyle}>Market schedule</h2>
          <button
            type="button"
            onClick={startEdit}
            style={primaryButtonStyle}
          >
            Edit schedule
          </button>
        </div>
        <p style={cardSubStyle}>
          Your published schedule + season window. Vendors at this market
          see the same info; changes go out as an in-app + email
          notification.
        </p>

        {/* Season window (if set) */}
        {(savedSeasonStart || savedSeasonEnd) && (
          <div style={{
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            marginBottom: spacing.sm,
          }}>
            <strong style={{ color: colors.textMuted, fontWeight: typography.weights.semibold }}>
              Season:
            </strong>
            {' '}
            {savedSeasonStart || '?'} – {savedSeasonEnd || '?'}
          </div>
        )}

        {activeDays.length === 0 ? (
          <p style={{
            margin: 0,
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            fontStyle: 'italic',
          }}>
            No active schedule entries. Click &ldquo;Edit schedule&rdquo; to set
            your market days.
          </p>
        ) : (
          <ul style={daysListStyle}>
            {activeDays.map((d) => (
              <li key={d.day_of_week} style={dayRowStyle}>
                <span style={dayLabelStyle}>{DAYS[d.day_of_week]}</span>
                <span style={{ color: colors.textPrimary }}>
                  {formatTimeDisplay(d.start_time)} – {formatTimeDisplay(d.end_time)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {savedFlash && (
          <div style={successFlashStyle}>✓ Schedule saved and vendors notified</div>
        )}
      </div>
    )
  }

  // ── Edit mode ──────────────────────────────────────────────────────
  return (
    <div style={cardOuterStyle}>
      <div style={cardHeaderRowStyle}>
        <h2 style={cardHeaderStyle}>Market schedule</h2>
        <div style={{ display: 'flex', gap: spacing.xs }}>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            style={secondaryButtonStyle}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={requestSave}
            disabled={saving}
            style={primaryButtonStyle}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
      <p style={cardSubStyle}>
        Toggle the days your market operates and set the times for each.
        Use the season window to limit when this schedule applies. Saving
        sends a notification to every approved vendor at this market.
      </p>

      {/* Season window editor */}
      <div style={{
        display: 'flex',
        gap: spacing.sm,
        flexWrap: 'wrap',
        marginBottom: spacing.md,
        padding: spacing.sm,
        backgroundColor: colors.surfaceBase,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.sm,
      }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={fieldLabelStyle}>Season start</label>
          <input
            type="date"
            value={seasonStart}
            onChange={(e) => setSeasonStart(e.target.value)}
            disabled={saving}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={fieldLabelStyle}>Season end</label>
          <input
            type="date"
            value={seasonEnd}
            onChange={(e) => setSeasonEnd(e.target.value)}
            disabled={saving}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Per-day editor */}
      <ul style={daysListStyle}>
        {days.map((d, i) => (
          <li
            key={i}
            style={{
              ...dayRowEditStyle,
              opacity: d.active ? 1 : 0.6,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, minWidth: 120 }}>
              <input
                type="checkbox"
                checked={d.active}
                onChange={(e) => updateDay(i, { active: e.target.checked })}
                disabled={saving}
              />
              <span style={dayLabelStyle}>{DAYS[i]}</span>
            </label>
            <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', flex: '1 1 200px' }}>
              <input
                type="time"
                value={d.start_time}
                onChange={(e) => updateDay(i, { start_time: e.target.value })}
                disabled={!d.active || saving}
                style={inputStyle}
              />
              <span style={{ color: colors.textMuted }}>–</span>
              <input
                type="time"
                value={d.end_time}
                onChange={(e) => updateDay(i, { end_time: e.target.value })}
                disabled={!d.active || saving}
                style={inputStyle}
              />
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <div style={errorBoxStyle}>{error}</div>
      )}

      <AcknowledgmentDialog
        open={confirming}
        acknowledged={acknowledged}
        onAcknowledgeChange={setAcknowledged}
        onConfirm={performSave}
        onCancel={() => {
          setConfirming(false)
          setAcknowledged(false)
        }}
      />
    </div>
  )
}

// ── Inline acknowledgment modal ─────────────────────────────────────
//
// Custom modal (not the shared ConfirmDialog) because we need a rich body
// — three bullet points + acknowledgment checkbox + gated confirm — that
// the shared component doesn't support. Patterns mirrored from
// shared/ConfirmDialog.tsx: backdrop click closes, Escape closes,
// fixed-position overlay.

interface AcknowledgmentDialogProps {
  open: boolean
  acknowledged: boolean
  onAcknowledgeChange: (next: boolean) => void
  onConfirm: () => void
  onCancel: () => void
}

function AcknowledgmentDialog({
  open,
  acknowledged,
  onAcknowledgeChange,
  onConfirm,
  onCancel,
}: AcknowledgmentDialogProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.sm,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: -1,
      }} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ack-dialog-title"
        style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          boxShadow: shadows.xl,
          width: '100%',
          maxWidth: 480,
          padding: spacing.md,
          outline: 'none',
        }}
      >
        <h3
          id="ack-dialog-title"
          style={{
            margin: `0 0 ${spacing.xs} 0`,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
          }}
        >
          Save schedule changes?
        </h3>

        <p style={{ margin: `0 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm, color: colors.textPrimary, lineHeight: 1.5 }}>
          Before you save:
        </p>
        <ul style={{
          margin: `0 0 ${spacing.sm} 0`,
          paddingLeft: spacing.md,
          fontSize: typography.sizes.sm,
          color: colors.textPrimary,
          lineHeight: 1.5,
          listStyleType: 'disc',   // Explicit so global CSS resets don't hide the bullet markers.
          listStylePosition: 'outside',
        }}>
          <li style={{ marginBottom: spacing['3xs'] }}>You are responsible for contacting the affected vendors directly.</li>
          <li style={{ marginBottom: spacing['3xs'] }}>Vendors at this market will get an automatic notification of the change and may request a refund from you.</li>
          <li style={{ marginBottom: spacing['3xs'] }}>The platform does not issue refunds for schedule changes — refunds are between you and the affected vendors.</li>
          <li>Turning a day off keeps your hours saved — you can re-enable it later without re-entering anything. Vendor attendance on that day is deactivated (not deleted); vendors must re-opt in if you turn the day back on.</li>
        </ul>

        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: spacing.xs,
          padding: spacing.xs,
          backgroundColor: colors.surfaceBase,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.sm,
          cursor: 'pointer',
          marginBottom: spacing.md,
        }}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledgeChange(e.target.checked)}
            style={{ marginTop: 3, cursor: 'pointer' }}
          />
          <span style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary, fontSize: typography.sizes.sm }}>
            I understand and accept these responsibilities.
          </span>
        </label>

        <div style={{
          display: 'flex',
          gap: spacing.xs,
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: `${spacing['2xs']} ${spacing.md}`,
              backgroundColor: 'transparent',
              color: colors.textSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer',
              minHeight: 44,
              minWidth: 80,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!acknowledged}
            style={{
              padding: `${spacing['2xs']} ${spacing.md}`,
              backgroundColor: acknowledged ? '#dc2626' : colors.surfaceBase,
              color: acknowledged ? '#fff' : colors.textMuted,
              border: acknowledged ? 'none' : `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              cursor: acknowledged ? 'pointer' : 'not-allowed',
              minHeight: 44,
              minWidth: 80,
            }}
          >
            Save schedule changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared styles ────────────────────────────────────────────────────

const cardOuterStyle: React.CSSProperties = {
  padding: spacing.md,
  backgroundColor: colors.surfaceElevated,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  marginBottom: spacing.md,
}

const cardHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.sm,
  flexWrap: 'wrap',
  marginBottom: spacing.xs,
}

const cardHeaderStyle: React.CSSProperties = {
  margin: 0,
  fontSize: typography.sizes.lg,
  fontWeight: typography.weights.semibold,
  color: colors.textPrimary,
}

const cardSubStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: spacing.sm,
  color: colors.textMuted,
  fontSize: typography.sizes.sm,
  lineHeight: 1.5,
}

const daysListStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: spacing['2xs'],
  fontSize: typography.sizes.sm,
}

const dayRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: spacing.sm,
  padding: `${spacing['2xs']} 0`,
  borderBottom: `1px solid ${colors.border}`,
}

const dayRowEditStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  padding: spacing.xs,
  backgroundColor: colors.surfaceBase,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  flexWrap: 'wrap',
}

const dayLabelStyle: React.CSSProperties = {
  minWidth: 100,
  fontWeight: typography.weights.semibold,
  color: colors.textPrimary,
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: typography.sizes.xs,
  color: colors.textMuted,
  marginBottom: spacing['3xs'],
  fontWeight: typography.weights.semibold,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  padding: `${spacing['3xs']} ${spacing.xs}`,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.md}`,
  backgroundColor: colors.primary,
  color: 'white',
  border: 'none',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.md}`,
  backgroundColor: 'transparent',
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  cursor: 'pointer',
}

const errorBoxStyle: React.CSSProperties = {
  marginTop: spacing.sm,
  padding: spacing.xs,
  backgroundColor: '#f8d7da',
  color: '#721c24',
  border: '1px solid #f5c6cb',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
}

const successFlashStyle: React.CSSProperties = {
  marginTop: spacing.sm,
  padding: spacing.xs,
  backgroundColor: '#d4edda',
  color: '#155724',
  border: '1px solid #c3e6cb',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
}
