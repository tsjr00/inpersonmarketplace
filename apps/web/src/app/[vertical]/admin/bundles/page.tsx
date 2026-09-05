'use client'

/**
 * Thin wrapper — the bundle approval queue lives in
 * components/admin/BundlesAdminPage.tsx (mig 244, market bundles B1+B2).
 * Vertical-only; there is no /admin/bundles platform pair (bundles join
 * verticals through their market).
 */
import { useParams } from 'next/navigation'
import BundlesAdminPage from '@/components/admin/BundlesAdminPage'

export default function AdminBundlesRoute() {
  const params = useParams()
  const vertical = params.vertical as string
  return <BundlesAdminPage vertical={vertical} />
}
