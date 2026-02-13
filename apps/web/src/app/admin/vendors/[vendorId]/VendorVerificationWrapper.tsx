'use client'

import { useRouter } from 'next/navigation'
import VendorVerificationPanel from '@/components/admin/VendorVerificationPanel'

interface Verification {
  status: string
  documents: Array<{ url: string; filename: string; type: string; uploaded_at: string }>
  notes: string | null
  reviewed_at: string | null
  requested_categories: string[]
  category_verifications: Record<string, {
    status: string
    doc_type?: string
    documents?: Array<{ url: string; filename: string; doc_type: string }>
    notes?: string
    reviewed_at?: string
  }>
  coi_status: string
  coi_documents: Array<{ url: string; filename: string; uploaded_at: string }>
  coi_verified_at: string | null
  prohibited_items_acknowledged_at: string | null
  onboarding_completed_at: string | null
}

interface Props {
  vendorId: string
  verification: Verification | null
}

export default function VendorVerificationWrapper({ vendorId, verification }: Props) {
  const router = useRouter()
  return (
    <VendorVerificationPanel
      vendorId={vendorId}
      verification={verification}
      onRefresh={() => router.refresh()}
    />
  )
}
