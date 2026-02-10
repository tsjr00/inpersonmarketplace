'use client'

import { useState, useEffect } from 'react'

interface NotificationPreferencesProps {
  primaryColor: string
}

interface Preferences {
  email_order_updates: boolean
  email_marketing: boolean
  sms_order_updates: boolean
  sms_marketing: boolean
  push_enabled: boolean
}

const DEFAULT_PREFS: Preferences = {
  email_order_updates: true,
  email_marketing: false,
  sms_order_updates: false,
  sms_marketing: false,
  push_enabled: false,
}

export default function NotificationPreferences({ primaryColor }: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [initialPrefs, setInitialPrefs] = useState<Preferences | null>(null)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<string>('default')

  useEffect(() => {
    // Check push support
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
    if (key === 'push_enabled') return // Push has its own handler
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
        // Enabling push
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
        // Disabling push
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
    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/user/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences)
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Preferences saved!' })
        setInitialPrefs(preferences)
        setHasChanges(false)
      } else {
        setMessage({ type: 'error', text: 'Failed to save preferences' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Error saving preferences' })
    } finally {
      setLoading(false)
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
      ? 'Blocked in browser settings'
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
                Receive deals and market updates
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

      {/* SMS Notifications */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 12px 0' }}>
          SMS Notifications
          <span style={{
            marginLeft: 8,
            padding: '2px 8px',
            backgroundColor: '#fef3c7',
            color: '#92400e',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 500
          }}>
            Coming Soon
          </span>
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#9ca3af' }}>Order Updates</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#9ca3af' }}>
                Get text alerts about your orders
              </p>
            </div>
            <ToggleSwitch
              checked={preferences.sms_order_updates}
              onChange={() => handleToggle('sms_order_updates')}
              disabled={true}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#9ca3af' }}>Marketing & Promotions</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#9ca3af' }}>
                Receive deals via text message
              </p>
            </div>
            <ToggleSwitch
              checked={preferences.sms_marketing}
              onChange={() => handleToggle('sms_marketing')}
              disabled={true}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
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
          backgroundColor: message.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: message.type === 'success' ? '#065f46' : '#991b1b',
          fontSize: 14
        }}>
          {message.text}
        </div>
      )}
    </div>
  )
}
