'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MarketAgreementBlock from '@/components/market-manager/MarketAgreementBlock'

interface ApplyToMarketButtonProps {
  marketId: string
  vendorProfileId: string
  /** Selects the brand name in the fixed platform clauses of the agreement block. */
  vertical: string
}

export default function ApplyToMarketButton({ marketId, vendorProfileId, vertical }: ApplyToMarketButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  // Owner 2026-09-18 (TR-036, option A): applying now shows the market's
  // agreement (the same block signup and booth booking use — it always has at
  // least the platform clauses, so acceptance is always required) plus an
  // opt-in to share onboarding documents with this market's manager. The
  // manager's "View docs" link keys off that consent inside the acceptance
  // record; before this, Apply wrote no acceptance at all, so a vendor who
  // joined by applying could never be reviewed.
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [shareDocs, setShareDocs] = useState(false)

  const handleApply = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/markets/${marketId}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_profile_id: vendorProfileId,
          notes: notes.trim() || undefined,
          agreement_accepted: agreementAccepted,
          info_sharing_accepted: shareDocs,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply')
      }

      // Success - refresh page
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        style={{
          padding: '10px 20px',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Apply to Sell Here
      </button>
    )
  }

  return (
    <div style={{
      backgroundColor: '#f8f9fa',
      borderRadius: 8,
      padding: 16,
      minWidth: 280,
      maxWidth: 520,
    }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
        Apply to Market
      </h4>

      {/* Owner 2026-09-07: tell the vendor what rides along + guide the
          message. Their business profile goes with the application, so the
          note should cover what the profile can't. */}
      <p style={{ margin: '0 0 10px 0', fontSize: 13, color: '#555', lineHeight: 1.45 }}>
        Your business profile is shared with the market automatically — no need to repeat it.
        Use this note for what the market can&apos;t see: what you&apos;d like to sell here,
        which days you&apos;re hoping to attend, and anything that makes your booth a good fit.
      </p>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. We sell small-batch salsas and fresh produce — hoping to join your Saturday market starting next month."
        style={{
          width: '100%',
          padding: 10,
          border: '1px solid #ddd',
          borderRadius: 6,
          fontSize: 14,
          resize: 'vertical',
          minHeight: 80,
          marginBottom: 12,
          boxSizing: 'border-box',
        }}
      />

      {/* The market's agreement — accepted here, recorded with the application. */}
      <MarketAgreementBlock marketId={marketId} vertical={vertical} onChange={setAgreementAccepted} />

      {/* Document-sharing opt-in (owner 2026-09-18). Off by default: the vendor
          chooses to let THIS market's manager review their onboarding documents
          (licenses, insurance, permits). Without it the manager sees no
          "View docs" link for them. */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#333', lineHeight: 1.45, margin: '12px 0', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={shareDocs}
          onChange={(e) => setShareDocs(e.target.checked)}
          style={{ marginTop: 3, minWidth: 16, minHeight: 16 }}
        />
        <span>
          <strong>Share my onboarding documents with this market&apos;s manager.</strong>{' '}
          Lets the manager review the licenses, permits and insurance you uploaded, so they can
          approve you without asking for copies. Optional — you can apply without it.
        </span>
      </label>
      {/* Owner 2026-09-19: say WHY, so the ask doesn't read as red tape. */}
      <p style={{ margin: '-6px 0 12px 24px', fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
        Market managers need to review applicants&apos; documents to ensure vendors in their markets meet certain standards.
      </p>

      {error && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: 6,
          fontSize: 13,
          marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleApply}
          disabled={loading || !agreementAccepted}
          title={!agreementAccepted ? 'Please accept the market agreement above' : undefined}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: loading || !agreementAccepted ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: loading || !agreementAccepted ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Applying...' : 'Submit Application'}
        </button>
        <button
          onClick={() => setShowForm(false)}
          disabled={loading}
          style={{
            padding: '10px 16px',
            backgroundColor: '#f0f0f0',
            color: '#666',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
