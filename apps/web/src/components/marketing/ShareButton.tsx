'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ShareData,
  getShareUrl,
  copyToClipboard,
  nativeShare,
  canUseNativeShare,
  openSharePopup,
  SHARE_PLATFORMS
} from '@/lib/marketing/share'

interface ShareButtonProps {
  url: string
  title: string
  text?: string
  variant?: 'icon' | 'button' | 'compact' | 'action'
  className?: string
}

export default function ShareButton({
  url,
  title,
  text,
  variant = 'button',
  className = ''
}: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showNative, setShowNative] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const shareData: ShareData = { url, title, text }

  // Check native share support on mount
  useEffect(() => {
    setShowNative(canUseNativeShare())
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleShare = useCallback(async (platformId: string) => {
    if (platformId === 'native') {
      const shared = await nativeShare(shareData)
      if (shared) {
        setIsOpen(false)
      }
      return
    }

    if (platformId === 'copy') {
      const success = await copyToClipboard(url)
      if (success) {
        setCopied(true)
        setTimeout(() => {
          setCopied(false)
          setIsOpen(false)
        }, 1500)
      }
      return
    }

    const shareUrl = getShareUrl(platformId as 'facebook' | 'twitter', shareData)
    if (shareUrl) {
      openSharePopup(shareUrl, platformId)
      setIsOpen(false)
    }
  }, [shareData, url])

  const buttonStyles: React.CSSProperties = variant === 'icon' ? {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    padding: 0,
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    color: '#6b7280'
  } : variant === 'compact' ? {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    fontSize: 12,
    color: '#374151',
    fontWeight: 500
  } : variant === 'action' ? {
    // Matches the Edit/View/Delete action buttons on listings page
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '4px 8px',
    border: 'none',
    borderRadius: 6,
    backgroundColor: '#6366f1', // Indigo for share
    cursor: 'pointer',
    fontSize: 14,
    color: '#ffffff',
    fontWeight: 600,
    minHeight: 44
  } : {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    fontSize: 14,
    color: '#374151',
    fontWeight: 500
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} className={className}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        style={buttonStyles}
        title="Share"
        aria-label="Share"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <ShareIcon size={variant === 'icon' ? 16 : variant === 'compact' ? 14 : 16} color={variant === 'action' ? '#ffffff' : 'currentColor'} />
        {variant !== 'icon' && <span>Share</span>}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            minWidth: 160,
            zIndex: 50,
            overflow: 'hidden'
          }}
          role="menu"
          aria-orientation="vertical"
        >
          {/* Native share on mobile */}
          {showNative && (
            <button
              onClick={() => handleShare('native')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 12px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: 14,
                color: '#374151',
                textAlign: 'left'
              }}
              role="menuitem"
            >
              <NativeShareIcon />
              <span>Share...</span>
            </button>
          )}

          {/* Platform options */}
          {SHARE_PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              onClick={() => handleShare(platform.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 12px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: 14,
                color: '#374151',
                textAlign: 'left'
              }}
              role="menuitem"
            >
              <PlatformIcon platform={platform.id} color={platform.color} />
              <span>{platform.id === 'copy' && copied ? 'Copied!' : platform.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Hover styles */}
      <style>{`
        .share-button:hover {
          background-color: #f9fafb !important;
          border-color: #d1d5db !important;
        }
        div[role="menu"] button:hover {
          background-color: #f3f4f6 !important;
        }
      `}</style>
    </div>
  )
}

// Simple share icon
function ShareIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx={18} cy={5} r={3} />
      <circle cx={6} cy={12} r={3} />
      <circle cx={18} cy={19} r={3} />
      <line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </svg>
  )
}

// Native share icon (for mobile)
function NativeShareIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6B7280"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1={12} y1={2} x2={12} y2={15} />
    </svg>
  )
}

// Platform-specific icons
function PlatformIcon({ platform, color }: { platform: string; color: string }) {
  switch (platform) {
    case 'facebook':
      return (
        <svg width={18} height={18} viewBox="0 0 24 24" fill={color}>
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      )
    case 'twitter':
      return (
        <svg width={18} height={18} viewBox="0 0 24 24" fill={color}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      )
    case 'copy':
      return (
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
      )
    default:
      return null
  }
}
