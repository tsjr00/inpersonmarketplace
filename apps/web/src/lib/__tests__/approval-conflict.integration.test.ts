/**
 * Approval × schedule conflict — DB integration (migration 262).
 *
 * The rule (owner 2026-10-09, option A): a farmers-market vendor's schedule
 * conflict at ANOTHER market never rolls back a manager's approval or a
 * manager's market-day edit. The auto-create triggers insert one day at a
 * time and skip only a day refused with SQLSTATE P0020 (the conflict trigger's
 * own code since mig 262); every other day is created.
 *
 * Before 262 (Staging trace mugcqpnz-n44s9t, 2026-09-25): the conflict raise
 * aborted the whole approval — vendor unapproved, manager shown the vendor's
 * rule text, owner emailed an "unknown database error".
 *
 * These run against the Dev project with the real triggers. PREREQUISITE:
 * migration 262 applied to Dev — until then the first test fails loudly
 * naming it. A silent skip would let the fix ship unverified.
 *
 * Fixture: vendor V (multi-location box UNTICKED) active at market A on
 * Saturday 08:00–13:00. Market B runs Saturday 09:00–14:00 (overlap) and
 * Wednesday. Approving V at B must succeed with Wednesday created and Saturday
 * skipped. Adding Sunday to B afterwards must create V's Sunday row; adding a
 * second overlapping Saturday window to B must not fail the manager's insert.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestClient } from '../test-utils/supabase-test-client'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient
const createdIds: { table: string; id: string }[] = []
let authUserId: string
let vendorId: string
let marketA: string
let marketB: string
let bSaturday: string
let bWednesday: string

async function insertOne(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.from(table).insert(row).select('id').single()
  if (error) throw new Error(`Setup failed (${table}): ${error.message}`)
  createdIds.push({ table, id: data.id as string })
  return data.id as string
}

async function vendorRowsAt(marketId: string): Promise<Array<{ schedule_id: string; is_active: boolean | null }>> {
  const { data, error } = await supabase
    .from('vendor_market_schedules')
    .select('id, schedule_id, is_active')
    .eq('vendor_profile_id', vendorId)
    .eq('market_id', marketId)
  if (error) throw new Error(`read vendor_market_schedules: ${error.message}`)
  for (const r of data ?? []) {
    if (!createdIds.some((c) => c.id === r.id)) createdIds.push({ table: 'vendor_market_schedules', id: r.id as string })
  }
  return (data ?? []) as Array<{ schedule_id: string; is_active: boolean | null }>
}

beforeAll(async () => {
  supabase = createTestClient()

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: `__test_approval_conflict_${Date.now()}@integration.test`,
    password: 'Test-Password-Integration-1234!',
    email_confirm: true,
  })
  if (authError) throw new Error(`Setup failed (auth user): ${authError.message}`)
  authUserId = authUser.user.id

  vendorId = await insertOne('vendor_profiles', {
    user_id: authUserId,
    vertical_id: 'farmers_market',
    status: 'approved',
    // multiple_trucks absent → the conflict rule applies to this vendor
    profile_data: { farm_name: '__test_ Conflict Farm' },
    tier: 'free',
  })

  marketA = await insertOne('markets', {
    vertical_id: 'farmers_market', name: '__test_ Market A (River Road)', market_type: 'traditional',
    status: 'active', active: true, timezone: 'America/Chicago',
  })
  marketB = await insertOne('markets', {
    vertical_id: 'farmers_market', name: '__test_ Market B', market_type: 'traditional',
    status: 'active', active: true, timezone: 'America/Chicago',
  })

  const aSaturday = await insertOne('market_schedules', { market_id: marketA, day_of_week: 6, start_time: '08:00:00', end_time: '13:00:00', active: true })
  bSaturday = await insertOne('market_schedules', { market_id: marketB, day_of_week: 6, start_time: '09:00:00', end_time: '14:00:00', active: true })
  bWednesday = await insertOne('market_schedules', { market_id: marketB, day_of_week: 3, start_time: '09:00:00', end_time: '14:00:00', active: true })

  // V is active at A on Saturday (the row the conflict is measured against).
  await insertOne('vendor_market_schedules', { vendor_profile_id: vendorId, market_id: marketA, schedule_id: aSaturday, is_active: true })
})

afterAll(async () => {
  if (!supabase) return
  // vendor rows the triggers created are collected by vendorRowsAt(); the
  // rest were pushed at insert time. Reverse order respects the FKs.
  await vendorRowsAt(marketB).catch(() => [])
  for (const { table, id } of [...createdIds].reverse()) {
    await supabase.from(table).delete().eq('id', id)
  }
  if (authUserId) await supabase.auth.admin.deleteUser(authUserId)
})

describe('migration 262 — approval never fails on a conflict elsewhere', () => {
  it('approving the vendor at B SUCCEEDS; Wednesday is created, the overlapping Saturday is skipped', async () => {
    const mvId = await insertOne('market_vendors', { market_id: marketB, vendor_profile_id: vendorId, approved: false })

    const { error } = await supabase
      .from('market_vendors')
      .update({ approved: true })
      .eq('id', mvId)
    expect(
      error?.message ?? null,
      'Approval was rolled back by the conflict trigger — is migration 262 applied to Dev?'
    ).toBeNull()

    const rows = await vendorRowsAt(marketB)
    expect(rows.map((r) => r.schedule_id).sort()).toEqual([bWednesday].sort())
    expect(rows.every((r) => r.is_active === true)).toBe(true)
  })

  it('the vendor is still refused the Saturday when THEY try to add it (the rule itself is intact)', async () => {
    const { error } = await supabase
      .from('vendor_market_schedules')
      .insert({ vendor_profile_id: vendorId, market_id: marketB, schedule_id: bSaturday, is_active: true })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('P0020')
    expect(error!.message).toContain('Schedule conflict: overlapping times with "__test_ Market A (River Road)"')
  })

  it('a manager adding a NEW day to B creates the vendor\'s row for it', async () => {
    const bSunday = await insertOne('market_schedules', { market_id: marketB, day_of_week: 0, start_time: '09:00:00', end_time: '14:00:00', active: true })
    const rows = await vendorRowsAt(marketB)
    expect(rows.map((r) => r.schedule_id)).toContain(bSunday)
  })

  it('a manager adding a SECOND overlapping Saturday window to B does not fail — the vendor is skipped for it', async () => {
    const { data, error } = await supabase
      .from('market_schedules')
      .insert({ market_id: marketB, day_of_week: 6, start_time: '10:00:00', end_time: '12:00:00', active: true })
      .select('id')
      .single()
    expect(error?.message ?? null, 'The manager\'s day insert was rolled back by one vendor\'s conflict').toBeNull()
    createdIds.push({ table: 'market_schedules', id: data!.id as string })
    const rows = await vendorRowsAt(marketB)
    expect(rows.map((r) => r.schedule_id)).not.toContain(data!.id)
  })
})
