import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import VendorDocLink, { extractVendorDocPathFromPublicUrl } from '@/components/shared/VendorDocLink'
import {
  FOOD_TRUCK_DOC_TYPES,
  FOOD_TRUCK_DOC_TYPE_LABELS,
  type FoodTruckDocType,
} from '@/lib/onboarding/category-requirements'

/**
 * Manager view of one vendor's onboarding documentation. Phase B A1
 * (2026-05-16).
 *
 * Three gates to reach this page:
 *   1. User must be authenticated.
 *   2. User must be the assigned manager of the market.
 *   3. Vendor must have authorized info sharing for THIS market via the
 *      `_info_sharing_consent` synthetic snapshot entry. Without consent,
 *      we render a friendly "not authorized" message instead of the docs.
 *
 * Data source: vendor_verifications row (one per vendor across all
 * markets). Fields displayed:
 *   - Onboarding status (submitted, reviewed, completed timestamps)
 *   - Requested categories + per-category verification status
 *   - Uploaded category documents (links)
 *   - COI status + documents (links)
 *   - Prohibited items acknowledgment timestamp
 *
 * Markets that haven't gone through full app verification will have
 * partial / empty data — the page handles that gracefully.
 */
interface PageProps {
  params: Promise<{ vertical: string; marketId: string; vendorProfileId: string }>
}

/** Per-category verification entry shape stored under
 *  vendor_verifications.category_verifications JSONB.
 *  Mirrors the type used by admin vendor management code
 *  (src/app/[vertical]/admin/vendors/page.tsx:172). */
interface CategoryVerification {
  status: string
  doc_type?: string
  documents?: Array<{ url: string; path: string; filename: string; doc_type: string }>
  notes?: string
  reviewed_at?: string
}

