'use client'

/**
 * Thin wrapper — the events admin surface lives in
 * components/admin/EventsAdminPage.tsx (phase 6 pipeline board, 2026-09-04).
 * Events admin is vertical-only; there is no /admin/events platform pair.
 */
import { useParams } from 'next/navigation'
import EventsAdminPage from '@/components/admin/EventsAdminPage'

export default function AdminEventsRoute() {
  const params = useParams()
  const vertical = params.vertical as string
  return <EventsAdminPage vertical={vertical} />
}
