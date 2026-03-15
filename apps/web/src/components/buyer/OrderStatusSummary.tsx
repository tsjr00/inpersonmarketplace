'use client'

import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface OrderStatusSummaryProps {
  status: string
  updatedAt: string
  readyCount?: number
  totalActiveCount?: number
}

export default function OrderStatusSummary({ status, updatedAt, readyCount, totalActiveCount }: OrderStatusSummaryProps) {
  const locale = getClientLocale()

  const STATUS_INFO: Record<string, { icon: string; color: string; bg: string; titleKey: string; msgKey: string }> = {
    pending: {
      icon: '⏳',
      color: '#f59e0b',
      bg: '#fef3c7',
      titleKey: 'status.pending_title',
      msgKey: 'status.pending_msg'
    },
    confirmed: {
      icon: '✓',
      color: '#3b82f6',
      bg: '#dbeafe',
      titleKey: 'status.confirmed_title',
      msgKey: 'status.confirmed_msg'
    },
    ready: {
      icon: '📦',
      color: '#10b981',
      bg: '#d1fae5',
      titleKey: 'status.ready_title',
      msgKey: 'status.ready_msg'
    },
    handed_off: {
      icon: '🤝',
      color: '#f59e0b',
      bg: '#fef3c7',
      titleKey: 'status.handed_off_title',
      msgKey: 'status.handed_off_msg'
    },
    fulfilled: {
      icon: '✓',
      color: '#8b5cf6',
      bg: '#e0e7ff',
      titleKey: 'status.fulfilled_title',
      msgKey: 'status.fulfilled_msg'
    },
    completed: {
      icon: '✓',
      color: '#8b5cf6',
      bg: '#e0e7ff',
      titleKey: 'status.completed_title',
      msgKey: 'status.completed_msg'
    },
    cancelled: {
      icon: '✕',
      color: '#ef4444',
      bg: '#fee2e2',
      titleKey: 'status.cancelled_title',
      msgKey: 'status.cancelled_msg'
    },
    expired: {
      icon: '⏱',
      color: '#6b7280',
      bg: '#f3f4f6',
      titleKey: 'status.expired_title',
      msgKey: 'status.expired_msg'
    }
  }

  const info = STATUS_INFO[status] || STATUS_INFO.pending
  const lastUpdated = new Date(updatedAt).toLocaleString()

  // Override messaging for partial readiness
  const isPartiallyReady = status === 'ready' && readyCount !== undefined && totalActiveCount !== undefined && readyCount < totalActiveCount
  const displayTitle = isPartiallyReady ? t('status.partially_ready', locale) : t(info.titleKey, locale)
  const displayMessage = isPartiallyReady
    ? t('status.x_of_y_ready', locale, { ready: String(readyCount), total: String(totalActiveCount) })
    : t(info.msgKey, locale)

  return (
    <div style={{
      padding: 20,
      backgroundColor: info.bg,
      borderRadius: 8,
      border: `2px solid ${info.color}`,
      marginBottom: 24
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 32 }}>{info.icon}</span>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: info.color }}>
            {displayTitle}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 14, color: info.color }}>
            {displayMessage}
          </p>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
        {t('status.last_updated', locale)} {lastUpdated}
      </p>
    </div>
  )
}
