'use client'

import { useState, useEffect, useRef } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  /** When true, shows a text input for the user to provide a reason/description */
  showInput?: boolean
  inputLabel?: string
  inputPlaceholder?: string
  inputRequired?: boolean
  onConfirm: (inputValue?: string) => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  showInput = false,
  inputLabel,
  inputPlaceholder,
  inputRequired = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus the input or the dialog when opened
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      if (showInput && inputRef.current) {
        inputRef.current.focus()
      } else if (dialogRef.current) {
        dialogRef.current.focus()
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [open, showInput])

  const handleCancel = () => {
    onCancel()
    setInputValue('')
  }

  const handleConfirm = () => {
    if (showInput && inputRequired && !inputValue.trim()) return
    onConfirm(showInput ? inputValue : undefined)
    setInputValue('')
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
        setInputValue('')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  const isDanger = variant === 'danger'

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
        if (e.target === e.currentTarget) handleCancel()
      }}
    >
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: -1,
      }} />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          boxShadow: shadows.xl,
          width: '100%',
          maxWidth: 420,
          padding: spacing.md,
          outline: 'none',
        }}
      >
        <h3
          id="confirm-dialog-title"
          style={{
            margin: `0 0 ${spacing.xs} 0`,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
          }}
        >
          {title}
        </h3>

        <p style={{
          margin: `0 0 ${spacing.sm} 0`,
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          lineHeight: typography.leading.relaxed,
          whiteSpace: 'pre-line',
        }}>
          {message}
        </p>

        {showInput && (
          <div style={{ marginBottom: spacing.sm }}>
            {inputLabel && (
              <label style={{
                display: 'block',
                marginBottom: spacing['3xs'],
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                color: colors.textSecondary,
              }}>
                {inputLabel}{inputRequired && ' *'}
              </label>
            )}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputPlaceholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm()
              }}
              style={{
                width: '100%',
                padding: `${spacing['2xs']} ${spacing.xs}`,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                color: colors.textPrimary,
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        <div style={{
          display: 'flex',
          gap: spacing.xs,
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={handleCancel}
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
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={showInput && inputRequired && !inputValue.trim()}
            style={{
              padding: `${spacing['2xs']} ${spacing.md}`,
              backgroundColor: isDanger ? '#dc2626' : colors.primary,
              color: '#fff',
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              cursor: (showInput && inputRequired && !inputValue.trim()) ? 'not-allowed' : 'pointer',
              opacity: (showInput && inputRequired && !inputValue.trim()) ? 0.5 : 1,
              minHeight: 44,
              minWidth: 80,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
