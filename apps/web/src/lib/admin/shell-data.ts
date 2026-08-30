/**
 * Server-side resolution for AdminShell (phase 1, admin UI rebuild 2026-08-30).
 * Both admin layouts call this; the client shell receives plain props.
 *
 * Scopes = only what this admin holds (owner decision): vertical pills from
 * the active `verticals` table intersected with the admin's grants —
 * platform_admin sees every vertical + the Platform pill; a vertical admin
 * sees their `user_profiles.verticals` (falling back to the current vertical)
 * and no Platform pill. Access itself is unchanged — pages keep their own
 * gates; the pills only advertise what the person can use.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { hasPlatformAdminRole } from '@/lib/auth/admin'
import { observed } from '@/lib/errors'
import { VERTICAL_ADMIN_NAV, PLATFORM_ADMIN_NAV } from './nav'
import { getAdminQueueBadges } from './queue-badges'
import type { ShellGroup, ShellScope } from '@/components/admin/AdminShell'

interface AdminProfileBits {
  role?: string | null
  roles?: string[] | null
  verticals?: string[] | null
  email?: string | null
}

export interface ResolvedShell {
  scopes: ShellScope[]
  groups: ShellGroup[]
  adminEmail: string | null
}

export async function resolveAdminShell(
  supabase: SupabaseClient,
  profile: AdminProfileBits,
  tier: 'platform' | 'vertical',
  vertical: string | null
): Promise<ResolvedShell> {
  void supabase
  const service = createServiceClient()
  const isPlatform = hasPlatformAdminRole(profile)

  const [{ data: verticalRows }, badges] = await Promise.all([
    observed(service
      .from('verticals')
      .select('vertical_id, name_public')
      .eq('is_active', true)
      .order('vertical_id'), { table: 'verticals' }),
    getAdminQueueBadges(service, tier === 'vertical' ? vertical : null),
  ])

  const activeVerticals = (verticalRows ?? []).map(v => ({
    id: v.vertical_id as string,
    label: (v.name_public as string) || (v.vertical_id as string),
  }))
  const grantedIds = isPlatform
    ? activeVerticals.map(v => v.id)
    : (profile.verticals && profile.verticals.length > 0
        ? profile.verticals
        : (vertical ? [vertical] : []))

  const scopes: ShellScope[] = activeVerticals
    .filter(v => grantedIds.includes(v.id))
    .map(v => ({
      key: v.id,
      label: v.label,
      href: `/${v.id}/admin`,
      active: tier === 'vertical' && vertical === v.id,
    }))
  if (isPlatform) {
    scopes.push({ key: 'platform', label: 'Platform', href: '/admin', active: tier === 'platform' })
  }

  const base = tier === 'platform' ? '/admin' : `/${vertical}/admin`
  const nav = tier === 'platform' ? PLATFORM_ADMIN_NAV : VERTICAL_ADMIN_NAV
  const groups: ShellGroup[] = nav.map(g => ({
    label: g.label,
    links: g.links.map(l => ({
      href: base + l.path,
      label: l.label,
      ...(l.badgeKey && badges[l.badgeKey] ? { badge: badges[l.badgeKey] } : {}),
    })),
  }))

  return { scopes, groups, adminEmail: profile.email ?? null }
}
