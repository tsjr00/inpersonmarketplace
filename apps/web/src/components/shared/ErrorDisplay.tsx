'use client'

import { useState } from 'react'

interface ErrorDisplayProps {
  error: string | {
    error?: string
    message?: string
    code?: string
    traceId?: string
    details?: string
  }
  onDismiss?: () => void
}

/**
 * ErrorDisplay - Shows error messages with error codes and trace IDs
 *
 * Displays errors in a consistent format with:
 * - Error message
 * - Error code (if available)
 * - Trace ID (if available)
 * - "Report Error" link that copies info to clipboard
 */
export default function ErrorDisplay({ error, onDismiss }: ErrorDisplayProps) {
  const [copied, setCopied] = useState(false)

  // Normalize error to object form
  const errorObj = typeof error === 'string'
    ? { error: error }
    : error

  const message = errorObj.error || errorObj.message || 'An error occurred'
  const code = errorObj.code
  const traceId = errorObj.traceId
  const details = errorObj.details

  const handleCopyReport = async () => {
    const reportText = [
      `Error: ${message}`,
      code && `Code: ${code}`,
      traceId && `Trace ID: ${traceId}`,
      details && `Details: ${details}`,
      `Time: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
    ].filter(Boolean).join('\n')

    try {
      await navigator.clipboard.writeText(reportText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
      const textarea = document.createElement('textarea')
      textarea.value = reportText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={{
      padding: 16,
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: 8,
      color: '#991b1b',
      marginBottom: 16
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {/* Main error message */}
          <p style={{ margin: 0, fontWeight: 500 }}>{message}</p>

          {/* Error code and trace ID */}
          {(code || traceId) && (
            <div style={{
              marginTop: 8,
              fontSize: 12,
              fontFamily: 'monospace',
              color: '#7f1d1d',
              backgroundColor: '#fee2e2',
              padding: '6px 8px',
              borderRadius: 4,
              display: 'inline-block'
            }}>
              {code && <span>Code: {code}</span>}
              {code && traceId && <span> | </span>}
              {traceId && <span>Trace: {traceId}</span>}
            </div>
          )}

          {/* Report error button */}
          {(code || traceId) && (
            <button
              onClick={handleCopyReport}
              style={{
                marginTop: 8,
                marginLeft: 8,
                padding: '4px 10px',
                backgroundColor: copied ? '#dcfce7' : '#fef3c7',
                color: copied ? '#166534' : '#92400e',
                border: `1px solid ${copied ? '#86efac' : '#fcd34d'}`,
                borderRadius: 4,
                fontSize: 12,
                cursor: 'pointer',
                verticalAlign: 'middle'
              }}
            >
              {copied ? '✓ Copied!' : 'Copy Error Report'}
            </button>
          )}
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              color: '#991b1b',
              cursor: 'pointer',
              fontSize: 18,
              padding: '0 0 0 12px',
              lineHeight: 1
            }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