/** Shape of each entry in vendor_verifications.coi_documents JSONB. */
interface CoiDoc {
  url?: string
  path?: string
  filename?: string
  uploaded_at?: string
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function statusBadgeColors(status: string | null | undefined): { bg: string; fg: string } {
  switch ((status || '').toLowerCase()) {
    case 'approved':
    case 'verified':
      return { bg: '#d4edda', fg: '#155724' }
    case 'rejected':
      return { bg: '#f8d7da', fg: '#721c24' }
    case 'pending':
    case 'submitted':
      return { bg: '#fff3cd', fg: '#856404' }
    default:
      return { bg: '#e9ecef', fg: '#495057' }
  }
}

export default async function VendorDocsPage({ params }: PageProps) {
  const { vertical, marketId, vendorProfileId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) redirect(`/${vertical}/dashboard`)

  const serviceClient = createServiceClient()

  // Vendor must be at this market.
  const { data: mvRow } = await serviceClient
    .from('market_vendors')
    .select('id, approved')
    .eq('market_id', marketId)
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle()
  if (!mvRow) notFound()

  // Check consent (synthetic `_info_sharing_consent` entry).
  const { data: acceptances } = await serviceClient
    .from('vendor_market_agreement_acceptances')
    .select('statements_snapshot')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('market_id', marketId)
  const hasConsent = (acceptances || []).some((row) => {
    const snap = row.statements_snapshot as Array<{ statement_id?: string }> | null
    return Array.isArray(snap) && snap.some((s) => s?.statement_id === '_info_sharing_consent')
  })

  // Vendor profile (always fetched — used for the heading + certifications)
  const { data: vp } = await serviceClient
    .from('vendor_profiles')
    .select('id, status, profile_data, certifications')
    .eq('id', vendorProfileId)
    .maybeSingle()
  if (!vp) notFound()
  const profileData = (vp.profile_data || {}) as Record<string, unknown>
  // Vendor-uploaded certifications (vendor_profiles.certifications JSONB). This
  // is the upload path a truck uses to satisfy a park's required-docs list, so
  // the operator needs to see them here alongside permits + COI. The file link
  // rides the same signed-URL path as permits: the stored document_url is a
  // now-dead PUBLIC url (bucket went private in mig 151), so we recover the
  // storage path from it and hand that to VendorDocLink for a fresh signed URL.
  const certifications = (vp.certifications as Array<{
    type?: string
    label?: string
    registration_number?: string
    state?: string
    document_url?: string
  }> | null) ?? []
  const businessName =
    (profileData.business_name as string | undefined) ||
    (profileData.farm_name as string | undefined) ||
    'Unknown vendor'

  // No consent → friendly bail-out page
  if (!hasConsent) {
    return (
      <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
        <div style={{ marginBottom: spacing.md }}>
          <Link href={`/${vertical}/market-manager/${marketId}/dashboard`} style={{
            color: colors.textMuted, fontSize: typography.sizes.sm, textDecoration: 'none',
          }}>
            ← Back to manager dashboard
          </Link>
        </div>
        <h1 style={{
          margin: 0, marginBottom: spacing.sm,
          fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold,
          color: colors.textPrimary,
        }}>{businessName}</h1>
        <div style={{
          padding: spacing.md,
          backgroundColor: '#fff3cd',
          border: '1px solid #fde047',
          borderRadius: radius.md,
          color: '#713f12',
          lineHeight: 1.5,
        }}>
          <strong>This vendor hasn&apos;t authorized info sharing.</strong>{' '}
          They haven&apos;t checked the &ldquo;I authorize the platform to share my
          onboarding info with the market manager&rdquo; box yet, so we can&apos;t
          show their docs here. Reach out to them if you need their
          documentation directly.
        </div>
      </div>
    )
  }

  // Fetch verification data
  const { data: verification } = await serviceClient
    .from('vendor_verifications')
    // Docs live inside category_verifications[cat].documents (see
    // admin path src/app/[vertical]/admin/vendors/page.tsx:172).
    .select('requested_categories, category_verifications, coi_status, coi_documents, coi_verified_at, prohibited_items_acknowledged_at, onboarding_completed_at, submitted_at')
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle()

  const categories = (verification?.requested_categories as string[] | null) ?? []
  const categoryVerifications = (verification?.category_verifications as Record<string, CategoryVerification> | null) ?? {}
  const coiStatus = (verification?.coi_status as string | null) ?? 'not_submitted'
  const coiDocuments = (verification?.coi_documents as CoiDoc[] | null) ?? []

  // Tester finding 2026-07-25: the operator saw product categories (e.g.
  // "BBQ & Smoked") with "no documents" and couldn't view the truck's permits.
  // Food trucks store compliance docs in category_verifications keyed by PERMIT
  // type (mfu_permit, cfm_certificate, …), NOT by product category — so
  // iterating requested_categories hid all the permit files. Render the permit
  // entries for FT; product categories for FM. Extra keys that carry documents
  // are included so nothing is ever missed.
  const isFoodTruck = vertical === 'food_trucks'
  const docEntries: { key: string; label: string }[] = isFoodTruck
    ? [
        ...(FOOD_TRUCK_DOC_TYPES as string[]).map((k) => ({
          key: k,
          label: FOOD_TRUCK_DOC_TYPE_LABELS[k as FoodTruckDocType] ?? k,
        })),
        ...Object.keys(categoryVerifications)
          .filter(
            (k) =>
              !(FOOD_TRUCK_DOC_TYPES as string[]).includes(k) &&
              ((categoryVerifications[k]?.documents?.length ?? 0) > 0)
          )
          .map((k) => ({ key: k, label: k })),
      ]
    : categories.map((c) => ({ key: c, label: c }))

  return (
    <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <div style={{ marginBottom: spacing.md }}>
        <Link href={`/${vertical}/market-manager/${marketId}/dashboard`} style={{
          color: colors.textMuted, fontSize: typography.sizes.sm, textDecoration: 'none',
        }}>
          ← Back to manager dashboard
        </Link>
      </div>

      <h1 style={{
        margin: 0, marginBottom: spacing['2xs'],
        fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold,
        color: colors.textPrimary,
      }}>{businessName}</h1>
      <p style={{
        margin: 0, marginBottom: spacing.md,
        fontSize: typography.sizes.sm, color: colors.textMuted,
      }}>
        Vendor documentation shared with you under the vendor&apos;s
        info-sharing authorization. Status reflects platform verification
        — not your market&apos;s vetting.
      </p>

      {/* Status overview card */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0, marginBottom: spacing.sm,
          fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>Onboarding status</h2>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `${spacing['2xs']} ${spacing.sm}`, fontSize: typography.sizes.sm }}>
          <dt style={{ color: colors.textMuted, fontWeight: typography.weights.semibold }}>Vendor profile status:</dt>
          <dd style={{ margin: 0, color: colors.textPrimary }}>{vp.status || 'unknown'}</dd>
          <dt style={{ color: colors.textMuted, fontWeight: typography.weights.semibold }}>Submitted:</dt>
          <dd style={{ margin: 0, color: colors.textPrimary }}>{formatDate(verification?.submitted_at as string | null)}</dd>
          <dt style={{ color: colors.textMuted, fontWeight: typography.weights.semibold }}>Onboarding completed:</dt>
          <dd style={{ margin: 0, color: colors.textPrimary }}>{formatDate(verification?.onboarding_completed_at as string | null)}</dd>
          <dt style={{ color: colors.textMuted, fontWeight: typography.weights.semibold }}>Prohibited items acknowledged:</dt>
          <dd style={{ margin: 0, color: colors.textPrimary }}>{formatDate(verification?.prohibited_items_acknowledged_at as string | null)}</dd>
          <dt style={{ color: colors.textMuted, fontWeight: typography.weights.semibold }}>At your market:</dt>
          <dd style={{ margin: 0, color: colors.textPrimary }}>{mvRow.approved ? 'Approved' : 'Pending approval'}</dd>
        </dl>
      </div>

      {/* Categories + documents */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0, marginBottom: spacing.sm,
          fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>Categories &amp; documents</h2>
        {docEntries.length === 0 ? (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
            {isFoodTruck ? 'No permit documents on file yet.' : 'No categories on file yet.'}
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {docEntries.map((entry) => {
              // category_verifications is keyed by category name (FM) or permit
              // type (FT); each value is { status, doc_type?, documents?, notes?,
              // reviewed_at? }. Pull status + documents from the nested object.
              const verification = categoryVerifications[entry.key]
              const status = verification?.status || 'pending'
              const docs = verification?.documents || []
              const colorPair = statusBadgeColors(status)
              return (
                <li key={entry.key} style={{
                  marginBottom: spacing.sm,
                  paddingBottom: spacing.sm,
                  borderBottom: `1px solid ${colors.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: typography.sizes.base, color: colors.textPrimary }}>{entry.label}</strong>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: colorPair.bg,
                      color: colorPair.fg,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                    }}>{status}</span>
                  </div>
                  {docs.length === 0 ? (
                    <p style={{
                      margin: `${spacing['2xs']} 0 0 ${spacing.md}`,
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                      fontStyle: 'italic',
                    }}>
                      No documents uploaded for this category.
                    </p>
                  ) : (
                    <ul style={{
                      margin: `${spacing['2xs']} 0 0 0`,
                      paddingLeft: spacing.md,
                      fontSize: typography.sizes.sm,
                    }}>
                      {docs.map((d, i) => (
                        <li key={i} style={{ marginBottom: spacing['3xs'] }}>
                          {(d.path || d.url) ? (
                            <VendorDocLink
                              path={d.path}
                              url={d.url}
                              marketId={marketId}
                              style={{ color: colors.primary, textDecoration: 'underline' }}
                            >
                              {d.filename || `Document ${i + 1}`}
                            </VendorDocLink>
                          ) : (
                            <span style={{ color: colors.textMuted }}>(no URL)</span>
                          )}
                          {d.doc_type && (
                            <span style={{ marginLeft: spacing.xs, color: colors.textMuted, fontSize: typography.sizes.xs }}>
                              ({d.doc_type})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {verification?.notes && (
                    <p style={{
                      margin: `${spacing['2xs']} 0 0 ${spacing.md}`,
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                    }}>
                      Admin notes: {verification.notes}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* COI */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', marginBottom: spacing.sm }}>
          <h2 style={{
            margin: 0,
            fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
          }}>Certificate of Insurance</h2>
          {(() => {
            const c = statusBadgeColors(coiStatus)
            return (
              <span style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: c.bg,
                color: c.fg,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
              }}>{coiStatus}</span>
            )
          })()}
        </div>
        {coiDocuments.length === 0 ? (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
            No COI documents on file.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: spacing.md, fontSize: typography.sizes.sm }}>
            {coiDocuments.map((d, i) => (
              <li key={i} style={{ marginBottom: spacing['3xs'] }}>
                {(d.path || d.url) ? (
                  <VendorDocLink
                    path={d.path}
                    url={d.url}
                    marketId={marketId}
                    style={{ color: colors.primary, textDecoration: 'underline' }}
                  >
                    {d.filename || `COI document ${i + 1}`}
                  </VendorDocLink>
                ) : <span style={{ color: colors.textMuted }}>(no URL)</span>}
                {d.uploaded_at && (
                  <span style={{ marginLeft: spacing.xs, color: colors.textMuted, fontSize: typography.sizes.xs }}>
                    uploaded {formatDate(d.uploaded_at)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {verification?.coi_verified_at && (
          <p style={{ margin: `${spacing.xs} 0 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
            Platform verified: {formatDate(verification.coi_verified_at as string)}
          </p>
        )}
      </div>

      {/* Certifications — vendor-uploaded credentials (the path a truck uses to
          satisfy a park's required-docs list). Distinct from the permit docs
          above (vendor_verifications) — these live on vendor_profiles. */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0, marginBottom: spacing.sm,
          fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>Certifications</h2>
        {certifications.length === 0 ? (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
            No certifications uploaded yet. If you asked for a required document,
            the truck adds it under their profile&apos;s Documents &amp; Certifications.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {certifications.map((cert, i) => {
              const certPath = extractVendorDocPathFromPublicUrl(cert.document_url)
              return (
                <li key={i} style={{
                  marginBottom: spacing.sm,
                  paddingBottom: spacing.sm,
                  borderBottom: `1px solid ${colors.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: typography.sizes.base, color: colors.textPrimary }}>
                      {cert.label || cert.type || 'Certification'}
                    </strong>
                    {cert.state && (
                      <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
                        ({cert.state})
                      </span>
                    )}
                  </div>
                  {cert.registration_number && (
                    <p style={{ margin: `${spacing['2xs']} 0 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                      #{cert.registration_number}
                    </p>
                  )}
                  <div style={{ margin: `${spacing['2xs']} 0 0 0`, fontSize: typography.sizes.sm }}>
                    {certPath ? (
                      <VendorDocLink
                        path={certPath}
                        marketId={marketId}
                        style={{ color: colors.primary, textDecoration: 'underline' }}
                      >
                        View document
                      </VendorDocLink>
                    ) : (
                      <span style={{ color: colors.textMuted, fontStyle: 'italic' }}>No file attached.</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
