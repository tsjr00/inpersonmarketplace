'use client'

/**
 * Client shim so the server-rendered vendor detail can hand
 * VendorVerificationPanel an onRefresh (admin UI rebuild phase 4 — moved
 * from app/admin/vendors/[vendorId]/, with the vertical prop added so the
 * panel's food-truck-specific copy renders correctly on both tiers).
 */

import { useRouter } from 'next/navigation'
import VendorVerificationPanel from '@/components/admin/VendorVerificationPanel'

interface Verification {
  status: string
  documents: Array<{ url: string; path: string; filename: string; type: string; uploaded_at: string }>
  notes: string | null
  reviewed_at: string | null
  requested_categories: string[]
  category_verifications: Record<string, {
    status: string
    doc_type?: string
    documents?: Array<{ url: string; path: string; filename: string; doc_type: string }>
    notes?: string
    reviewed_at?: string
  }>
  coi_status: string
  coi_documents: Array<{ url: string; path: string; filename: string; uploaded_at: string }>
  coi_verified_at: string | null
  prohibited_items_acknowledged_at: string | null
  onboarding_completed_at: string | null
}

interface Props {
  vendorId: string
  verification: Verification | null
  vertical?: string
}

export default function VendorVerificationWrapper({ vendorId, verification, vertical }: Props) {
  const router = useRouter()
  return (
    <VendorVerificationPanel
      vendorId={vendorId}
      verification={verification}
      onRefresh={() => router.refresh()}
      {...(vertical ? { vertical } : {})}
    />
  )
}
