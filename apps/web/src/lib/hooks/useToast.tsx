'use client'
import { useState, useCallback } from 'react'
import Toast, { ToastType } from '@/components/shared/Toast'

interface ToastMessage {
  id: number
  message: string
  type: ToastType
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [nextId, setNextId] = useState(0)

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId
    setNextId(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type }])
  }, [nextId])

  const hideToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const ToastContainer = useCallback(() => (
    <>
      {toasts.map((toast, index) => (
        <div key={toast.id} style={{ position: 'fixed', bottom: 24 + (index * 80), right: 24, zIndex: 9999 }}>
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => hideToast(toast.id)}
          />
        </div>
      ))}
    </>
  ), [toasts, hideToast])

  return {
    showToast,
    ToastContainer,
    success: (msg: string) => showToast(msg, 'success'),
    error: (msg: string) => showToast(msg, 'error'),
    info: (msg: string) => showToast(msg, 'info'),
    warning: (msg: string) => showToast(msg, 'warning')
  }
}
