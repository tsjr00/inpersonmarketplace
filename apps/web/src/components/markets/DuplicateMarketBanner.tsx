import Link from 'next/link'

/**
 * Shared duplicate-detection banner for pending-intake markets.
 *
 * Used by both:
 *   - Platform admin detail page (apps/web/src/app/admin/markets/[id]/page.tsx)
 *   - Vertical admin list page edit form (apps/web/src/app/[vertical]/admin/markets/page.tsx)
 *
 * Pure presentational. Caller passes the pre-computed duplicates array.
 * Returns null when no duplicates so callers can drop it in unconditionally.
 *
 * Each duplicate row links to /admin/markets/<id> (platform admin detail
 * page) because that's the single deepest existing inspection surface.
 * Vertical admin doesn't yet have a per-market detail route; if/when it
 * does, this link target should become a prop.
 */
export interface DuplicateMarketSummary {
  id: string
  name: string
  city: string | null
  state: string | null
  status: string | null
  manager_email: string | null
}

interface DuplicateMarketBannerProps {
  duplicates: DuplicateMarketSummary[]
}

export default function DuplicateMarketBanner({
  duplicates,
}: DuplicateMarketBannerProps) {
  if (duplicates.length === 0) return null

  return (
    <div style={{
      padding: '14px 16px',
      marginBottom: 20,
      backgroundColor: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: 8,
      color: '#664d03',
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        ⚠️ Possible duplicate / claim of existing market
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
        Another market with the same name and city already exists. Before approving this intake, verify the prospective manager is legitimate.
      </div>
      <ul style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: '#664d03' }}>
        <li>Email the prospective manager and ask for ownership proof (LLC docs, market website with their name, signed letter from the market organization).</li>
        <li>Request a Certificate of Insurance naming the market as additional insured (if applicable).</li>
        <li>Contact the existing market&apos;s manager_email (if set) to confirm or deny the new request.</li>
        <li>Do not approve until verified — booth rental payments route through Stripe and reversing a fraudulent activation is costly.</li>
      </ul>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        Existing market{duplicates.length === 1 ? '' : 's'} with the same name + city:
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fffaf0' }}>
        <tbody>
          {duplicates.map((d) => (
            <tr key={d.id}>
              <td style={{ padding: '6px 10px', fontSize: 12, fontFamily: 'monospace', borderBottom: '1px solid #f5e6c2' }}>
                <Link href={`/admin/markets/${d.id}`} style={{ color: '#664d03', textDecoration: 'underline' }}>
                  {d.id}
                </Link>
              </td>
              <td style={{ padding: '6px 10px', fontSize: 13, borderBottom: '1px solid #f5e6c2' }}>
                <strong>{d.name}</strong>
                {' · '}
                {d.city}{d.state ? `, ${d.state}` : ''}
                {' · status='}
                <code>{d.status ?? 'unknown'}</code>
                {d.manager_email
                  ? <> · current manager: <a href={`mailto:${d.manager_email}`} style={{ color: '#664d03' }}>{d.manager_email}</a></>
                  : ' · no manager_email on file'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
