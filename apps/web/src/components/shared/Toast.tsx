'use client'
import { useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
  message: string
  type: ToastType
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const colors = {
    success: { bg: '#10b981', icon: '✓' },
    error: { bg: '#ef4444', icon: '✗' },
    info: { bg: '#3b82f6', icon: 'ℹ' },
    warning: { bg: '#f59e0b', icon: '⚠' }
  }

  const config = colors[type]

  return (
    <>
      <div
        className="toast-notification"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          minWidth: 300,
          maxWidth: 500,
          padding: '16px 20px',
          backgroundColor: config.bg,
          color: 'white',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          animation: 'toastSlideIn 0.3s ease-out'
        }}
      >
        <span style={{ fontSize: 20, flexShrink: 0 }}>{config.icon}</span>
        <p style={{ margin: 0, flex: 1, fontSize: 14, lineHeight: 1.5 }}>{message}</p>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: 20,
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            opacity: 0.8
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
        >
          ×
        </button>
      </div>
      <style>{`
        @keyframes toastSlideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </>
  )
}
