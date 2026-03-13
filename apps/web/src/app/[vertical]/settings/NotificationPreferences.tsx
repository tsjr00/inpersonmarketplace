'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

interface NotificationPreferencesProps {
  primaryColor: string
  initialPhone: string
  initialSmsConsent: boolean
}

interface Preferences {
  email_order_updates: boolean
  email_marketing: boolean
  sms_order_updates: boolean
  sms_marketing: boolean
  push_enabled: boolean
  sound_enabled: boolean
}

const DEFAULT_PREFS: Preferences = {
  email_order_updates: true,
  email_marketing: false,
  sms_order_updates: false,
  sms_marketing: false,
  push_enabled: false,
  sound_enabled: true,
}

export default function NotificationPreferences({ primaryColor, initialPhone, initialSmsConsent }: NotificationPreferencesProps) {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS)
  const [loading] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [initialPrefs, setInitialPrefs] = useState<Preferences | null>(null)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<string>('default')

  // SMS opt-in state
  const [phone, setPhone] = useState(initialPhone)
  const [smsConsent, setSmsConsent] = useState(initialSmsConsent)
  const [smsLoading, setSmsLoading] = useState(false)
  const [changingNumber, setChangingNumber] = useState(false)

  const smsEnabled = initialSmsConsent && Boolean(initialPhone) && !changingNumber

  // Format phone as user types: (555) 123-4567
  const formatPhone = (value: string): string => {
    const digits = value.replace(/\D/g, '')
    const local = digits.startsWith('1') && digits.length > 10 ? digits.slice(1) : digits
    if (local.length <= 3) return local
    if (local.length <= 6) return `(${local.slice(0, 3)}) ${local.slice(3)}`
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 10)}`
  }

  const handlePhoneChange = (value: string) => {
    const cleaned = value.replace(/[^\d()\s-]/g, '')
    setPhone(formatPhone(cleaned))
    setMessage(null)
  }

  const phoneDigits = phone.replace(/\D/g, '')
  const hasValidPhone = phoneDigits.length >= 10

  const handlePhoneClear = () => {
    setPhone('')
    setSmsConsent(false)
    setMessage(null)
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true)
      setPushPermission(Notification.permission)
    }

    const loadPreferences = async () => {
      try {
        const res = await fetch('/api/user/notifications')
        if (res.ok) {
          const data = await res.json()
          if (data.preferences) {
            const merged = { ...DEFAULT_PREFS, ...data.preferences }
            setPreferences(merged)
            setInitialPrefs(merged)
          }
        }
      } catch {
        // Use defaults if fetch fails
      }
    }
    loadPreferences()
  }, [])

  useEffect(() => {
    if (initialPrefs) {
      const changed = (Object.keys(preferences) as (keyof Preferences)[]).some(
        key => preferences[key] !== initialPrefs[key]
      )
      setHasChanges(changed)
    }
  }, [preferences, initialPrefs])

  const handleToggle = (key: keyof Preferences) => {
    if (key === 'push_enabled') return
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
    setMessage(null)
  }

  const handlePushToggle = async () => {
    if (pushLoading) return
    setPushLoading(true)
    setMessage(null)

    try {
      if (!preferences.push_enabled) {
        const permission = await Notification.requestPermission()
        setPushPermission(permission)
        if (permission !== 'granted') {
          setPushLoading(false)
          return
        }

        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        })

        const sub = subscription.toJSON()
        const res = await fetch('/api/notifications/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: sub.keys,
          }),
        })

        if (!res.ok) {
          setMessage({ type: 'error', text: 'Failed to register push subscription' })
          setPushLoading(false)
          return
        }

        setPreferences(prev => ({ ...prev, push_enabled: true }))
      } else {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          const endpoint = subscription.endpoint
          await subscription.unsubscribe()
          await fetch('/api/notifications/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
          })
        }

        setPreferences(prev => ({ ...prev, push_enabled: false }))
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update push notifications' })
    } finally {
      setPushLoading(false)
    }
  }

  const handleSave = async () => {
    setMessage(null)

    // Optimistically show success immediately
    const prevPrefs = initialPrefs
    setMessage({ type: 'success', text: 'Preferences saved!' })
    setInitialPrefs(preferences)
    setHasChanges(false)

    // Fire API in background, revert on error
    try {
      const res = await fetch('/api/user/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences)
      })

      if (!res.ok) {
        setInitialPrefs(prevPrefs)
        setMessage({ type: 'error', text: 'Failed to save preferences' })
      }
    } catch {
      setInitialPrefs(prevPrefs)
      setMessage({ type: 'error', text: 'Error saving preferences' })
    }
  }

  // Save phone + SMS consent, then refresh page so SMS toggles unlock
  const handleSmsOptIn = async () => {
    if (!hasValidPhone) {
      setMessage({ type: 'error', text: 'Please enter a valid phone number' })
      return
    }
    if (!smsConsent) {
      setMessage({ type: 'error', text: 'Please accept the SMS terms to enable text notifications' })
      return
    }

    setSmsLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          sms_consent: true,
        })
      })

      if (res.ok) {
        // Refresh page so server re-renders with updated smsEnabled
        router.refresh()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to save phone number' })
        setSmsLoading(false)
      }
    } catch {
      setMessage({ type: 'error', text: 'Error saving phone number' })
      setSmsLoading(false)
    }
  }

  const ToggleSwitch = ({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 48,
        height: 26,
        borderRadius: 13,
        border: 'none',
        backgroundColor: checked ? primaryColor : '#d1d5db',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background-color 0.2s',
        opacity: disabled ? 0.5 : 1
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: checked ? 25 : 3,
        width: 20,
        height: 20,
        borderRadius: '50%',
        backgroundColor: 'white',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }} />
    </button>
  )

  const pushDisabled = !pushSupported || pushPermission === 'denied' || pushLoading
  const pushStatusText = !pushSupported
    ? 'Not supported in this browser'
    : pushPermission === 'denied'
      ? 'Blocked in browser settings — see setup guide'
      : pushLoading
        ? 'Setting up...'
        : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Email Notifications */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 12px 0' }}>
          Email Notifications
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Order Updates</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                Get notified about order status changes
              </p>
            </div>
            <ToggleSwitch
              checked={preferences.email_order_updates}
              onChange={() => handleToggle('email_order_updates')}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Marketing & Promotions</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                {`Receive deals and ${term(vertical, 'market').toLowerCase()} updates`}
              </p>
            </div>
            <ToggleSwitch
              checked={preferences.email_marketing}
              onChange={() => handleToggle('email_marketing')}
            />
          </div>
        </div>
      </div>

      {/* Push Notifications */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 12px 0' }}>
          Push Notifications
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: pushDisabled && !pushLoading ? '#9ca3af' : undefined }}>
                Browser Notifications
              </p>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: pushDisabled && !pushLoading ? '#9ca3af' : '#6b7280' }}>
                {pushStatusText || 'Get instant alerts for orders and pickups'}
              </p>
            </div>
            <ToggleSwitch
              checked={preferences.push_enabled}
              onChange={handlePushToggle}
              disabled={pushDisabled}
            />
          </div>
        </div>
      </div>

      {/* Setup guide link */}
      {(!pushSupported || pushPermission === 'denied') && (
        <div style={{ padding: '8px 12px', backgroundColor: colors.primaryLight, borderRadius: 6, fontSize: 12 }}>
          <a href={`/${vertical}/help/setup`} style={{ color: colors.primaryDark, fontWeight: 600 }}>
            View Setup Guide
          </a>{' '}
          <span style={{ color: colors.textMuted }}>— step-by-step instructions for enabling notifications and installing the app.</span>
        </div>
      )}

      {/* Sound & Vibration */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 12px 0' }}>
          Sound & Vibration
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Notification Sounds</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                Play a sound when new notifications arrive. Vibration is always on.
              </p>
            </div>
            <ToggleSwitch
              checked={preferences.sound_enabled}
              onChange={() => handleToggle('sound_enabled')}
            />
          </div>
        </div>
      </div>

      {/* SMS Notifications */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 12px 0' }}>
          SMS Notifications
        </h3>

        {!smsEnabled ? (
          /* SMS opt-in flow: phone number + consent */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
              Add your phone number and accept the terms below to enable SMS notifications.
            </p>

            {/* Phone Number */}
            <div>
              <label style={{
                display: 'block',
                fontSize: typography.sizes.sm,
                color: colors.textMuted,
                marginBottom: 6,
                fontWeight: typography.weights.medium
              }}>
                Phone Number
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, maxWidth: 400 }}>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="(555) 123-4567"
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.sm,
                    color: colors.textPrimary,
                    backgroundColor: colors.inputBg,
                    boxSizing: 'border-box'
                  }}
                />
                {phone && (
                  <button
                    type="button"
                    onClick={handlePhoneClear}
                    style={{
                      padding: '10px 12px',
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      backgroundColor: colors.surfaceMuted,
                      color: colors.textMuted,
                      fontSize: typography.sizes.sm,
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* SMS Consent */}
            {hasValidPhone && (
              <>
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.border}`,
                  maxWidth: 500
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: spacing.xs,
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={smsConsent}
                      onChange={(e) => { setSmsConsent(e.target.checked); setMessage(null) }}
                      style={{
                        width: 18,
                        height: 18,
                        marginTop: 2,
                        flexShrink: 0,
                        accentColor: primaryColor,
                        cursor: 'pointer'
                      }}
                    />
                    <span style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, lineHeight: '1.5' }}>
                      I agree to receive automated SMS/text messages from {term(vertical, 'display_name')} for order
                      status alerts, pickup notifications, and cancellation notices. Message frequency varies
                      (typically 1-5 per week during active orders). Message and data rates may apply.
                      Reply STOP to opt out, HELP for help. See our{' '}
                      <a href={`/${vertical}/terms#sms-terms`} target="_blank" style={{ color: primaryColor }}>Terms of Service</a>
                      {' '}and{' '}
                      <a href={`/${vertical}/terms#privacy-policy`} target="_blank" style={{ color: primaryColor }}>Privacy Policy</a>.
                    </span>
                  </label>
                </div>

                <div>
                  <button
                    onClick={handleSmsOptIn}
                    disabled={smsLoading || !smsConsent}
                    style={{
                      padding: '10px 24px',
                      backgroundColor: smsLoading || !smsConsent ? '#d1d5db' : primaryColor,
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: smsLoading || !smsConsent ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {smsLoading ? 'Enabling...' : 'Enable SMS Notifications'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* SMS already enabled — show toggles */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Order Updates</p>
                <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                  Get text alerts about your orders
                </p>
              </div>
              <ToggleSwitch
                checked={preferences.sms_order_updates}
                onChange={() => handleToggle('sms_order_updates')}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Marketing & Promotions</p>
                <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                  Receive deals via text message
                </p>
              </div>
              <ToggleSwitch
                checked={preferences.sms_marketing}
                onChange={() => handleToggle('sms_marketing')}
              />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              Phone: {initialPhone} · <button
                onClick={() => { setChangingNumber(true); setPhone(initialPhone); setSmsConsent(false) }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: primaryColor,
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 12,
                  textDecoration: 'underline'
                }}
              >
                Change number
              </button>
            </p>
          </div>
        )}
      </div>

      {/* Save Preferences Button (for email/push/sound/sms toggles) */}
      <div>
        <button
          onClick={handleSave}
          disabled={loading || !hasChanges}
          style={{
            padding: '10px 24px',
            backgroundColor: loading || !hasChanges ? '#d1d5db' : primaryColor,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading || !hasChanges ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 6,
          backgroundColor: message.type === 'success' ? colors.primaryLight : '#fee2e2',
          color: message.type === 'success' ? colors.primaryDark : '#991b1b',
          fontSize: 14
        }}>
          {message.text}
        </div>
      )}
    </div>
  )
}
